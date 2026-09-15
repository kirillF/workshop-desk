export function SessionLoadingScreen() {
  return (
    <main className="app-shell">
      <div className="loading-block" role="status">
        Проверяем сессию…
      </div>
    </main>
  );
}

export function SessionRestoreErrorScreen({
  message,
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <main className="app-shell">
      <section className="panel stack" role="alert" aria-labelledby="restore-error-title">
        <h1 id="restore-error-title">Не удалось проверить сессию</h1>
        <p>{message ?? 'Проверьте соединение и повторите попытку.'}</p>
        <button type="button" className="button button-primary" onClick={onRetry}>
          Повторить
        </button>
      </section>
    </main>
  );
}

export function LogoutPendingScreen() {
  return (
    <main className="app-shell">
      <div className="loading-block" role="status">
        Завершаем выход…
      </div>
    </main>
  );
}

export function LogoutErrorScreen({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <main className="app-shell">
      <section className="panel stack" role="alert" aria-labelledby="logout-error-title">
        <h1 id="logout-error-title">Выход не подтверждён</h1>
        <p>{message ?? 'Сессия всё ещё может быть активна на сервере.'}</p>
        <button type="button" className="button button-primary" onClick={onRetry}>
          Повторить выход
        </button>
      </section>
    </main>
  );
}
