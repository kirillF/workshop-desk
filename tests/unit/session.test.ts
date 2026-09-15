import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SessionController,
  type SessionApi,
} from '../../apps/web/src/features/auth/model/session-controller.ts';
const user = { id: 'a', displayName: 'Anna', role: 'participant' as const };
const other = { id: 'b', displayName: 'Boris', role: 'participant' as const };
const credentials = { email: 'demo@local', password: 'password' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup() {
  const api = {
    getSession: vi.fn<SessionApi['getSession']>().mockResolvedValue({ user }),
    login: vi.fn<SessionApi['login']>().mockResolvedValue({ user }),
    logout: vi.fn<SessionApi['logout']>().mockResolvedValue({ ok: true }),
  };
  return { api, controller: new SessionController(api, { timeoutMs: 100 }) };
}
afterEach(() => vi.useRealTimers());

describe('session transition isolation', () => {
  it('distinguishes absent credentials from unavailable session service', async () => {
    const { api, controller } = setup();
    api.getSession.mockRejectedValueOnce({ code: 'UNAUTHENTICATED', message: 'Expired' });
    await controller.restore();
    expect(controller.getState().phase).toBe('unauthenticated');
    api.getSession.mockRejectedValueOnce(new TypeError('offline'));
    await controller.restore();
    expect(controller.getState()).toMatchObject({ phase: 'restore-error', user: null });
    await controller.retryRestore();
    expect(controller.getState()).toMatchObject({ phase: 'authenticated', user });
  });
  it('coalesces restore requests and ignores old restore success after a new login', async () => {
    const { api, controller } = setup();
    const old = deferred<{ user: typeof user }>();
    api.getSession.mockReturnValue(old.promise);
    const pending = controller.restore();
    expect(controller.retryRestore()).toBe(pending);
    api.login.mockResolvedValue({ user: other });
    await controller.login(credentials);
    old.resolve({ user });
    await pending;
    expect(controller.getState().user?.id).toBe(other.id);
    expect(api.getSession).toHaveBeenCalledTimes(1);
  });
  it('coalesces login and keeps generic failures recoverable', async () => {
    const { api, controller } = setup();
    const request = deferred<{ user: typeof user }>();
    api.login.mockReturnValueOnce(request.promise);
    const a = controller.login(credentials);
    const b = controller.login(credentials);
    expect(a).toBe(b);
    request.reject({ code: 'UNAUTHENTICATED', message: 'Wrong credentials' });
    await expect(a).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(controller.getState()).toMatchObject({
      phase: 'unauthenticated',
      user: null,
      error: 'Wrong credentials',
    });
    await controller.login(credentials);
    expect(controller.getState().phase).toBe('authenticated');
  });
  it('old 401 cannot expire a newly authenticated identity or send logout', async () => {
    const { api, controller } = setup();
    await controller.restore();
    const old = controller.getState().generation;
    controller.expireSession(old);
    api.login.mockResolvedValue({ user: other });
    await controller.login(credentials);
    expect(controller.expireSession(old)).toBe(false);
    expect(controller.getState().user?.id).toBe(other.id);
    expect(api.logout).not.toHaveBeenCalled();
  });
  it('explicit logout coalesces clicks, hides private data and confirms revocation', async () => {
    const { api, controller } = setup();
    await controller.restore();
    const held = deferred<{ ok: true }>();
    api.logout.mockReturnValue(held.promise);
    const a = controller.requestLogout();
    const b = controller.requestLogout();
    expect(a).toBe(b);
    expect(controller.getState()).toMatchObject({ phase: 'logging-out', user: null });
    await expect(controller.login(credentials)).rejects.toThrow();
    expect(controller.expireSession()).toBe(false);
    held.resolve({ ok: true });
    await a;
    expect(controller.getState().phase).toBe('unauthenticated');
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(controller.requestLogout()).toBeUndefined();
  });
  it('failed logout is not reported as logged out and can be retried', async () => {
    const { api, controller } = setup();
    await controller.restore();
    api.logout.mockRejectedValueOnce(new TypeError('offline'));
    await expect(controller.requestLogout()).rejects.toThrow('offline');
    expect(controller.getState()).toMatchObject({ phase: 'logout-error', user: null });
    await expect(controller.login(credentials)).rejects.toThrow();
    expect(controller.expireSession()).toBe(false);
    await controller.retryLogout();
    expect(controller.getState().phase).toBe('unauthenticated');
    expect(api.logout).toHaveBeenCalledTimes(2);
  });
  it('a hung logout times out, supports a new attempt and ignores the old completion', async () => {
    vi.useFakeTimers();
    const { api, controller } = setup();
    await controller.restore();
    const held = deferred<{ ok: true }>();
    api.logout.mockReturnValueOnce(held.promise);
    const attempt = controller.requestLogout()!;
    const rejected = expect(attempt).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(101);
    await rejected;
    expect(controller.getState().phase).toBe('logout-error');
    await controller.retryLogout();
    await controller.login(credentials);
    held.resolve({ ok: true });
    await Promise.resolve();
    expect(controller.getState()).toMatchObject({ phase: 'authenticated', user });
  });
  it('notifies subscribers and lets unmounted consumers unsubscribe', async () => {
    const { controller } = setup();
    const changed = vi.fn();
    const stop = controller.subscribe(changed);
    await controller.restore();
    expect(changed).toHaveBeenCalled();
    stop();
    changed.mockClear();
    controller.expireSession();
    expect(changed).not.toHaveBeenCalled();
  });
});

it('a late restore rejection does not hide an already completed login', async () => {
  const { api, controller } = setup();
  const pending = deferred<{ user: typeof user }>();
  api.getSession.mockReturnValue(pending.promise);
  const restore = controller.retryRestore();
  await controller.login(credentials);
  pending.reject(Error('old outage'));
  await restore;
  expect(controller.getState()).toMatchObject({ phase: 'authenticated', user });
});

it.each(['resolve', 'reject'] as const)(
  'an invalidated pending login cannot restore its old state on %s',
  async (outcome) => {
    const { api, controller } = setup();
    const held = deferred<{ user: typeof user }>();
    api.login.mockReturnValue(held.promise);
    const login = controller.login(credentials);
    const observed = login.catch(() => undefined);
    controller.expireSession();
    if (outcome === 'resolve') held.resolve({ user });
    else held.reject(Error('old credentials'));
    await observed;
    expect(controller.getState()).toMatchObject({ phase: 'unauthenticated', user: null });
    expect(controller.getState().error).toBeUndefined();
  },
);

it('retry during pending logout is coalesced, and late rejection after timeout cannot affect a new login', async () => {
  vi.useFakeTimers();
  const { api, controller } = setup();
  await controller.restore();
  const held = deferred<{ ok: true }>();
  api.logout.mockReturnValueOnce(held.promise);
  const attempt = controller.requestLogout()!;
  const failure = expect(attempt).rejects.toThrow();
  expect(controller.retryLogout()).toBe(attempt);
  await vi.advanceTimersByTimeAsync(101);
  await failure;
  await controller.retryLogout();
  await controller.login(credentials);
  held.reject(Error('late network failure'));
  await Promise.resolve();
  await Promise.resolve();
  expect(controller.getState()).toMatchObject({ phase: 'authenticated', user });
});

it('invalid timeout configuration falls back to the documented bounded wait', async () => {
  vi.useFakeTimers();
  const { api } = setup();
  const controller = new SessionController(api, { timeoutMs: Number.NaN });
  await controller.restore();
  api.logout.mockReturnValue(new Promise(() => undefined));
  const request = controller.requestLogout()!;
  const failure = expect(request).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(9999);
  expect(controller.getState().phase).toBe('logging-out');
  await vi.advanceTimersByTimeAsync(1);
  await failure;
  expect(controller.getState().phase).toBe('logout-error');
});
