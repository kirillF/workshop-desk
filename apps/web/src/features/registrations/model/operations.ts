import { RegistrationStatus, RegistrationAction } from '@workshop-desk/contracts';
import type {
  OrganizerRegistrationsResponse,
  Registration,
  UpdateRegistrationResponse,
} from '@workshop-desk/contracts';
export type {
  OrganizerRegistrationsResponse,
  Registration,
  RegistrationAction,
  RegistrationStatus,
  UpdateRegistrationResponse,
  WorkshopSnapshot,
} from '@workshop-desk/contracts';

export interface OperationRequest {
  action: string;
  expectedVersion: number | null;
}

export interface LogicalKey {
  actorId: string;
  workshopId: string;
  participantId: string;
}

export interface OperationError {
  code?: string;
  message: string;
}

export type OperationStatus = 'pending' | 'unknown' | 'succeeded' | 'rejected' | 'retired';

export interface OperationDescriptor {
  opId: string;
  key: LogicalKey;
  keyId: string;
  contextKey: string;
  registrationId?: string;
  action: string;
  expectedVersion: number | null;
  status: OperationStatus;
  contextGeneration: number;
  interactionGeneration: number;
  restored: boolean;
  overlay?: Partial<Registration>;
  error?: OperationError;
  unknownAtReadGeneration?: number;
  refreshedAtReadGeneration?: number;
}

export interface StartOperationInput {
  participantId: string;
  registrationId?: string;
  action: string;
  expectedVersion?: number | null;
  optimisticPatch?: Partial<Registration>;
}

export interface StartOperationResult {
  accepted: boolean;
  reason?: 'NO_CONTEXT' | 'SNAPSHOT_REQUIRED' | 'GUARDED' | 'MISSING_EXPECTED_VERSION';
  operation?: OperationDescriptor;
  request?: OperationRequest;
}

export interface ReadToken {
  contextKey: string;
  actorId: string;
  workshopId: string;
  contextGeneration: number;
  readGeneration: number;
  writeEpoch: number;
}

export interface ReadResult {
  accepted: boolean;
  authoritative: boolean;
  reason?: 'STALE_READ' | 'STALE_EPOCH' | 'STALE_ROW_VERSION' | 'WRONG_WORKSHOP';
}

export interface CompletionResult {
  accepted: boolean;
  uiApplied: boolean;
  refreshRequired: boolean;
  reason?: 'UNKNOWN_OPERATION' | 'RETIRED_OPERATION' | 'GUARD_REPLACED';
}

export interface ContinuationResult {
  ok: boolean;
  reason?: 'UNKNOWN_OPERATION' | 'WRONG_CONTEXT' | 'REFRESH_REQUIRED' | 'GUARD_REPLACED';
  opId?: string;
  key?: LogicalKey;
  expectedVersion?: number | null;
}

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ReadStatus = 'idle' | 'pending' | 'ready' | 'error' | 'stale';

export interface OperationStoreState {
  context: {
    actorId: string;
    workshopId: string;
    contextGeneration: number;
  };
  baseSnapshot: OrganizerRegistrationsResponse | null;
  snapshot: OrganizerRegistrationsResponse | null;
  read: {
    status: ReadStatus;
    latestGeneration: number;
    acceptedGeneration: number;
    ready: boolean;
    needsRefresh: boolean;
    error?: OperationError;
  };
  operations: OperationDescriptor[];
  guards: Array<{
    key: LogicalKey;
    opId: string;
    status: OperationStatus;
  }>;
  errors: Array<{
    opId: string;
    key: LogicalKey;
    error: OperationError;
  }>;
  syncing: boolean;
}

type Listener = () => void;

interface ContextState {
  actorId: string;
  workshopId: string;
  contextGeneration: number;
}

interface InternalReadState {
  status: ReadStatus;
  latestGeneration: number;
  acceptedGeneration: number;
  ready: boolean;
  needsRefresh: boolean;
  error?: OperationError;
}

