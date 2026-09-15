import { randomUUID } from 'node:crypto';

import { isRecord } from '../../../../packages/contracts/src/index.ts';
import { ApiProblem } from './http/errors.ts';

export type ControlPhase = 'before' | 'after';
export type ControlAction = 'hold' | 'reject' | 'drop';

export type RequestMetadata = {
  requestId: string;
  operationId: string;
  method: string;
  path: string;
  identity?: string;
  registrationId?: string;
  requestedVersion?: number | null;
};

type ControlRule = {
  ruleId: string;
  method: string;
  path: string;
  identity?: string;
  phase: ControlPhase;
  action: ControlAction;
  remaining: number;
};

type PendingRequest = {
  queueId: string;
  ruleId: string;
  phase: ControlPhase;
  action: 'hold';
  metadata: RequestMetadata;
  release: (outcome?: 'continue' | 'reject') => void;
};

export type ControlEvent = RequestMetadata & {
  sequence: number;
  event: string;
  phase?: ControlPhase;
  ruleId?: string;
  queueId?: string;
  status?: number;
};

export type ControlQueueItem = PendingRequest extends infer T
  ? T extends { release: () => void }
    ? Omit<T, 'release'>
    : never
  : never;

export type ControlResponseAction = 'send' | 'drop';

function validation(message: string, fieldErrors?: Record<string, string>): ApiProblem {
  return new ApiProblem('VALIDATION_ERROR', message, fieldErrors);
}

export class TestControls {
  private readonly rules = new Map<string, ControlRule>();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly events: ControlEvent[] = [];
  private sequence = 0;

  addRule(input: unknown): {
    ruleId: string;
    method: string;
    path: string;
    identity?: string;
    phase: ControlPhase;
    action: ControlAction;
    remaining: number;
  } {
    if (!isRecord(input)) {
      throw validation('Правило должно быть JSON-объектом.');
    }

    const method = typeof input.method === 'string' ? input.method.trim().toUpperCase() : '';
    const path = typeof input.path === 'string' ? input.path.trim() : '';
    const identity =
      input.identity === undefined
        ? undefined
        : typeof input.identity === 'string' && input.identity.trim().length > 0
          ? input.identity.trim()
          : undefined;
    const phase = input.phase;
    const action = input.action;
    const count = input.count === undefined ? 1 : input.count;
    const fieldErrors: Record<string, string> = {};

    if (method.length === 0) {
      fieldErrors.method = 'Укажите HTTP-метод.';
    }
    if (!path.startsWith('/')) {
      fieldErrors.path = 'Путь должен начинаться с /.';
    }
    if (phase !== 'before' && phase !== 'after') {
      fieldErrors.phase = 'Фаза должна быть before или after.';
    }
    if (action !== 'hold' && action !== 'reject' && action !== 'drop') {
      fieldErrors.action = 'Действие должно быть hold, reject или drop.';
    }
    if (action === 'drop' && phase === 'before') {
      fieldErrors.action = 'drop доступно только после обработки запроса.';
    }
    if (action === 'reject' && phase === 'after') {
      fieldErrors.action = 'reject доступно только до обработки запроса.';
    }
    if (!Number.isSafeInteger(count) || Number(count) < 1 || Number(count) > 1000) {
      fieldErrors.count = 'Количество срабатываний должно быть от 1 до 1000.';
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw validation('Проверьте правило управления запросом.', fieldErrors);
    }

    const rule: ControlRule = {
      ruleId: randomUUID(),
      method,
      path,
      ...(identity ? { identity } : {}),
      phase: phase as ControlPhase,
      action: action as ControlAction,
      remaining: Number(count),
    };
    this.rules.set(rule.ruleId, rule);
    return {
      ruleId: rule.ruleId,
      method: rule.method,
      path: rule.path,
      ...(rule.identity ? { identity: rule.identity } : {}),
      phase: rule.phase,
      action: rule.action,
      remaining: rule.remaining,
    };
  }

  record(
    metadata: RequestMetadata,
    event: string,
    details: Partial<Pick<ControlEvent, 'phase' | 'ruleId' | 'queueId' | 'status'>> = {},
  ): void {
    this.events.push({
      sequence: ++this.sequence,
      ...metadata,
      event,
      ...details,
    });
  }

  hasEvent(requestId: string, event: string): boolean {
    return this.events.some(
      (candidate) => candidate.requestId === requestId && candidate.event === event,
    );
  }

