import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import { openDatabase, seedDatabase } from '../../apps/api/src/db.ts';
import { createApiServer } from '../../apps/api/src/server.ts';

const fixtureEmails = {
  'organizer-1': 'organizer@praktika.local',
  'participant-1': 'anna@praktika.local',
  'participant-2': 'boris@praktika.local',
  'participant-3': 'vera@praktika.local',
  'participant-4': 'gleb@praktika.local',
};
const fixturePassword = 'Praktika-demo-2026!';
const sessionCache = new Map();

async function sessionCookie(port, userId) {
  const key = `${port}:${userId}`;
  const cached = sessionCache.get(key);
  if (cached) return cached;
  const response = await fetch(`http://127.0.0.1:${port}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: fixtureEmails[userId], password: fixturePassword }),
  });
  if (!response.ok) throw new Error(`Fixture login failed for ${userId}: ${response.status}`);
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error(`Fixture login returned no cookie for ${userId}`);
  sessionCache.set(key, cookie);
  return cookie;
}

function privateActor(path, options) {
  const input = new Headers(options.headers);
  const explicit = options.actor === '' ? undefined : options.actor || input.get('X-Demo-User-Id');
  if (explicit) return explicit;
  if (options.actor === '') return undefined;
  if (
    path.startsWith('/workshops') ||
    path.startsWith('/registrations') ||
    path.startsWith('/admin')
  ) {
    return 'organizer-1';
  }
  return undefined;
}

async function temporaryDatabase(t) {
  const directory = await mkdtemp(join(tmpdir(), 'workshop-desk-organizer-'));
  const databasePath = join(directory, 'integration.sqlite');
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

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function startApi(t, databasePath) {
  sessionCache.clear();
  const server = createApiServer({ databasePath });
  const port = await listen(server);
  t.after(() => closeServer(server));
  return port;
}

async function request(port, path, options = {}) {
  const headers = new Headers(options.headers);
  headers.delete('X-Demo-User-Id');
  const actor = privateActor(path, options);
  if (actor) headers.set('Cookie', await sessionCookie(port, actor));
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { ...options, headers });
  const text = await response.text();
  return {
    status: response.status,
    body: text.length === 0 ? null : JSON.parse(text),
  };
}

function headers(userId) {
  return userId ? { 'X-Demo-User-Id': userId } : {};
}

function patchOptions(userId, action, expectedVersion) {
  return {
    method: 'PATCH',
    headers: {
      ...headers(userId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, expectedVersion }),
  };
}

test('read endpoints return consistent workshop projections and identity state', async (t) => {
  const databasePath = await temporaryDatabase(t);
  seedDatabase(databasePath);
  const port = await startApi(t, databasePath);

  const catalog = await request(port, '/workshops', {
    headers: headers('participant-1'),
  });
  assert.equal(catalog.status, 200);
  assert.equal(catalog.body.workshops.length, 3);

  const spare = catalog.body.workshops.find((workshop) => workshop.id === 'workshop-spare');
  assert.deepEqual(
    {
      capacity: spare.capacity,
      confirmedCount: spare.confirmedCount,
      waitlistedCount: spare.waitlistedCount,
      availableSeats: spare.availableSeats,
      registrationStatus: spare.myRegistration.status,
    },
    {
      capacity: 4,
      confirmedCount: 1,
      waitlistedCount: 1,
      availableSeats: 3,
      registrationStatus: 'confirmed',
    },
  );

  const details = await request(port, '/workshops/workshop-spare', {
    headers: headers('participant-2'),
  });
  assert.equal(details.status, 200);
  assert.equal(details.body.workshop.confirmedCount, 1);
  assert.equal(details.body.workshop.availableSeats, 3);
  assert.equal(details.body.myRegistration.status, 'waitlisted');

  const own = await request(port, '/workshops/workshop-spare/my-registration', {
    headers: headers('participant-2'),
  });
  assert.equal(own.status, 200);
  assert.equal(own.body.registration.id, 'registration-spare-waitlisted');

  const organizer = await request(port, '/workshops/workshop-spare/registrations', {
    headers: headers('organizer-1'),
  });
  assert.equal(organizer.status, 200);
  assert.equal(organizer.body.workshop.availableSeats, 3);
  assert.deepEqual(
    organizer.body.registrations.map((registration) => registration.id),
    ['registration-spare-confirmed', 'registration-spare-waitlisted'],
  );

  const publicDetails = await request(port, '/workshops/workshop-spare');
  assert.equal(publicDetails.status, 200);
  assert.equal(publicDetails.body.myRegistration, null);
});

test('server-owned authorization rejects participant organizer operations without mutation', async (t) => {
  const databasePath = await temporaryDatabase(t);
  seedDatabase(databasePath);
  const port = await startApi(t, databasePath);

  const before = await request(port, '/workshops/workshop-full/registrations', {
    headers: headers('organizer-1'),
  });
  const beforeTarget = before.body.registrations.find(
    (registration) => registration.id === 'registration-full-waitlisted-2',
  );

  const confirm = await request(
    port,
    '/registrations/registration-full-waitlisted-2',
    patchOptions('participant-1', 'confirm', 1),
  );
  assert.equal(confirm.status, 403);
  assert.equal(confirm.body.code, 'FORBIDDEN');

  const cancel = await request(
    port,
    '/registrations/registration-full-waitlisted-2',
    patchOptions('participant-1', 'cancel', 1),
  );
  assert.equal(cancel.status, 403);
  assert.equal(cancel.body.code, 'FORBIDDEN');

  const forgedRole = await request(port, '/registrations/registration-full-waitlisted-2', {
    ...patchOptions('participant-1', 'confirm', 1),
    body: JSON.stringify({
      action: 'confirm',
      expectedVersion: 1,
      role: 'organizer',
    }),
  });
  assert.equal(forgedRole.status, 403);

  const missingIdentity = await request(port, '/workshops/workshop-full/registrations', {
    actor: '',
  });
  assert.equal(missingIdentity.status, 401);
  assert.equal(missingIdentity.body.code, 'UNAUTHENTICATED');

  const after = await request(port, '/workshops/workshop-full/registrations', {
    headers: headers('organizer-1'),
  });
  const afterTarget = after.body.registrations.find(
    (registration) => registration.id === 'registration-full-waitlisted-2',
  );
  assert.deepEqual(afterTarget, beforeTarget);
});

test('owner can cancel confirmed and waitlisted registrations with monotonic versions', async (t) => {
  const databasePath = await temporaryDatabase(t);
  seedDatabase(databasePath);
  const port = await startApi(t, databasePath);

  const confirmedCancel = await request(
    port,
    '/registrations/registration-spare-confirmed',
    patchOptions('participant-1', 'cancel', 1),
  );
  assert.equal(confirmedCancel.status, 200);
  assert.deepEqual(confirmedCancel.body.registration, {
    id: 'registration-spare-confirmed',
    workshopId: 'workshop-spare',
    participantId: 'participant-1',
    attendeeName: 'Анна',
    comment: 'Готова к практической части.',
    status: 'cancelled',
    version: 2,
  });

  const afterConfirmedCancel = await request(port, '/workshops/workshop-spare');
  assert.equal(afterConfirmedCancel.body.workshop.confirmedCount, 0);
  assert.equal(afterConfirmedCancel.body.workshop.waitlistedCount, 1);
  assert.equal(afterConfirmedCancel.body.workshop.availableSeats, 4);

  const waitlistedCancel = await request(
    port,
    '/registrations/registration-spare-waitlisted',
    patchOptions('participant-2', 'cancel', 1),
  );
  assert.equal(waitlistedCancel.status, 200);
  assert.equal(waitlistedCancel.body.registration.status, 'cancelled');
  assert.equal(waitlistedCancel.body.registration.version, 2);

  const afterWaitlistedCancel = await request(port, '/workshops/workshop-spare');
  assert.equal(afterWaitlistedCancel.body.workshop.confirmedCount, 0);
  assert.equal(afterWaitlistedCancel.body.workshop.waitlistedCount, 0);
  assert.equal(afterWaitlistedCancel.body.workshop.availableSeats, 4);

  const repeatedCancel = await request(
    port,
    '/registrations/registration-spare-waitlisted',
    patchOptions('participant-2', 'cancel', 2),
  );
  assert.equal(repeatedCancel.status, 409);
  assert.equal(repeatedCancel.body.code, 'INVALID_TRANSITION');
});

test('simultaneous same-row PATCH requests allow only one expected version transition', async (t) => {
  const databasePath = await temporaryDatabase(t);
  seedDatabase(databasePath);
  const port = await startApi(t, databasePath);

  const results = await Promise.all([
    request(
      port,
      '/registrations/registration-spare-waitlisted',
      patchOptions('organizer-1', 'confirm', 1),
    ),
    request(
      port,
      '/registrations/registration-spare-waitlisted',
      patchOptions('organizer-1', 'confirm', 1),
    ),
  ]);

  assert.deepEqual(
    results.map((result) => result.status).sort((left, right) => left - right),
    [200, 409],
  );
  const loser = results.find((result) => result.status === 409);
  assert.equal(loser.body.code, 'VERSION_CONFLICT');

  const state = await request(port, '/workshops/workshop-spare/registrations', {
    headers: headers('organizer-1'),
  });
  const registration = state.body.registrations.find(
    (candidate) => candidate.id === 'registration-spare-waitlisted',
  );
  assert.equal(registration.status, 'confirmed');
  assert.equal(registration.version, 2);
  assert.equal(state.body.workshop.confirmedCount, 2);
});

test('simultaneous distinct-row confirmations cannot overbook the last seat', async (t) => {
  const databasePath = await temporaryDatabase(t);
  seedDatabase(databasePath);

  const database = openDatabase(databasePath);
  const timestamp = new Date().toISOString();
  const insert = database.prepare(`
    INSERT INTO registrations
      (id, workshop_id, participant_id, attendee_name, comment, status, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'waitlisted', 1, ?, ?)
  `);
  insert.run(
    'registration-last-seat-waitlisted-1',
    'workshop-last-seat',
    'participant-1',
    'Анна',
    '',
    timestamp,
    timestamp,
  );
  insert.run(
    'registration-last-seat-waitlisted-2',
    'workshop-last-seat',
    'participant-2',
    'Борис',
    '',
    timestamp,
    timestamp,
  );
  database.close();

  const port = await startApi(t, databasePath);
  const results = await Promise.all([
    request(
      port,
      '/registrations/registration-last-seat-waitlisted-1',
      patchOptions('organizer-1', 'confirm', 1),
    ),
    request(
      port,
      '/registrations/registration-last-seat-waitlisted-2',
      patchOptions('organizer-1', 'confirm', 1),
    ),
  ]);

  assert.deepEqual(
    results.map((result) => result.status).sort((left, right) => left - right),
    [200, 409],
  );
  const rejection = results.find((result) => result.status === 409);
  assert.equal(rejection.body.code, 'SEATS_FULL');

  const state = await request(port, '/workshops/workshop-last-seat/registrations', {
    headers: headers('organizer-1'),
  });
  assert.equal(state.body.workshop.confirmedCount, 2);
  assert.equal(state.body.workshop.availableSeats, 0);
  assert.equal(
    state.body.registrations.filter((registration) => registration.status === 'confirmed').length,
    2,
  );
  assert.equal(
    state.body.registrations.filter((registration) => registration.status === 'waitlisted').length,
    1,
  );
});

test('validation, stale versions, full capacity, and invalid transitions do not mutate state', async (t) => {
  const databasePath = await temporaryDatabase(t);
  seedDatabase(databasePath);
  const port = await startApi(t, databasePath);

  const invalid = await request(
    port,
    '/registrations/registration-full-waitlisted-1',
    patchOptions('organizer-1', 'confirm', 0),
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, 'VALIDATION_ERROR');

  const stale = await request(
    port,
    '/registrations/registration-full-waitlisted-1',
    patchOptions('organizer-1', 'confirm', 2),
  );
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'VERSION_CONFLICT');

  const full = await request(
    port,
    '/registrations/registration-full-waitlisted-1',
    patchOptions('organizer-1', 'confirm', 1),
  );
  assert.equal(full.status, 409);
  assert.equal(full.body.code, 'SEATS_FULL');

  const missing = await request(
    port,
    '/registrations/does-not-exist',
    patchOptions('organizer-1', 'cancel', 1),
  );
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, 'NOT_FOUND');

  const state = await request(port, '/workshops/workshop-full/registrations', {
    headers: headers('organizer-1'),
  });
  const target = state.body.registrations.find(
    (registration) => registration.id === 'registration-full-waitlisted-1',
  );
  assert.equal(target.status, 'waitlisted');
  assert.equal(target.version, 1);
  assert.equal(state.body.workshop.confirmedCount, 2);
  assert.equal(state.body.workshop.availableSeats, 0);
});

for (const [id, actor, workshopId, status] of [
  ['registration-full-confirmed-1', 'participant-3', 'workshop-full', 'confirmed'],
  ['registration-spare-waitlisted', 'participant-2', 'workshop-spare', 'waitlisted'],
]) {
  test(`editing ${status} preserves allocation, identity and rejects stale writes`, async (t) => {
    const databasePath = await temporaryDatabase(t);
    seedDatabase(databasePath);
    const port = await startApi(t, databasePath);
    const before = await request(port, `/workshops/${workshopId}`);
    const edit = (expectedVersion, attendeeName = 'Новое имя', user = actor) =>
      request(port, `/registrations/${id}`, {
        method: 'PATCH',
        actor: user,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit',
          expectedVersion,
          attendeeName,
          comment: 'Новый комментарий',
        }),
      });
    for (const user of ['organizer-1', 'participant-4']) {
      assert.equal((await edit(1, 'Чужое имя', user)).status, 403);
    }
    assert.equal((await edit(1, '')).status, 400);
    const changed = await edit(1);
    assert.equal(changed.status, 200);
    assert.equal(changed.body.registration.id, id);
    assert.equal(changed.body.registration.participantId, actor);
    assert.equal(changed.body.registration.status, status);
    assert.equal(changed.body.registration.version, 2);
    assert.equal(changed.body.registration.attendeeName, 'Новое имя');
    assert.equal(changed.body.registration.comment, 'Новый комментарий');
    const after = await request(port, `/workshops/${workshopId}`);
    assert.deepEqual(after.body.workshop, before.body.workshop);
    assert.equal((await edit(1, 'Устаревшее имя')).status, 409);
    assert.equal(
      (await request(port, `/registrations/${id}`, patchOptions(actor, 'cancel', 2))).status,
      200,
    );
    assert.equal((await edit(3)).status, 409);
  });
}
