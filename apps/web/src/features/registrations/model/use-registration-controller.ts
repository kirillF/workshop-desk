import {
  RegistrationAction,
  RegistrationMode,
  UserRole,
  RegistrationStatus,
} from '@workshop-desk/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  OrganizerRegistrationsResponse,
  Registration,
  UpdateRegistrationResponse,
  UpdateRegistrationRequest,
  User,
  WorkshopResponse,
  WorkshopsResponse,
} from '@workshop-desk/contracts';
import type {
  ApiRequestOptions,
  CreateRegistrationRequest,
  CreateRegistrationResponse,
} from '../../../shared/api/index.ts';
import {
  contextId,
  OperationStore,
  type OperationDescriptor,
  type OperationStoreState,
} from './operations.ts';
import type {
  CancelTarget,
  CatalogState,
  Draft,
  DraftErrors,
  MutationResponse,
  OriginContext,
  RegistrationController,
} from './types.ts';
import {
  isUnauthenticatedError,
  getFieldErrors,
  toOperationError,
} from '../../../shared/lib/errors.ts';
import { displayNameForParticipant } from '../../../shared/lib/format.ts';
import {
  getSessionStorage,
  readSessionValue,
  writeSessionValue,
} from '../../../shared/lib/storage.ts';

const DEFAULT_WORKSHOP_ID = 'workshop-spare';
const WORKSHOP_STORAGE_KEY = 'workshop-desk.workshop-id';

const configuredTimeoutValue =
  typeof import.meta.env === 'object' ? import.meta.env.VITE_OPERATION_TIMEOUT_MS : undefined;
const configuredTimeout = Number(configuredTimeoutValue);
const OPERATION_TIMEOUT_MS =
  Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 10_000;

export interface RegistrationApi {
  getWorkshops(options?: ApiRequestOptions): Promise<WorkshopsResponse>;
  getWorkshop(workshopId: string, options?: ApiRequestOptions): Promise<WorkshopResponse>;
  getOrganizerRegistrations(
    workshopId: string,
    options?: ApiRequestOptions,
  ): Promise<OrganizerRegistrationsResponse>;
  patchRegistration(
    registrationId: string,
    input: UpdateRegistrationRequest,
    options?: ApiRequestOptions,
  ): Promise<UpdateRegistrationResponse>;
  postRegistration(
    workshopId: string,
    input: CreateRegistrationRequest,
    options?: ApiRequestOptions,
  ): Promise<CreateRegistrationResponse>;
}

function validateDraft(draft: Draft): DraftErrors {
  const errors: DraftErrors = {};
  const nameLength = [...draft.name.trim()].length;
  const commentLength = [...draft.comment].length;

  if (nameLength < 1) {
    errors.name = 'Введите имя участника.';
  } else if (nameLength > 80) {
    errors.name = 'Имя должно содержать не более 80 символов.';
  }

  if (commentLength > 500) {
    errors.comment = 'Комментарий должен содержать не более 500 символов.';
  }

  return errors;
}

function registrationForParticipant(
  snapshot: OrganizerRegistrationsResponse | null,
  participantId: string,
): Registration | null {
  return (
    snapshot?.registrations.find((registration) => registration.participantId === participantId) ??
    null
  );
}

function focusFirstError(errors: DraftErrors): void {
  if (typeof document === 'undefined') {
    return;
  }
  const id = errors.name ? 'attendee-name' : errors.comment ? 'attendee-comment' : undefined;
  if (id) {
    document.getElementById(id)?.focus();
  }
}

