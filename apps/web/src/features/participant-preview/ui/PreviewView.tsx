import { RegistrationStatus } from '@workshop-desk/contracts';
import type { User } from '@workshop-desk/contracts';
import type { PreviewCatalogState, WorkshopResponseLike } from '../../registrations/model/types.ts';
import { formatUtc } from '../../../shared/lib/format.ts';
import { StatusChip } from '../../../shared/ui/StatusChip.tsx';
import { WorkshopMetrics } from '../../../shared/ui/WorkshopMetrics.tsx';
import { CatalogView } from '../../workshops/ui/CatalogView.tsx';

export type PreviewViewProps = {
  target: User;
  catalog: PreviewCatalogState;
  details: WorkshopResponseLike | null;
  selectedWorkshopId: string;
  formOpen: boolean;
  onWorkshopChange: (workshopId: string) => void;
  onRefresh: () => void;
  onOpenForm: () => void;
  onCloseForm: () => void;
  onBack: () => void;
};

export function PreviewView({
  target,
  catalog,
  details,
  selectedWorkshopId,
  formOpen,
  onWorkshopChange,
  onRefresh,
  onOpenForm,
  onCloseForm,
  onBack,
}: PreviewViewProps) {
  const workshop =
    details?.workshop ?? catalog.workshops.find((item) => item.id === selectedWorkshopId);
  const registration = details?.myRegistration ?? null;
  const canInspectForm = !registration || registration.status === RegistrationStatus.Cancelled;

  return (
    <section className="stack" aria-labelledby="preview-title">
      <CatalogView
        catalog={catalog}
        identity={target}
        onOpen={onWorkshopChange}
        onRefresh={onRefresh}
      />

      <section className="panel stack">
        <div className="toolbar">
          <div>
            <div className="eyebrow">Предпросмотр участника</div>
            <h1 id="preview-title">{target.displayName}</h1>
          </div>
          <button type="button" className="button button-quiet" onClick={onBack}>
            Вернуться
          </button>
        </div>
        <div className="field">
          <label htmlFor="preview-workshop-select">Воркшоп</label>
          <select
            id="preview-workshop-select"
            className="control"
            value={selectedWorkshopId}
            onChange={(event) => onWorkshopChange(event.target.value)}
            disabled={catalog.status !== 'ready' || catalog.workshops.length === 0}
          >
            {catalog.workshops.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </div>
        {catalog.status === 'loading' && (
          <div className="loading-block" role="status">
            Загружаем данные участника…
          </div>
        )}
        {catalog.status === 'error' && (
          <div className="notice notice-error" role="alert">
            {catalog.error}
          </div>
        )}
      </section>

      {workshop && (
        <section className="panel stack" aria-labelledby="preview-workshop-title">
          <div>
            <div className="eyebrow">{workshop.location}</div>
            <h2 id="preview-workshop-title">{workshop.title}</h2>
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
                <div className="eyebrow">Заявка участника</div>
                <h3 className="sr-only">Состояние заявки участника</h3>
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
              <p className="muted">Участник ещё не отправлял заявку.</p>
            )}
            {!formOpen && canInspectForm && (
              <button type="button" className="button button-quiet" onClick={onOpenForm}>
                Открыть форму регистрации
              </button>
            )}
          </div>
          {formOpen && (
            <section className="panel stack" aria-labelledby="preview-form-title">
              <div className="panel-header">
                <div>
                  <div className="eyebrow">Только просмотр</div>
                  <h3 id="preview-form-title">Форма регистрации</h3>
                </div>
                <button type="button" className="button button-quiet" onClick={onCloseForm}>
                  Закрыть
                </button>
              </div>
              <form className="form-grid" onSubmit={(event) => event.preventDefault()}>
                <div className="field">
                  <label htmlFor="preview-attendee-name">Имя участника</label>
                  <input
                    id="preview-attendee-name"
                    className="control"
                    value={target.displayName}
                    readOnly
                    disabled
                  />
                </div>
                <div className="field">
                  <label htmlFor="preview-attendee-comment">Комментарий</label>
                  <textarea
                    id="preview-attendee-comment"
                    className="control"
                    value=""
                    readOnly
                    disabled
                  />
                </div>
                <button type="submit" className="button" disabled>
                  Отправка недоступна в режиме просмотра
                </button>
              </form>
            </section>
          )}
        </section>
      )}
    </section>
  );
}
