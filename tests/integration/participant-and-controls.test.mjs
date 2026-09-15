import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import { seedDatabase } from '../../apps/api/src/db.ts';
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
  const explicit = options.actor || input.get('X-Demo-User-Id');
  if (explicit) return explicit;
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
  const directory = await mkdtemp(join(tmpdir(), 'workshop-desk-participant-'));
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
  server.closeAllConnections();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function startApi(t, databasePath, options = {}) {
  sessionCache.clear();
  const server = createApiServer({ databasePath, ...options });
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

function headers(userId, operationId) {
  return {
    ...(userId ? { 'X-Demo-User-Id': userId } : {}),
    ...(operationId ? { 'X-Operation-Id': operationId } : {}),
  };
}

function postOptions(userId, payload, operationId) {
  return {
    method: 'POST',
    headers: {
      ...headers(userId, operationId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  };
}

function patchOptions(userId, action, expectedVersion, operationId) {
  return {
    method: 'PATCH',
    headers: {
      ...headers(userId, operationId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, expectedVersion }),
  };
}

async function waitForQueue(port, predicate = () => true) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await request(port, '/__test/queue');
    const item = response.body.queue.find(predicate);
    if (item) {
      return item;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('The expected test-control queue item did not become ready.');
}

async function splitJsonRequest(port, path, userId, payload) {
  const cookie = await sessionCookie(port, userId);
  return new Promise((resolve, reject) => {
    const bytes = Buffer.from(JSON.stringify(payload));
    const split = Math.max(1, Math.floor(bytes.length / 2));
    const request = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/json',
          'Content-Length': bytes.byteLength,
        },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: response.statusCode,
            body: text.length === 0 ? null : JSON.parse(text),
          });
        });
      },
    );
    request.on('error', reject);
    request.write(bytes.subarray(0, split));
    setImmediate(() => request.end(bytes.subarray(split)));
  });
}

test('participant POST validates identity, input, explicit mode, and UTF-8 bodies', async (t) => {
  const databasePath = await temporaryDatabase(t);
  seedDatabase(databasePath);
  const port = await startApi(t, databasePath);

  const waitlisted = await request(
    port,
    '/workshops/workshop-spare/registrations',
    postOptions('participant-3', {
      attendeeName: '  Вера  ',
      comment: 'Комментарий',
      mode: 'waitlist',
      expectedVersion: null,
    }),
  );
  assert.equal(waitlisted.status, 201);
  assert.equal(waitlisted.body.registration.attendeeName, 'Вера');
  assert.equal(waitlisted.body.registration.status, 'waitlisted');
  assert.equal(waitlisted.body.registration.version, 1);

  const organizer = await request(
    port,
    '/workshops/workshop-spare/registrations',
    postOptions('organizer-1', {
      attendeeName: 'Не участник',
      comment: '',
      mode: 'seat',
      expectedVersion: null,
    }),
  );
  assert.equal(organizer.status, 403);
  assert.equal(organizer.body.code, 'FORBIDDEN');

  const invalid = await request(
    port,
    '/workshops/workshop-spare/registrations',
    postOptions('participant-4', {
      attendeeName: ' ',
      comment: 'x',
      mode: 'seat',
      expectedVersion: null,
    }),
  );
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, 'VALIDATION_ERROR');
  assert.equal(invalid.body.fieldErrors.attendeeName, 'Имя обязательно.');

  const utf8 = await splitJsonRequest(
    port,
    '/workshops/workshop-last-seat/registrations',
    'participant-1',
    {
      attendeeName: '  Юлия  ',
      comment: 'Тестовый комментарий',
      mode: 'waitlist',
      expectedVersion: null,
    },
  );
  assert.equal(utf8.status, 201);
  assert.equal(utf8.body.registration.attendeeName, 'Юлия');
  assert.equal(utf8.body.registration.comment, 'Тестовый комментарий');
});

test('simultaneous participant seat requests cannot overbook the last seat', async (t) => {
  const databasePath = await temporaryDatabase(t);
  seedDatabase(databasePath);
  const port = await startApi(t, databasePath);

  const results = await Promise.all([
    request(
      port,
      '/workshops/workshop-last-seat/registrations',
      postOptions('participant-1', {
        attendeeName: 'Анна',
        comment: '',
        mode: 'seat',
        expectedVersion: null,
      }),
    ),
    request(
      port,
      '/workshops/workshop-last-seat/registrations',
      postOptions('participant-2', {
        attendeeName: 'Борис',
        comment: '',
        mode: 'seat',
        expectedVersion: null,
      }),
    ),
  ]);

  assert.deepEqual(
    results.map((result) => result.status).sort((left, right) => left - right),
    [201, 409],
  );
  const rejection = results.find((result) => result.status === 409);
  assert.equal(rejection.body.code, 'SEATS_FULL');

  const state = await request(port, '/workshops/workshop-last-seat');
  assert.equal(state.body.workshop.confirmedCount, 2);
  assert.equal(state.body.workshop.availableSeats, 0);
});

