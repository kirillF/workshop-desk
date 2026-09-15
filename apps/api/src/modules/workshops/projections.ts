import type { DatabaseSync } from 'node:sqlite';

import type {
  CatalogWorkshop,
  WorkshopResponse,
  WorkshopsResponse,
} from '../../../../../packages/contracts/src/index.ts';
import { inTransaction } from '../../shared/database/transaction.ts';
import { ApiProblem } from '../../shared/http/errors.ts';
import { readAllWorkshops, readWorkshop } from './repository.ts';
import { readRegistrationForParticipant, requireActor } from '../registrations/repository.ts';

function notFound(): ApiProblem {
  return new ApiProblem('NOT_FOUND', 'Запрошенный ресурс не найден.');
}

/** Catalog projection. Counters are calculated by the server-owned SQL projection. */
export function readWorkshops(database: DatabaseSync, userId?: string): WorkshopsResponse {
  return inTransaction(database, 'DEFERRED', () => {
    const actor = userId === undefined ? null : requireActor(database, userId);
    const workshops = readAllWorkshops(database);

    const catalog: CatalogWorkshop[] = workshops.map((workshop) => ({
      ...workshop,
      myRegistration: actor
        ? readRegistrationForParticipant(database, workshop.id, actor.id)
        : null,
    }));

    return { workshops: catalog };
  });
}

/** Details projection for the authenticated actor or an organizer preview target. */
export function readWorkshopDetails(
  database: DatabaseSync,
  workshopId: string,
  userId?: string,
): WorkshopResponse {
  return inTransaction(database, 'DEFERRED', () => {
    const actor = userId === undefined ? null : requireActor(database, userId);
    const workshop = readWorkshop(database, workshopId);

    if (!workshop) {
      throw notFound();
    }

    return {
      workshop,
      myRegistration: actor
        ? readRegistrationForParticipant(database, workshop.id, actor.id)
        : null,
    };
  });
}
