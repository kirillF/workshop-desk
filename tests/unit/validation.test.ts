import { describe, expect, it } from 'vitest';
import {
  parseCreateRegistrationRequest,
  parseUpdateRegistrationRequest,
} from '../../apps/api/src/modules/registrations/validation.ts';
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  digestSessionToken,
} from '../../apps/api/src/modules/auth/crypto.ts';
import { isLoginRequest, isUpdateRegistrationRequest, isUser } from '@workshop-desk/contracts';

const input = { attendeeName: 'Anna', comment: '', mode: 'seat', expectedVersion: null };
describe('registration request boundaries', () => {
  it.each([null, [], 'text', 1])('rejects non-object create body %j', (body) =>
    expect(() => parseCreateRegistrationRequest(body)).toThrow(),
  );
  it.each([
    [{ attendeeName: '' }, 'attendeeName'],
    [{ attendeeName: '  ' }, 'attendeeName'],
    [{ attendeeName: 1 }, 'attendeeName'],
    [{ attendeeName: 'x'.repeat(81) }, 'attendeeName'],
    [{ comment: false }, 'comment'],
    [{ comment: 'x'.repeat(501) }, 'comment'],
    [{ mode: 'auto' }, 'mode'],
    [{ expectedVersion: undefined }, 'expectedVersion'],
    [{ expectedVersion: 0 }, 'expectedVersion'],
    [{ expectedVersion: 0.5 }, 'expectedVersion'],
  ])('rejects invalid field %j with a structured field error', (patch, field) => {
    try {
      parseCreateRegistrationRequest({ ...input, ...patch });
      throw Error('Expected validation failure');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'VALIDATION_ERROR',
        fieldErrors: { [field as string]: expect.any(String) },
      });
    }
  });
  it('counts Unicode characters and preserves explicit waiting-list intent and comment whitespace', () => {
    expect(
      parseCreateRegistrationRequest({
        attendeeName: ' 😀 '.repeat(20).trim(),
        comment: '😀'.repeat(500),
        mode: 'waitlist',
        expectedVersion: 2,
      }),
    ).toMatchObject({ mode: 'waitlist', expectedVersion: 2, comment: '😀'.repeat(500) });
    expect(
      parseCreateRegistrationRequest({ ...input, attendeeName: ' Anna ', comment: undefined }),
    ).toEqual(input);
    expect(parseCreateRegistrationRequest({ ...input, comment: '  text  ' }).comment).toBe(
      '  text  ',
    );
  });
  it.each([
    null,
    [],
    {},
    { action: 'confirm', expectedVersion: 0 },
    { action: 'create', expectedVersion: 1 },
  ])('rejects invalid update %j', (body) =>
    expect(() => parseUpdateRegistrationRequest(body)).toThrow(),
  );
  it.each(['confirm', 'cancel'])('accepts conditional %s', (action) =>
    expect(parseUpdateRegistrationRequest({ action, expectedVersion: 1 })).toEqual({
      action,
      expectedVersion: 1,
    }),
  );
});

describe('standard crypto primitives and contract guards', () => {
  it('salts equal passwords differently and rejects wrong or malformed credential records', () => {
    const a = hashPassword('demo-password');
    const b = hashPassword('demo-password');
    expect(a.salt).not.toEqual(b.salt);
    expect(a.hash).not.toEqual(b.hash);
    expect(verifyPassword('demo-password', a.salt, a.hash)).toBe(true);
    expect(verifyPassword('wrong', a.salt, a.hash)).toBe(false);
    expect(verifyPassword('demo-password', '', a.hash)).toBe(false);
    expect(verifyPassword('demo-password', a.salt, 'bad')).toBe(false);
  });
  it('keeps opaque session tokens separate from stable digests', () => {
    const token = createSessionToken();
    expect(createSessionToken()).not.toBe(token);
    expect(digestSessionToken(token)).not.toBe(token);
    expect(digestSessionToken(token)).toBe(digestSessionToken(token));
  });
  it('checks external contracts without trusting roles or coercing versions', () => {
    expect(isLoginRequest(null)).toBe(false);
    expect(isLoginRequest({ email: 1, password: 'x' })).toBe(false);
    expect(isLoginRequest({ email: 'a', password: 'b' })).toBe(true);
    expect(isUpdateRegistrationRequest(null)).toBe(false);
    expect(isUpdateRegistrationRequest({ action: 'cancel', expectedVersion: '1' })).toBe(false);
    expect(isUpdateRegistrationRequest({ action: 'cancel', expectedVersion: 1 })).toBe(true);
    expect(isUser({ id: 'a', displayName: 'A', role: 'admin' })).toBe(false);
    expect(isUser({ id: 'a', displayName: 'A', role: 'organizer' })).toBe(true);
  });
});
