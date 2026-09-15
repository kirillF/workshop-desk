import type { ApiErrorCode, ApiErrorResponse } from '@workshop-desk/contracts';
import { isApiErrorResponse } from './validation.ts';
export type ApiFailureKind = 'definitive' | 'unknown';

export type ApiFailureReason = 'business' | 'transport' | 'server' | 'protocol' | 'aborted';

export class ApiClientError extends Error {
  readonly kind: ApiFailureKind;
  readonly reason: ApiFailureReason;
  readonly status?: number;
  readonly code?: ApiErrorCode;
  readonly fieldErrors?: Record<string, string>;

  constructor(options: {
    message: string;
    kind: ApiFailureKind;
    reason: ApiFailureReason;
    status?: number;
    code?: ApiErrorCode;
    fieldErrors?: Record<string, string>;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'ApiClientError';
    this.kind = options.kind;
    this.reason = options.reason;
    this.status = options.status;
    this.code = options.code;
    this.fieldErrors = options.fieldErrors;
  }

  get isDefinitive(): boolean {
    return this.kind === 'definitive';
  }

  get isUnknownOutcome(): boolean {
    return this.kind === 'unknown';
  }
}

export class ApiBusinessError extends ApiClientError {
  constructor(options: {
    message: string;
    status: number;
    code: ApiErrorCode;
    fieldErrors?: Record<string, string>;
  }) {
    super({
      ...options,
      kind: 'definitive',
      reason: 'business',
    });
    this.name = 'ApiBusinessError';
  }
}

export class ApiUnknownOutcomeError extends ApiClientError {
  constructor(options: {
    message: string;
    reason: Exclude<ApiFailureReason, 'business'>;
    status?: number;
    code?: ApiErrorCode;
    cause?: unknown;
  }) {
    super({
      ...options,
      kind: 'unknown',
    });
    this.name = 'ApiUnknownOutcomeError';
  }
}

export class ApiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiConfigurationError';
  }
}

export function normalizeBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');

  if (!normalized) {
    throw new ApiConfigurationError('API base URL must not be empty.');
  }

  return normalized;
}

function isDefinitiveErrorStatus(status: number, payload: ApiErrorResponse): boolean {
  return (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 409 ||
    status === 429 ||
    (status === 503 && payload.code === 'SERVICE_UNAVAILABLE')
  );
}

export function serverErrorMessage(status: number): string {
  return status >= 500 ? 'Сервис временно недоступен.' : 'Сервис вернул ошибку.';
}

export function classifyHttpError(status: number, payload: unknown): ApiClientError {
  if (isApiErrorResponse(payload) && isDefinitiveErrorStatus(status, payload)) {
    return new ApiBusinessError({
      message: payload.message,
      status,
      code: payload.code,
      fieldErrors: payload.fieldErrors,
    });
  }

  const errorPayload = isApiErrorResponse(payload) ? payload : undefined;

  return new ApiUnknownOutcomeError({
    message: errorPayload?.message || serverErrorMessage(status),
    reason: 'server',
    status,
    code: errorPayload?.code,
    cause: payload,
  });
}
