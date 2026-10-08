import { describe, expect, it, vi } from 'vitest';
import {
  createApiClient,
  ApiBusinessError,
  ApiUnknownOutcomeError,
  ApiConfigurationError,
  isApiErrorResponse,
  isRegistration,
  isWorkshopSnapshot,
} from '../../apps/web/src/shared/api/index.ts';

const user = { id: 'p1', displayName: 'Anna', role: 'participant' };
const registration = {
  id: 'r1',
  workshopId: 'w1',
  participantId: 'p1',
  attendeeName: 'Anna',
  comment: '',
  status: 'confirmed',
  version: 1,
};
const workshop = {
  id: 'w1',
  title: 'API',
  description: '',
  startsAt: '2026-09-16',
  location: 'A',
  capacity: 2,
  confirmedCount: 1,
  waitlistedCount: 0,
  availableSeats: 1,
};
const create = { attendeeName: 'Anna', comment: '', mode: 'seat' as const, expectedVersion: null };
const update = { action: 'cancel' as const, expectedVersion: 1 };
const client = (payload: unknown, status = 200) => {
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify(payload), { status }));
  return { api: createApiClient({ baseUrl: ' http://api.local/ ', fetchImpl }), fetchImpl };
};

describe('credentialed transport and response boundaries', () => {
  it('encodes IDs, sends cookies and correlation metadata, and preserves explicit booking intent', async () => {
    const { api, fetchImpl } = client({ registration });
    const signal = new AbortController().signal;
    await api.createRegistration('w /?', create, { operationId: 'op', signal });
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(
      'http://api.local/workshops/w%20%2F%3F/registrations',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        signal,
        headers: {
          Accept: 'application/json',
          'X-Operation-Id': 'op',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(create),
      }),
    );
  });
  it('scopes preview reads without changing authentication', async () => {
    const { api, fetchImpl } = client({ workshops: [{ ...workshop, myRegistration: null }] });
    await api.getWorkshops({ previewUserId: ' p1 ' });
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'include',
      headers: { 'X-Preview-User-Id': 'p1' },
    });
    expect(new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).has('X-Demo-User-Id')).toBe(false);
  });
  it.each([
    ['login', { user }],
    ['getSession', { user }],
    ['logout', { ok: true }],
    ['getParticipants', { users: [user] }],
    ['getOrganizerParticipants', { users: [] }],
    ['getWorkshops', { workshops: [{ ...workshop, myRegistration: registration }] }],
    ['getWorkshop', { workshop, myRegistration: registration }],
    ['getMyRegistration', { registration: null }],
    ['getOrganizerRegistrations', { workshop, registrations: [registration] }],
    ['updateRegistration', { registration }],
    ['patchRegistration', { registration }],
    ['postRegistration', { registration }],
  ] as const)('validates the %s endpoint', async (method, payload) => {
    const { api } = client(payload);
    const result =
      method === 'login'
        ? api.login({ email: 'demo@local', password: 'password' })
        : method === 'updateRegistration' || method === 'patchRegistration'
          ? api[method]('r1', update)
          : method === 'postRegistration'
            ? api.postRegistration('w1', create)
            : method === 'getWorkshop' ||
                method === 'getMyRegistration' ||
                method === 'getOrganizerRegistrations'
              ? api[method]('w1')
              : api[method]();
    await expect(result).resolves.toEqual(payload);
  });
  it.each([400, 401, 403, 404, 409, 429, 503])(
    'classifies contract rejection %s without retry',
    async (status) => {
      const code = status === 503 ? 'SERVICE_UNAVAILABLE' : 'VALIDATION_ERROR';
      const { api, fetchImpl } = client(
        { code, message: 'Rejected', fieldErrors: { name: 'Required' } },
        status,
      );
      const error = await api.postRegistration('w1', create).catch((e) => e);
      expect(error).toBeInstanceOf(ApiBusinessError);
      expect(error).toMatchObject({
        kind: 'definitive',
        isDefinitive: true,
        isUnknownOutcome: false,
        status,
        code,
        fieldErrors: { name: 'Required' },
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    [500, { code: 'SERVICE_UNAVAILABLE', message: 'Unknown' }],
    [503, { code: 'VERSION_CONFLICT', message: 'Unknown' }],
    [418, {}],
    [502, null],
  ])('keeps ambiguous HTTP %s outcomes unknown', async (status, body) => {
    const { api, fetchImpl } = client(body, status as number);
    const error = await api.postRegistration('w1', create).catch((e) => e);
    expect(error).toBeInstanceOf(ApiUnknownOutcomeError);
    expect(error).toMatchObject({ kind: 'unknown', reason: 'server', isUnknownOutcome: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it.each([200, 502, 418])('handles malformed JSON at HTTP %s', async (status) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{', { status }));
    await expect(createApiClient({ fetchImpl }).getSession()).rejects.toMatchObject({
      reason: status === 200 ? 'protocol' : 'server',
    });
  });
  it('rejects a successful response with the wrong schema', async () => {
    const { api } = client({ user: { ...user, role: 'root' } });
    await expect(api.getSession()).rejects.toMatchObject({ reason: 'protocol' });
  });
  it('does not accept 204 as the required logout receipt', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(createApiClient({ fetchImpl }).logout()).rejects.toMatchObject({
      reason: 'protocol',
    });
  });
  it.each([new TypeError('offline'), new DOMException('aborted', 'AbortError')])(
    'does not retry transport errors',
    async (error) => {
      const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(error);
      await expect(
        createApiClient({ fetchImpl }).postRegistration('w1', create),
      ).rejects.toMatchObject({
        kind: 'unknown',
        reason: error.name === 'AbortError' ? 'aborted' : 'transport',
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );
  it('rejects unsupported local configuration before sending', () => {
    expect(() => createApiClient({ baseUrl: '  ' })).toThrow(ApiConfigurationError);
    const { api, fetchImpl } = client({});
    expect(() =>
      api.postRegistration('w', { ...create, mode: 'silent-upgrade' as 'seat' }),
    ).toThrow(ApiConfigurationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('untrusted DTO validation', () => {
  it.each([
    null,
    [],
    {},
    { code: 'FAKE', message: 'x' },
    { code: 'FORBIDDEN', message: 1 },
    { code: 'FORBIDDEN', message: 'x', fieldErrors: [] },
    { code: 'FORBIDDEN', message: 'x', fieldErrors: { name: 1 } },
  ])('rejects malformed error %j', (payload) => expect(isApiErrorResponse(payload)).toBe(false));
  it.each([
    null,
    {},
    { ...registration, version: 0 },
    { ...registration, status: 'pending' },
    { ...registration, attendeeName: null },
  ])('rejects malformed registration %j', (payload) => expect(isRegistration(payload)).toBe(false));
  it.each([
    null,
    {},
    { ...workshop, capacity: 0 },
    { ...workshop, confirmedCount: -1 },
    { ...workshop, waitlistedCount: -1 },
    { ...workshop, availableSeats: -1 },
    { ...workshop, availableSeats: 0.5 },
  ])('rejects malformed workshop %j', (payload) => expect(isWorkshopSnapshot(payload)).toBe(false));
  it('accepts zero counters and positive queues', () =>
    expect(
      isWorkshopSnapshot({ ...workshop, confirmedCount: 0, waitlistedCount: 2, availableSeats: 0 }),
    ).toBe(true));
});

describe('in-flight workshop reads', () => {
  const payload = { workshops: [{ ...workshop, myRegistration: null }] };
  const response = () => new Response(JSON.stringify(payload), { status: 200 });
  function held() {
    let release!: (response: Response) => void;
    const promise = new Promise<Response>((resolve) => {
      release = resolve;
    });
    return { promise, release };
  }
  it('shares overlapping reads and releases the result after completion', async () => {
    const first = held();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(first.promise)
      .mockImplementation(async () => response());
    const api = createApiClient({ fetchImpl });
    const a = api.getWorkshops();
    const b = api.getWorkshops();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    first.release(response());
    await expect(Promise.all([a, b])).resolves.toEqual([payload, payload]);
    await api.getWorkshops();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('releases failed reads so a later call can retry', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockImplementation(async () => response());
    const api = createApiClient({ fetchImpl });
    const results = await Promise.allSettled([api.getWorkshops(), api.getWorkshops()]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(api.getWorkshops()).resolves.toEqual(payload);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('keeps cancellable and correlated requests independent', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => response());
    const api = createApiClient({ fetchImpl });
    await Promise.all([
      api.getWorkshops({ signal: new AbortController().signal }),
      api.getWorkshops({ signal: new AbortController().signal }),
      api.getWorkshops({ operationId: 'one' }),
      api.getWorkshops({ operationId: 'two' }),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
  it('separates resource URLs and invalidates sharing when a mutation starts', async () => {
    const first = held();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(first.promise)
      .mockImplementation(
        async (url) =>
          new Response(
            JSON.stringify(
              String(url).endsWith('/auth/logout')
                ? { ok: true }
                : String(url).endsWith('/workshops/w1')
                  ? { workshop, myRegistration: null }
                  : payload,
            ),
            { status: 200 },
          ),
      );
    const api = createApiClient({ fetchImpl });
    const pending = api.getWorkshops();
    await api.getWorkshop('w1');
    await api.logout();
    await api.getWorkshops();
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    first.release(response());
    await pending;
  });
});