  private takeRule(metadata: RequestMetadata, phase: ControlPhase): ControlRule | undefined {
    for (const rule of this.rules.values()) {
      if (
        rule.method !== metadata.method ||
        rule.path !== metadata.path ||
        rule.phase !== phase ||
        (rule.identity !== undefined && rule.identity !== metadata.identity)
      ) {
        continue;
      }

      rule.remaining -= 1;
      if (rule.remaining <= 0) {
        this.rules.delete(rule.ruleId);
      }
      return rule;
    }
    return undefined;
  }

  private async hold(
    metadata: RequestMetadata,
    rule: ControlRule,
    phase: ControlPhase,
  ): Promise<void> {
    const queueId = randomUUID();
    let release!: (outcome?: 'continue' | 'reject') => void;
    const waiting = new Promise<'continue' | 'reject'>((resolve) => {
      release = (outcome = 'continue') => resolve(outcome);
    });
    const pending: PendingRequest = {
      queueId,
      ruleId: rule.ruleId,
      phase,
      action: 'hold',
      metadata,
      release,
    };
    this.pending.set(queueId, pending);
    this.record(metadata, phase === 'before' ? 'held' : 'response-held', {
      phase,
      ruleId: rule.ruleId,
      queueId,
    });
    const outcome = await waiting;
    this.pending.delete(queueId);
    this.record(metadata, phase === 'before' ? 'released' : 'response-released', {
      phase,
      ruleId: rule.ruleId,
      queueId,
    });
    if (phase === 'before' && outcome === 'reject') {
      this.record(metadata, 'rejected', {
        phase: 'before',
        ruleId: rule.ruleId,
        queueId,
      });
      throw new ApiProblem(
        'SERVICE_UNAVAILABLE',
        'Тестовое правило отклонило запрос до записи в базу данных.',
      );
    }
  }

  async before(metadata: RequestMetadata): Promise<void> {
    const rule = this.takeRule(metadata, 'before');
    if (!rule) {
      return;
    }

    if (rule.action === 'reject') {
      this.record(metadata, 'rejected', {
        phase: 'before',
        ruleId: rule.ruleId,
      });
      throw new ApiProblem(
        'SERVICE_UNAVAILABLE',
        'Тестовое правило отклонило запрос до записи в базу данных.',
      );
    }

    await this.hold(metadata, rule, 'before');
  }

  async after(metadata: RequestMetadata): Promise<ControlResponseAction> {
    const rule = this.takeRule(metadata, 'after');
    if (!rule) {
      return 'send';
    }

    if (rule.action === 'hold') {
      await this.hold(metadata, rule, 'after');
      return 'send';
    }

    if (rule.action === 'drop') {
      this.record(metadata, 'response-dropped', {
        phase: 'after',
        ruleId: rule.ruleId,
      });
      return 'drop';
    }

    throw new ApiProblem('INTERNAL_ERROR', 'Некорректное правило управления ответом.');
  }

  release(
    queueId?: string,
    ruleId?: string,
    outcome: 'continue' | 'reject' = 'continue',
  ): Omit<PendingRequest, 'release'> {
    const pending = queueId
      ? this.pending.get(queueId)
      : [...this.pending.values()].find((candidate) => candidate.ruleId === ruleId);
    if (!pending) {
      throw new ApiProblem('NOT_FOUND', 'Ожидаемый управляемый запрос не найден.');
    }
    if (outcome === 'reject' && pending.phase !== 'before') {
      throw new ApiProblem(
        'VALIDATION_ERROR',
        'Отклонение при освобождении доступно только для before.',
      );
    }

    this.pending.delete(pending.queueId);
    pending.release(outcome);
    const { release: _release, ...released } = pending;
    return released;
  }

  queue(): { ready: true; queue: Array<Omit<PendingRequest, 'release'>> } {
    return {
      ready: true,
      queue: [...this.pending.values()].map(({ release: _release, ...item }) => item),
    };
  }

  log(): { ready: true; events: ControlEvent[] } {
    return {
      ready: true,
      events: [...this.events],
    };
  }

  activeRules(): {
    ready: true;
    rules: Array<Omit<ControlRule, 'remaining'> & { remaining: number }>;
  } {
    return {
      ready: true,
      rules: [...this.rules.values()].map((rule) => ({ ...rule })),
    };
  }
}
