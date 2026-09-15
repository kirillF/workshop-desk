import {
  resetDatabase,
  resolveDatabasePath,
  seedDatabase,
  setupDatabase,
} from '../apps/api/src/db.ts';

const command = process.argv[2];
const databasePath = resolveDatabasePath();

if (!['setup', 'seed', 'reset'].includes(command)) {
  console.error('Usage: npm run db:setup | npm run db:seed | npm run demo:reset');
  process.exit(1);
}

const summary =
  command === 'setup'
    ? setupDatabase(databasePath)
    : command === 'seed'
      ? seedDatabase(databasePath)
      : resetDatabase(databasePath);

const action =
  command === 'setup'
    ? 'Database ready'
    : command === 'seed'
      ? 'Seed complete'
      : 'Demo reset complete';
console.log(`${action}: ${summary.databasePath}`);
console.log(
  `users=${summary.users} workshops=${summary.workshops} registrations=${summary.registrations} ` +
    `confirmed=${summary.confirmed} waitlisted=${summary.waitlisted} cancelled=${summary.cancelled}`,
);
