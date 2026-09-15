import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { OrganizerRegistrationsResponse, Registration } from '@workshop-desk/contracts';
import {
  OperationStore,
  type SessionStorageLike,
} from '../../apps/web/src/features/registrations/model/operations.ts';

function row(
  id: string,
  participantId: string,
  status: Registration['status'],
  version = 1,
): Registration {
  return {
    id,
    workshopId: 'w',
    participantId,
    attendeeName: participantId,
    comment: '',
    status,
    version,
  };
}

function response(registrations: Registration[], capacity = 2): OrganizerRegistrationsResponse {
  const confirmedCount = registrations.filter(
    (registration) => registration.status === 'confirmed',
  ).length;
  const waitlistedCount = registrations.filter(
    (registration) => registration.status === 'waitlisted',
  ).length;

  return {
    workshop: {
      id: 'w',
      title: 'Workshop',
      description: '',
      startsAt: '2026-09-15T10:00:00Z',
      location: 'Room',
      capacity,
      confirmedCount,
      waitlistedCount,
      availableSeats: capacity - confirmedCount,
    },
    registrations: registrations.map((registration) => ({
      ...registration,
    })),
  };
}

function ids(...values: string[]): () => string {
  let index = 0;
  return () => values[index++] ?? `generated-${index}`;
}

function readyStore(
  actorId: string,
  registrations: Registration[],
  capacity = 2,
  extra: {
    storage?: SessionStorageLike;
    idFactory?: () => string;
  } = {},
): OperationStore {
  const store = new OperationStore({
    actorId,
    workshopId: 'w',
    ...extra,
  });
  const read = store.beginRead();
  assert.equal(store.acceptRead(read, response(registrations, capacity)).accepted, true);
  return store;
}

class MemoryStorage implements SessionStorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

test('rejecting A does not roll back acknowledged success for B', () => {
  const r1 = row('r1', 'p1', 'confirmed');
  const r2 = row('r2', 'p2', 'waitlisted');
  const store = readyStore('organizer', [r1, r2], 2, {
    idFactory: ids('a', 'b'),
  });

  const a = store.startOperation({
    participantId: 'p1',
    registrationId: 'r1',
    action: 'cancel',
    expectedVersion: 1,
  });
  const b = store.startOperation({
    participantId: 'p2',
    registrationId: 'r2',
    action: 'confirm',
    expectedVersion: 1,
  });

  assert.equal(a.accepted, true);
  assert.equal(b.accepted, true);

  store.resolveSuccess('b', {
    registration: { ...r2, status: 'confirmed', version: 2 },
  });
  store.resolveRejection('a', {
    code: 'SEATS_FULL',
    message: 'Rejected by the scenario harness.',
  });

  const beforeReconcile = store.getSnapshot();
  assert.equal(
    beforeReconcile?.registrations.find((item) => item.id === 'r1')?.status,
    'confirmed',
  );
  assert.equal(
    beforeReconcile?.registrations.find((item) => item.id === 'r2')?.status,
    'confirmed',
  );
  assert.equal(store.getState().syncing, true);

  const read = store.beginRead();
  assert.equal(
    store.acceptRead(read, response([{ ...r1 }, { ...r2, status: 'confirmed', version: 2 }], 2))
      .accepted,
    true,
  );

  const after = store.getSnapshot();
  assert.equal(after?.registrations.find((item) => item.id === 'r2')?.version, 2);
  assert.equal(after?.workshop.confirmedCount, 2);
  assert.equal(after?.workshop.availableSeats, 0);
});

test('duplicate creation is guarded before a registration ID exists', () => {
  const store = readyStore('p1', [], 1, {
    idFactory: ids('create-a', 'create-b'),
  });

  const first = store.startOperation({
    participantId: 'p1',
    action: 'create',
    expectedVersion: null,
    optimisticPatch: {
      attendeeName: 'Draft',
      comment: 'private draft',
      status: 'confirmed',
    },
  });
  const second = store.startOperation({
    participantId: 'p1',
    action: 'create',
    expectedVersion: null,
  });

  assert.equal(first.accepted, true);
  assert.equal(first.request?.expectedVersion, null);
  assert.equal(second.accepted, false);
  assert.equal(second.reason, 'GUARDED');
  assert.equal(store.getState().guards[0]?.key.participantId, 'p1');
});

