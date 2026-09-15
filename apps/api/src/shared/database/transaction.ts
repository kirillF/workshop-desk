import type { DatabaseSync } from 'node:sqlite';

export type TransactionMode = 'DEFERRED' | 'IMMEDIATE';

/** Execute a unit of work with one explicit transaction boundary. */
export function inTransaction<T>(
  database: DatabaseSync,
  mode: TransactionMode,
  operation: () => T,
): T {
  let started = false;
  try {
    database.exec(`BEGIN ${mode}`);
    started = true;
    const result = operation();
    database.exec('COMMIT');
    started = false;
    return result;
  } catch (error) {
    if (started) {
      try {
        database.exec('ROLLBACK');
      } catch {
        // Preserve the original domain or database error.
      }
    }
    throw error;
  }
}
