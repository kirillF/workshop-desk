import type { DatabaseSync } from 'node:sqlite';

import type { WorkshopSnapshot } from '../../../../../packages/contracts/src/index.ts';

type DatabaseRow = Record<string, unknown>;

function mapWorkshop(row: DatabaseRow): WorkshopSnapshot {
  const capacity = Number(row.capacity);
  const confirmedCount = Number(row.confirmed_count);

  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description),
    startsAt: String(row.starts_at),
    location: String(row.location),
    capacity,
    confirmedCount,
    waitlistedCount: Number(row.waitlisted_count),
    availableSeats: capacity - confirmedCount,
  };
}

const workshopProjectionSql = `
  SELECT
    w.id,
    w.title,
    w.description,
    w.starts_at,
    w.location,
    w.capacity,
    COALESCE(SUM(CASE WHEN r.status = 'confirmed' THEN 1 ELSE 0 END), 0)
      AS confirmed_count,
    COALESCE(SUM(CASE WHEN r.status = 'waitlisted' THEN 1 ELSE 0 END), 0)
      AS waitlisted_count
  FROM workshops w
  LEFT JOIN registrations r ON r.workshop_id = w.id
`;

export function readAllWorkshops(database: DatabaseSync): WorkshopSnapshot[] {
  const rows = database
    .prepare(
      `
      ${workshopProjectionSql}
      GROUP BY w.id, w.title, w.description, w.starts_at, w.location, w.capacity
      ORDER BY w.starts_at, w.id
    `,
    )
    .all() as unknown as DatabaseRow[];

  return rows.map(mapWorkshop);
}

export function readWorkshop(database: DatabaseSync, workshopId: string): WorkshopSnapshot | null {
  const row = database
    .prepare(
      `
      ${workshopProjectionSql}
      WHERE w.id = ?
      GROUP BY w.id, w.title, w.description, w.starts_at, w.location, w.capacity
    `,
    )
    .get(workshopId) as unknown as DatabaseRow | undefined;

  return row ? mapWorkshop(row) : null;
}
