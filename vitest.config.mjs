import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts', 'tests/client/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'components',
          include: ['tests/components/**/*.test.tsx'],
          environment: 'jsdom',
          environmentOptions: { jsdom: { url: 'http://127.0.0.1:5173' } },
          setupFiles: ['tests/components/setup.ts'],
        },
      },
    ],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: [
        'apps/web/src/**/*.{ts,tsx}',
        'packages/contracts/src/**/*.ts',
        'apps/api/src/modules/registrations/validation.ts',
        'apps/api/src/modules/auth/crypto.ts',
        'apps/api/src/shared/http/errors.ts',
        'apps/api/src/shared/http/response.ts',
      ],
      exclude: ['apps/web/src/main.tsx'],
      reportsDirectory: 'coverage/unit-components',
      reporter: ['text', 'json', 'json-summary', 'html'],
      thresholds: {
        'apps/web/src/features/participant-preview/model/use-participant-preview.ts': {
          lines: 90,
          functions: 90,
          branches: 85,
        },
        'apps/web/src/features/auth/model/session-controller.ts': {
          lines: 90,
          functions: 90,
          branches: 85,
        },
        'apps/api/src/modules/registrations/validation.ts': {
          lines: 90,
          functions: 90,
          branches: 85,
        },
        'apps/web/src/shared/api/*.ts': { lines: 90, functions: 90, branches: 85 },
        'apps/web/src/features/registrations/model/operations.ts': {
          lines: 90,
          functions: 90,
          branches: 85,
        },
      },
    },
  },
});
