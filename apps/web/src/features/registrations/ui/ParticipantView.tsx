import { RegistrationStatus } from '@workshop-desk/contracts';
import type { User } from '@workshop-desk/contracts';
import type { WorkshopSnapshot } from '@workshop-desk/contracts';
import type {
  OperationDescriptor,
  OperationStoreState,
  Registration,
} from '../model/operations.ts';
import type { Draft, DraftErrors } from '../model/types.ts';
import type { RegistrationMode } from '../../../shared/api/index.ts';
import { formatUtc, operationActionLabel } from '../../../shared/lib/format.ts';
import { StatusChip } from '../../../shared/ui/StatusChip.tsx';
import { WorkshopMetrics } from '../../../shared/ui/WorkshopMetrics.tsx';
import { UnknownOperationPanel } from './UnknownOperationPanel.tsx';
import { ParticipantForm } from './ParticipantForm.tsx';

function isActiveRegistration(
  registration: Registration | null,
): registration is Registration & { status: 'confirmed' | 'waitlisted' } {
  return Boolean(
    registration &&
    (registration.status === RegistrationStatus.Confirmed ||
      registration.status === RegistrationStatus.Waitlisted),
  );
}

export function ParticipantView({
  state,
  identity,
  workshop,
  registration,
  busyOperation,
  unknownOperations,
  formOpen,
  formSubmitting,
  draft,
  errors,
  capacityConflict,
  formMode,
  editing,
  onEdit,
  onBack,
  onOpenForm,
  onCloseForm,
  onCancel,
  onSubmit,
  onDraftChange,
  onRefresh,
  onContinue,
  canContinue,
  participantName,
}: {
  state: OperationStoreState;
  identity: User;
  workshop?: WorkshopSnapshot;
  registration: Registration | null;
  busyOperation: OperationDescriptor | null;
  unknownOperations: OperationDescriptor[];
  formOpen: boolean;
  formSubmitting: boolean;
  draft: Draft;
  errors: DraftErrors;
  capacityConflict: boolean;
  formMode: RegistrationMode;
  editing: boolean;
  onEdit: () => void;
  onBack: () => void;
  onOpenForm: () => void;
  onCloseForm: () => void;
  onCancel: (registration: Registration, trigger: HTMLElement) => void;
  onSubmit: (mode: RegistrationMode) => void;
  onDraftChange: (field: keyof Draft, value: string) => void;
  onRefresh: () => void;
  onContinue: (operation: OperationDescriptor) => void;
  canContinue: (operation: OperationDescriptor) => boolean;
  participantName: (id: string) => string;
}) {
  if (!workshop) {
    return (
      <section className="panel error-state" role="alert">
        Не удалось определить выбранный воркшоп.
      </section>
    );
  }

  const canOpenForm = state.read.ready;
  const hasActiveRegistration = isActiveRegistration(registration);
  const registrationUnknown = busyOperation?.status === 'unknown';

  return (
    <section className="stack" aria-labelledby="workshop-title">
      <div className="panel stack">
        <div className="toolbar">
          <button type="button" className="button button-quiet" onClick={onBack}>
            ← Вернуться в каталог
          </button>
          <span className="muted">{identity.displayName}</span>
        </div>

        <div>
          <div className="eyebrow">{workshop.location}</div>
          <h1 id="workshop-title">{workshop.title}</h1>
          <p className="lead">{workshop.description}</p>
        </div>

        <div className="card-meta">
          <span>{formatUtc(workshop.startsAt)}</span>
          <span>Место проведения: {workshop.location}</span>
          <span>Вместимость: {workshop.capacity}</span>
        </div>

        <WorkshopMetrics workshop={workshop} />

        <div className="card">
          <div className="panel-header">
            <div>
              <div className="eyebrow">Ваша заявка</div>
              <h2 className="sr-only">Состояние вашей заявки</h2>
            </div>
            {registration ? (
              <StatusChip status={registration.status} />
            ) : (
              <span className="muted">Нет заявки</span>
            )}
          </div>

          {registration ? (
            <div className="stack-small">
              <p>
                Имя: <strong>{registration.attendeeName}</strong>
              </p>
              {registration.comment && <p className="muted">{registration.comment}</p>}
            </div>
          ) : (
            <p className="muted">Вы ещё не отправляли заявку на этот воркшоп.</p>
          )}

          {busyOperation && (
            <div className="notice notice-pending" role="status">
              <div>
                <StatusChip status={busyOperation.status} />
                <div>{operationActionLabel(busyOperation.action)} выполняется для этой заявки.</div>
              </div>
            </div>
          )}

          {hasActiveRegistration && !formOpen && !busyOperation && (
            <div className="actions">
              <button
                type="button"
                className="button"
                disabled={!state.read.ready}
                onClick={onEdit}
              >
                Изменить данные
              </button>
              <button
                type="button"
                className="button button-danger"
                onClick={(event) => onCancel(registration, event.currentTarget)}
              >
                Отменить регистрацию
              </button>
            </div>
          )}

          {!formOpen &&
            (!hasActiveRegistration ||
              busyOperation?.action === 'register' ||
              busyOperation?.action === 'waitlist') && (
              <div className="actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={onOpenForm}
                  disabled={!canOpenForm}
                >
                  {registration?.status === RegistrationStatus.Cancelled
                    ? 'Подать заявку снова'
                    : 'Открыть форму регистрации'}
                </button>
              </div>
            )}

          {!state.read.ready && !busyOperation && !formOpen && (
            <small className="field-hint">Форма станет доступна после обновления данных.</small>
          )}
        </div>
      </div>

      {state.errors
        .filter((error) => error.key.participantId === identity.id)
        .map((error) => (
          <div className="notice notice-error" role="alert" key={error.opId}>
            {error.error.message}
          </div>
        ))}

      {formOpen && (
        <ParticipantForm
          editing={editing}
          draft={draft}
          errors={errors}
          formSubmitting={formSubmitting}
          formReady={state.read.ready}
          busy={Boolean(busyOperation)}
          capacityConflict={capacityConflict}
          formMode={formMode}
          availableSeats={workshop.availableSeats}
          onDraftChange={onDraftChange}
          onClose={onCloseForm}
          onSubmit={onSubmit}
        />
      )}

      {unknownOperations.map((operation) => (
        <UnknownOperationPanel
          key={operation.opId}
          operation={operation}
          baseSnapshot={state.baseSnapshot}
          read={state.read}
          canContinue={canContinue(operation)}
          onRefresh={onRefresh}
          onContinue={() => onContinue(operation)}
          participantName={participantName}
        />
      ))}

      {registrationUnknown && !unknownOperations.length && (
        <div className="notice notice-unknown" role="status">
          Исход операции неизвестен. Обновите статус для доступного продолжения.
        </div>
      )}
    </section>
  );
}
