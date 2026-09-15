import { UserRole } from '../../../../../packages/contracts/src/index.ts';
import type { DatabaseSync } from 'node:sqlite';

import type {
  MyRegistrationResponse,
  OrganizerRegistrationsResponse,
} from '../../../../../packages/contracts/src/index.ts';
import { inTransaction } from '../../shared/database/transaction.ts';
import { ApiProblem } from '../../shared/http/errors.ts';
import { readWorkshop } from '../workshops/repository.ts';
import { mapRegistration, readRegistrationForParticipant, requireActor } from './repository.ts';

function forbidden(): ApiProblem {
  return new ApiProblem('FORBIDDEN', 'Недостаточно прав для выполнения операции.');
}

function notFound(): ApiProblem {
  return new ApiProblem('NOT_FOUND', 'Запрошенный ресурс не найден.');
}

/** Participant status projection scoped to the actual authenticated actor. */
export function readMyRegistration(
  database: DatabaseSync,
  workshopId: string,
  userId: string | undefined,
): MyRegistrationResponse {
  return inTransaction(database, 'DEFERRED', () => {
    const actor = requireActor(database, userId);
    if (!readWorkshop(database, workshopId)) {
      throw notFound();
    }

    return {
      registration: readRegistrationForParticipant(database, workshopId, actor.id),
    };
  });
}

/** Organizer registration-list projection, including all statuses for one workshop. */
export function readOrganizerRegistrations(
  database: DatabaseSync,
  workshopId: string,
  userId: string | undefined,
): OrganizerRegistrationsResponse {
  return inTransaction(database, 'DEFERRED', () => {
    const actor = requireActor(database, userId);
    if (actor.role !== UserRole.Organizer) {
      throw forbidden();
    }

    const workshop = readWorkshop(database, workshopId);
    if (!workshop) {
      throw notFound();
    }

    const rows = database
      .prepare(
        `
        SELECT id, workshop_id, participant_id, attendee_name, comment, status, version
        FROM registrations
        WHERE workshop_id = ?
        ORDER BY
          CASE status
            WHEN 'confirmed' THEN 0
            WHEN 'waitlisted' THEN 1
            ELSE 2
          END,
          created_at,
          id
      `,
      )
      .all(workshopId) as unknown as Array<Record<string, unknown>>;

    return {
      workshop,
      registrations: rows.map(mapRegistration),
    };
  });
}
