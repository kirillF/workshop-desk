import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { isRecord } from '../../../packages/contracts/src/index.ts';
import {
  authenticate,
  LoginRateLimiter,
  parseLoginRequest,
  readSessionCookie,
  readParticipants,
  requireSession,
  resolvePreviewTarget,
  revokeSession,
  sessionResponse,
} from './modules/auth/index.ts';
import { clearSessionCookie, setSessionCookie } from './modules/auth/cookie.ts';
import {
  createRegistration,
  parseCreateRegistrationRequest,
  parseUpdateRegistrationRequest,
  readMyRegistration,
  readOrganizerRegistrations,
  updateRegistration,
} from './modules/registrations/index.ts';
import { readWorkshopDetails, readWorkshops } from './modules/workshops/index.ts';
import { ApiProblem } from './shared/http/errors.ts';
import {
  assertAllowedOrigin,
  decodePath,
  firstHeaderValue,
  readJsonBody,
  requireJsonContentType,
  sendJson,
  setCorsHeaders,
} from './shared/http/index.ts';
import { TestControls, type RequestMetadata } from './shared/test-controls.ts';

export type RouteDependencies = {
  database: DatabaseSync;
  databasePath: string;
  controls: TestControls | null;
  allowedOrigin: string;
  secureCookies: boolean;
  limiter: LoginRateLimiter;
};

function createRequestMetadata(
  request: IncomingMessage,
  path: string[],
  userId: string | undefined,
): RequestMetadata {
  const registrationId = path[0] === 'registrations' && path.length >= 2 ? path[1] : undefined;

  return {
    requestId: randomUUID(),
    operationId: firstHeaderValue(request.headers['x-operation-id']) ?? randomUUID(),
    method: request.method ?? 'UNKNOWN',
    path: `/${path.join('/')}`,
    ...(userId ? { identity: userId } : {}),
    ...(registrationId ? { registrationId } : {}),
  };
}

function setRequestedVersion(metadata: RequestMetadata | undefined, body: unknown): void {
  if (!metadata || !isRecord(body) || !('expectedVersion' in body)) {
    return;
  }
  const expectedVersion = body.expectedVersion;
  if (expectedVersion === null || typeof expectedVersion === 'number') {
    metadata.requestedVersion = expectedVersion;
  }
}

function setRegistrationIdFromPayload(metadata: RequestMetadata, payload: unknown): void {
  if (!isRecord(payload) || !isRecord(payload.registration)) {
    return;
  }
  if (typeof payload.registration.id === 'string') {
    metadata.registrationId = payload.registration.id;
  }
}

async function runControlled<T>(
  controls: TestControls | null,
  metadata: RequestMetadata | undefined,
  response: ServerResponse,
  statusCode: number,
  operation: () => T,
  outcomeEvent: string,
): Promise<void> {
  try {
    if (controls && metadata) {
      await controls.before(metadata);
    }

    const payload = operation();

    if (controls && metadata) {
      setRegistrationIdFromPayload(metadata, payload);
      controls.record(metadata, outcomeEvent);
    }

    const responseAction = controls && metadata ? await controls.after(metadata) : 'send';

    if (responseAction === 'drop') {
      response.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Content-Length': '100000',
      });
      response.write('{', () => response.destroy());
      return;
    }

    sendJson(response, statusCode, payload);
    if (controls && metadata) {
      controls.record(metadata, 'responded', { status: statusCode });
    }
  } catch (error) {
    if (controls && metadata && !controls.hasEvent(metadata.requestId, 'rejected')) {
      controls.record(metadata, error instanceof ApiProblem ? 'rejected' : 'failed');
    }
    throw error;
  }
}

