import type { IncomingMessage, ServerResponse } from 'node:http';

import { ApiProblem } from './errors.ts';
import { firstHeaderValue } from './request.ts';

export function configuredOrigin(value: string | undefined): string {
  const fallback = 'http://127.0.0.1:5173';
  const candidate = (value ?? fallback).trim();
  try {
    return new URL(candidate).origin;
  } catch {
    throw new Error(`WEB_ORIGIN must be an absolute origin; received ${candidate}.`);
  }
}

export function setCorsHeaders(
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigin: string,
): void {
  const origin = firstHeaderValue(request.headers.origin);
  if (origin === allowedOrigin) {
    response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Operation-Id, X-Preview-User-Id',
  );
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
}

export function assertAllowedOrigin(request: IncomingMessage, allowedOrigin: string): void {
  const origin = firstHeaderValue(request.headers.origin);
  if (origin && origin !== allowedOrigin) {
    throw new ApiProblem('FORBIDDEN', 'Источник запроса не разрешён.');
  }
}
