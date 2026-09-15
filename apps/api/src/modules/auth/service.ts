import { UserRole } from '../../../../../packages/contracts/src/index.ts';
import type { DatabaseSync } from 'node:sqlite';

import type {
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  ParticipantsResponse,
  SessionResponse,
  User,
} from '../../../../../packages/contracts/src/index.ts';
import { inTransaction } from '../../shared/database/transaction.ts';
import { ApiProblem } from '../../shared/http/errors.ts';
import { createSessionToken, digestSessionToken, verifyPassword } from './crypto.ts';

type DatabaseRow = Record<string, unknown>;

export const SESSION_COOKIE_NAME = 'workshop_desk_session';
export const SESSION_TTL_SECONDS = 24 * 60 * 60;
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;
const GENERIC_LOGIN_MESSAGE = 'Неверный email или пароль.';

function invalidCredentials(): ApiProblem {
  return new ApiProblem('UNAUTHENTICATED', GENERIC_LOGIN_MESSAGE);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function mapUser(row: DatabaseRow): User {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    role: row.role === UserRole.Organizer ? UserRole.Organizer : UserRole.Participant,
  };
}

function findUserByEmail(
  database: DatabaseSync,
  email: string,
): (DatabaseRow & { email?: string; password_salt?: string; password_hash?: string }) | null {
  const row = database
    .prepare(
      `
    SELECT id, display_name, role, email, password_salt, password_hash
    FROM users
    WHERE email = ?
  `,
    )
    .get(normalizeEmail(email)) as unknown as DatabaseRow | undefined;
  return row ?? null;
}

export function parseLoginRequest(value: unknown): LoginRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiProblem('VALIDATION_ERROR', 'Тело запроса должно быть JSON-объектом.');
  }

  const input = value as Record<string, unknown>;
  const fieldErrors: Record<string, string> = {};
  const email = input.email;
  const password = input.password;

  if (typeof email !== 'string' || email.trim().length < 3) {
    fieldErrors.email = 'Введите email.';
  }
  if (typeof password !== 'string' || password.length === 0) {
    fieldErrors.password = 'Введите пароль.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new ApiProblem('VALIDATION_ERROR', 'Проверьте данные формы.', fieldErrors);
  }

  return { email: email as string, password: password as string };
}

export function authenticate(
  database: DatabaseSync,
  email: string,
  password: string,
  existingCookie?: string,
): { response: LoginResponse; token: string } {
  const row = findUserByEmail(database, email);
  if (
    !row ||
    typeof row.password_salt !== 'string' ||
    typeof row.password_hash !== 'string' ||
    !verifyPassword(password, row.password_salt, row.password_hash)
  ) {
    throw invalidCredentials();
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  const token = createSessionToken();
  const digest = digestSessionToken(token);
  const previousDigest = existingCookie ? digestSessionToken(existingCookie) : undefined;

  inTransaction(database, 'IMMEDIATE', () => {
    database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now.toISOString());
    if (previousDigest) {
      database.prepare('DELETE FROM sessions WHERE token_digest = ?').run(previousDigest);
    }
    database
      .prepare(
        `
      INSERT INTO sessions (token_digest, user_id, created_at, expires_at)
      VALUES (?, ?, ?, ?)
    `,
      )
      .run(digest, String(row.id), now.toISOString(), expiresAt);
  });

  return {
    response: { user: mapUser(row) },
    token,
  };
}

export function readSessionUser(
  database: DatabaseSync,
  cookieHeader: string | undefined,
): User | null {
  const token = readSessionCookie(cookieHeader);
  if (!token) {
    return null;
  }

  const digest = digestSessionToken(token);
  const row = database
    .prepare(
      `
    SELECT u.id, u.display_name, u.role, s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_digest = ?
  `,
    )
    .get(digest) as unknown as DatabaseRow | undefined;

  if (!row) {
    return null;
  }

  const expiresAt = Date.parse(String(row.expires_at));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    database.prepare('DELETE FROM sessions WHERE token_digest = ?').run(digest);
    return null;
  }

  return mapUser(row);
}

export function requireSession(database: DatabaseSync, cookieHeader: string | undefined): User {
  const user = readSessionUser(database, cookieHeader);
  if (!user) {
    throw new ApiProblem('UNAUTHENTICATED', 'Войдите в систему, чтобы продолжить.');
  }
  return user;
}

export function revokeSession(
  database: DatabaseSync,
  cookieHeader: string | undefined,
): LogoutResponse {
  const token = readSessionCookie(cookieHeader);
  if (token) {
    database.prepare('DELETE FROM sessions WHERE token_digest = ?').run(digestSessionToken(token));
  }
  return { ok: true };
}

export function findParticipantById(database: DatabaseSync, participantId: string): User | null {
  const row = database
    .prepare(
      `
    SELECT id, display_name, role
    FROM users
    WHERE id = ? AND role = 'participant'
  `,
    )
    .get(participantId) as unknown as DatabaseRow | undefined;
  return row ? mapUser(row) : null;
}

export function readParticipants(database: DatabaseSync, actor: User): ParticipantsResponse {
  if (actor.role !== UserRole.Organizer) {
    throw new ApiProblem('FORBIDDEN', 'Недостаточно прав для выполнения операции.');
  }

  const rows = database
    .prepare(
      `
    SELECT id, display_name, role
    FROM users
    WHERE role = 'participant'
    ORDER BY display_name, id
  `,
    )
    .all() as unknown as DatabaseRow[];

  return { users: rows.map(mapUser) };
}

export function sessionResponse(user: User): SessionResponse {
  return { user };
}

export function readSessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    if (name !== SESSION_COOKIE_NAME) {
      continue;
    }
    const value = part.slice(separator + 1).trim();
    return /^[A-Za-z0-9_-]{40,100}$/.test(value) ? value : undefined;
  }

  return undefined;
}

export class LoginRateLimiter {
  private readonly entries = new Map<string, { count: number; expiresAt: number }>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxEntries: number;

  constructor(limit = 5, windowMs = 60_000, maxEntries = 10_000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxEntries = maxEntries;
  }

  isBlocked(ip: string, now = Date.now()): boolean {
    this.prune(now);
    const entry = this.entries.get(ip);
    return Boolean(entry && entry.expiresAt > now && entry.count >= this.limit);
  }

  recordFailure(ip: string, now = Date.now()): void {
    this.prune(now);
    const existing = this.entries.get(ip);
    if (!existing || existing.expiresAt <= now) {
      this.entries.set(ip, { count: 1, expiresAt: now + this.windowMs });
    } else {
      existing.count += 1;
    }
    this.trimToBound();
  }

  clear(ip: string): void {
    this.entries.delete(ip);
  }

  private prune(now: number): void {
    for (const [ip, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(ip);
      }
    }
  }

  private trimToBound(): void {
    while (this.entries.size > this.maxEntries) {
      const first = this.entries.keys().next().value as string | undefined;
      if (first === undefined) {
        return;
      }
      this.entries.delete(first);
    }
  }
}

export function genericLoginMessage(): string {
  return GENERIC_LOGIN_MESSAGE;
}