async function routeControlRequest(
  request: IncomingMessage,
  response: ServerResponse,
  path: string[],
  url: URL,
  controls: TestControls,
): Promise<void> {
  if (request.method === 'GET' && path.length === 2 && path[1] === 'queue') {
    sendJson(response, 200, controls.queue());
    return;
  }

  if (request.method === 'GET' && path.length === 2 && path[1] === 'log') {
    sendJson(response, 200, controls.log());
    return;
  }

  if (request.method === 'GET' && path.length === 2 && path[1] === 'rules') {
    sendJson(response, 200, controls.activeRules());
    return;
  }

  if (request.method === 'POST' && path.length === 2 && path[1] === 'rules') {
    requireJsonContentType(request);
    const body = await readJsonBody(request);
    sendJson(response, 201, controls.addRule(body));
    return;
  }

  if (request.method === 'POST' && path.length === 2 && path[1] === 'release') {
    let queueId = url.searchParams.get('queueId') ?? undefined;
    let ruleId = url.searchParams.get('ruleId') ?? undefined;
    let outcome: 'continue' | 'reject' = 'continue';
    const queryOutcome = url.searchParams.get('outcome');

    if (queryOutcome !== null) {
      if (queryOutcome !== 'continue' && queryOutcome !== 'reject') {
        throw new ApiProblem('VALIDATION_ERROR', 'outcome должен быть continue или reject.');
      }
      outcome = queryOutcome;
    }

    if (!queueId && !ruleId) {
      requireJsonContentType(request);
      const body = await readJsonBody(request);
      if (!isRecord(body)) {
        throw new ApiProblem('VALIDATION_ERROR', 'Тело освобождения должно быть JSON-объектом.');
      }
      queueId = typeof body.queueId === 'string' ? body.queueId : undefined;
      ruleId = typeof body.ruleId === 'string' ? body.ruleId : undefined;
      if (body.outcome !== undefined && body.outcome !== 'continue' && body.outcome !== 'reject') {
        throw new ApiProblem('VALIDATION_ERROR', 'outcome должен быть continue или reject.');
      }
      if (body.outcome === 'reject') {
        outcome = 'reject';
      }
    }

    if (!queueId && !ruleId) {
      throw new ApiProblem('VALIDATION_ERROR', 'Укажите queueId или ruleId.');
    }

    sendJson(response, 200, {
      ready: true,
      released: controls.release(queueId, ruleId, outcome),
    });
    return;
  }

  sendJson(response, 404, {
    code: 'NOT_FOUND',
    message: 'Маршрут тестового управления не найден.',
  });
}

function cookieHeader(request: IncomingMessage): string | undefined {
  return firstHeaderValue(request.headers.cookie);
}

function clientIp(request: IncomingMessage): string {
  return request.socket.remoteAddress || 'unknown';
}

