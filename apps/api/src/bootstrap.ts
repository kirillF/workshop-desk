import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { LoginRateLimiter } from './modules/auth/index.ts';
import { openDatabase, resolveDatabasePath } from './shared/database/lifecycle.ts';
import { configuredOrigin, sendProblem } from './shared/http/index.ts';
import { TestControls } from './shared/test-controls.ts';
import { routeRequest, type RouteDependencies } from './routes.ts';

export type ApiServerOptions = {
  databasePath?: string;
  testMode?: boolean;
  allowedOrigin?: string;
  secureCookies?: boolean;
};

/** Compose the native HTTP server around the route module and one DB handle. */
export function createApiServer(options: ApiServerOptions = {}) {
  const databasePath = resolveDatabasePath(options.databasePath);
  const database = openDatabase(databasePath);
  const testMode = options.testMode ?? process.env.WORKSHOP_TEST_MODE === '1';
  const controls = testMode ? new TestControls() : null;
  const allowedOrigin = configuredOrigin(options.allowedOrigin ?? process.env.WEB_ORIGIN);
  const secureCookies =
    options.secureCookies ??
    (process.env.AUTH_COOKIE_SECURE === '1' || allowedOrigin.startsWith('https:'));
  const limiter = new LoginRateLimiter();
  const routeDependencies: RouteDependencies = {
    database,
    databasePath,
    controls,
    allowedOrigin,
    secureCookies,
    limiter,
  };
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void routeRequest(request, response, routeDependencies).catch((error: unknown) =>
      sendProblem(response, error),
    );
  });

  server.once('close', () => {
    database.close();
  });
  return server;
}

function readPort(value: string | undefined, fallback: number): number {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `API_PORT must be an integer between 1 and 65535; received ${value ?? fallback}.`,
    );
  }
  return port;
}

export function startApiServer(): void {
  const host = process.env.API_HOST || '127.0.0.1';
  const port = readPort(process.env.API_PORT, 4000);
  const server = createApiServer();

  const shutdown = (): void => {
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  server.once('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`API port ${port} is already in use. Set API_PORT to another free port.`);
    } else {
      console.error(`API server could not start: ${error.message}`);
    }
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    console.log(`API listening at http://${host}:${port}`);
  });
}
