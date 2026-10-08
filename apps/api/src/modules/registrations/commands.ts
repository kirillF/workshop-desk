import {
  RegistrationAction,
  UserRole,
  RegistrationStatus,
  RegistrationMode,
} from '../../../../../packages/contracts/src/index.ts';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type {
  CreateRegistrationRequest,
  CreateRegistrationResponse,
  UpdateRegistrationRequest,
  UpdateRegistrationResponse,
} from '../../../../../packages/contracts/src/index.ts';
import { inTransaction } from '../../shared/database/transaction.ts';
import { ApiProblem } from '../../shared/http/errors.ts';
import { readWorkshop } from '../workshops/repository.ts';
import {
  readRegistrationById,
  readRegistrationForParticipant,
  requireActor,
} from './repository.ts';

type DatabaseRow = Record<string, unknown>;

function forbidden(): ApiProblem {
  return new ApiProblem('FORBIDDEN', 'Недостаточно прав для выполнения операции.');
}

function notFound(): ApiProblem {
  return new ApiProblem('NOT_FOUND', 'Запрошенный ресурс не найден.');
}

function versionConflict(): ApiProblem {
  return new ApiProblem(
    'VERSION_CONFLICT',
    'Данные изменились в другом запросе. Обновите состояние и повторите действие явно.',
  );
}

function invalidTransition(): ApiProblem {
  return new ApiProblem(
    'INVALID_TRANSITION',
    'Переход для текущего состояния регистрации недоступен.',
  );
}

function alreadyRegistered(): ApiProblem {
  return new ApiProblem(
    'ALREADY_REGISTERED',
    'У пользователя уже есть активная регистрация на этот воркшоп.',
  );
}

export function updateRegistration(
  database: DatabaseSync,
  registrationId: string,
  userId: string | undefined,
  request: UpdateRegistrationRequest,
): UpdateRegistrationResponse {
  return inTransaction(database, 'IMMEDIATE', () => {
    const actor = requireActor(database, userId);
    if (request.action === RegistrationAction.Confirm && actor.role !== UserRole.Organizer) {
      throw forbidden();
    }

    const target = database
      .prepare(
        `
        SELECT
          r.id,
          r.workshop_id,
          r.participant_id,
          r.attendee_name,
          r.comment,
          r.status,
          r.version,
          w.capacity AS workshop_capacity
        FROM registrations r
        JOIN workshops w ON w.id = r.workshop_id
        WHERE r.id = ?
      `,
      )
      .get(registrationId) as unknown as DatabaseRow | undefined;

    if (!target) {
      throw notFound();
    }

    const participantId = String(target.participant_id);
    if (
      request.action === RegistrationAction.Cancel &&
      actor.role !== UserRole.Organizer &&
      actor.id !== participantId
    ) {
      throw forbidden();
    }

    if (
      request.action === RegistrationAction.Edit &&
      (actor.role !== UserRole.Participant || actor.id !== participantId)
    ) {
      throw forbidden();
    }

    const currentVersion = Number(target.version);
    if (currentVersion !== request.expectedVersion) {
      throw versionConflict();
    }

    const currentStatus = target.status as RegistrationStatus;
    let nextStatus: RegistrationStatus;

    if (request.action === RegistrationAction.Confirm) {
      if (currentStatus !== RegistrationStatus.Waitlisted) {
        throw invalidTransition();
      }

      const countRow = database
        .prepare(
          `
          SELECT COUNT(*) AS count
          FROM registrations
          WHERE workshop_id = ? AND status = 'confirmed'
        `,
        )
        .get(String(target.workshop_id)) as unknown as DatabaseRow;
      const confirmedCount = Number(countRow.count);
      const capacity = Number(target.workshop_capacity);

      if (confirmedCount >= capacity) {
        throw new ApiProblem('SEATS_FULL', 'Свободных мест для подтверждения регистрации нет.');
      }
      nextStatus = RegistrationStatus.Confirmed;
    } else {
      if (
        currentStatus !== RegistrationStatus.Confirmed &&
        currentStatus !== RegistrationStatus.Waitlisted
      ) {
        throw invalidTransition();
      }
      nextStatus =
        request.action === RegistrationAction.Edit ? currentStatus : RegistrationStatus.Cancelled;
    }

    const updateResult = database
      .prepare(
        `
        UPDATE registrations
        SET status = ?, version = version + 1, updated_at = ?,
            attendee_name = ?, comment = ?
        WHERE id = ? AND version = ? AND status = ?
      `,
      )
      .run(
        nextStatus,
        new Date().toISOString(),
        request.action === RegistrationAction.Edit
          ? request.attendeeName
          : String(target.attendee_name),
        request.action === RegistrationAction.Edit ? request.comment : String(target.comment),
        registrationId,
        request.expectedVersion,
        currentStatus,
      );

    if (Number(updateResult.changes) !== 1) {
      throw versionConflict();
    }

    const registration = readRegistrationById(database, registrationId);
    if (!registration) {
      throw new ApiProblem('INTERNAL_ERROR', 'Не удалось прочитать обновлённую регистрацию.');
    }

    return { registration };
  });
}