test('an old read cannot replace a snapshot after an acknowledged mutation', () => {
  const initial = row('r1', 'p1', 'confirmed');
  const store = readyStore('organizer', [initial], 2, {
    idFactory: ids('cancel'),
  });

  const oldRead = store.beginRead();
  const operation = store.startOperation({
    participantId: 'p1',
    registrationId: 'r1',
    action: 'cancel',
    expectedVersion: 1,
  });

  assert.equal(operation.accepted, true);
  store.resolveSuccess('cancel', {
    registration: { ...initial, status: 'cancelled', version: 2 },
  });

  const stale = store.acceptRead(oldRead, response([initial], 2));
  assert.equal(stale.accepted, false);
  assert.equal(stale.reason, 'STALE_EPOCH');

  const current = store.getBaseSnapshot();
  assert.equal(current?.registrations[0]?.status, 'cancelled');
  assert.equal(current?.registrations[0]?.version, 2);
});

test('unknown continuation uses a global read sequence across context changes', () => {
  const initial = row('r1', 'p1', 'confirmed');
  const store = readyStore('organizer', [initial], 2, {
    idFactory: ids('unknown'),
  });

  for (let index = 0; index < 3; index += 1) {
    const read = store.beginRead();
    assert.equal(store.acceptRead(read, response([initial], 2)).accepted, true);
  }

  const operation = store.startOperation({
    participantId: 'p1',
    registrationId: 'r1',
    action: 'cancel',
    expectedVersion: 1,
  });
  assert.equal(operation.accepted, true);
  // Issue the read before marking the outcome unknown.
  const inFlight = store.beginRead();
  assert.equal(store.markUnknown('unknown'), true);
  assert.equal(store.acceptRead(inFlight, response([initial], 2)).accepted, true);
  assert.equal(store.continueFromCurrent('unknown').reason, 'REFRESH_REQUIRED');

  store.setContext('other-user', 'w');
  const otherRead = store.beginRead();
  assert.equal(store.acceptRead(otherRead, response([initial], 2)).accepted, true);

  store.setContext('organizer', 'w');
  const freshRead = store.beginRead();
  assert.equal(store.acceptRead(freshRead, response([initial], 2)).accepted, true);
  assert.ok(freshRead.readGeneration > inFlight.readGeneration);

  const continuation = store.continueFromCurrent('unknown');
  assert.equal(continuation.ok, true);
  assert.equal(continuation.expectedVersion, 1);
});

test('reload converts pending descriptors to unknown without restoring drafts', () => {
  const storage = new MemoryStorage();
  const store = readyStore('p1', [], 1, {
    storage,
    idFactory: ids('create'),
  });

  const started = store.startOperation({
    participantId: 'p1',
    action: 'create',
    expectedVersion: null,
    optimisticPatch: {
      attendeeName: 'Should not persist',
      comment: 'Should not persist',
      status: 'confirmed',
    },
  });
  assert.equal(started.accepted, true);

  const saved = JSON.parse(
    storage.getItem('workshop-desk.operation-descriptors.v1') as string,
  ) as Array<Record<string, unknown>>;
  assert.deepEqual(Object.keys(saved[0] ?? {}).sort(), ['key', 'opId', 'status']);
  assert.equal(saved[0]?.status, 'pending');
  assert.equal('attendeeName' in (saved[0] ?? {}), false);

  const reloaded = new OperationStore({
    actorId: 'p1',
    workshopId: 'w',
    storage,
  });
  const restored = reloaded.getState().operations.find((operation) => operation.opId === 'create');

  assert.equal(restored?.status, 'unknown');
  assert.equal(restored?.restored, true);
  assert.equal(restored?.action, 'restored');
  assert.equal(restored?.overlay, undefined);

  assert.equal(
    reloaded.startOperation({
      participantId: 'p1',
      action: 'create',
      expectedVersion: null,
    }).reason,
    'SNAPSHOT_REQUIRED',
  );

  const read = reloaded.beginRead();
  assert.equal(reloaded.acceptRead(read, response([], 1)).accepted, true);
  assert.equal(
    reloaded.startOperation({
      participantId: 'p1',
      action: 'create',
      expectedVersion: null,
    }).reason,
    'GUARDED',
  );

  assert.equal(reloaded.continueFromCurrent('create').ok, true);
});

test('a retired callback cannot release or overwrite a newer guard', () => {
  const initial = row('r1', 'p1', 'waitlisted');
  const store = readyStore('organizer', [initial], 2, {
    idFactory: ids('old', 'new'),
  });

  const old = store.startOperation({
    participantId: 'p1',
    registrationId: 'r1',
    action: 'confirm',
    expectedVersion: 1,
  });
  assert.equal(old.accepted, true);
  assert.equal(store.markUnknown('old'), true);

  const read = store.beginRead();
  assert.equal(store.acceptRead(read, response([initial], 2)).accepted, true);
  assert.equal(store.continueFromCurrent('old').ok, true);

  const newer = store.startOperation({
    participantId: 'p1',
    registrationId: 'r1',
    action: 'cancel',
    expectedVersion: 1,
  });
  assert.equal(newer.accepted, true);

  const late = store.resolveSuccess('old', {
    registration: { ...initial, status: 'confirmed', version: 2 },
  });
  assert.equal(late.accepted, false);
  assert.equal(late.refreshRequired, false);
  assert.equal(late.reason, 'RETIRED_OPERATION');

  const state = store.getState();
  assert.equal(state.guards[0]?.opId, 'new');
  assert.equal(store.getBaseSnapshot()?.registrations[0]?.status, 'waitlisted');
  assert.equal(store.getSnapshot()?.registrations[0]?.status, 'cancelled');
});

