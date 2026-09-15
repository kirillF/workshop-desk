import type { IncomingMessage } from 'node:http';

import { ApiProblem } from './errors.ts';

export function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || candidate.trim().length === 0) {
    return undefined;
  }
  return candidate.trim();
}

export function requireJsonContentType(request: IncomingMessage): void {
  const contentType = firstHeaderValue(request.headers['content-type']);
  if (!contentType || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new ApiProblem(
      'VALIDATION_ERROR',
      'Для JSON-команды требуется Content-Type: application/json.',
    );
  }
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let byteLength = 0;
  const maxBodyBytes = 1024 * 1024;

  for await (const chunk of request) {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk);
    byteLength += bytes.byteLength;
    if (byteLength > maxBodyBytes) {
      throw new ApiProblem('VALIDATION_ERROR', 'Тело запроса слишком большое.');
    }
    chunks.push(bytes);
  }

  const body = Buffer.concat(chunks).toString('utf8').trim();
  if (body.length === 0) {
    throw new ApiProblem('VALIDATION_ERROR', 'Тело запроса обязательно.');
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ApiProblem('VALIDATION_ERROR', 'Тело запроса должно содержать корректный JSON.');
  }
}

export function decodePath(pathname: string): string[] | null {
  const segments: string[] = [];
  for (const segment of pathname.split('/').filter(Boolean)) {
    try {
      segments.push(decodeURIComponent(segment));
    } catch {
      return null;
    }
  }
  return segments;
}