export function createRegistration(
  database: DatabaseSync,
  workshopId: string,
  userId: string | undefined,
  request: CreateRegistrationRequest,
): CreateRegistrationResponse {
  return inTransaction(database, 'IMMEDIATE', () => {
    const actor = requireActor(database, userId);
    if (actor.role !== UserRole.Participant) {
      throw forbidden();
    }

    const workshop = readWorkshop(database, workshopId);
    if (!workshop) {
      throw notFound();
    }

    const existing = readRegistrationForParticipant(database, workshopId, actor.id);

    if (existing && existing.status !== RegistrationStatus.Cancelled) {
      throw alreadyRegistered();
    }

    if (existing && existing.version !== request.expectedVersion) {
      throw versionConflict();
    }

    if (!existing && request.expectedVersion !== null) {
      throw versionConflict();
    }

    if (request.mode === RegistrationMode.Seat && workshop.confirmedCount >= workshop.capacity) {
      throw new ApiProblem(
        'SEATS_FULL',
        'Свободных мест нет. Выберите присоединение к листу ожидания явно.',
      );
    }

    const status: RegistrationStatus =
      request.mode === RegistrationMode.Seat
        ? RegistrationStatus.Confirmed
        : RegistrationStatus.Waitlisted;
    const timestamp = new Date().toISOString();

    if (existing) {
      const updateResult = database
        .prepare(
          `
          UPDATE registrations
          SET attendee_name = ?, comment = ?, status = ?,
              version = version + 1, updated_at = ?
          WHERE id = ? AND status = 'cancelled' AND version = ?
        `,
        )
        .run(
          request.attendeeName,
          request.comment,
          status,
          timestamp,
          existing.id,
          request.expectedVersion,
        );

      if (Number(updateResult.changes) !== 1) {
        throw versionConflict();
      }

      const registration = readRegistrationById(database, existing.id);
      if (!registration) {
        throw new ApiProblem('INTERNAL_ERROR', 'Не удалось прочитать обновлённую регистрацию.');
      }
      return { registration };
    }

    const registrationId = randomUUID();
    database
      .prepare(
        `
        INSERT INTO registrations
          (id, workshop_id, participant_id, attendee_name, comment,
           status, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `,
      )
      .run(
        registrationId,
        workshopId,
        actor.id,
        request.attendeeName,
        request.comment,
        status,
        timestamp,
        timestamp,
      );

    const registration = readRegistrationById(database, registrationId);
    if (!registration) {
      throw new ApiProblem('INTERNAL_ERROR', 'Не удалось прочитать созданную регистрацию.');
    }
    return { registration };
  });
}