export function contextId(identity: { actorId: string; workshopId: string }): string {
  return JSON.stringify([identity.actorId, identity.workshopId]);
}

export function logicalKeyId(key: LogicalKey): string {
  return JSON.stringify([key.actorId, key.workshopId, key.participantId]);
}

function registrationVersionKey(registration: Registration): string {
  return JSON.stringify([registration.workshopId, registration.id]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneError(error: OperationError): OperationError {
  return { ...error };
}

function cloneSnapshot(
  snapshot: OrganizerRegistrationsResponse | null,
): OrganizerRegistrationsResponse | null {
  if (!snapshot) {
    return null;
  }

  return {
    workshop: { ...snapshot.workshop },
    registrations: snapshot.registrations.map((registration) => ({
      ...registration,
    })),
  };
}

let generatedOperationId = 0;

function defaultOperationId(): string {
  generatedOperationId += 1;
  return `op-${Date.now().toString(36)}-${generatedOperationId.toString(36)}`;
}

function emptyReadState(): InternalReadState {
  return {
    status: 'idle',
    latestGeneration: 0,
    acceptedGeneration: 0,
    ready: false,
    needsRefresh: false,
  };
}

export class OperationStore {
  private readonly storage?: SessionStorageLike;
  private readonly storageKey: string;
  private readonly idFactory: () => string;
  private readonly listeners = new Set<Listener>();
  private readonly operations = new Map<string, OperationDescriptor>();
  private readonly guards = new Map<string, string>();
  private readonly retiredOperationIds = new Set<string>();
  private readonly interactionGenerations = new Map<string, number>();
  private readonly acknowledgedVersions = new Map<string, number>();
  private readonly writeEpochs = new Map<string, number>();
  private nextReadSequence = 0;

  private context: ContextState;
  private baseSnapshot: OrganizerRegistrationsResponse | null = null;
  private read: InternalReadState = emptyReadState();

  constructor(
    options: {
      actorId?: string;
      workshopId?: string;
      storage?: SessionStorageLike;
      storageKey?: string;
      idFactory?: () => string;
    } = {},
  ) {
    this.storage = options.storage;
    this.storageKey = options.storageKey ?? 'workshop-desk.operation-descriptors.v1';
    this.idFactory = options.idFactory ?? defaultOperationId;
    this.context = {
      actorId: options.actorId ?? '',
      workshopId: options.workshopId ?? '',
      contextGeneration: options.actorId || options.workshopId ? 1 : 0,
    };

    this.loadPersistedDescriptors();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getContext(): ContextState {
    return { ...this.context };
  }

  setContext(actorId: string, workshopId: string): void {
    if (actorId === this.context.actorId && workshopId === this.context.workshopId) {
      return;
    }

    this.context = {
      actorId,
      workshopId,
      contextGeneration: this.context.contextGeneration + 1,
    };

    // Identity/workshop changes clear active cache and readiness.
    // Operation guards and descriptors remain in the registry.
    this.baseSnapshot = null;
    this.read = emptyReadState();
    this.notify();
  }

  /** Clear session-scoped command state before a user session is revoked. */
  resetSession(): void {
    this.operations.clear();
    this.guards.clear();
    this.retiredOperationIds.clear();
    this.interactionGenerations.clear();
    this.acknowledgedVersions.clear();
    this.writeEpochs.clear();
    this.nextReadSequence = 0;
    this.context = {
      actorId: '',
      workshopId: '',
      contextGeneration: this.context.contextGeneration + 1,
    };
    this.baseSnapshot = null;
    this.read = emptyReadState();
    this.persistDescriptors();
    this.notify();
  }

  beginInteraction(participantId: string): number {
    if (!this.context.actorId || !this.context.workshopId) {
      return 0;
    }

    const keyId = logicalKeyId({
      actorId: this.context.actorId,
      workshopId: this.context.workshopId,
      participantId,
    });
    const generation = (this.interactionGenerations.get(keyId) ?? 0) + 1;
    this.interactionGenerations.set(keyId, generation);
    this.notify();
    return generation;
  }

  getBaseSnapshot(): OrganizerRegistrationsResponse | null {
    return cloneSnapshot(this.baseSnapshot);
  }

  getSnapshot(): OrganizerRegistrationsResponse | null {
    const snapshot = cloneSnapshot(this.baseSnapshot);
    if (!snapshot) {
      return null;
    }

    const currentContextKey = this.currentContextKey();

    for (const operation of this.operations.values()) {
      if (operation.contextKey !== currentContextKey) {
        continue;
      }

      if (
        (operation.status !== 'pending' && operation.status !== 'unknown') ||
        !operation.overlay ||
        !this.isCurrentInteraction(operation)
      ) {
        continue;
      }

      const index = snapshot.registrations.findIndex((registration) =>
        operation.registrationId
          ? registration.id === operation.registrationId
          : registration.participantId === operation.key.participantId,
      );

      if (index >= 0) {
        snapshot.registrations[index] = {
          ...snapshot.registrations[index],
          ...operation.overlay,
        };
        continue;
      }

      // A creation operation has no server row yet. Only synthesize a row
      // when enough optimistic data exists for a useful UI representation.
      const patch = operation.overlay;
      if (
        patch.attendeeName === undefined &&
        patch.comment === undefined &&
        patch.status === undefined
      ) {
        continue;
      }

      snapshot.registrations.push({
        id: operation.registrationId ?? `pending:${operation.opId}`,
        workshopId: this.context.workshopId,
        participantId: operation.key.participantId,
        attendeeName: patch.attendeeName ?? '',
        comment: patch.comment ?? '',
        status: patch.status ?? RegistrationStatus.Waitlisted,
        version: patch.version ?? 0,
      });
    }

    return snapshot;
  }

  getState(): OperationStoreState {
    const read = { ...this.read };
    if (this.read.error) {
      read.error = cloneError(this.read.error);
    } else {
      delete read.error;
    }

    const errors = [...this.operations.values()]
      .filter(
        (operation) =>
          operation.status === 'rejected' &&
          operation.error &&
          this.isCurrentInteraction(operation),
      )
      .map((operation) => ({
        opId: operation.opId,
        key: { ...operation.key },
        error: cloneError(operation.error as OperationError),
      }));

    const guards = [...this.guards.entries()]
      .map(([_keyId, opId]) => {
        const operation = this.operations.get(opId);
        if (!operation) {
          return null;
        }

        return {
          key: { ...operation.key },
          opId,
          status: operation.status,
        };
      })
      .filter(
        (
          guard,
        ): guard is {
          key: LogicalKey;
          opId: string;
          status: OperationStatus;
        } => guard !== null,
      );

    return {
      context: this.getContext(),
      baseSnapshot: this.getBaseSnapshot(),
      snapshot: this.getSnapshot(),
      read,
      operations: [...this.operations.values()].map((operation) => this.cloneOperation(operation)),
      guards,
      errors,
      syncing: this.isSyncing(),
    };
  }

  beginRead(): ReadToken {
    const currentContextKey = this.currentContextKey();
    const readGeneration = ++this.nextReadSequence;

    this.read = {
      ...this.read,
      status: 'pending',
      latestGeneration: readGeneration,
      // Keep existing rows usable during a refresh, but continuation still
      // requires status === ready after the refresh completes.
      ready: this.read.ready && this.baseSnapshot !== null,
      needsRefresh: true,
    };
    delete this.read.error;

    const token: ReadToken = {
      contextKey: currentContextKey,
      actorId: this.context.actorId,
      workshopId: this.context.workshopId,
      contextGeneration: this.context.contextGeneration,
      readGeneration,
      writeEpoch: this.writeEpochs.get(currentContextKey) ?? 0,
    };

    this.notify();
    return token;
  }

  acceptRead(token: ReadToken, response: OrganizerRegistrationsResponse): ReadResult {
    if (!this.isLatestRead(token)) {
      return {
        accepted: false,
        authoritative: false,
        reason: 'STALE_READ',
      };
    }

    if (response.workshop.id !== this.context.workshopId) {
      this.invalidateRead('WRONG_WORKSHOP', 'Snapshot belongs to another workshop.');
      return {
        accepted: false,
        authoritative: false,
        reason: 'WRONG_WORKSHOP',
      };
    }

    const currentEpoch = this.writeEpochs.get(token.contextKey) ?? 0;
    if (token.writeEpoch < currentEpoch) {
      this.invalidateRead(
        'STALE_EPOCH',
        'A newer acknowledged operation requires another refresh.',
      );
      return {
        accepted: false,
        authoritative: false,
        reason: 'STALE_EPOCH',
      };
    }

    for (const registration of response.registrations) {
      const floor = this.acknowledgedVersions.get(registrationVersionKey(registration)) ?? 0;

      if (registration.version < floor) {
        this.invalidateRead(
          'STALE_ROW_VERSION',
          'The response contains an older registration version.',
        );
        return {
          accepted: false,
          authoritative: false,
          reason: 'STALE_ROW_VERSION',
        };
      }
    }

    this.baseSnapshot = cloneSnapshot(response);
    for (const registration of response.registrations) {
      const rowKey = registrationVersionKey(registration);
      const floor = this.acknowledgedVersions.get(rowKey) ?? 0;
      this.acknowledgedVersions.set(rowKey, Math.max(floor, registration.version));
    }

    this.read = {
      ...this.read,
      status: 'ready',
      ready: true,
      needsRefresh: false,
      acceptedGeneration: token.readGeneration,
    };
    delete this.read.error;

    // A successful read updates observed state but never resolves unknown
    // command history. It only makes explicit continuation eligible.
    for (const operation of this.operations.values()) {
      if (
        operation.status === 'unknown' &&
        operation.contextKey === token.contextKey &&
        token.readGeneration > (operation.unknownAtReadGeneration ?? 0)
      ) {
        operation.refreshedAtReadGeneration = token.readGeneration;
      }
    }

    this.notify();
    return {
      accepted: true,
      authoritative: true,
    };
  }

  failRead(token: ReadToken, error: OperationError | string): boolean {
    if (!this.isLatestRead(token)) {
      return false;
    }

    this.read.status = 'error';
    this.read.ready = false;
    this.read.needsRefresh = true;
    this.read.error = this.normalizeError(
      error,
      'READ_FAILED',
      'Unable to refresh the current status.',
    );
    this.notify();
    return true;
  }

  startOperation(input: StartOperationInput): StartOperationResult {
    if (!this.context.actorId || !this.context.workshopId) {
      return { accepted: false, reason: 'NO_CONTEXT' };
    }

    if (!this.read.ready || !this.baseSnapshot) {
      return { accepted: false, reason: 'SNAPSHOT_REQUIRED' };
    }

    const key: LogicalKey = {
      actorId: this.context.actorId,
      workshopId: this.context.workshopId,
      participantId: input.participantId,
    };
    const keyId = logicalKeyId(key);
    const existingId = this.guards.get(keyId);

    if (existingId) {
      const existing = this.operations.get(existingId);
      if (existing && (existing.status === 'pending' || existing.status === 'unknown')) {
        return { accepted: false, reason: 'GUARDED' };
      }
      this.guards.delete(keyId);
    }

    const row = this.findBaseRow(input.registrationId, input.participantId);
    const expectedVersion =
      input.expectedVersion === undefined ? (row?.version ?? null) : input.expectedVersion;

    if (
      (input.action === RegistrationAction.Confirm ||
        input.action === RegistrationAction.Cancel ||
        input.action === RegistrationAction.Edit) &&
      (typeof expectedVersion !== 'number' ||
        !Number.isSafeInteger(expectedVersion) ||
        expectedVersion <= 0)
    ) {
      return {
        accepted: false,
        reason: 'MISSING_EXPECTED_VERSION',
      };
    }

    const opId = this.idFactory();
    const operation: OperationDescriptor = {
      opId,
      key,
      keyId,
      contextKey: contextId(key),
      registrationId: input.registrationId,
      action: input.action,
      expectedVersion,
      status: 'pending',
      contextGeneration: this.context.contextGeneration,
      interactionGeneration: this.interactionGenerations.get(keyId) ?? 0,
      restored: false,
    };

    const overlay: Partial<Registration> = {
      ...(input.optimisticPatch ?? {}),
    };

    if (overlay.status === undefined) {
      if (input.action === RegistrationAction.Confirm) {
        overlay.status = RegistrationStatus.Confirmed;
      } else if (input.action === RegistrationAction.Cancel) {
        overlay.status = RegistrationStatus.Cancelled;
      } else if (input.action === 'waitlist') {
        overlay.status = RegistrationStatus.Waitlisted;
      }
    }

    if (Object.keys(overlay).length > 0) {
      operation.overlay = overlay;
    }

    // A new explicit command dismisses an older terminal error for this key.
    for (const previous of this.operations.values()) {
      if (previous.keyId === keyId && previous.status === 'rejected') {
        delete previous.error;
      }
    }

    this.operations.set(opId, operation);
    this.guards.set(keyId, opId);
    this.persistDescriptors();
    this.notify();

    return {
      accepted: true,
      operation: this.cloneOperation(operation),
      request: {
        action: input.action,
        expectedVersion,
      },
    };
  }

  resolveSuccess(opId: string, response: UpdateRegistrationResponse): CompletionResult {
    const operation = this.liveOperation(opId);
    if (!operation) {
      return {
        accepted: false,
        uiApplied: false,
        refreshRequired: false,
        reason: this.retiredOperationIds.has(opId) ? 'RETIRED_OPERATION' : 'GUARD_REPLACED',
      };
    }

    if (!response?.registration) {
      return {
        accepted: false,
        uiApplied: false,
        refreshRequired: false,
        reason: 'UNKNOWN_OPERATION',
      };
    }

    const uiApplied = this.isCurrentInteraction(operation);
    operation.status = 'succeeded';
    delete operation.error;
    this.retiredOperationIds.add(opId);
    this.bumpWriteEpoch(operation.contextKey);

    const registration = response.registration;
    const rowKey = registrationVersionKey(registration);
    const floor = this.acknowledgedVersions.get(rowKey) ?? 0;
    this.acknowledgedVersions.set(rowKey, Math.max(floor, registration.version));

    if (uiApplied && this.baseSnapshot && registration.workshopId === this.context.workshopId) {
      this.replaceBaseRow(registration);
    }

    this.releaseGuard(operation);

    if (operation.contextKey === this.currentContextKey()) {
      this.read.needsRefresh = true;
    }

    this.persistDescriptors();
    this.notify();

    return {
      accepted: true,
      uiApplied,
      refreshRequired: true,
    };
  }

  resolveRejection(opId: string, error: OperationError | string): CompletionResult {
    const operation = this.liveOperation(opId);
    if (!operation) {
      return {
        accepted: false,
        uiApplied: false,
        refreshRequired: false,
        reason: this.retiredOperationIds.has(opId) ? 'RETIRED_OPERATION' : 'GUARD_REPLACED',
      };
    }

    const uiApplied = this.isCurrentInteraction(operation);
    operation.status = 'rejected';
    operation.error = this.normalizeError(
      error,
      'OPERATION_REJECTED',
      'The operation was rejected.',
    );
    this.retiredOperationIds.add(opId);
    this.bumpWriteEpoch(operation.contextKey);
    this.releaseGuard(operation);

    if (operation.contextKey === this.currentContextKey()) {
      this.read.needsRefresh = true;
    }

    this.persistDescriptors();
    this.notify();

    return {
      accepted: true,
      uiApplied,
      refreshRequired: true,
    };
  }

  markUnknown(
    opId: string,
    reason: OperationError | string = {
      code: 'OUTCOME_UNKNOWN',
      message: 'Outcome unknown.',
    },
  ): boolean {
    const operation = this.liveOperation(opId);
    if (!operation) {
      return false;
    }

    operation.status = 'unknown';
    operation.error = this.normalizeError(reason, 'OUTCOME_UNKNOWN', 'Outcome unknown.');
    operation.unknownAtReadGeneration =
      operation.contextKey === this.currentContextKey() ? this.nextReadSequence : 0;
    delete operation.refreshedAtReadGeneration;

    this.persistDescriptors();
    this.notify();
    return true;
  }

  continueFromCurrent(opId: string): ContinuationResult {
    const operation = this.operations.get(opId);

    if (!operation || operation.status !== 'unknown') {
      return { ok: false, reason: 'UNKNOWN_OPERATION' };
    }

    if (operation.contextKey !== this.currentContextKey()) {
      return { ok: false, reason: 'WRONG_CONTEXT' };
    }

    // A newer failed/pending read invalidates a previously successful refresh.
    if (
      this.read.status !== 'ready' ||
      !this.read.ready ||
      !this.baseSnapshot ||
      operation.refreshedAtReadGeneration === undefined ||
      operation.refreshedAtReadGeneration !== this.read.acceptedGeneration ||
      operation.refreshedAtReadGeneration <= (operation.unknownAtReadGeneration ?? 0)
    ) {
      return { ok: false, reason: 'REFRESH_REQUIRED' };
    }

    if (this.guards.get(operation.keyId) !== operation.opId) {
      return { ok: false, reason: 'GUARD_REPLACED' };
    }

    operation.status = 'retired';
    delete operation.error;
    delete operation.overlay;
    this.retiredOperationIds.add(operation.opId);
    this.guards.delete(operation.keyId);

    const nextInteraction = (this.interactionGenerations.get(operation.keyId) ?? 0) + 1;
    this.interactionGenerations.set(operation.keyId, nextInteraction);

    const row = this.findBaseRow(operation.registrationId, operation.key.participantId);

    this.read.needsRefresh = false;
    this.persistDescriptors();
    this.notify();

    return {
      ok: true,
      opId,
      key: { ...operation.key },
      expectedVersion: row?.version ?? null,
    };
  }

  private currentContextKey(): string {
    return contextId(this.context);
  }

  private findBaseRow(
    registrationId: string | undefined,
    participantId: string,
  ): Registration | undefined {
    if (!this.baseSnapshot) {
      return undefined;
    }

    return this.baseSnapshot.registrations.find((registration) =>
      registrationId
        ? registration.id === registrationId
        : registration.participantId === participantId,
    );
  }

  private isCurrentInteraction(operation: OperationDescriptor): boolean {
    return (
      operation.contextKey === this.currentContextKey() &&
      operation.contextGeneration === this.context.contextGeneration &&
      operation.interactionGeneration === (this.interactionGenerations.get(operation.keyId) ?? 0)
    );
  }

  private isLatestRead(token: ReadToken): boolean {
    return (
      token.contextKey === this.currentContextKey() &&
      token.contextGeneration === this.context.contextGeneration &&
      token.readGeneration === this.read.latestGeneration
    );
  }

  private liveOperation(opId: string): OperationDescriptor | undefined {
    if (this.retiredOperationIds.has(opId)) {
      return undefined;
    }

    const operation = this.operations.get(opId);
    if (
      !operation ||
      (operation.status !== 'pending' && operation.status !== 'unknown') ||
      this.guards.get(operation.keyId) !== opId
    ) {
      return undefined;
    }

    return operation;
  }

  private replaceBaseRow(registration: Registration): void {
    if (!this.baseSnapshot) {
      return;
    }

    const index = this.baseSnapshot.registrations.findIndex(
      (candidate) => candidate.id === registration.id,
    );

    if (index < 0) {
      this.baseSnapshot.registrations.push({ ...registration });
      return;
    }

    if (this.baseSnapshot.registrations[index].version <= registration.version) {
      this.baseSnapshot.registrations[index] = { ...registration };
    }
  }

  private releaseGuard(operation: OperationDescriptor): void {
    if (this.guards.get(operation.keyId) === operation.opId) {
      this.guards.delete(operation.keyId);
    }
  }

  private bumpWriteEpoch(contextKey: string): void {
    this.writeEpochs.set(contextKey, (this.writeEpochs.get(contextKey) ?? 0) + 1);
  }

  private invalidateRead(code: string, message: string): void {
    this.read.status = 'stale';
    this.read.ready = false;
    this.read.needsRefresh = true;
    this.read.error = { code, message };
    this.notify();
  }

  private normalizeError(
    error: OperationError | string | undefined,
    fallbackCode: string,
    fallbackMessage: string,
  ): OperationError {
    if (typeof error === 'string') {
      return { code: fallbackCode, message: error };
    }

    if (error && typeof error.message === 'string') {
      return { ...error };
    }

    return {
      code: fallbackCode,
      message: fallbackMessage,
    };
  }

  private cloneOperation(operation: OperationDescriptor): OperationDescriptor {
    const copy: OperationDescriptor = {
      ...operation,
      key: { ...operation.key },
    };

    if (operation.overlay) {
      copy.overlay = { ...operation.overlay };
    }

    if (operation.error) {
      copy.error = cloneError(operation.error);
    }

    return copy;
  }

  private getSyncingOperations(): boolean {
    const contextKey = this.currentContextKey();

    return [...this.operations.values()].some(
      (operation) =>
        operation.contextKey === contextKey &&
        (operation.status === 'pending' || operation.status === 'unknown'),
    );
  }

  private isSyncing(): boolean {
    return this.read.status === 'pending' || this.read.needsRefresh || this.getSyncingOperations();
  }

  private loadPersistedDescriptors(): void {
    const raw = this.readStorage();
    if (!raw) {
      return;
    }

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return;
    }

    if (!Array.isArray(value)) {
      return;
    }

    let changed = false;

    for (const item of value) {
      if (!isRecord(item) || typeof item.opId !== 'string') {
        continue;
      }

      const rawKey = item.key;
      if (!isRecord(rawKey)) {
        continue;
      }

      const actorId = rawKey.actorId;
      const workshopId = rawKey.workshopId;
      const participantId = rawKey.participantId;

      if (
        typeof actorId !== 'string' ||
        typeof workshopId !== 'string' ||
        typeof participantId !== 'string' ||
        (item.status !== 'pending' && item.status !== 'unknown')
      ) {
        continue;
      }

      const key: LogicalKey = {
        actorId,
        workshopId,
        participantId,
      };
      const keyId = logicalKeyId(key);

      if (this.guards.has(keyId) || this.operations.has(item.opId)) {
        continue;
      }

      const operation: OperationDescriptor = {
        opId: item.opId,
        key,
        keyId,
        contextKey: contextId(key),
        action: 'restored',
        expectedVersion: null,
        status: 'unknown',
        contextGeneration: 0,
        interactionGeneration: 0,
        restored: true,
        unknownAtReadGeneration: 0,
      };

      this.operations.set(operation.opId, operation);
      this.guards.set(keyId, operation.opId);
      changed = changed || item.status === 'pending';
    }

    if (changed) {
      this.persistDescriptors();
    }
  }

  private persistDescriptors(): void {
    if (!this.storage) {
      return;
    }

    const descriptors = [...this.operations.values()]
      .filter((operation) => operation.status === 'pending' || operation.status === 'unknown')
      .map((operation) => ({
        key: { ...operation.key },
        opId: operation.opId,
        status: operation.status,
      }));

    try {
      if (descriptors.length === 0) {
        this.storage.removeItem(this.storageKey);
      } else {
        this.storage.setItem(this.storageKey, JSON.stringify(descriptors));
      }
    } catch {
      // Storage failure must not change server-side command semantics.
    }
  }

  private readStorage(): string | null {
    if (!this.storage) {
      return null;
    }

    try {
      return this.storage.getItem(this.storageKey);
    } catch {
      return null;
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // A subscriber cannot invalidate operation state.
      }
    }
  }
}
