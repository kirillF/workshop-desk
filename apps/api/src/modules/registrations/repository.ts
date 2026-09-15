import { UserRole } from '../../../../../packages/contracts/src/index.ts';
import type { DatabaseSync } from 'node:sqlite';

import type {
  Registration,
  RegistrationStatus,
} from '../../../../../packages/contracts/src/index.ts';
import { ApiProblem } from '../../shared/http/errors.ts';

type DatabaseRow = Record<string, unknown>;

export type Actor = {
  id: string;
  role: UserRole;
};

export function findActor(database: DatabaseSync, userId: string): Actor | null {
  const row = database.prepare('SELECT id, role FROM users WHERE id = ?').get(userId) as unknown as
    DatabaseRow | undefined;

  if (!row || (row.role !== UserRole.Participant && row.role !== UserRole.Organizer)) {
    return null;
  }

  return {
    id: String(row.id),
    role: row.role as UserRole,
  };
}

export function requireActor(database: DatabaseSync, userId: string | undefined): Actor {
  if (!userId || userId.trim().length === 0) {
    throw forbidden();
  }

  const actor = findActor(database, userId.trim());
  if (!actor) {
    throw forbidden();
  }
  return actor;
}

function forbidden(): ApiProblem {
  return new ApiProblem('FORBIDDEN', 'Недостаточно прав для выполнения операции.');
}

export function mapRegistration(row: DatabaseRow): Registration {
  return {
    id: String(row.id),
    workshopId: String(row.workshop_id),
    participantId: String(row.participant_id),
    attendeeName: String(row.attendee_name),
    comment: String(row.comment ?? ''),
    status: row.status as RegistrationStatus,
    version: Number(row.version),
  };
}

export function readRegistrationForParticipant(
  database: DatabaseSync,
  workshopId: string,
  participantId: string,
): Registration | null {
  const row = database
    .prepare(
      `
      SELECT id, workshop_id, participant_id, attendee_name, comment, status, version
      FROM registrations
      WHERE workshop_id = ? AND participant_id = ?
    `,
    )
    .get(workshopId, participantId) as unknown as DatabaseRow | undefined;

  return row ? mapRegistration(row) : null;
}

export function readRegistrationById(
  database: DatabaseSync,
  registrationId: string,
): Registration | null {
  const row = database
    .prepare(
      `
      SELECT id, workshop_id, participant_id, attendee_name, comment, status, version
      FROM registrations
      WHERE id = ?
    `,
    )
    .get(registrationId) as unknown as DatabaseRow | undefined;

  return row ? mapRegistration(row) : null;
}
