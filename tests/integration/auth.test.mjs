import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import { LoginRateLimiter } from '../../apps/api/src/auth.ts';
import { openDatabase, seedDatabase } from '../../apps/api/src/db.ts';
import { createApiServer } from '../../apps/api/src/server.ts';

const origin = 'http://127.0.0.1:14701';
const password = 'Praktika-demo-2026!';
const emails = {
  'organizer-1': 'organizer@praktika.local',
  'participant-1': 'anna@praktika.local',
  'participant-2': 'boris@praktika.local',
  'participant-3': 'vera@praktika.local',
  'participant-4': 'gleb@praktika.local',
};

async function temporaryDatabase(t) {
  const directory = await mkdtemp(join(tmpdir(), 'workshop-desk-auth-'));
  const databasePath = join(directory, 'auth.sqlite');
  t.after(() => rm(directory, { recursive: true, force: true }));
  return databasePath;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('The test API did not expose a TCP address.'));
        return;
      }
      resolve(address.port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });
}

async function startApi(t) {
  const databasePath = await temporaryDatabase(t);
  seedDatabase(databasePath);
  const server = createApiServer({
    databasePath,
    allowedOrigin: origin,
    secureCookies: false,
  });
  const port = await listen(server);
  t.after(
    () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  return { databasePath, port };
}

async function request(port, path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.cookie) headers.set('Cookie', options.cookie);
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? options.rawBody : JSON.stringify(options.body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text.length === 0 ? null : JSON.parse(text),
    headers: response.headers,
  };
}

async function login(port, userId, suppliedPassword = password, existingCookie) {
  const result = await request(port, '/auth/login', {
    method: 'POST',
    cookie: existingCookie,
    headers: { Origin: origin },
    body: { email: emails[userId], password: suppliedPassword },
  });
  const cookie = result.headers.get('set-cookie')?.split(';', 1)[0];
  return { ...result, cookie };
}

test('AUTH-AC-01/02: login session reload, rotation, logout, and generic failures', async (t) => {
  const { port } = await startApi(t);

  const missing = await request(port, '/auth/session', { headers: { Origin: origin } });
  assert.equal(missing.status, 401);
  assert.equal(missing.body.code, 'UNAUTHENTICATED');

  const malformed = await request(port, '/auth/login', {
    method: 'POST',
    headers: { Origin: origin },
    body: { email: '', password: '' },
  });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.code, 'VALIDATION_ERROR');
  assert.deepEqual(Object.keys(malformed.body.fieldErrors).sort(), ['email', 'password']);

  const bad = await login(port, 'organizer-1', 'wrong-password');
  assert.equal(bad.status, 401);
  assert.equal(bad.body.code, 'UNAUTHENTICATED');
  assert.equal(bad.body.message, 'Неверный email или пароль.');
  assert.equal(Object.hasOwn(bad.body, 'fieldErrors'), false);
  assert.equal(bad.cookie, undefined);

  const first = await login(port, 'organizer-1');
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.user, {
    id: 'organizer-1',
    displayName: 'Организатор',
    role: 'organizer',
  });
  assert.match(first.cookie, /^workshop_desk_session=[A-Za-z0-9_-]{40,100}$/);
  assert.match(first.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.match(first.headers.get('set-cookie'), /Max-Age=86400/);

  const reloaded = await request(port, '/auth/session', {
    cookie: first.cookie,
    headers: { Origin: origin },
  });
  assert.equal(reloaded.status, 200);
  assert.deepEqual(reloaded.body.user, first.body.user);

  const rotated = await login(port, 'organizer-1', password, first.cookie);
  assert.equal(rotated.status, 200);
  assert.notEqual(rotated.cookie, first.cookie);
  const oldSession = await request(port, '/auth/session', {
    cookie: first.cookie,
    headers: { Origin: origin },
  });
  assert.equal(oldSession.status, 401);

  const loggedOut = await request(port, '/auth/logout', {
    method: 'POST',
    cookie: rotated.cookie,
    headers: { Origin: origin },
    body: {},
  });
  assert.equal(loggedOut.status, 200);
  assert.deepEqual(loggedOut.body, { ok: true });
  assert.match(loggedOut.headers.get('set-cookie'), /Max-Age=0/);
  const revoked = await request(port, '/auth/session', {
    cookie: rotated.cookie,
    headers: { Origin: origin },
  });
  assert.equal(revoked.status, 401);

  const idempotentLogout = await request(port, '/auth/logout', {
    method: 'POST',
    headers: { Origin: origin },
    body: {},
  });
  assert.equal(idempotentLogout.status, 200);
  assert.deepEqual(idempotentLogout.body, { ok: true });
});

