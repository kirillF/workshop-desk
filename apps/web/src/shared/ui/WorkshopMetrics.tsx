import type { WorkshopSnapshot } from '@workshop-desk/contracts';

export function WorkshopMetrics({ workshop }: { workshop: WorkshopSnapshot }) {
  return (
    <div className="metrics" aria-label="Счётчики воркшопа">
      <div
        className="metric"
        data-testid="counter-confirmed"
        role="group"
        aria-label="Подтверждено"
      >
        <span>Подтверждено</span>
        <strong>{workshop.confirmedCount}</strong>
      </div>
      <div
        className="metric"
        data-testid="counter-waitlisted"
        role="group"
        aria-label="Лист ожидания"
      >
        <span>Лист ожидания</span>
        <strong>{workshop.waitlistedCount}</strong>
      </div>
      <div
        className="metric"
        data-testid="counter-available"
        role="group"
        aria-label="Свободно мест"
      >
        <span>Свободно мест</span>
        <strong>{workshop.availableSeats}</strong>
      </div>
    </div>
  );
}