test('a newer failed refresh invalidates an earlier successful refresh', () => {
  const initial = row('r1', 'p1', 'confirmed');
  const store = readyStore('organizer', [initial], 2, {
    idFactory: ids('unknown'),
  });

  const operation = store.startOperation({
    participantId: 'p1',
    registrationId: 'r1',
    action: 'cancel',
    expectedVersion: 1,
  });
  assert.equal(operation.accepted, true);
  assert.equal(store.markUnknown('unknown'), true);

  const successfulRefresh = store.beginRead();
  assert.equal(store.acceptRead(successfulRefresh, response([initial], 2)).accepted, true);

  const failedRefresh = store.beginRead();
  assert.equal(
    store.failRead(failedRefresh, {
      code: 'READ_FAILED',
      message: 'refresh failed',
    }),
    true,
  );
  assert.equal(store.continueFromCurrent('unknown').reason, 'REFRESH_REQUIRED');

  const finalRefresh = store.beginRead();
  assert.equal(store.acceptRead(finalRefresh, response([initial], 2)).accepted, true);
  assert.equal(store.continueFromCurrent('unknown').ok, true);
});

test('session reset clears persisted commands and makes late callbacks inert', () => {
  const storage = new MemoryStorage();
  const initial = row('r1', 'p1', 'confirmed');
  const store = readyStore('organizer', [initial], 2, {
    storage,
    idFactory: ids('logout-pending'),
  });
  const started = store.startOperation({
    participantId: 'p1',
    registrationId: 'r1',
    action: 'cancel',
    expectedVersion: 1,
  });
  assert.equal(started.accepted, true);
  assert.notEqual(storage.getItem('workshop-desk.operation-descriptors.v1'), null);

  store.resetSession();
  assert.equal(store.getState().context.actorId, '');
  assert.equal(store.getState().operations.length, 0);
  assert.equal(store.getState().guards.length, 0);
  assert.equal(storage.getItem('workshop-desk.operation-descriptors.v1'), null);
  const late = store.resolveSuccess('logout-pending', {
    registration: { ...initial, status: 'cancelled', version: 2 },
  });
  assert.equal(late.accepted, false);
  assert.equal(late.refreshRequired, false);
});

test('context and snapshot readiness reject premature commands', () => {
  const store = new OperationStore();
  assert.equal(store.beginInteraction('p1'), 0);
  assert.deepEqual(store.startOperation({ participantId: 'p1', action: 'seat' }), {
    accepted: false,
    reason: 'NO_CONTEXT',
  });
  store.setContext('a', 'w');
  const context = store.getContext();
  store.setContext('a', 'w');
  assert.deepEqual(store.getContext(), context);
  assert.equal(store.startOperation({ participantId: 'p1', action: 'seat' }).accepted, false);
  const token = store.beginRead();
  assert.equal(store.acceptRead(token, response([], 2)).accepted, true);
  for (const expectedVersion of [null, 0, -1, 0.5]) {
    assert.equal(
      store.startOperation({ participantId: 'p1', action: 'cancel', expectedVersion }).accepted,
      false,
    );
  }
  const started = store.startOperation({ participantId: 'p1', action: 'seat' });
  assert.equal(started.accepted, true);
  assert.ok(started.operation?.opId);
  assert.equal(store.getSnapshot()?.registrations.length, 0);
});

test('wrong workshop and regressing versions invalidate readiness without replacing rows', () => {
  const initial = row('r1', 'p1', 'confirmed', 4);
  const store = readyStore('a', [initial]);
  let token = store.beginRead();
  assert.equal(
    store.acceptRead(token, {
      ...response([initial]),
      workshop: { ...response([]).workshop, id: 'other' },
    }).reason,
    'WRONG_WORKSHOP',
  );
  assert.equal(store.getState().read.ready, false);
  token = store.beginRead();
  assert.equal(
    store.acceptRead(token, response([{ ...initial, version: 3 }])).reason,
    'STALE_ROW_VERSION',
  );
  assert.equal(store.getSnapshot()?.registrations[0]?.version, 4);
  const stale = token;
  token = store.beginRead();
  assert.equal(store.failRead(stale, 'old failure'), false);
  assert.equal(store.failRead(token, { code: 'OFFLINE', message: 'offline' }), true);
});

