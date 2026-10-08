export const UserRole = {
  Participant: 'participant',
  Organizer: 'organizer',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const RegistrationStatus = {
  Confirmed: 'confirmed',
  Waitlisted: 'waitlisted',
  Cancelled: 'cancelled',
} as const;

export type RegistrationStatus = (typeof RegistrationStatus)[keyof typeof RegistrationStatus];

export const RegistrationAction = {
  Confirm: 'confirm',
  Cancel: 'cancel',
  Edit: 'edit',
} as const;

export type RegistrationAction = (typeof RegistrationAction)[keyof typeof RegistrationAction];

export const RegistrationMode = {
  Seat: 'seat',
  Waitlist: 'waitlist',
} as const;

export type RegistrationMode = (typeof RegistrationMode)[keyof typeof RegistrationMode];

export interface User {
  id: string;
  displayName: string;
  role: UserRole;
}

export interface Workshop {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  location: string;
  capacity: number;
}

export interface WorkshopSnapshot extends Workshop {
  confirmedCount: number;
  waitlistedCount: number;
  availableSeats: number;
}

export interface Registration {
  id: string;
  workshopId: string;
  participantId: string;
  attendeeName: string;
  comment: string;
  status: RegistrationStatus;
  version: number;
}

export interface CatalogWorkshop extends WorkshopSnapshot {
  myRegistration: Registration | null;
}

export interface WorkshopsResponse {
  workshops: CatalogWorkshop[];
}

export interface WorkshopResponse {
  workshop: WorkshopSnapshot;
  myRegistration: Registration | null;
}

export interface MyRegistrationResponse {
  registration: Registration | null;
}

export interface OrganizerRegistrationsResponse {
  workshop: WorkshopSnapshot;
  registrations: Registration[];
}

export type UpdateRegistrationRequest = { expectedVersion: number } & (
  | { action: typeof RegistrationAction.Edit; attendeeName: string; comment: string }
  | { action: typeof RegistrationAction.Confirm | typeof RegistrationAction.Cancel }
);

export interface UpdateRegistrationResponse {
  registration: Registration;
}

export interface CreateRegistrationRequest {
  attendeeName: string;
  comment: string;
  mode: RegistrationMode;
  expectedVersion: number | null;
}

export interface CreateRegistrationResponse {
  registration: Registration;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
}

export interface SessionResponse {
  user: User;
}

export interface LogoutResponse {
  ok: true;
}

export interface ParticipantsResponse {
  users: User[];
}

export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'RATE_LIMITED',
  'FORBIDDEN',
  'NOT_FOUND',
  'SEATS_FULL',
  'ALREADY_REGISTERED',
  'VERSION_CONFLICT',
  'INVALID_TRANSITION',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorResponse {
  code: ApiErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isRegistrationAction(value: unknown): value is RegistrationAction {
  return (
    value === RegistrationAction.Confirm ||
    value === RegistrationAction.Cancel ||
    value === RegistrationAction.Edit
  );
}

export function isRegistrationMode(value: unknown): value is RegistrationMode {
  return value === RegistrationMode.Seat || value === RegistrationMode.Waitlist;
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function isUpdateRegistrationRequest(value: unknown): value is UpdateRegistrationRequest {
  return (
    isRecord(value) &&
    isRegistrationAction(value.action) &&
    isPositiveInteger(value.expectedVersion) &&
    (value.action !== RegistrationAction.Edit ||
      (typeof value.attendeeName === 'string' && typeof value.comment === 'string'))
  );
}

export function isUser(value: unknown): value is User {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.displayName === 'string' &&
    (value.role === UserRole.Participant || value.role === UserRole.Organizer)
  );
}

export function isLoginRequest(value: unknown): value is LoginRequest {
  return isRecord(value) && typeof value.email === 'string' && typeof value.password === 'string';
}
