import { RegistrationMode } from '@workshop-desk/contracts';
import type {
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  ParticipantsResponse,
  SessionResponse,
  MyRegistrationResponse,
  OrganizerRegistrationsResponse,
  Registration,
  UpdateRegistrationRequest,
  UpdateRegistrationResponse,
  WorkshopResponse,
  WorkshopsResponse,
} from '@workshop-desk/contracts';

import {
  isUserResponse,
  isLogoutResponse,
  isParticipantsResponse,
  isWorkshopsResponse,
  isWorkshopResponse,
  isMyRegistrationResponse,
  isOrganizerRegistrationsResponse,
  isUpdateRegistrationResponse,
  isCreateRegistrationResponse,
} from './validation.ts';
import {
  ApiUnknownOutcomeError,
  ApiConfigurationError,
  normalizeBaseUrl,
  serverErrorMessage,
  classifyHttpError,
} from './errors.ts';
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

export interface ApiRequestOptions {
  operationId?: string;
  signal?: AbortSignal;
  previewUserId?: string;
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const registrationModes = new Set<string>(Object.values(RegistrationMode));
const viteApiUrl = typeof import.meta.env === 'object' ? import.meta.env.VITE_API_URL : undefined;

function defaultApiUrl(): string {
  if (viteApiUrl) {
    return viteApiUrl;
  }

  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:4000';
  }

  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  return protocol + '//' + window.location.hostname + ':4000';
}

export const DEFAULT_API_URL = defaultApiUrl();

export class WorkshopApi {
  readonly baseUrl: string;

  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_API_URL);
    this.fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);
  }

  private requestUrl(path: string): string {
    return this.baseUrl + (path.startsWith('/') ? path : '/' + path);
  }

  private requestHeaders(options: ApiRequestOptions): Record<string, string> {
    const previewUserId = options.previewUserId?.trim();
    return {
      Accept: 'application/json',
      ...(previewUserId ? { 'X-Preview-User-Id': previewUserId } : {}),
      ...(options.operationId ? { 'X-Operation-Id': options.operationId } : {}),
    };
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    validate: (value: unknown) => value is T,
    options: ApiRequestOptions = {},
    body?: unknown,
  ): Promise<T> {
    const headers = this.requestHeaders(options);
    const request: RequestInit = {
      method,
      cache: 'no-store',
      credentials: 'include',
      headers,
      signal: options.signal,
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      request.body = JSON.stringify(body);
    }

    let response: Response;

    try {
      response = await this.fetchImpl(this.requestUrl(path), request);
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError';

      throw new ApiUnknownOutcomeError({
        message: aborted
          ? 'Запрос был прерван; результат операции неизвестен.'
          : 'Не удалось связаться с API; результат операции неизвестен.',
        reason: aborted ? 'aborted' : 'transport',
        cause: error,
      });
    }

    let payload: unknown;

    try {
      payload = response.status === 204 ? undefined : await response.json();
    } catch (error) {
      throw new ApiUnknownOutcomeError({
        message: response.ok
          ? 'API вернул некорректный ответ.'
          : serverErrorMessage(response.status),
        reason: response.ok ? 'protocol' : 'server',
        status: response.status,
        cause: error,
      });
    }

    if (!response.ok) {
      throw classifyHttpError(response.status, payload);
    }

    if (!validate(payload)) {
      throw new ApiUnknownOutcomeError({
        message: 'API вернул данные в неожиданном формате.',
        reason: 'protocol',
        status: response.status,
      });
    }

    return payload;
  }

  login(input: LoginRequest): Promise<LoginResponse> {
    return this.request('POST', '/auth/login', isUserResponse, {}, input);
  }

  getSession(): Promise<SessionResponse> {
    return this.request('GET', '/auth/session', isUserResponse);
  }

  logout(options: ApiRequestOptions = {}): Promise<LogoutResponse> {
    return this.request('POST', '/auth/logout', isLogoutResponse, options, {});
  }

  getParticipants(options: ApiRequestOptions = {}): Promise<ParticipantsResponse> {
    return this.request('GET', '/admin/participants', isParticipantsResponse, options);
  }

  getOrganizerParticipants(options: ApiRequestOptions = {}): Promise<ParticipantsResponse> {
    return this.getParticipants(options);
  }

  getWorkshops(options: ApiRequestOptions = {}): Promise<WorkshopsResponse> {
    return this.request('GET', '/workshops', isWorkshopsResponse, options);
  }

  getWorkshop(workshopId: string, options: ApiRequestOptions = {}): Promise<WorkshopResponse> {
    return this.request(
      'GET',
      '/workshops/' + encodeURIComponent(workshopId),
      isWorkshopResponse,
      options,
    );
  }

  getMyRegistration(
    workshopId: string,
    options: ApiRequestOptions = {},
  ): Promise<MyRegistrationResponse> {
    return this.request(
      'GET',
      '/workshops/' + encodeURIComponent(workshopId) + '/my-registration',
      isMyRegistrationResponse,
      options,
    );
  }

  getOrganizerRegistrations(
    workshopId: string,
    options: ApiRequestOptions = {},
  ): Promise<OrganizerRegistrationsResponse> {
    return this.request(
      'GET',
      '/workshops/' + encodeURIComponent(workshopId) + '/registrations',
      isOrganizerRegistrationsResponse,
      options,
    );
  }

  patchRegistration(
    registrationId: string,
    input: UpdateRegistrationRequest,
    options: ApiRequestOptions = {},
  ): Promise<UpdateRegistrationResponse> {
    return this.request(
      'PATCH',
      '/registrations/' + encodeURIComponent(registrationId),
      isUpdateRegistrationResponse,
      options,
      input,
    );
  }

  updateRegistration(
    registrationId: string,
    input: UpdateRegistrationRequest,
    options: ApiRequestOptions = {},
  ): Promise<UpdateRegistrationResponse> {
    return this.patchRegistration(registrationId, input, options);
  }

  postRegistration(
    workshopId: string,
    input: CreateRegistrationRequest,
    options: ApiRequestOptions = {},
  ): Promise<CreateRegistrationResponse> {
    if (!registrationModes.has(input.mode)) {
      throw new ApiConfigurationError('Unsupported registration mode.');
    }

    return this.request(
      'POST',
      '/workshops/' + encodeURIComponent(workshopId) + '/registrations',
      isCreateRegistrationResponse,
      options,
      input,
    );
  }

  createRegistration(
    workshopId: string,
    input: CreateRegistrationRequest,
    options: ApiRequestOptions = {},
  ): Promise<CreateRegistrationResponse> {
    return this.postRegistration(workshopId, input, options);
  }
}

export function createApiClient(options: ApiClientOptions = {}): WorkshopApi {
  return new WorkshopApi(options);
}

export { WorkshopApi as ApiClient };

export default createApiClient;
