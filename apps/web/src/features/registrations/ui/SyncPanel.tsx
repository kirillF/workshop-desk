import type { OperationStoreState } from '../model/operations.ts';

function readStatusLabel(status: OperationStoreState['read']['status'], syncing: boolean): string {
  if (status === 'pending') {
    return 'Синхронизация…';
  }

  if (status === 'error') {
    return 'Ошибка обновления';
  }

  if (status === 'stale') {
    return 'Нужно обновить данные';
  }

  if (status === 'ready' && syncing) {
    return 'Есть незавершённые операции';
  }

  if (status === 'ready') {
    return 'Синхронизировано';
  }

  return 'Загружаем данные';
}

export function SyncPanel({
  state,
  onRefresh,
}: {
  state: OperationStoreState;
  onRefresh: () => void;
}) {
  const workshop = state.baseSnapshot?.workshop;
  const observedText = workshop
    ? `На сервере: ${workshop.confirmedCount} подтверждено из ${workshop.capacity}, ${workshop.availableSeats} свободно.`
    : 'Состояние ещё не загружено.';

  return (
    <section className="panel stack-small sync-panel" aria-labelledby="sync-title">
      <div className="toolbar">
        <div>
          <div className="eyebrow">Состояние данных</div>
          <h2 id="sync-title" className="sr-only">
            Состояние данных
          </h2>
          <strong data-testid="sync-status">
            {readStatusLabel(state.read.status, state.syncing)}
          </strong>
        </div>
        <button
          type="button"
          className="button button-quiet"
          onClick={onRefresh}
          disabled={state.read.status === 'pending'}
        >
          Обновить статус
        </button>
      </div>

      <p data-testid="observed-status" className="muted">
        {observedText}
      </p>

      {state.read.error && (
        <div className="notice notice-error" role="alert">
          {state.read.error.message}
        </div>
      )}

      {state.syncing && state.read.status !== 'pending' && (
        <div className="notice notice-pending" role="status">
          Изменения синхронизируются с сервером. Счётчики остаются последним подтверждённым
          состоянием.
        </div>
      )}
    </section>
  );
}
