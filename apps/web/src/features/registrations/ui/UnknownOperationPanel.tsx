import type { OperationDescriptor, OperationStoreState } from '../model/operations.ts';
import { operationActionLabel, registrationStatusLabel } from '../../../shared/lib/format.ts';
import { StatusChip } from '../../../shared/ui/StatusChip.tsx';

type SnapshotLike = NonNullable<OperationStoreState['baseSnapshot']>;

export function UnknownOperationPanel({
  operation,
  baseSnapshot,
  read,
  canContinue,
  onRefresh,
  onContinue,
  participantName,
}: {
  operation: OperationDescriptor;
  baseSnapshot: SnapshotLike | null;
  read: OperationStoreState['read'];
  canContinue: boolean;
  onRefresh: () => void;
  onContinue: () => void;
  participantName: (id: string) => string;
}) {
  const observedRow =
    baseSnapshot?.registrations.find((registration) =>
      operation.registrationId
        ? registration.id === operation.registrationId
        : registration.participantId === operation.key.participantId,
    ) ?? null;
  const observedText = observedRow
    ? registrationStatusLabel(observedRow.status)
    : 'Заявка пока не найдена.';

  return (
    <section
      className="notice notice-unknown"
      role="region"
      aria-labelledby={`unknown-title-${operation.opId}`}
      data-testid={`unknown-operation-${operation.opId}`}
    >
      <div className="stack-small">
        <div className="toolbar">
          <div>
            <strong id={`unknown-title-${operation.opId}`}>Исход операции неизвестен</strong>
            <div className="muted">
              {operationActionLabel(operation.action)} ·{' '}
              {participantName(operation.key.participantId)}
            </div>
          </div>
          <StatusChip status="unknown" />
        </div>
        <div data-testid={`unknown-observed-base-${operation.opId}`}>
          <strong>Состояние на сервере:</strong> {observedText}
        </div>
        <div>
          <strong>Последнее действие:</strong> {operationActionLabel(operation.action)}
          {operation.error?.message ? ` · ${operation.error.message}` : ''}
        </div>
        <p>
          Обновление статуса показывает текущее состояние заявки, но не подтверждает и не отклоняет
          прежнюю команду. Она всё ещё может завершиться позже.
        </p>
        <div className="actions">
          <button
            type="button"
            className="button button-primary"
            onClick={onRefresh}
            disabled={read.status === 'pending'}
          >
            Обновить статус
          </button>
          <button
            type="button"
            className="button"
            onClick={onContinue}
            disabled={!canContinue}
            title={
              canContinue ? 'Вы сможете выбрать новое действие.' : 'Сначала обновите состояние.'
            }
          >
            Продолжить с текущего состояния
          </button>
        </div>
        {!canContinue && (
          <small>
            Продолжение доступно только после успешного обновления. Дождитесь обновления, чтобы
            выбрать следующее действие.
          </small>
        )}
      </div>
    </section>
  );
}
