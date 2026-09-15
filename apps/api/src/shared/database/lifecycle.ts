import { UserRole, RegistrationStatus } from '../../../../../packages/contracts/src/index.ts';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { hashPassword } from '../../modules/auth/crypto.ts';

export const DEFAULT_DATABASE_PATH = 'data/workshop.sqlite';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('participant', 'organizer')),
  email TEXT,
  password_salt TEXT,
  password_hash TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_digest TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS workshops (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  location TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0)
);

CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY,
  workshop_id TEXT NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attendee_name TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('confirmed', 'waitlisted', 'cancelled')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workshop_id, participant_id)
);

CREATE INDEX IF NOT EXISTS registrations_workshop_status_idx
  ON registrations (workshop_id, status);
CREATE INDEX IF NOT EXISTS registrations_participant_idx
  ON registrations (participant_id);
`;

type SeedUser = {
  id: string;
  displayName: string;
  role: UserRole;
  email: string;
  password: string;
};

type SeedWorkshop = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  location: string;
  capacity: number;
};

type SeedRegistration = {
  id: string;
  workshopId: string;
  participantId: string;
  attendeeName: string;
  comment: string;
  status: RegistrationStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type DatasetSummary = {
  databasePath: string;
  users: number;
  workshops: number;
  registrations: number;
  confirmed: number;
  waitlisted: number;
  cancelled: number;
};

export function resolveDatabasePath(databasePath = process.env.WORKSHOP_DB_PATH): string {
  if (!databasePath || databasePath === ':memory:') {
    return databasePath ?? resolve(DEFAULT_DATABASE_PATH);
  }

  return isAbsolute(databasePath) ? databasePath : resolve(databasePath);
}

function ensureDatabaseDirectory(databasePath: string): void {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(databasePath), { recursive: true });
  }
}

function migrateDatabase(database: DatabaseSync): void {
  const columns = database.prepare('PRAGMA table_info(users)').all() as Array<{ name?: unknown }>;
  const names = new Set(columns.map((column) => String(column.name ?? '')));
  if (!names.has('email')) database.exec('ALTER TABLE users ADD COLUMN email TEXT');
  if (!names.has('password_salt')) database.exec('ALTER TABLE users ADD COLUMN password_salt TEXT');
  if (!names.has('password_hash')) database.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
  database.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users(email) WHERE email IS NOT NULL',
  );
}

export function openDatabase(databasePath = resolveDatabasePath()): DatabaseSync {
  const resolvedPath = resolveDatabasePath(databasePath);
  ensureDatabaseDirectory(resolvedPath);

  const database = new DatabaseSync(resolvedPath);
  database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  database.exec(SCHEMA_SQL);
  migrateDatabase(database);
  return database;
}

function seedRows(now: Date): {
  users: SeedUser[];
  workshops: SeedWorkshop[];
  registrations: SeedRegistration[];
} {
  const timestamp = now.toISOString();
  const startsAt = (daysFromNow: number, hour: number): string => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() + daysFromNow);
    date.setUTCHours(hour, 0, 0, 0);
    return date.toISOString();
  };

  return {
    users: [
      {
        id: 'organizer-1',
        displayName: 'Организатор',
        role: UserRole.Organizer,
        email: 'organizer@praktika.local',
        password: 'Praktika-demo-2026!',
      },
      {
        id: 'participant-1',
        displayName: 'Анна',
        role: UserRole.Participant,
        email: 'anna@praktika.local',
        password: 'Praktika-demo-2026!',
      },
      {
        id: 'participant-2',
        displayName: 'Борис',
        role: UserRole.Participant,
        email: 'boris@praktika.local',
        password: 'Praktika-demo-2026!',
      },
      {
        id: 'participant-3',
        displayName: 'Вера',
        role: UserRole.Participant,
        email: 'vera@praktika.local',
        password: 'Praktika-demo-2026!',
      },
      {
        id: 'participant-4',
        displayName: 'Глеб',
        role: UserRole.Participant,
        email: 'gleb@praktika.local',
        password: 'Praktika-demo-2026!',
      },
    ],
    workshops: [
      {
        id: 'workshop-spare',
        title: 'Проектирование API',
        description: 'Спроектируем понятный HTTP API: от контракта и ошибок до версионирования.',
        startsAt: startsAt(2, 10),
        location: 'Зал A',
        capacity: 4,
      },
      {
        id: 'workshop-last-seat',
        title: 'Архитектура React',
        description: 'Разделим интерфейс на компоненты и разберём, где должно жить состояние.',
        startsAt: startsAt(3, 14),
        location: 'Зал B',
        capacity: 2,
      },
      {
        id: 'workshop-full',
        title: 'Надёжный фронтенд',
        description:
          'Научимся работать с сетевыми ошибками, повторными запросами и гонками данных.',
        startsAt: startsAt(4, 16),
        location: 'Зал C',
        capacity: 2,
      },
    ],
    registrations: [
      {
        id: 'registration-spare-confirmed',
        workshopId: 'workshop-spare',
        participantId: 'participant-1',
        attendeeName: 'Анна',
        comment: 'Готова к практической части.',
        status: RegistrationStatus.Confirmed,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'registration-spare-waitlisted',
        workshopId: 'workshop-spare',
        participantId: 'participant-2',
        attendeeName: 'Борис',
        comment: 'Хочу присоединиться к группе.',
        status: RegistrationStatus.Waitlisted,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'registration-last-seat-confirmed',
        workshopId: 'workshop-last-seat',
        participantId: 'participant-3',
        attendeeName: 'Вера',
        comment: '',
        status: RegistrationStatus.Confirmed,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'registration-full-confirmed-1',
        workshopId: 'workshop-full',
        participantId: 'participant-3',
        attendeeName: 'Вера',
        comment: '',
        status: RegistrationStatus.Confirmed,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'registration-full-confirmed-2',
        workshopId: 'workshop-full',
        participantId: 'participant-4',
        attendeeName: 'Глеб',
        comment: '',
        status: RegistrationStatus.Confirmed,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'registration-full-waitlisted-1',
        workshopId: 'workshop-full',
        participantId: 'participant-1',
        attendeeName: 'Анна',
        comment: '',
        status: RegistrationStatus.Waitlisted,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'registration-full-waitlisted-2',
        workshopId: 'workshop-full',
        participantId: 'participant-2',
        attendeeName: 'Борис',
        comment: '',
        status: RegistrationStatus.Waitlisted,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };
}

function insertSeedRows(database: DatabaseSync, now: Date): void {
  const seed = seedRows(now);
  const userInsert = database.prepare(
    `INSERT INTO users
      (id, display_name, role, email, password_salt, password_hash)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       email = COALESCE(users.email, excluded.email),
       password_salt = COALESCE(users.password_salt, excluded.password_salt),
       password_hash = COALESCE(users.password_hash, excluded.password_hash)`,
  );
  for (const user of seed.users) {
    const credential = hashPassword(user.password);
    userInsert.run(
      user.id,
      user.displayName,
      user.role,
      user.email,
      credential.salt,
      credential.hash,
    );
  }

  const workshopInsert = database.prepare(
    `INSERT INTO workshops (id, title, description, starts_at, location, capacity)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
  );
  for (const workshop of seed.workshops) {
    workshopInsert.run(
      workshop.id,
      workshop.title,
      workshop.description,
      workshop.startsAt,
      workshop.location,
      workshop.capacity,
    );
  }

  const registrationInsert = database.prepare(
    `INSERT INTO registrations
      (id, workshop_id, participant_id, attendee_name, comment, status, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
  );
  for (const registration of seed.registrations) {
    registrationInsert.run(
      registration.id,
      registration.workshopId,
      registration.participantId,
      registration.attendeeName,
      registration.comment,
      registration.status,
      registration.version,
      registration.createdAt,
      registration.updatedAt,
    );
  }
}

export function summarizeDatabase(database: DatabaseSync, databasePath: string): DatasetSummary {
  const count = (sql: string): number => {
    const row = database.prepare(sql).get() as { count: number };
    return Number(row.count);
  };

  return {
    databasePath,
    users: count('SELECT COUNT(*) AS count FROM users'),
    workshops: count('SELECT COUNT(*) AS count FROM workshops'),
    registrations: count('SELECT COUNT(*) AS count FROM registrations'),
    confirmed: count("SELECT COUNT(*) AS count FROM registrations WHERE status = 'confirmed'"),
    waitlisted: count("SELECT COUNT(*) AS count FROM registrations WHERE status = 'waitlisted'"),
    cancelled: count("SELECT COUNT(*) AS count FROM registrations WHERE status = 'cancelled'"),
  };
}

export function setupDatabase(databasePath = resolveDatabasePath()): DatasetSummary {
  const resolvedPath = resolveDatabasePath(databasePath);
  const database = openDatabase(resolvedPath);
  try {
    return summarizeDatabase(database, resolvedPath);
  } finally {
    database.close();
  }
}

export function seedDatabase(
  databasePath = resolveDatabasePath(),
  now = new Date(),
): DatasetSummary {
  const resolvedPath = resolveDatabasePath(databasePath);
  const database = openDatabase(resolvedPath);
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      insertSeedRows(database, now);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    return summarizeDatabase(database, resolvedPath);
  } finally {
    database.close();
  }
}

export function resetDatabase(
  databasePath = resolveDatabasePath(),
  now = new Date(),
): DatasetSummary {
  const resolvedPath = resolveDatabasePath(databasePath);
  const database = openDatabase(resolvedPath);
  try {
    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(
        'DELETE FROM sessions; DELETE FROM registrations; DELETE FROM workshops; DELETE FROM users;',
      );
      insertSeedRows(database, now);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    return summarizeDatabase(database, resolvedPath);
  } finally {
    database.close();
  }
}

export const seedWorkshopTitles = {
  spare: 'Проектирование API',
  lastSeat: 'Архитектура React',
  full: 'Надёжный фронтенд',
} as const;