export async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: RouteDependencies,
): Promise<void> {
  const { database, databasePath, controls, allowedOrigin, secureCookies, limiter } = dependencies;
  const url = new URL(request.url ?? '/', 'http://localhost');
  const path = decodePath(url.pathname);

  setCorsHeaders(request, response, allowedOrigin);

  if (!path) {
    sendJson(response, 404, {
      code: 'NOT_FOUND',
      message: 'Маршрут не найден.',
    });
    return;
  }

  if (request.method === 'OPTIONS') {
    assertAllowedOrigin(request, allowedOrigin);
    response.statusCode = 204;
    response.end();
    return;
  }

  if (path[0] === '__test') {
    if (!controls) {
      sendJson(response, 404, {
        code: 'NOT_FOUND',
        message: 'Маршрут не найден.',
      });
      return;
    }
    await routeControlRequest(request, response, path, url, controls);
    return;
  }

  if (request.method === 'GET' && path.length === 1 && path[0] === 'health') {
    try {
      database.prepare('SELECT 1 AS ready').get();
      sendJson(response, 200, {
        status: 'ok',
        database: 'ready',
        databasePath,
      });
    } catch {
      sendJson(response, 503, {
        status: 'error',
        database: 'unavailable',
      });
    }
    return;
  }

  assertAllowedOrigin(request, allowedOrigin);

  if (
    (request.method === 'POST' || request.method === 'PATCH') &&
    request.headers['x-preview-user-id'] !== undefined
  ) {
    throw new ApiProblem('FORBIDDEN', 'В режиме просмотра изменения недоступны.');
  }

  if (path[0] === 'auth' && path.length === 2 && path[1] === 'login') {
    if (request.method !== 'POST') {
      sendJson(response, 404, { code: 'NOT_FOUND', message: 'Маршрут не найден.' });
      return;
    }
    requireJsonContentType(request);
    const ip = clientIp(request);
    if (limiter.isBlocked(ip)) {
      throw new ApiProblem('RATE_LIMITED', 'Слишком много неудачных попыток. Повторите позже.');
    }
    const body = await readJsonBody(request);
    const credentials = parseLoginRequest(body);
    try {
      const result = authenticate(
        database,
        credentials.email,
        credentials.password,
        readSessionCookie(cookieHeader(request)),
      );
      limiter.clear(ip);
      setSessionCookie(response, result.token, secureCookies);
      sendJson(response, 200, result.response);
    } catch (error) {
      if (error instanceof ApiProblem && error.code === 'UNAUTHENTICATED') {
        limiter.recordFailure(ip);
      }
      throw error;
    }
    return;
  }

  if (path[0] === 'auth' && path.length === 2 && path[1] === 'session') {
    if (request.method !== 'GET') {
      sendJson(response, 404, { code: 'NOT_FOUND', message: 'Маршрут не найден.' });
      return;
    }
    const user = requireSession(database, cookieHeader(request));
    sendJson(response, 200, sessionResponse(user));
    return;
  }

  if (path[0] === 'auth' && path.length === 2 && path[1] === 'logout') {
    if (request.method !== 'POST') {
      sendJson(response, 404, { code: 'NOT_FOUND', message: 'Маршрут не найден.' });
      return;
    }
    requireJsonContentType(request);
    const body = await readJsonBody(request);
    if (!isRecord(body)) {
      throw new ApiProblem('VALIDATION_ERROR', 'Тело запроса должно быть JSON-объектом.');
    }
    const result = revokeSession(database, cookieHeader(request));
    clearSessionCookie(response, secureCookies);
    sendJson(response, 200, result);
    return;
  }

  const sessionUser = requireSession(database, cookieHeader(request));
  const previewUserId = resolvePreviewTarget(
    database,
    sessionUser,
    firstHeaderValue(request.headers['x-preview-user-id']),
  );
  const viewedUserId = previewUserId ?? sessionUser.id;
  const metadata = controls ? createRequestMetadata(request, path, sessionUser.id) : undefined;
  if (controls && metadata) {
    controls.record(metadata, 'arrived');
  }

  try {
    if (request.method === 'GET' && path.length === 1 && path[0] === 'admin') {
      if (path[0] === 'admin') {
        sendJson(response, 404, { code: 'NOT_FOUND', message: 'Маршрут не найден.' });
      }
      return;
    }

    if (
      request.method === 'GET' &&
      path.length === 2 &&
      path[0] === 'admin' &&
      path[1] === 'participants'
    ) {
      if (previewUserId) {
        throw new ApiProblem(
          'FORBIDDEN',
          'Предпросмотр нельзя использовать для списка участников.',
        );
      }
      sendJson(response, 200, readParticipants(database, sessionUser));
      return;
    }

    if (request.method === 'GET' && path.length === 1 && path[0] === 'workshops') {
      await runControlled(
        controls,
        metadata,
        response,
        200,
        () => readWorkshops(database, viewedUserId),
        'snapshot-ready',
      );
      return;
    }

    if (request.method === 'GET' && path.length === 2 && path[0] === 'workshops') {
      await runControlled(
        controls,
        metadata,
        response,
        200,
        () => readWorkshopDetails(database, path[1], viewedUserId),
        'snapshot-ready',
      );
      return;
    }

    if (
      request.method === 'GET' &&
      path.length === 3 &&
      path[0] === 'workshops' &&
      path[2] === 'my-registration'
    ) {
      await runControlled(
        controls,
        metadata,
        response,
        200,
        () => readMyRegistration(database, path[1], viewedUserId),
        'snapshot-ready',
      );
      return;
    }

    if (
      request.method === 'GET' &&
      path.length === 3 &&
      path[0] === 'workshops' &&
      path[2] === 'registrations'
    ) {
      if (previewUserId) {
        throw new ApiProblem(
          'FORBIDDEN',
          'Регистрации организатора недоступны в режиме просмотра.',
        );
      }
      await runControlled(
        controls,
        metadata,
        response,
        200,
        () => readOrganizerRegistrations(database, path[1], sessionUser.id),
        'snapshot-ready',
      );
      return;
    }

    if (
      request.method === 'POST' &&
      path.length === 3 &&
      path[0] === 'workshops' &&
      path[2] === 'registrations'
    ) {
      requireJsonContentType(request);
      if (previewUserId) {
        throw new ApiProblem('FORBIDDEN', 'Изменения в режиме просмотра запрещены.');
      }
      const body = await readJsonBody(request);
      setRequestedVersion(metadata, body);
      const create = parseCreateRegistrationRequest(body);
      await runControlled(
        controls,
        metadata,
        response,
        201,
        () => createRegistration(database, path[1], sessionUser.id, create),
        'committed',
      );
      return;
    }

    if (request.method === 'PATCH' && path.length === 2 && path[0] === 'registrations') {
      requireJsonContentType(request);
      if (previewUserId) {
        throw new ApiProblem('FORBIDDEN', 'Изменения в режиме просмотра запрещены.');
      }
      const body = await readJsonBody(request);
      setRequestedVersion(metadata, body);
      const update = parseUpdateRegistrationRequest(body);
      await runControlled(
        controls,
        metadata,
        response,
        200,
        () => updateRegistration(database, path[1], sessionUser.id, update),
        'committed',
      );
      return;
    }

    sendJson(response, 404, {
      code: 'NOT_FOUND',
      message: 'Маршрут не найден.',
    });
  } catch (error) {
    if (controls && metadata && !controls.hasEvent(metadata.requestId, 'rejected')) {
      controls.record(metadata, error instanceof ApiProblem ? 'rejected' : 'failed');
    }
    throw error;
  }
}
