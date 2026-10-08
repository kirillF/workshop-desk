import { resolve } from 'node:path';
import { validateRun } from './run.mjs';
try {
  if (!process.argv[2]) throw new Error('Usage: validate.mjs run-directory');
  const result = validateRun(resolve(process.argv[2]));
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
