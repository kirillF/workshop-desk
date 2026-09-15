import { UserRole } from '../../../../../packages/contracts/src/index.ts';
import type { DatabaseSync } from 'node:sqlite';

import type { User } from '../../../../../packages/contracts/src/index.ts';
import { ApiProblem } from '../../shared/http/errors.ts';
import { findParticipantById } from './service.ts';

/** Resolve an organizer preview target without changing the authenticated actor. */
export function resolvePreviewTarget(
  database: DatabaseSync,
  actor: User,
  value: string | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }
  if (actor.role !== UserRole.Organizer) {
    throw new ApiProblem('FORBIDDEN', 'Просмотр доступен только организатору.');
  }
  const participant = findParticipantById(database, value);
  if (!participant) {
    throw new ApiProblem('FORBIDDEN', 'Указанный участник недоступен для просмотра.');
  }
  return participant.id;
}