test('active duplicate, stale initial creation, and conditional re-registration are rejected safely', async (t) => {
  const databasePath = await temporaryDatabase(t);
  seedDatabase(databasePath);
  const port = await startApi(t, databasePath);

  const first = await request(
    port,
    '/workshops/workshop-last-seat/registrations',
    postOptions('participant-1', {
      attendeeName: 'Анна',
      comment: '',
      mode: 'seat',
      expectedVersion: null,
    }),
  );
  assert.equal(first.status, 201);
  assert.equal(first.body.registration.version, 1);

  const duplicate = await request(
    port,
    '/workshops/workshop-last-seat/registrations',
    postOptions('participant-1', {
      attendeeName: 'Другое имя',
      comment: '',
      mode: 'seat',
      expectedVersion: 1,
    }),
  );
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.code, 'ALREADY_REGISTERED');

  const cancelled = await request(
    port,
    `/registrations/${first.body.registration.id}`,
    patchOptions('participant-1', 'cancel', 1),
  );
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.registration.version, 2);
  assert.equal(cancelled.body.registration.status, 'cancelled');

  const staleInitial = await request(
    port,
    '/workshops/workshop-last-seat/registrations',
    postOptions('participant-1', {
      attendeeName: 'Задержанный запрос',
      comment: '',
      mode: 'seat',
      expectedVersion: null,
    }),
  );
  assert.equal(staleInitial.status, 409);
  assert.equal(staleInitial.body.code, 'VERSION_CONFLICT');

  const staleReregistration = await request(
    port,
    '/workshops/workshop-last-seat/registrations',
    postOptions('participant-1', {
      attendeeName: 'Старая версия',
      comment: '',
      mode: 'seat',
      expectedVersion: 1,
    }),
  );
  assert.equal(staleReregistration.status, 409);
  assert.equal(staleReregistration.body.code, 'VERSION_CONFLICT');

  const reregistered = await request(
    port,
    '/workshops/workshop-last-seat/registrations',
    postOptions('participant-1', {
      attendeeName: 'Обновлённая Анна',
      comment: 'Повторная заявка',
      mode: 'seat',
      expectedVersion: 2,
    }),
  );
  assert.equal(reregistered.status, 201);
  assert.equal(reregistered.body.registration.id, first.body.registration.id);
  assert.equal(reregistered.body.registration.version, 3);
  assert.equal(reregistered.body.registration.status, 'confirmed');
  assert.equal(reregistered.body.registration.attendeeName, 'Обновлённая Анна');
});

