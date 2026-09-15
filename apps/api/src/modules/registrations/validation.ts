import {
  isPositiveInteger,
  isRecord,
  isRegistrationAction,
  isRegistrationMode,
} from '../../../../../packages/contracts/src/index.ts';
import type {
  CreateRegistrationRequest,
  RegistrationAction,
  RegistrationMode,
  UpdateRegistrationRequest,
} from '../../../../../packages/contracts/src/index.ts';
import { ApiProblem } from '../../shared/http/errors.ts';

function characterCount(value: string): number {
  return [...value].length;
}

export function parseCreateRegistrationRequest(value: unknown): CreateRegistrationRequest {
  if (!isRecord(value)) {
    throw new ApiProblem('VALIDATION_ERROR', 'Тело запроса должно быть JSON-объектом.');
  }

  const fieldErrors: Record<string, string> = {};
  const attendeeName = value.attendeeName;
  const comment = value.comment;
  const mode = value.mode;
  const expectedVersion = value.expectedVersion;

  if (typeof attendeeName !== 'string' || characterCount(attendeeName.trim()) < 1) {
    fieldErrors.attendeeName = 'Имя обязательно.';
  } else if (characterCount(attendeeName.trim()) > 80) {
    fieldErrors.attendeeName = 'Имя должно содержать не более 80 символов.';
  }

  if (comment !== undefined && typeof comment !== 'string') {
    fieldErrors.comment = 'Комментарий должен быть строкой.';
  } else if (typeof comment === 'string' && characterCount(comment) > 500) {
    fieldErrors.comment = 'Комментарий должен содержать не более 500 символов.';
  }

  if (!isRegistrationMode(mode)) {
    fieldErrors.mode = 'Режим должен быть seat или waitlist.';
  }

  if (expectedVersion !== null && !isPositiveInteger(expectedVersion)) {
    fieldErrors.expectedVersion = 'Версия должна быть null или положительным целым числом.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new ApiProblem('VALIDATION_ERROR', 'Проверьте параметры запроса.', fieldErrors);
  }

  return {
    attendeeName: (attendeeName as string).trim(),
    comment: typeof comment === 'string' ? comment : '',
    mode: mode as RegistrationMode,
    expectedVersion: expectedVersion as number | null,
  };
}

export function parseUpdateRegistrationRequest(value: unknown): UpdateRegistrationRequest {
  if (!isRecord(value)) {
    throw new ApiProblem('VALIDATION_ERROR', 'Тело запроса должно быть JSON-объектом.');
  }

  const fieldErrors: Record<string, string> = {};
  const action = value.action;
  const expectedVersion = value.expectedVersion;

  if (!isRegistrationAction(action)) {
    fieldErrors.action = 'Действие должно быть confirm или cancel.';
  }
  if (!isPositiveInteger(expectedVersion)) {
    fieldErrors.expectedVersion = 'Версия должна быть положительным целым числом.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new ApiProblem('VALIDATION_ERROR', 'Проверьте параметры запроса.', fieldErrors);
  }

  return {
    action: action as RegistrationAction,
    expectedVersion: expectedVersion as number,
  };
}
