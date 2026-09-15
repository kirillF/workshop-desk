import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const PASSWORD_KEY_LENGTH = 64;

export type PasswordRecord = {
  salt: string;
  hash: string;
};

export function hashPassword(password: string): PasswordRecord {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, PASSWORD_KEY_LENGTH);
  return {
    salt: salt.toString('hex'),
    hash: hash.toString('hex'),
  };
}

export function verifyPassword(password: string, saltHex: string, hashHex: string): boolean {
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    if (salt.length === 0 || expected.length !== PASSWORD_KEY_LENGTH) {
      return false;
    }
    const actual = scryptSync(password, salt, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function digestSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
