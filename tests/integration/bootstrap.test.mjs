import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import {
  openDatabase,
  resetDatabase,
  seedDatabase,
  seedWorkshopTitles,
  summarizeDatabase,
} from '../../apps/api/src/db.ts';
import { createApiServer } from '../../apps/api/src/server.ts';

async function temporaryDatabase(t) {
  const directory = await mkdtemp(join(tmpdir(), 'workshop-desk-'));
  const databasePath = join(directory, 'integration.sqlite');
  t.after(() => rm(directory, { recursive: true, force: true }));
  return databasePath;
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('The test API did not expose a TCP address.'));
        return;
      }
      resolve(address.port);
    });
  });
}

test('schema enforces one registration per workshop and participant', async (t) => {
  const databasePath = await temporaryDatabase(t);
  seedDatabase(databasePath);
  const database = openDatabase(databasePath);

  assert.throws(
    () =>
      database
        .prepare(
          `
      INSERT INTO registrations
        (id, workshop_id, participant_id, attendee_name, comment, status, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
        )
        .run(
          'duplicate-registration',
          'workshop-spare',
          'participant-1',
          'Анна',
          '',
          'confirmed',
          1,
          new Date().toISOString(),
          new Date().toISOString(),
        ),
    /UNIQUE constraint failed: registrations\.workshop_id, registrations\.participant_id/,
  );
  database.close();
});

test('seed is idempotent and does not overwrite an existing fixture; reset restores it', async (t) => {
  const databasePath = await temporaryDatabase(t);
  const first = seedDatabase(databasePath);
  assert.deepEqual(
    {
      users: first.users,
      workshops: first.workshops,
      registrations: first.registrations,
      confirmed: first.confirmed,
      waitlisted: first.waitlisted,
    },
    { users: 5, workshops: 3, registrations: 7, confirmed: 4, waitlisted: 3 },
  );

  const changedTitle = 'Изменённая проверочная запись';
  const database = openDatabase(databasePath);
  database
    .prepare('UPDATE workshops SET title = ? WHERE id = ?')
    .run(changedTitle, 'workshop-spare');
  database.close();

  const second = seedDatabase(databasePath);
  const afterSecondSeed = openDatabase(databasePath);
  const preserved = afterSecondSeed
    .prepare('SELECT title FROM workshops WHERE id = ?')
    .get('workshop-spare');
  afterSecondSeed.close();
  assert.equal(preserved.title, changedTitle);
  assert.equal(second.registrations, 7);

  resetDatabase(databasePath);
  const afterReset = openDatabase(databasePath);
  const restored = afterReset
    .prepare('SELECT title FROM workshops WHERE id = ?')
    .get('workshop-spare');
  afterReset.close();
  assert.equal(restored.title, seedWorkshopTitles.spare);
});

test('database changes survive closing and reopening the API database', async (t) => {
  const databasePath = await temporaryDatabase(t);
  seedDatabase(databasePath);
  const updatedDescription = 'Изменение сохраняется после перезапуска.';
  const firstConnection = openDatabase(databasePath);
  firstConnection
    .prepare('UPDATE workshops SET description = ? WHERE id = ?')
    .run(updatedDescription, 'workshop-last-seat');
  firstConnection.close();

  const restartedConnection = openDatabase(databasePath);
  const row = restartedConnection
    .prepare('SELECT description FROM workshops WHERE id = ?')
    .get('workshop-last-seat');
  assert.equal(row.description, updatedDescription);
  assert.equal(summarizeDatabase(restartedConnection, databasePath).workshops, 3);
  restartedConnection.close();
});

test('GET /health reports database readiness', async (t) => {
  const server = createApiServer({ databasePath: ':memory:' });
  const port = await listen(server);
  t.after(() => closeServer(server));

  const response = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: 'ok',
    database: 'ready',
    databasePath: ':memory:',
  });
});
