export * from './bootstrap.ts';

import { startApiServer } from './bootstrap.ts';

if (import.meta.main) {
  startApiServer();
}
