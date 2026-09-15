type ErrorRecord = {
  code?: unknown;
  message?: unknown;
  fieldErrors?: unknown;
};

function asErrorRecord(error: unknown): ErrorRecord | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  return error as ErrorRecord;
}

export function isUnauthenticatedError(error: unknown): boolean {
  return asErrorRecord(error)?.code === 'UNAUTHENTICATED';
}

export function toOperationError(
  error: unknown,
  fallbackMessage: string,
): { code?: string; message: string } {
  const record = asErrorRecord(error);
  if (typeof record?.message === 'string' && record.message) {
    return {
      ...(typeof record.code === 'string' ? { code: record.code } : {}),
      message: record.message,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'CLIENT_ERROR',
      message: error.message || fallbackMessage,
    };
  }

  return {
    code: 'CLIENT_ERROR',
    message: fallbackMessage,
  };
}

export function getFieldErrors(error: unknown): Record<string, string> | undefined {
  const fieldErrors = asErrorRecord(error)?.fieldErrors;
  if (typeof fieldErrors !== 'object' || fieldErrors === null) {
    return undefined;
  }

  const entries = Object.entries(fieldErrors as Record<string, unknown>)
    .filter(([, message]) => typeof message === 'string')
    .map(([field, message]) => [field, message as string] as const);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
