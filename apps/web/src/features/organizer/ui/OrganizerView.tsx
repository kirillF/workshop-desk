import { RegistrationStatus } from '@workshop-desk/contracts';
import type { CatalogWorkshop, User } from '@workshop-desk/contracts';
import type { WorkshopSnapshot } from '@workshop-desk/contracts';
import type {
  OperationDescriptor,
  OperationStoreState,
  Registration,
} from '../../registrations/model/operations.ts';
import { contextId } from '../../registrations/model/operations.ts';
import { WorkshopMetrics } from '../../../shared/ui/WorkshopMetrics.tsx';
import { StatusChip } from '../../../shared/ui/StatusChip.tsx';
import { UnknownOperationPanel } from '../../registrations/ui/UnknownOperationPanel.tsx';

export function OrganizerView({
  state,
  identity,
  workshops,
  selectedWorkshopId,
  workshop,
  onWorkshopChange,
  onRefresh,
  onConfirm,
  onCancel,
  onContinue,
  canContinue,
  participantName,
}: {
  state: OperationStoreState;
  identity: User;
  workshops: CatalogWorkshop[];
  selectedWorkshopId: string;
  workshop?: WorkshopSnapshot;
  onWorkshopChange: (workshopId: string) => void;
  onRefresh: () => void;
  onConfirm: (registration: Registration) => void;
  onCancel: (registration: Registration, trigger: HTMLElement) => void;
  onContinue: (operation: OperationDescriptor) => void;
  canContinue: (operation: OperationDescriptor) => boolean;
  participantName: (id: string) => string;
}) {
  const currentContextKey = contextId({
    actorId: identity.id,
    workshopId: selectedWorkshopId,
  });

  const registrations = state.snapshot?.registrations ?? [];
  const orderedRegistrations = [...registrations].sort((left, right) => {
    if (
      left.status === RegistrationStatus.Cancelled &&
      right.status !== RegistrationStatus.Cancelled
    ) {
      return 1;
    }

    if (
      left.status !== RegistrationStatus.Cancelled &&
      right.status === RegistrationStatus.Cancelled
    ) {
      return -1;
    }

    return left.attendeeName.localeCompare(right.attendeeName, 'ru');
  });

  const rowOperation = (registration: Registration) =>
    [...state.operations]
      .reverse()
      .find(
        (operation) =>
          operation.contextKey === currentContextKey &&
          (operation.status === 'pending' ||
            operation.status === 'unknown' ||
            (operation.status === 'rejected' &&
              state.errors.some((error) => error.opId === operation.opId))) &&
          (operation.registrationId === registration.id ||
            (!operation.registrationId &&
              operation.key.participantId === registration.participantId)),
      ) ?? null;

  return (
    <section className="stack" aria-labelledby="organizer-title">
      <section className="panel stack">
        <div className="panel-header">
          <div>
            <div className="eyebrow">Панель организатора</div>
            <h1 id="organizer-title">Регистрации воркшопа</h1>
          </div>
          <span className="muted">{identity.displayName}</span>
        </div>

        <div className="field">
          <label htmlFor="organizer-workshop-select">Воркшоп</label>
          <select
            id="organizer-workshop-select"
            className="control"
            value={selectedWorkshopId}
            onChange={(event) => onWorkshopChange(event.target.value)}
            disabled={workshops.length === 0 && !workshop}
          >
            {!workshops.length && workshop && <option value={workshop.id}>{workshop.title}</option>}
            {workshops.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </div>

        {workshop && <WorkshopMetrics workshop={workshop} />}
      </section>

      {!state.snapshot && state.read.status === 'pending' && (
        <div className="loading-block" role="status">
          Загружаем регистрации…
        </div>
      )}

      {!state.snapshot && state.read.status !== 'pending' && (
        <div className="error-state" role="alert">
          <div className="stack-small">
            <strong>Регистрации недоступны</strong>
            <span>{state.read.error?.message ?? 'Не удалось загрузить данные воркшопа.'}</span>
            <button type="button" className="button button-primary" onClick={onRefresh}>
              Обновить статус
            </button>
          </div>
        </div>
      )}

      {state.snapshot && orderedRegistrations.length === 0 && (
        <div className="empty-state">В выбранном воркшопе пока нет регистраций.</div>
      )}

      {state.snapshot && orderedRegistrations.length > 0 && (
        <div className="data-table-wrap">
          <table className="data-table">
            <caption className="sr-only">Регистрации выбранного воркшопа</caption>
            <thead>
              <tr>
                <th scope="col">Участник</th>
                <th scope="col">Состояние</th>
                <th scope="col">Комментарий</th>
                <th scope="col">Действия</th>
              </tr>
            </thead>
            <tbody>
              {orderedRegistrations.map((registration) => {
                const operation = rowOperation(registration);
                const busy = operation?.status === 'pending' || operation?.status === 'unknown';
                const rowError = operation
                  ? state.errors.find((error) => error.opId === operation.opId)
                  : undefined;

                return (
                  <tr
                    key={registration.id}
                    className={[busy ? 'row-pending' : '', rowError ? 'row-error' : '']
                      .filter(Boolean)
                      .join(' ')}
                    data-testid={`registration-row-${registration.id}`}
                  >
                    <td>
                      <strong>{registration.attendeeName}</strong>
                      <div className="muted">{participantName(registration.participantId)}</div>
                    </td>
                    <td>
                      <div className="stack-small">
                        <StatusChip status={registration.status} />
                        {operation && (
                          <small>
                            {operation.status === 'pending' && 'Ожидаем ответ сервера…'}
                            {operation.status === 'unknown' && 'Исход операции неизвестен'}
                            {operation.status === 'rejected' && 'Последняя команда отклонена'}
                          </small>
                        )}
                      </div>
                    </td>
                    <td>{registration.comment || '—'}</td>
                    <td>
                      <div className="actions">
                        {registration.status === RegistrationStatus.Waitlisted && (
                          <button
                            type="button"
                            className="button button-primary"
                            disabled={Boolean(busy) || !state.read.ready}
                            onClick={() => onConfirm(registration)}
                          >
                            Подтвердить
                          </button>
                        )}
                        {(registration.status === RegistrationStatus.Confirmed ||
                          registration.status === RegistrationStatus.Waitlisted) && (
                          <button
                            type="button"
                            className="button button-danger"
                            disabled={Boolean(busy) || !state.read.ready}
                            onClick={(event) => onCancel(registration, event.currentTarget)}
                          >
                            Отменить
                          </button>
                        )}
                      </div>
                      {rowError && (
                        <div
                          className="field-error"
                          role="alert"
                          data-testid={`registration-error-${registration.id}`}
                        >
                          {rowError.error.message}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {state.operations
        .filter(
          (operation) =>
            operation.contextKey === currentContextKey && operation.status === 'unknown',
        )
        .map((operation) => (
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
    </section>
  );
}
