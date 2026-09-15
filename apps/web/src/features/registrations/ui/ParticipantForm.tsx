import { RegistrationMode } from '@workshop-desk/contracts';
import type { FormEvent } from 'react';

import type { Draft, DraftErrors } from '../model/types.ts';

export function ParticipantForm({
  draft,
  errors,
  formSubmitting,
  formReady,
  busy,
  capacityConflict,
  formMode,
  availableSeats,
  onDraftChange,
  onClose,
  onSubmit,
}: {
  draft: Draft;
  errors: DraftErrors;
  formSubmitting: boolean;
  formReady: boolean;
  busy: boolean;
  capacityConflict: boolean;
  formMode: RegistrationMode;
  availableSeats: number;
  onDraftChange: (field: keyof Draft, value: string) => void;
  onClose: () => void;
  onSubmit: (mode: RegistrationMode) => void;
}) {
  const showWaitlist =
    formMode === RegistrationMode.Seat && (capacityConflict || availableSeats === 0);
  const disabled = formSubmitting || busy || !formReady;

  return (
    <section className="panel stack" aria-labelledby="registration-form-title">
      <div className="panel-header">
        <div>
          <div className="eyebrow">Новая заявка</div>
          <h2 id="registration-form-title">Запись на воркшоп</h2>
        </div>
      </div>

      {errors.form && (
        <div className="notice notice-error" role="alert">
          {errors.form}
        </div>
      )}

      <form
        className="form-grid"
        noValidate
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          onSubmit(formMode);
        }}
      >
        <div className="field">
          <label htmlFor="attendee-name">Имя участника</label>

          <input
            id="attendee-name"
            className="control"
            value={draft.name}
            disabled={formSubmitting}
            onChange={(event) => onDraftChange('name', event.target.value)}
            aria-invalid={errors.name ? 'true' : 'false'}
            aria-describedby={
              errors.name ? 'attendee-name-hint attendee-name-error' : 'attendee-name-hint'
            }
            autoComplete="name"
            placeholder="Например, Анна"
          />
          <span id="attendee-name-hint" className="field-hint">
            Как к вам обращаться? До 80 символов.
          </span>
          {errors.name && (
            <span id="attendee-name-error" className="field-error" role="alert">
              {errors.name}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="attendee-comment">Комментарий</label>
          <textarea
            id="attendee-comment"
            value={draft.comment}
            disabled={formSubmitting}
            onChange={(event) => onDraftChange('comment', event.target.value)}
            aria-invalid={errors.comment ? 'true' : 'false'}
            aria-describedby={
              errors.comment
                ? 'attendee-comment-hint attendee-comment-error'
                : 'attendee-comment-hint'
            }
            placeholder="Необязательно"
          />
          <span id="attendee-comment-hint" className="field-hint">
            {[...draft.comment].length}/500 символов
          </span>
          {errors.comment && (
            <span id="attendee-comment-error" className="field-error" role="alert">
              {errors.comment}
            </span>
          )}
        </div>

        <div className="actions field-full">
          <button type="submit" className="button button-primary" disabled={disabled}>
            {formSubmitting
              ? 'Отправляем…'
              : formMode === RegistrationMode.Waitlist
                ? 'Встать в лист ожидания'
                : 'Забронировать место'}
          </button>

          {showWaitlist && (
            <button
              type="button"
              className="button"
              disabled={disabled}
              onClick={() => onSubmit(RegistrationMode.Waitlist)}
            >
              Встать в лист ожидания
            </button>
          )}

          <button type="button" className="button button-quiet" onClick={onClose}>
            Закрыть и удалить черновик
          </button>
        </div>

        {!formReady && (
          <div className="field-error field-full" role="status">
            Обновляем данные. Отправка скоро станет доступна.
          </div>
        )}
      </form>
    </section>
  );
}