test(
  'test controls expose readiness, hold before commit, post-commit hold/drop, rejection, and stale reads',
  { timeout: 15000 },
  async (t) => {
    const databasePath = await temporaryDatabase(t);
    seedDatabase(databasePath);
    const port = await startApi(t, databasePath, { testMode: true });

    const normalServer = createApiServer({ databasePath });
    const normalPort = await listen(normalServer);
    t.after(() => closeServer(normalServer));
    t.after(async () => {
      try {
        const queued = await request(port, '/__test/queue');
        for (const item of queued.body.queue) {
          await request(port, '/__test/release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queueId: item.queueId }),
          });
        }
      } catch {
        // The server may already be closed after a failed setup.
      }
    });
    const controlsAbsent = await request(normalPort, '/__test/queue');
    assert.equal(controlsAbsent.status, 404);

    const invalidAfterReject = await request(port, '/__test/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'PATCH',
        path: '/registrations/registration-spare-confirmed',
        phase: 'after',
        action: 'reject',
      }),
    });
    assert.equal(invalidAfterReject.status, 400);

    const beforeRule = await request(port, '/__test/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'PATCH',
        path: '/registrations/registration-spare-waitlisted',
        identity: 'organizer-1',
        phase: 'before',
        action: 'hold',
      }),
    });
    assert.equal(beforeRule.status, 201);

    const heldPatch = request(
      port,
      '/registrations/registration-spare-waitlisted',
      patchOptions('organizer-1', 'confirm', 1, 'op-before-hold'),
    );
    const beforeQueue = await waitForQueue(
      port,
      (item) => item.phase === 'before' && item.metadata?.operationId === 'op-before-hold',
    );
    assert.equal(beforeQueue.metadata.operationId, 'op-before-hold');
    assert.equal(beforeQueue.metadata.registrationId, 'registration-spare-waitlisted');
    assert.equal(beforeQueue.metadata.requestedVersion, 1);

    const heldState = await request(port, '/workshops/workshop-spare/registrations', {
      headers: { 'X-Demo-User-Id': 'organizer-1' },
    });
    assert.equal(
      heldState.body.registrations.find(
        (registration) => registration.id === 'registration-spare-waitlisted',
      ).status,
      'waitlisted',
    );

    const independentSuccess = await request(
      port,
      '/registrations/registration-spare-confirmed',
      patchOptions('organizer-1', 'cancel', 1, 'op-independent-b'),
    );
    assert.equal(independentSuccess.status, 200);
    assert.equal(independentSuccess.body.registration.status, 'cancelled');

    await request(port, '/__test/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queueId: beforeQueue.queueId,
        outcome: 'reject',
      }),
    });
    const patchResult = await heldPatch;
    assert.equal(patchResult.status, 503);
    assert.equal(patchResult.body.code, 'SERVICE_UNAVAILABLE');

    const afterHeldRejection = await request(port, '/workshops/workshop-spare/registrations', {
      headers: { 'X-Demo-User-Id': 'organizer-1' },
    });
    assert.equal(
      afterHeldRejection.body.registrations.find(
        (registration) => registration.id === 'registration-spare-waitlisted',
      ).status,
      'waitlisted',
    );
    assert.equal(
      afterHeldRejection.body.registrations.find(
        (registration) => registration.id === 'registration-spare-confirmed',
      ).status,
      'cancelled',
    );
    assert.equal(afterHeldRejection.body.workshop.confirmedCount, 0);

    const rejectRule = await request(port, '/__test/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'POST',
        path: '/workshops/workshop-spare/registrations',
        identity: 'participant-4',
        phase: 'before',
        action: 'reject',
      }),
    });
    assert.equal(rejectRule.status, 201);
    const rejected = await request(
      port,
      '/workshops/workshop-spare/registrations',
      postOptions('participant-4', {
        attendeeName: 'Не создан',
        comment: '',
        mode: 'seat',
        expectedVersion: null,
      }),
    );
    assert.equal(rejected.status, 503);
    assert.equal(rejected.body.code, 'SERVICE_UNAVAILABLE');
    const rejectedState = await request(port, '/workshops/workshop-spare/my-registration', {
      headers: { 'X-Demo-User-Id': 'participant-4' },
    });
    assert.equal(rejectedState.body.registration, null);

    const afterHoldRule = await request(port, '/__test/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'PATCH',
        path: '/registrations/registration-spare-waitlisted',
        phase: 'after',
        action: 'hold',
      }),
    });
    assert.equal(afterHoldRule.status, 201);
    const heldAfter = request(
      port,
      '/registrations/registration-spare-waitlisted',
      patchOptions('organizer-1', 'confirm', 1, 'op-after-hold'),
    );
    const afterQueue = await waitForQueue(
      port,
      (item) => item.phase === 'after' && item.metadata?.operationId === 'op-after-hold',
    );
    const committedBeforeRelease = await request(port, '/workshops/workshop-spare');
    assert.equal(committedBeforeRelease.body.workshop.confirmedCount, 1);
    await request(port, '/__test/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queueId: afterQueue.queueId }),
    });
    assert.equal((await heldAfter).status, 200);
    assert.equal(
      (
        await request(port, '/workshops/workshop-spare/my-registration', {
          headers: { 'X-Demo-User-Id': 'participant-2' },
        })
      ).body.registration.status,
      'confirmed',
    );

    const dropRule = await request(port, '/__test/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'PATCH',
        path: '/registrations/registration-spare-waitlisted',
        phase: 'after',
        action: 'drop',
      }),
    });
    assert.equal(dropRule.status, 201);
    await assert.rejects(
      request(
        port,
        '/registrations/registration-spare-waitlisted',
        patchOptions('organizer-1', 'cancel', 2, 'op-after-drop'),
      ),
    );
    const droppedState = await request(port, '/workshops/workshop-spare/registrations', {
      headers: { 'X-Demo-User-Id': 'organizer-1' },
    });
    assert.equal(
      droppedState.body.registrations.find(
        (registration) => registration.id === 'registration-spare-waitlisted',
      ).status,
      'cancelled',
    );
    assert.equal(
      droppedState.body.registrations.find(
        (registration) => registration.id === 'registration-spare-waitlisted',
      ).version,
      3,
    );

    const oldReadRule = await request(port, '/__test/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'GET',
        path: '/workshops/workshop-full',
        phase: 'after',
        action: 'hold',
      }),
    });
    assert.equal(oldReadRule.status, 201);
    const oldRead = request(port, '/workshops/workshop-full');
    const readQueue = await waitForQueue(port, (item) => item.phase === 'after');
    const cancellation = await request(
      port,
      '/registrations/registration-full-confirmed-1',
      patchOptions('organizer-1', 'cancel', 1),
    );
    assert.equal(cancellation.status, 200);
    await request(port, '/__test/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queueId: readQueue.queueId }),
    });
    const staleRead = await oldRead;
    assert.equal(staleRead.status, 200);
    assert.equal(staleRead.body.workshop.confirmedCount, 2);
    assert.equal(staleRead.body.workshop.availableSeats, 0);

    const log = await request(port, '/__test/log');
    assert.equal(log.status, 200);
    assert.ok(log.body.events.some((event) => event.event === 'arrived'));
    assert.ok(log.body.events.some((event) => event.event === 'committed'));
    assert.ok(log.body.events.some((event) => event.event === 'rejected'));
    assert.ok(log.body.events.some((event) => event.event === 'response-released'));
  },
);