export function useRegistrationController(
  identity: User,
  api: RegistrationApi,
  onSessionExpired: () => void,
): RegistrationController {
  const initialWorkshopRef = useRef<string | null>(null);
  if (!initialWorkshopRef.current) {
    initialWorkshopRef.current = readSessionValue(WORKSHOP_STORAGE_KEY) ?? DEFAULT_WORKSHOP_ID;
  }
  const initialWorkshopId = initialWorkshopRef.current;

  const store = useMemo(
    () =>
      new OperationStore({
        actorId: identity.id,
        workshopId: initialWorkshopId,
        storage: getSessionStorage(),
      }),
    [identity.id, initialWorkshopId],
  );
  const [selectedWorkshopId, setSelectedWorkshopId] = useState(initialWorkshopId);
  const [storeState, setStoreState] = useState<OperationStoreState>(() => store.getState());
  const [catalog, setCatalog] = useState<CatalogState>({
    status: 'idle',
    workshops: [],
  });
  const [editTarget, setEditTarget] = useState<Registration | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: '', comment: '' });
  const [draftErrors, setDraftErrors] = useState<DraftErrors>({});
  const [formOpen, setFormOpen] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [capacityConflict, setCapacityConflict] = useState(false);
  const [formMode, setFormMode] = useState<RegistrationMode>(RegistrationMode.Seat);
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [pageNotice, setPageNotice] = useState<string | undefined>();
  const formInteractionRef = useRef(0);
  const formOpenRef = useRef(formOpen);
  formOpenRef.current = formOpen;
  const cancelReturnFocusRef = useRef<HTMLElement | null>(null);
  const catalogGenerationRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleSessionExpired = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }
    store.resetSession();
    onSessionExpired();
  }, [onSessionExpired, store]);

  useEffect(() => {
    return store.subscribe(() => {
      setStoreState(store.getState());
    });
  }, [store]);

  const resetParticipantForm = useCallback(() => {
    setEditTarget(null);
    formInteractionRef.current += 1;
    setDraft({ name: '', comment: '' });
    setDraftErrors({});
    setFormOpen(false);
    setFormSubmitting(false);
    setCapacityConflict(false);
  }, []);

  const loadCatalog = useCallback(async () => {
    const generation = ++catalogGenerationRef.current;
    const requestedIdentityId = identity.id;
    setCatalog((current) => ({
      ...current,
      status: 'loading',
      error: undefined,
    }));

    try {
      const response = await api.getWorkshops();
      const currentContext = store.getContext();
      if (
        !mountedRef.current ||
        generation !== catalogGenerationRef.current ||
        currentContext.actorId !== requestedIdentityId
      ) {
        return;
      }
      setCatalog({ status: 'ready', workshops: response.workshops });
      setSelectedWorkshopId((currentWorkshopId) => {
        if (
          currentWorkshopId &&
          response.workshops.some((workshop) => workshop.id === currentWorkshopId)
        ) {
          return currentWorkshopId;
        }
        return response.workshops[0]?.id ?? currentWorkshopId;
      });
    } catch (error: unknown) {
      if (isUnauthenticatedError(error)) {
        handleSessionExpired();
        return;
      }
      const currentContext = store.getContext();
      if (
        !mountedRef.current ||
        generation !== catalogGenerationRef.current ||
        currentContext.actorId !== requestedIdentityId
      ) {
        return;
      }
      setCatalog((current) => ({
        ...current,
        status: 'error',
        error: toOperationError(error, 'Не удалось загрузить каталог. Проверьте доступность API.')
          .message,
      }));
    }
  }, [api, handleSessionExpired, identity.id, store]);

  const refreshCurrentContext = useCallback(async () => {
    const context = store.getContext();
    if (!context.actorId || !context.workshopId) {
      return;
    }
    const token = store.beginRead();
    try {
      if (identity.role === UserRole.Organizer) {
        const response = await api.getOrganizerRegistrations(context.workshopId);
        store.acceptRead(token, response);
        return;
      }

      const response = await api.getWorkshop(context.workshopId);
      store.acceptRead(token, {
        workshop: response.workshop,
        registrations: response.myRegistration ? [response.myRegistration] : [],
      });
    } catch (error: unknown) {
      if (isUnauthenticatedError(error)) {
        handleSessionExpired();
        return;
      }
      store.failRead(
        token,
        toOperationError(error, 'Не удалось обновить статус выбранного воркшопа.'),
      );
    }
  }, [api, handleSessionExpired, identity.role, store]);

  const refreshAll = useCallback(() => {
    void refreshCurrentContext();
    void loadCatalog();
  }, [loadCatalog, refreshCurrentContext]);

  const isOriginCurrent = useCallback(
    (origin: OriginContext): boolean => {
      const current = store.getContext();
      return (
        current.actorId === origin.actorId &&
        current.workshopId === origin.workshopId &&
        current.contextGeneration === origin.contextGeneration
      );
    },
    [store],
  );

  const refreshRef = useRef(refreshAll);
  refreshRef.current = refreshAll;

  const runMutation = useCallback(
    (
      operation: OperationDescriptor,
      origin: OriginContext,
      promise: Promise<MutationResponse>,
      options: {
        formToken?: number;
        onSuccess?: () => void;
        onDefinitiveError?: (error: {
          message: string;
          fieldErrors?: Record<string, string>;
          code?: string;
        }) => void;
      } = {},
    ) => {
      const timeoutId = setTimeout(() => {
        const marked = store.markUnknown(operation.opId, {
          code: 'OUTCOME_UNKNOWN',
          message: 'Ответ не получен вовремя. Серверная команда могла уже завершиться.',
        });
        if (
          marked &&
          options.formToken !== undefined &&
          isOriginCurrent(origin) &&
          formOpenRef.current &&
          formInteractionRef.current === options.formToken
        ) {
          setFormSubmitting(false);
        }
      }, OPERATION_TIMEOUT_MS);

      void promise
        .then((response) => {
          clearTimeout(timeoutId);
          const completion = store.resolveSuccess(operation.opId, response);
          if (!isOriginCurrent(origin)) {
            void refreshRef.current();
            return;
          }
          if (
            options.formToken !== undefined &&
            formOpenRef.current &&
            formInteractionRef.current === options.formToken
          ) {
            setFormSubmitting(false);
            if (completion.accepted && completion.uiApplied) {
              resetParticipantForm();
              setPageNotice('Заявка успешно сохранена. Обновляем статус.');
            }
          }
          if (completion.accepted && completion.uiApplied) {
            options.onSuccess?.();
          }
          void refreshAll();
        })
        .catch((error: unknown) => {
          clearTimeout(timeoutId);
          if (isUnauthenticatedError(error)) {
            handleSessionExpired();
            return;
          }
          const definitive =
            typeof error === 'object' &&
            error !== null &&
            'isDefinitive' in error &&
            Boolean(error.isDefinitive);
          let completionAccepted = false;
          if (definitive) {
            const completion = store.resolveRejection(
              operation.opId,
              toOperationError(error, 'Команда отклонена сервером.'),
            );
            completionAccepted = completion.accepted;
          } else {
            const currentOperation = store
              .getState()
              .operations.find((candidate) => candidate.opId === operation.opId);
            if (currentOperation?.status === 'pending') {
              store.markUnknown(
                operation.opId,
                toOperationError(error, 'Связь с API потеряна; исход операции неизвестен.'),
              );
            }
          }
          if (!isOriginCurrent(origin)) {
            if (definitive) {
              void refreshRef.current();
            }
            return;
          }
          if (
            options.formToken !== undefined &&
            formOpenRef.current &&
            formInteractionRef.current === options.formToken
          ) {
            setFormSubmitting(false);
            if (definitive && completionAccepted) {
              options.onDefinitiveError?.({
                ...toOperationError(error, 'Команда отклонена сервером.'),
                fieldErrors: getFieldErrors(error),
              });
            }
          }
          if (definitive) {
            void refreshAll();
          }
        });
    },
    [handleSessionExpired, isOriginCurrent, refreshAll, resetParticipantForm, store],
  );

  const currentContextKey = contextId({
    actorId: identity.id,
    workshopId: selectedWorkshopId,
  });
  const unknownOperations = storeState.operations.filter(
    (operation) => operation.contextKey === currentContextKey && operation.status === 'unknown',
  );
  const participantGuard = storeState.guards.find(
    (guard) =>
      guard.key.actorId === identity.id &&
      guard.key.workshopId === selectedWorkshopId &&
      guard.key.participantId === identity.id,
  );
  const participantBusyOperation = participantGuard
    ? (storeState.operations.find((operation) => operation.opId === participantGuard.opId) ?? null)
    : null;
  const selectedWorkshop =
    storeState.snapshot?.workshop ??
    catalog.workshops.find((workshop) => workshop.id === selectedWorkshopId);
  const participantRegistration =
    identity.role === UserRole.Participant
      ? registrationForParticipant(storeState.snapshot, identity.id)
      : null;

  const startOrganizerMutation = useCallback(
    (
      registration: Registration,
      action: typeof RegistrationAction.Confirm | typeof RegistrationAction.Cancel,
    ) => {
      const origin = store.getContext();
      if (identity.role !== UserRole.Organizer || origin.workshopId !== selectedWorkshopId) {
        return;
      }
      const existingGuard = store
        .getState()
        .guards.find(
          (guard) =>
            guard.key.actorId === origin.actorId &&
            guard.key.workshopId === origin.workshopId &&
            guard.key.participantId === registration.participantId,
        );
      if (existingGuard) {
        return;
      }
      store.beginInteraction(registration.participantId);
      const started = store.startOperation({
        participantId: registration.participantId,
        registrationId: registration.id,
        action,
        optimisticPatch: {
          status:
            action === RegistrationAction.Confirm
              ? RegistrationStatus.Confirmed
              : RegistrationStatus.Cancelled,
        },
      });
      if (
        !started.accepted ||
        !started.operation ||
        !started.request ||
        typeof started.request.expectedVersion !== 'number'
      ) {
        if (started.reason === 'SNAPSHOT_REQUIRED') {
          void refreshAll();
        }
        return;
      }
      try {
        const promise = api.patchRegistration(
          registration.id,
          {
            action,
            expectedVersion: started.request.expectedVersion,
          },
          { operationId: started.operation.opId },
        );
        runMutation(started.operation, origin, promise);
      } catch (error: unknown) {
        store.markUnknown(
          started.operation.opId,
          toOperationError(error, 'Команда не получила ответа; исход операции неизвестен.'),
        );
      }
    },
    [api, identity.role, refreshAll, runMutation, selectedWorkshopId, store],
  );

  const startParticipantRegistration = useCallback(
    (mode: RegistrationMode) => {
      if (identity.role !== UserRole.Participant || !formOpenRef.current) {
        return;
      }
      const validationErrors = validateDraft(draft);
      if (Object.keys(validationErrors).length > 0) {
        setDraftErrors(validationErrors);
        focusFirstError(validationErrors);
        return;
      }
      const origin = store.getContext();
      if (origin.actorId !== identity.id || origin.workshopId !== selectedWorkshopId) {
        return;
      }
      const existingGuard = store
        .getState()
        .guards.find(
          (guard) =>
            guard.key.actorId === origin.actorId &&
            guard.key.workshopId === origin.workshopId &&
            guard.key.participantId === identity.id,
        );
      if (existingGuard) {
        setDraftErrors({
          form: 'Для этой заявки уже выполняется операция. Обновите статус после её завершения.',
        });
        return;
      }
      const existingRegistration =
        store
          .getBaseSnapshot()
          ?.registrations.find((registration) => registration.participantId === identity.id) ??
        null;
      const name = draft.name.trim();
      const formToken = formInteractionRef.current;
      store.beginInteraction(identity.id);
      const started = store.startOperation({
        participantId: identity.id,
        registrationId: existingRegistration?.id,
        action: editTarget
          ? RegistrationAction.Edit
          : mode === RegistrationMode.Waitlist
            ? 'waitlist'
            : 'register',
        expectedVersion: editTarget?.version ?? existingRegistration?.version ?? null,
        optimisticPatch: {
          attendeeName: name,
          comment: draft.comment,
          status: editTarget
            ? editTarget.status
            : mode === RegistrationMode.Seat
              ? RegistrationStatus.Confirmed
              : RegistrationStatus.Waitlisted,
          version: existingRegistration?.version ?? 0,
        },
      });
      if (!started.accepted || !started.operation || !started.request) {
        if (started.reason === 'SNAPSHOT_REQUIRED') {
          setDraftErrors({ form: 'Обновите статус и попробуйте ещё раз.' });
          void refreshAll();
        } else if (started.reason === 'GUARDED') {
          setDraftErrors({ form: 'Для этой заявки уже выполняется операция.' });
        }
        return;
      }
      setDraftErrors({});
      setFormSubmitting(true);
      try {
        const promise = editTarget
          ? api.patchRegistration(
              editTarget.id,
              {
                action: RegistrationAction.Edit,
                attendeeName: name,
                comment: draft.comment,
                expectedVersion: editTarget.version,
              },
              { operationId: started.operation.opId },
            )
          : api.postRegistration(
              origin.workshopId,
              {
                attendeeName: name,
                comment: draft.comment,
                mode,
                expectedVersion: started.request.expectedVersion,
              },
              { operationId: started.operation.opId },
            );
        runMutation(started.operation, origin, promise, {
          formToken,
          onDefinitiveError: (error) => {
            const nextErrors: DraftErrors = { form: error.message };
            if (error.fieldErrors) {
              for (const [field, message] of Object.entries(error.fieldErrors)) {
                if (field === 'attendeeName' || field === 'name') {
                  nextErrors.name = message;
                } else if (field === 'comment') {
                  nextErrors.comment = message;
                }
              }
            }
            setDraftErrors(nextErrors);
            focusFirstError(nextErrors);
            if (error.code === 'SEATS_FULL') {
              setCapacityConflict(true);
            }
          },
        });
      } catch (error: unknown) {
        store.markUnknown(
          started.operation.opId,
          toOperationError(error, 'Команда не получила ответа; исход операции неизвестен.'),
        );
        setFormSubmitting(false);
      }
    },
    [
      api,
      draft,
      editTarget,
      identity.id,
      identity.role,
      refreshAll,
      runMutation,
      selectedWorkshopId,
      store,
    ],
  );

  const startParticipantCancellation = useCallback(
    (registration: Registration) => {
      if (identity.role !== UserRole.Participant) {
        return;
      }
      const origin = store.getContext();
      if (origin.actorId !== identity.id || origin.workshopId !== selectedWorkshopId) {
        return;
      }
      const existingGuard = store
        .getState()
        .guards.find(
          (guard) =>
            guard.key.actorId === origin.actorId &&
            guard.key.workshopId === origin.workshopId &&
            guard.key.participantId === identity.id,
        );
      if (existingGuard) {
        return;
      }
      store.beginInteraction(identity.id);
      const started = store.startOperation({
        participantId: identity.id,
        registrationId: registration.id,
        action: RegistrationAction.Cancel,
        optimisticPatch: { status: RegistrationStatus.Cancelled },
      });
      if (
        !started.accepted ||
        !started.operation ||
        !started.request ||
        typeof started.request.expectedVersion !== 'number'
      ) {
        if (started.reason === 'SNAPSHOT_REQUIRED') {
          void refreshAll();
        }
        return;
      }
      try {
        const promise = api.patchRegistration(
          registration.id,
          {
            action: RegistrationAction.Cancel,
            expectedVersion: started.request.expectedVersion,
          },
          { operationId: started.operation.opId },
        );
        runMutation(started.operation, origin, promise, {
          onSuccess: () => {
            setPageNotice('Регистрация отменена. При необходимости можно подать новую заявку.');
          },
        });
      } catch (error: unknown) {
        store.markUnknown(
          started.operation.opId,
          toOperationError(error, 'Команда не получила ответа; исход операции неизвестен.'),
        );
      }
    },
    [api, identity.id, identity.role, refreshAll, runMutation, selectedWorkshopId, store],
  );

  const canContinue = useCallback(
    (operation: OperationDescriptor): boolean => {
      const current = store.getContext();
      const read = store.getState().read;
      return (
        operation.contextKey ===
          contextId({ actorId: current.actorId, workshopId: current.workshopId }) &&
        operation.status === 'unknown' &&
        read.status === 'ready' &&
        read.ready &&
        operation.refreshedAtReadGeneration !== undefined &&
        operation.refreshedAtReadGeneration === read.acceptedGeneration &&
        operation.refreshedAtReadGeneration > (operation.unknownAtReadGeneration ?? 0)
      );
    },
    [store],
  );

  const continueOperation = useCallback(
    (operation: OperationDescriptor) => {
      const result = store.continueFromCurrent(operation.opId);
      if (!result.ok) {
        return;
      }
      if (
        identity.role === UserRole.Participant &&
        operation.key.actorId === identity.id &&
        operation.key.participantId === identity.id
      ) {
        formInteractionRef.current += 1;
        setFormSubmitting(false);
      }
      setPageNotice('Можно выбрать новое действие. Предыдущий запрос всё ещё может завершиться.');
    },
    [identity.id, identity.role, store],
  );

  const openParticipantForm = useCallback(() => {
    if (identity.role !== UserRole.Participant || !store.getState().read.ready) {
      return;
    }
    store.beginInteraction(identity.id);
    formInteractionRef.current += 1;
    setDraftErrors({});
    setPageNotice(undefined);
    setCapacityConflict(false);
    setFormMode(
      selectedWorkshop?.availableSeats === 0 ? RegistrationMode.Waitlist : RegistrationMode.Seat,
    );
    setFormOpen(true);
  }, [identity.id, identity.role, selectedWorkshop, store]);

  const openEditForm = useCallback(() => {
    if (
      identity.role !== UserRole.Participant ||
      !store.getState().read.ready ||
      participantBusyOperation ||
      !participantRegistration ||
      participantRegistration.status === RegistrationStatus.Cancelled
    )
      return;
    formInteractionRef.current += 1;
    setEditTarget(participantRegistration);
    setDraft({
      name: participantRegistration.attendeeName,
      comment: participantRegistration.comment,
    });
    setDraftErrors({});
    setCapacityConflict(false);
    setFormSubmitting(false);
    setFormOpen(true);
  }, [identity.role, store, participantBusyOperation, participantRegistration]);

  const updateDraft = useCallback((field: keyof Draft, value: string) => {
    formInteractionRef.current += 1;
    setDraft((current) => ({ ...current, [field]: value }));
    setDraftErrors((current) => ({ ...current, [field]: undefined, form: undefined }));
  }, []);

  const requestCancellation = useCallback(
    (registration: Registration, trigger: HTMLElement) => {
      cancelReturnFocusRef.current = trigger;
      setCancelTarget({
        registration,
        scope: identity.role === UserRole.Organizer ? 'organizer' : 'participant',
      });
    },
    [identity.role],
  );

  const dismissCancellation = useCallback(() => {
    setCancelTarget(null);
  }, []);

  const handleCancelConfirmed = useCallback(
    (target: CancelTarget) => {
      if (target.scope === 'organizer') {
        startOrganizerMutation(target.registration, RegistrationAction.Cancel);
      } else {
        startParticipantCancellation(target.registration);
      }
    },
    [startOrganizerMutation, startParticipantCancellation],
  );

  const handleWorkshopChange = useCallback(
    (nextWorkshopId: string) => {
      if (!nextWorkshopId) {
        return;
      }
      store.setContext(identity.id, nextWorkshopId);
      setSelectedWorkshopId(nextWorkshopId);
      setPageNotice(undefined);
      setCancelTarget(null);
      resetParticipantForm();
    },
    [identity.id, resetParticipantForm, store],
  );

  const openWorkshop = useCallback(
    (workshopId: string) => {
      if (workshopId !== selectedWorkshopId) {
        handleWorkshopChange(workshopId);
      } else {
        resetParticipantForm();
      }
    },
    [handleWorkshopChange, resetParticipantForm, selectedWorkshopId],
  );

  const participantName = useCallback(
    (participantId: string): string => displayNameForParticipant(participantId),
    [],
  );

  useEffect(() => {
    writeSessionValue(WORKSHOP_STORAGE_KEY, selectedWorkshopId);
  }, [selectedWorkshopId]);

  useEffect(() => {
    store.setContext(identity.id, selectedWorkshopId);
    resetParticipantForm();
    setPageNotice(undefined);
    void refreshCurrentContext();
  }, [identity.id, refreshCurrentContext, resetParticipantForm, selectedWorkshopId, store]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    const onFocus = () => {
      void refreshRef.current();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshRef.current();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (cancelTarget !== null) {
      return;
    }
    const element = cancelReturnFocusRef.current;
    cancelReturnFocusRef.current = null;
    if (!element) {
      return;
    }
    window.setTimeout(() => {
      if (element.isConnected) {
        element.focus();
      }
    }, 0);
  }, [cancelTarget]);

  return {
    store,
    storeState,
    catalog,
    selectedWorkshopId,
    selectedWorkshop,
    participantRegistration,
    unknownOperations,
    participantBusyOperation,
    draft,
    draftErrors,
    formOpen,
    formSubmitting,
    capacityConflict,
    formMode,
    editing: editTarget !== null,
    openEditForm,
    cancelTarget,
    pageNotice,
    refreshAll,
    resetParticipantForm,
    openParticipantForm,
    updateDraft,
    startParticipantRegistration,
    startOrganizerMutation,
    requestCancellation,
    dismissCancellation,
    handleCancelConfirmed,
    continueOperation,
    canContinue,
    handleWorkshopChange,
    openWorkshop,
    participantName,
  };
}
