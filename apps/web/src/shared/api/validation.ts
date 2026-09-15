import { RegistrationMode, RegistrationStatus } from '@workshop-desk/contracts';
import { API_ERROR_CODES, isPositiveInteger, isRecord, isUser } from '@workshop-desk/contracts';
import type {
  ApiErrorResponse,
  LoginResponse,
  LogoutResponse,
  ParticipantsResponse,
  SessionResponse,
  CatalogWorkshop,
  MyRegistrationResponse,
  OrganizerRegistrationsResponse,
  Registration,
  UpdateRegistrationResponse,
  WorkshopResponse,
  WorkshopsResponse,
} from '@workshop-desk/contracts';

const errorCodes = new Set<string>(API_ERROR_CODES);
const registrationStatuses = new Set<string>(Object.values(RegistrationStatus));
export type { RegistrationMode } from '@workshop-desk/contracts';

export interface CreateRegistrationRequest {
  attendeeName: string;
  comment: string;
  mode: RegistrationMode;
  expectedVersion: number | null;
}

export interface CreateRegistrationResponse {
  registration: Registration;
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (!isRecord(value)) {
    return false;
  }

  const code = value.code;
  const message = value.message;
  const fieldErrors = value.fieldErrors;

  if (typeof code !== 'string' || !errorCodes.has(code) || typeof message !== 'string') {
    return false;
  }

  if (fieldErrors !== undefined) {
    if (!isRecord(fieldErrors)) {
      return false;
    }

    if (!Object.values(fieldErrors).every((item) => typeof item === 'string')) {
      return false;
    }
  }

  return true;
}

export function isRegistration(value: unknown): value is Registration {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.workshopId === 'string' &&
    typeof value.participantId === 'string' &&
    typeof value.attendeeName === 'string' &&
    typeof value.comment === 'string' &&
    typeof value.status === 'string' &&
    registrationStatuses.has(value.status) &&
    isPositiveInteger(value.version)
  );
}

export function isWorkshop(value: unknown): value is Record<string, unknown> & {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  location: string;
  capacity: number;
} {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    typeof value.startsAt === 'string' &&
    typeof value.location === 'string' &&
    isPositiveInteger(value.capacity)
  );
}

export function isWorkshopSnapshot(value: unknown): value is WorkshopResponse['workshop'] {
  if (!isWorkshop(value)) {
    return false;
  }

  return (
    (isPositiveInteger(value.confirmedCount) || value.confirmedCount === 0) &&
    (isPositiveInteger(value.waitlistedCount) || value.waitlistedCount === 0) &&
    typeof value.availableSeats === 'number' &&
    Number.isSafeInteger(value.availableSeats) &&
    value.availableSeats >= 0
  );
}

export function isNullableRegistration(value: unknown): value is Registration | null {
  return value === null || isRegistration(value);
}

export function isCatalogWorkshop(value: unknown): value is CatalogWorkshop {
  if (!isWorkshopSnapshot(value) || !isRecord(value)) {
    return false;
  }

  return isNullableRegistration(value.myRegistration);
}

export function isWorkshopsResponse(value: unknown): value is WorkshopsResponse {
  return (
    isRecord(value) && Array.isArray(value.workshops) && value.workshops.every(isCatalogWorkshop)
  );
}

export function isWorkshopResponse(value: unknown): value is WorkshopResponse {
  return (
    isRecord(value) &&
    isWorkshopSnapshot(value.workshop) &&
    isNullableRegistration(value.myRegistration)
  );
}

export function isMyRegistrationResponse(value: unknown): value is MyRegistrationResponse {
  return isRecord(value) && isNullableRegistration(value.registration);
}

export function isOrganizerRegistrationsResponse(
  value: unknown,
): value is OrganizerRegistrationsResponse {
  return (
    isRecord(value) &&
    isWorkshopSnapshot(value.workshop) &&
    Array.isArray(value.registrations) &&
    value.registrations.every(isRegistration)
  );
}

export function isUpdateRegistrationResponse(value: unknown): value is UpdateRegistrationResponse {
  return isRecord(value) && isRegistration(value.registration);
}

export function isCreateRegistrationResponse(value: unknown): value is CreateRegistrationResponse {
  return isRecord(value) && isRegistration(value.registration);
}

export function isUserResponse(value: unknown): value is LoginResponse | SessionResponse {
  return isRecord(value) && isUser(value.user);
}

export function isLogoutResponse(value: unknown): value is LogoutResponse {
  return isRecord(value) && value.ok === true;
}

export function isParticipantsResponse(value: unknown): value is ParticipantsResponse {
  return isRecord(value) && Array.isArray(value.users) && value.users.every(isUser);
}
