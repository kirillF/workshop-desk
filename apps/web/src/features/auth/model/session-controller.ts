import type {
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  SessionResponse,
  User,
} from '@workshop-desk/contracts';
import { isUnauthenticatedError, toOperationError } from '../../../shared/lib/errors.ts';

export interface SessionApi {
  getSession(): Promise<SessionResponse>;
  login(input: LoginRequest): Promise<LoginResponse>;
  logout(options?: { signal?: AbortSignal }): Promise<LogoutResponse>;
}

export type SessionPhase =
  | 'restoring'
  | 'restore-error'
  | 'unauthenticated'
  | 'authenticated'
  | 'logging-in'
  | 'logging-out'
  | 'logout-error';

export interface SessionState {
  phase: SessionPhase;
  user: User | null;
  error?: string;
  generation: number;
}

export interface SessionControllerOptions {
  timeoutMs?: number;
}

type Listener = () => void;
type RestoreResult = SessionResponse | undefined;

const DEFAULT_LOGOUT_TIMEOUT_MS = 10_000;

class LogoutTimeoutError extends Error {
  constructor() {
    super(
      'Не удалось подтвердить выход вовремя. Повторите попытку; закрытие сессии ещё не подтверждено.',
    );
    this.name = 'LogoutTimeoutError';
  }
}

type LogoutAttempt = {
  id: number;
  controller: AbortController;
  raw: Promise<LogoutResponse>;
  settled: boolean;
  timedOut: boolean;
};

/**
 * Owns the browser session lifecycle independently from authenticated views.
 * Expiry is a local invalidation path; explicit logout requires a successful
 * server response and remains recoverable when its request is uncertain.
 */
export class SessionController {
  private readonly api: SessionApi;
  private readonly timeoutMs: number;
  private readonly listeners = new Set<Listener>();
  private state: SessionState = {
    phase: 'restoring',
    user: null,
    generation: 0,
  };
  private transitionId = 0;
  private restorePromise: Promise<RestoreResult> | null = null;
  private loginPromise: Promise<SessionResponse> | null = null;
  private logoutPromise: Promise<LogoutResponse> | null = null;
  private logoutAttempt: LogoutAttempt | null = null;
  private logoutTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(api: SessionApi, options: SessionControllerOptions = {}) {
    this.api = api;
    const configuredTimeout = options.timeoutMs ?? DEFAULT_LOGOUT_TIMEOUT_MS;
    this.timeoutMs =
      Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_LOGOUT_TIMEOUT_MS;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): SessionState {
    return { ...this.state };
  }

  getSnapshot = (): SessionState => this.state;

  restore(): Promise<RestoreResult> {
    if (this.restorePromise) {
      return this.restorePromise;
    }

    const transitionId = ++this.transitionId;
    this.setState({
      phase: 'restoring',
      user: null,
      error: undefined,
    });

    const request = Promise.resolve().then(() => this.api.getSession());
    const wrapped: Promise<RestoreResult> = request
      .then((response) => {
        if (transitionId === this.transitionId) {
          this.setState({
            phase: 'authenticated',
            user: response.user,
            error: undefined,
            generation: this.state.generation + 1,
          });
        }
        return response;
      })
      .catch((error: unknown) => {
        if (transitionId === this.transitionId) {
          if (isUnauthenticatedError(error)) {
            this.setState({
              phase: 'unauthenticated',
              user: null,
              error: undefined,
            });
          } else {
            this.setState({
              phase: 'restore-error',
              user: null,
              error: toOperationError(
                error,
                'Не удалось проверить сессию. Проверьте соединение и повторите попытку.',
              ).message,
            });
          }
        }
        return undefined;
      })
      .finally(() => {
        if (this.restorePromise === wrapped) {
          this.restorePromise = null;
        }
      });
    this.restorePromise = wrapped;

    return wrapped;
  }

  retryRestore(): Promise<RestoreResult> {
    if (this.state.phase === 'restoring') {
      return this.restorePromise ?? this.restore();
    }

    return this.restore();
  }

  login(input: LoginRequest): Promise<SessionResponse> {
    if (this.loginPromise) {
      return this.loginPromise;
    }

    if (this.state.phase === 'logging-out' || this.state.phase === 'logout-error') {
      return Promise.reject(new Error('Сначала подтвердите выход из системы.'));
    }

    const transitionId = ++this.transitionId;
    this.setState({
      phase: 'logging-in',
      user: null,
      error: undefined,
    });

    const request = Promise.resolve().then(() => this.api.login(input));
    const wrapped: Promise<SessionResponse> = request
      .then((response) => {
        if (transitionId === this.transitionId) {
          this.setState({
            phase: 'authenticated',
            user: response.user,
            error: undefined,
            generation: this.state.generation + 1,
          });
        }
        return { user: response.user };
      })
      .catch((error: unknown) => {
        if (transitionId === this.transitionId) {
          this.setState({
            phase: 'unauthenticated',
            user: null,
            error: toOperationError(error, 'Не удалось войти. Проверьте email и пароль.').message,
          });
        }
        throw error;
      })
      .finally(() => {
        if (this.loginPromise === wrapped) {
          this.loginPromise = null;
        }
      });
    this.loginPromise = wrapped;

    return wrapped;
  }

