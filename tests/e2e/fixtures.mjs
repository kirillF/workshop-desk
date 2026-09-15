import { test as base, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApiServer } from '../../apps/api/src/server.ts';
import { seedDatabase } from '../../apps/api/src/db.ts';

const origin = 'http://127.0.0.1:14701';
const credentials = {
  'organizer-1': { email: 'organizer@praktika.local', password: 'Praktika-demo-2026!' },
  'participant-1': { email: 'anna@praktika.local', password: 'Praktika-demo-2026!' },
  'participant-2': { email: 'boris@praktika.local', password: 'Praktika-demo-2026!' },
  'participant-3': { email: 'vera@praktika.local', password: 'Praktika-demo-2026!' },
  'participant-4': { email: 'gleb@praktika.local', password: 'Praktika-demo-2026!' },
};

export const test = base.extend({
  desk: [
    async ({}, use, testInfo) => {
      const directory = await mkdtemp(join(tmpdir(), 'workshop-desk-e2e-'));
      const databasePath = join(directory, 'test.sqlite');
      seedDatabase(databasePath);
      const server = createApiServer({
        databasePath,
        testMode: true,
        allowedOrigin: origin,
      });
      const apiUrl = 'http://127.0.0.1:14700';
      const sessions = new Map();
      try {
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(14700, '127.0.0.1', resolve);
        });

        const sessionCookie = async (actor) => {
          const cached = sessions.get(actor);
          if (cached) return cached;
          const account = credentials[actor];
          if (!account) throw new Error(`Unknown fixture actor: ${actor}`);
          const response = await fetch(`${apiUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: origin },
            body: JSON.stringify(account),
          });
          if (!response.ok)
            throw new Error(`Fixture login failed for ${actor}: ${response.status}`);
          const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
          if (!cookie) throw new Error(`Fixture login returned no cookie for ${actor}`);
          sessions.set(actor, cookie);
          return cookie;
        };

        const json = async (path, { method = 'GET', actor, data } = {}) => {
          const headers = { Origin: origin };
          if (actor) headers.Cookie = await sessionCookie(actor);
          if (data !== undefined) headers['Content-Type'] = 'application/json';
          const response = await fetch(apiUrl + path, {
            method,
            headers,
            body: data === undefined ? undefined : JSON.stringify(data),
          });
          return { status: response.status, data: await response.json() };
        };
        const rule = async (definition) => {
          const result = await json('/__test/rules', { method: 'POST', data: definition });
          expect(result.status).toBe(201);
          return result.data.ruleId;
        };
        const queued = async (ruleId) => {
          let found;
          await expect
            .poll(
              async () => {
                const result = await json('/__test/queue');
                found = result.data.queue.find((entry) => entry.ruleId === ruleId);
                return Boolean(found);
              },
              { message: 'Wait for an explicit server queue event' },
            )
            .toBe(true);
          return found;
        };
        const release = async (item, outcome = 'continue') => {
          const result = await json('/__test/release', {
            method: 'POST',
            data: { queueId: item.queueId, outcome },
          });
          expect(result.status).toBe(200);
        };
        await use({ apiUrl, json, rule, queued, release });
        const log = await json('/__test/log');
        await testInfo.attach('scenario-events', {
          body: JSON.stringify(log.data, null, 2),
          contentType: 'application/json',
        });
      } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        await rm(directory, { recursive: true, force: true });
      }
    },
    { auto: true },
  ],
});
export { expect };
