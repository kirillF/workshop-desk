import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const children = [];
let stopping = false;
let exitCode = 0;

function launch(label, args) {
  const child = spawn(process.execPath, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  });
  child.once('error', (error) => {
    console.error(`${label} could not start: ${error.message}`);
    exitCode = 1;
    stopChildren();
  });
  child.once('exit', (code, signal) => {
    if (!stopping) {
      exitCode = code ?? 1;
      console.error(`${label} stopped${signal ? ` after ${signal}` : ''}.`);
      stopChildren();
    }
  });
  children.push(child);
}

function stopChildren() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(exitCode), 250);
}

process.once('SIGINT', () => stopChildren());
process.once('SIGTERM', () => stopChildren());

launch('API', ['dist/api/apps/api/src/server.js']);
launch('Web', ['node_modules/vite/bin/vite.js', 'preview', '--config', 'apps/web/vite.config.mjs']);