  requestLogout(): Promise<LogoutResponse> | undefined {
    if (this.logoutPromise) {
      return this.logoutPromise;
    }

    if (
      !this.state.user &&
      this.state.phase !== 'authenticated' &&
      this.state.phase !== 'logout-error'
    ) {
      return undefined;
    }

    const transitionId = ++this.transitionId;
    const controller = new AbortController();
    const attempt: LogoutAttempt = {
      id: transitionId,
      controller,
      raw: Promise.resolve().then(() => this.api.logout({ signal: controller.signal })),
      settled: false,
      timedOut: false,
    };
    this.logoutAttempt = attempt;
    this.setState({
      phase: 'logging-out',
      user: null,
      error: undefined,
      generation: this.state.generation + 1,
    });

    let resolveBounded!: (response: LogoutResponse) => void;
    let rejectBounded!: (error: unknown) => void;
    const bounded = new Promise<LogoutResponse>((resolve, reject) => {
      resolveBounded = resolve;
      rejectBounded = reject;
    });
    this.logoutPromise = bounded;

    const settleSuccess = (response: LogoutResponse) => {
      if (attempt.settled) {
        return;
      }
      attempt.settled = true;
      this.clearLogoutTimer();
      if (this.logoutAttempt === attempt) {
        this.logoutAttempt = null;
        this.logoutPromise = null;
      }
      resolveBounded(response);
    };

    const settleFailure = (error: unknown) => {
      if (attempt.settled) {
        return;
      }
      attempt.settled = true;
      this.clearLogoutTimer();
      if (this.logoutAttempt === attempt) {
        this.logoutAttempt = null;
        this.logoutPromise = null;
      }
      rejectBounded(error);
    };

    // Observe the raw request independently. A late success after a timeout
    // can still confirm revocation; a late response from a retried attempt is
    // ignored by the transition id.
    void attempt.raw.then(
      (response) => {
        this.finishLogoutSuccess(attempt, response);
        settleSuccess(response);
      },
      (error: unknown) => {
        this.finishLogoutFailure(attempt, error);
        settleFailure(error);
      },
    );

    this.logoutTimer = setTimeout(() => {
      if (attempt.settled) {
        return;
      }

      attempt.timedOut = true;
      attempt.controller.abort();
      const timeoutError = new LogoutTimeoutError();
      settleFailure(timeoutError);
      if (this.transitionId === transitionId) {
        this.setState({
          phase: 'logout-error',
          user: null,
          error: timeoutError.message,
        });
      }
    }, this.timeoutMs);

    return bounded;
  }

  retryLogout(): Promise<LogoutResponse> | undefined {
    if (this.logoutPromise) {
      return this.logoutPromise;
    }

    return this.requestLogout();
  }

  /**
   * Locally invalidate a session whose protected request was rejected. This
   * path never calls /auth/logout, and the generation guard prevents a stale
   * request from logging out a newer login.
   */
  expireSession(expectedGeneration?: number): boolean {
    if (expectedGeneration !== undefined && expectedGeneration !== this.state.generation) {
      return false;
    }

    if (this.state.phase === 'logging-out' || this.state.phase === 'logout-error') {
      return false;
    }

    ++this.transitionId;
    this.setState({
      phase: 'unauthenticated',
      user: null,
      error: undefined,
      generation: this.state.generation + 1,
    });
    return true;
  }

  private finishLogoutSuccess(attempt: LogoutAttempt, _response: LogoutResponse): void {
    if (this.transitionId !== attempt.id) {
      return;
    }

    this.setState({
      phase: 'unauthenticated',
      user: null,
      error: undefined,
    });
  }

  private finishLogoutFailure(attempt: LogoutAttempt, error: unknown): void {
    if (
      this.transitionId !== attempt.id ||
      attempt.timedOut ||
      error instanceof LogoutTimeoutError
    ) {
      return;
    }

    this.setState({
      phase: 'logout-error',
      user: null,
      error: toOperationError(error, 'Не удалось подтвердить выход. Повторите попытку.').message,
    });
  }

  private clearLogoutTimer(): void {
    if (this.logoutTimer !== null) {
      clearTimeout(this.logoutTimer);
      this.logoutTimer = null;
    }
  }

  private setState(patch: Partial<SessionState>): void {
    this.state = {
      ...this.state,
      ...patch,
    };
    for (const listener of this.listeners) {
      listener();
    }
  }
}