test('optimistic creation is isolated from base rows and returned snapshots', () => {
  const store = readyStore('a', [], 2, { idFactory: ids('new') });
  store.startOperation({
    participantId: 'p',
    action: 'waitlist',
    optimisticPatch: { attendeeName: 'Anna', comment: 'Draft' },
  });
  const snapshot = store.getSnapshot();
  assert.equal(snapshot?.registrations[0]?.status, 'waitlisted');
  assert.equal(store.getBaseSnapshot()?.registrations.length, 0);
  snapshot!.registrations[0]!.attendeeName = 'External mutation';
  assert.equal(store.getSnapshot()?.registrations[0]?.attendeeName, 'Anna');
  assert.equal(
    store.resolveSuccess('new', { registration: row('created', 'p', 'waitlisted') }).accepted,
    true,
  );
  assert.equal(store.getBaseSnapshot()?.registrations[0]?.id, 'created');
  assert.equal(store.markUnknown('new'), false);
  assert.equal(store.resolveRejection('new', 'late').accepted, false);
});

test('old context completion releases its own guard without injecting rows or errors', () => {
  const store = readyStore('a', [row('r1', 'p1', 'confirmed')], 2, { idFactory: ids('old') });
  store.startOperation({ participantId: 'p1', registrationId: 'r1', action: 'cancel' });
  store.setContext('b', 'w');
  store.markUnknown('old');
  assert.deepEqual(store.continueFromCurrent('old'), { ok: false, reason: 'WRONG_CONTEXT' });
  assert.equal(
    store.resolveSuccess('old', { registration: row('r1', 'p1', 'cancelled', 2) }).uiApplied,
    false,
  );
  assert.equal(store.getSnapshot(), null);
  assert.equal(
    store.resolveSuccess('missing', { registration: row('r', 'p', 'confirmed') }).accepted,
    false,
  );
  assert.equal(store.resolveRejection('missing', 'error').accepted, false);
  assert.deepEqual(store.continueFromCurrent('missing'), {
    ok: false,
    reason: 'UNKNOWN_OPERATION',
  });
});

test('new interaction hides an old optimistic overlay and terminal error', () => {
  const store = readyStore('a', [row('r', 'p', 'confirmed')], 2, { idFactory: ids('a', 'b') });
  store.startOperation({ participantId: 'p', action: 'cancel', expectedVersion: 1 });
  store.beginInteraction('p');
  assert.equal(store.getSnapshot()?.registrations[0]?.status, 'confirmed');
  assert.equal(store.resolveRejection('a', 'old rejected').uiApplied, false);
  assert.equal(store.getState().errors.length, 0);
  store.startOperation({ participantId: 'p', action: 'cancel', expectedVersion: 1 });
  assert.equal(store.getState().errors.length, 0);
});

test('storage and subscriber failures cannot interrupt command state changes', () => {
  const storage = {
    getItem: () => {
      throw Error('denied');
    },
    setItem: () => {
      throw Error('full');
    },
    removeItem: () => {
      throw Error('denied');
    },
  };
  const store = readyStore('a', [], 2, { storage, idFactory: ids('x') });
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications++;
  });
  store.subscribe(() => {
    throw Error('consumer error');
  });
  assert.equal(
    store.startOperation({
      participantId: 'p',
      action: 'seat',
      optimisticPatch: { status: 'confirmed' },
    }).accepted,
    true,
  );
  assert.ok(notifications > 0);
  unsubscribe();
  const previous = notifications;
  store.resetSession();
  assert.equal(notifications, previous);
  assert.equal(store.getState().operations.length, 0);
});

test('corrupt, duplicate and terminal persisted descriptors never create extra guards', () => {
  const key = 'workshop-desk.operation-descriptors.v1';
  const good = {
    opId: 'old',
    key: { actorId: 'a', workshopId: 'w', participantId: 'p' },
    status: 'unknown',
  };
  for (const raw of [
    '{',
    '{}',
    JSON.stringify([
      null,
      {},
      { opId: 'invalid-key' },
      { ...good, status: 'succeeded' },
      { ...good, key: { actorId: 1 } },
      good,
      good,
    ]),
  ]) {
    const storage = new MemoryStorage();
    storage.setItem(key, raw);
    const store = new OperationStore({ storage, actorId: 'a', workshopId: 'w' });
    assert.equal(store.getState().guards.length, raw.startsWith('[') ? 1 : 0);
  }
});
