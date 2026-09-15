import type {
  ApiErrorCode,
  ApiErrorResponse,
} from '../../../../../packages/contracts/src/index.ts';

/** HTTP status mapping for every public API error code. */
export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  RATE_LIMITED: 429,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SEATS_FULL: 409,
  ALREADY_REGISTERED: 409,
  VERSION_CONFLICT: 409,
  INVALID_TRANSITION: 409,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

/** A definitive, client-safe API failure. */
export class ApiProblem extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly fieldErrors?: Record<string, string>;

  constructor(code: ApiErrorCode, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = 'ApiProblem';
    this.code = code;
    this.statusCode = API_ERROR_STATUS[code];
    this.fieldErrors = fieldErrors;
  }
}

export function toApiErrorResponse(problem: ApiProblem): ApiErrorResponse {
  return {
    code: problem.code,
    message: problem.message,
    ...(problem.fieldErrors ? { fieldErrors: problem.fieldErrors } : {}),
  };
}