test('AUTH-AC-03: failed login limiter blocks the sixth attempt and expires bounded state', async (t) => {
  const { port } = await startApi(t);

  const outcomes = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    outcomes.push((await login(port, 'organizer-1', 'bad-password')).status);
  }
  assert.deepEqual(outcomes, [401, 401, 401, 401, 401]);
  assert.equal((await login(port, 'organizer-1', 'bad-password')).status, 429);

  const defaults = new LoginRateLimiter();
  for (let i = 0; i < 5; i++) defaults.recordFailure('default-window', 100000);
  assert.equal(defaults.isBlocked('default-window', 159999), true);
  assert.equal(defaults.isBlocked('default-window', 160000), false);

  const limiter = new LoginRateLimiter(2, 10);
  assert.equal(limiter.isBlocked('test-ip', 100), false);
  limiter.recordFailure('test-ip', 100);
  limiter.recordFailure('test-ip', 101);
  assert.equal(limiter.isBlocked('test-ip', 101), true);
  assert.equal(limiter.isBlocked('test-ip', 110), false);
  limiter.recordFailure('test-ip', 200);
  limiter.clear('test-ip');
  assert.equal(limiter.isBlocked('test-ip', 200), false);
});

test('AUTH-AC-04/05/09: session identity is server-owned and organizer preview is read-only', async (t) => {
  const { port } = await startApi(t);
  const organizer = await login(port, 'organizer-1');
  const participant = await login(port, 'participant-1');
  assert.equal(organizer.status, 200);
  assert.equal(participant.status, 200);

  const forged = await request(port, '/workshops?userId=organizer-1', {
    headers: {
      Origin: origin,
      'X-Demo-User-Id': 'organizer-1',
    },
  });
  assert.equal(forged.status, 401);
  assert.equal(forged.body.code, 'UNAUTHENTICATED');

  const directoryForParticipant = await request(port, '/admin/participants', {
    cookie: participant.cookie,
    headers: { Origin: origin },
  });
  assert.equal(directoryForParticipant.status, 403);
  assert.equal(directoryForParticipant.body.code, 'FORBIDDEN');

  const directory = await request(port, '/admin/participants', {
    cookie: organizer.cookie,
    headers: { Origin: origin },
  });
  assert.equal(directory.status, 200);
  assert.deepEqual(
    directory.body.users.map((user) => user.id),
    ['participant-1', 'participant-2', 'participant-3', 'participant-4'],
  );

  const preview = await request(port, '/workshops', {
    cookie: organizer.cookie,
    headers: {
      Origin: origin,
      'X-Preview-User-Id': 'participant-1',
    },
  });
  assert.equal(preview.status, 200);
  assert.equal(
    preview.body.workshops.find((workshop) => workshop.id === 'workshop-spare').myRegistration
      .status,
    'confirmed',
  );

  const participantPreview = await request(port, '/workshops', {
    cookie: participant.cookie,
    headers: {
      Origin: origin,
      'X-Preview-User-Id': 'participant-2',
    },
  });
  assert.equal(participantPreview.status, 403);

  const before = await request(port, '/workshops/workshop-spare/registrations', {
    cookie: organizer.cookie,
    headers: { Origin: origin },
  });
  const previewWrite = await request(port, '/workshops/workshop-spare/registrations', {
    method: 'POST',
    cookie: organizer.cookie,
    headers: {
      Origin: origin,
      'X-Preview-User-Id': 'participant-1',
    },
    body: {
      attendeeName: 'Призрачная запись',
      comment: '',
      mode: 'seat',
      expectedVersion: null,
    },
  });
  assert.equal(previewWrite.status, 403);
  const previewPatch = await request(port, '/registrations/registration-spare-confirmed', {
    method: 'PATCH',
    cookie: organizer.cookie,
    headers: {
      Origin: origin,
      'X-Preview-User-Id': 'participant-1',
    },
    body: { action: 'cancel', expectedVersion: 1 },
  });
  assert.equal(previewPatch.status, 403);
  const after = await request(port, '/workshops/workshop-spare/registrations', {
    cookie: organizer.cookie,
    headers: { Origin: origin },
  });
  assert.deepEqual(after.body, before.body);
});

