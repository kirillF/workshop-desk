import type { CatalogWorkshop, User } from '@workshop-desk/contracts';
import type { CatalogState } from '../../registrations/model/types.ts';
import { formatUtc } from '../../../shared/lib/format.ts';
import { StatusChip } from '../../../shared/ui/StatusChip.tsx';

export function CatalogView({
  catalog,
  identity,
  onOpen,
  onRefresh,
}: {
  catalog: CatalogState;
  identity: User;
  onOpen: (workshopId: string) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="panel stack catalog" aria-labelledby="catalog-title">
      <div className="panel-header">
        <div>
          <div className="eyebrow">Каталог</div>
          <h1 id="catalog-title">Учиться. Делать. Обсуждать.</h1>
          <p className="lead">
            Небольшие группы. Реальные задачи. Новые навыки, которые остаются с вами.
          </p>
        </div>
        <span className="muted">{identity.displayName}</span>
      </div>

      {catalog.status === 'error' && (
        <div className="notice notice-error" role="alert">
          {catalog.error ?? 'Не удалось загрузить каталог.'}
          <button type="button" className="button button-quiet" onClick={onRefresh}>
            Повторить
          </button>
        </div>
      )}

      {catalog.status === 'loading' && catalog.workshops.length === 0 && (
        <div className="loading-block" role="status">
          Загружаем каталог…
        </div>
      )}

      {catalog.status === 'ready' && catalog.workshops.length === 0 && (
        <div className="empty-state">В каталоге пока нет доступных воркшопов.</div>
      )}

      {catalog.workshops.length > 0 && (
        <div className="grid grid-cards">
          {catalog.workshops.map((workshop: CatalogWorkshop, index) => (
            <article
              className="card course-card"
              key={workshop.id}
              data-testid={`workshop-card-${workshop.id}`}
            >
              <div className="course-intro">
                <div className="eyebrow">
                  <span>Воркшоп</span>
                  <span>0{index + 1}</span>
                </div>
                <h2>{workshop.title}</h2>
                <p>{workshop.description}</p>
              </div>

              <div className="card-meta">
                <span>{formatUtc(workshop.startsAt)}</span>
                <span>
                  {workshop.location} · Группа до {workshop.capacity} человек
                </span>
                <span>
                  {workshop.availableSeats === 0
                    ? 'Мест нет · доступен лист ожидания'
                    : `Свободно мест: ${workshop.availableSeats}`}
                </span>
              </div>

              <div className="card-footer">
                {workshop.myRegistration ? (
                  <StatusChip status={workshop.myRegistration.status} />
                ) : (
                  <span className="muted">Вы ещё не записаны</span>
                )}
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => onOpen(workshop.id)}
                >
                  Подробнее
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