test(
  'held old PATCH cannot commit after a fresh same-version command wins (AC-19 server)',
  { timeout: 15000 },
  async (t) => {
    const databasePath = await temporaryDatabase(t);
    seedDatabase(databasePath);
    const port = await startApi(t, databasePath, { testMode: true });
    const path = '/registrations/registration-spare-waitlisted';
    const rule = await request(port, '/__test/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'PATCH', path, phase: 'before', action: 'hold' }),
    });
    const old = request(port, path, patchOptions('organizer-1', 'confirm', 1, 'old-command'));
    const held = await waitForQueue(port, (item) => item.ruleId === rule.body.ruleId);
    const observed = await request(port, '/workshops/workshop-spare/registrations', {
      headers: headers('organizer-1'),
    });
    const row = observed.body.registrations.find(
      (item) => item.id === 'registration-spare-waitlisted',
    );
    assert.equal(row.status, 'waitlisted');
    assert.equal(row.version, 1);
    const fresh = await request(
      port,
      path,
      patchOptions('organizer-1', 'cancel', row.version, 'new-command'),
    );
    assert.equal(fresh.status, 200);
    await request(port, '/__test/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queueId: held.queueId }),
    });
    const late = await old;
    assert.equal(late.status, 409);
    assert.equal(late.body.code, 'VERSION_CONFLICT');
    const final = await request(port, '/workshops/workshop-spare/registrations', {
      headers: headers('organizer-1'),
    });
    assert.equal(final.body.registrations.find((item) => item.id === row.id).version, 2);
    assert.equal(final.body.registrations.find((item) => item.id === row.id).status, 'cancelled');
  },
);

test(
  'held initial POST cannot resurrect a row created and cancelled by another client (AC-20 server)',
  { timeout: 15000 },
  async (t) => {
    const databasePath = await temporaryDatabase(t);
    seedDatabase(databasePath);
    const port = await startApi(t, databasePath, { testMode: true });
    const path = '/workshops/workshop-spare/registrations';
    const payload = { attendeeName: 'Глеб', comment: '', mode: 'seat', expectedVersion: null };
    const rule = await request(port, '/__test/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'POST',
        path,
        identity: 'participant-4',
        phase: 'before',
        action: 'hold',
      }),
    });
    const old = request(port, path, postOptions('participant-4', payload, 'old-create'));
    const held = await waitForQueue(port, (item) => item.ruleId === rule.body.ruleId);
    const created = await request(port, path, postOptions('participant-4', payload, 'new-create'));
    assert.equal(created.status, 201);
    const cancelled = await request(
      port,
      '/registrations/' + created.body.registration.id,
      patchOptions('participant-4', 'cancel', 1),
    );
    assert.equal(cancelled.status, 200);
    await request(port, '/__test/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queueId: held.queueId }),
    });
    const late = await old;
    assert.equal(late.status, 409);
    assert.equal(late.body.code, 'VERSION_CONFLICT');
    const final = await request(port, '/workshops/workshop-spare/my-registration', {
      headers: headers('participant-4'),
    });
    assert.equal(final.body.registration.id, created.body.registration.id);
    assert.equal(final.body.registration.status, 'cancelled');
    assert.equal(final.body.registration.version, 2);
  },
);