test('AUTH-AC-06/08/10: exact CORS, JSON mutation contracts, and hashed credentials', async (t) => {
  const { databasePath, port } = await startApi(t);

  const foreign = await request(port, '/auth/login', {
    method: 'POST',
    headers: { Origin: 'http://evil.example.test' },
    body: { email: emails['organizer-1'], password },
  });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.body.code, 'FORBIDDEN');
  assert.equal(foreign.headers.get('access-control-allow-origin'), null);

  const allowed = await login(port, 'organizer-1');
  assert.equal(allowed.headers.get('access-control-allow-origin'), origin);
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');

  const missingContentType = await request(port, '/auth/logout', {
    method: 'POST',
    cookie: allowed.cookie,
    headers: { Origin: origin },
    rawBody: '{}',
  });
  assert.equal(missingContentType.status, 400);
  assert.equal(missingContentType.body.code, 'VALIDATION_ERROR');

  const database = openDatabase(databasePath);
  try {
    const users = database
      .prepare('SELECT email, password_salt, password_hash FROM users ORDER BY id')
      .all();
    assert.equal(users.length, 5);
    for (const user of users) {
      assert.match(user.email, /@praktika\.local$/);
      assert.match(user.password_salt, /^[a-f0-9]{32}$/);
      assert.match(user.password_hash, /^[a-f0-9]{128}$/);
      assert.notEqual(user.password_hash, password);
    }
    const sessionRows = database.prepare('SELECT token_digest FROM sessions').all();
    assert.equal(sessionRows.length, 1);
    assert.match(sessionRows[0].token_digest, /^[a-f0-9]{64}$/);
    assert.equal(sessionRows[0].token_digest.includes(allowed.cookie.split('=')[1]), false);
  } finally {
    database.close();
  }
});

test('AUTH-AC-02: expired cookie is rejected by HTTP and its stored session is removed', async (t) => {
  const { port, databasePath } = await startApi(t);
  const signedIn = await login(port, 'participant-1');
  const database = openDatabase(databasePath);
  try {
    database.prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    assert.equal((await request(port, '/auth/session', { cookie: signedIn.cookie })).status, 401);
    assert.equal((await request(port, '/workshops', { cookie: signedIn.cookie })).status, 401);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
  } finally {
    database.close();
  }
});

test('AUTH-AC-05: preview header cannot log in, log out, or rotate the real session', async (t) => {
  const { port } = await startApi(t);
  const signedIn = await login(port, 'organizer-1');
  for (const path of ['/auth/login', '/auth/logout']) {
    const result = await request(port, path, {
      method: 'POST',
      cookie: signedIn.cookie,
      headers: { Origin: origin, 'X-Preview-User-Id': 'participant-1' },
      body: path.endsWith('login') ? { email: emails['participant-1'], password } : {},
    });
    assert.equal(result.status, 403);
    assert.equal(result.headers.get('set-cookie'), null);
    const current = await request(port, '/auth/session', { cookie: signedIn.cookie });
    assert.equal(current.status, 200);
    assert.equal(current.body.user.id, 'organizer-1');
  }
});
