import type { ServerResponse } from 'node:http';

import type { ApiErrorResponse } from '../../../../../packages/contracts/src/index.ts';
import { API_ERROR_STATUS, ApiProblem, toApiErrorResponse } from './errors.ts';

export function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  if (response.writableEnded || response.destroyed) {
    return;
  }
  const body = JSON.stringify(payload);
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Length', Buffer.byteLength(body));
  response.end(body);
}

export function sendProblem(response: ServerResponse, error: unknown): void {
  if (response.writableEnded || response.destroyed) {
    return;
  }

  if (error instanceof ApiProblem) {
    const payload: ApiErrorResponse = toApiErrorResponse(error);
    sendJson(response, error.statusCode, payload);
    return;
  }

  const databaseCode =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;

  if (databaseCode === 'SQLITE_BUSY' || databaseCode === 'SQLITE_LOCKED') {
    sendJson(response, API_ERROR_STATUS.SERVICE_UNAVAILABLE, {
      code: 'SERVICE_UNAVAILABLE',
      message: 'База данных временно занята. Повторите запрос.',
    });
    return;
  }

  sendJson(response, API_ERROR_STATUS.INTERNAL_ERROR, {
    code: 'INTERNAL_ERROR',
    message: 'Внутренняя ошибка сервера.',
  });
}
