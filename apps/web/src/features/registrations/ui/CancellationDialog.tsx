import { useEffect, useRef } from 'react';
import type { CancelTarget } from '../model/types.ts';

export function CancellationDialog({
  target,
  onDismiss,
  onConfirm,
}: {
  target: CancelTarget | null;
  onDismiss: () => void;
  onConfirm: (target: CancelTarget) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (target && !dialog.open) {
      dialog.showModal();
    } else if (!target && dialog.open) {
      dialog.close();
    }
  }, [target]);

  return (
    <dialog ref={dialogRef} aria-labelledby="cancel-dialog-title" onCancel={onDismiss}>
      <form
        className="dialog-card"
        onSubmit={(event) => {
          event.preventDefault();

          if (!target) {
            return;
          }

          dialogRef.current?.close();
          onDismiss();
          onConfirm(target);
        }}
      >
        <header>
          <div>
            <div className="eyebrow">Подтверждение</div>
            <h2 id="cancel-dialog-title">Отменить регистрацию?</h2>
          </div>
          <button
            type="button"
            className="button button-quiet"
            onClick={onDismiss}
            aria-label="Закрыть диалог"
          >
            Закрыть
          </button>
        </header>

        <p>
          Регистрация участника <strong>{target?.registration.attendeeName ?? ''}</strong> будет
          переведена в состояние «Отменена». Место станет доступно другим участникам, если заявка
          была подтверждена.
        </p>

        <div className="actions actions-end">
          <button type="button" className="button" onClick={onDismiss}>
            Оставить как есть
          </button>
          <button type="submit" className="button button-danger">
            Подтвердить отмену
          </button>
        </div>
      </form>
    </dialog>
  );
}
