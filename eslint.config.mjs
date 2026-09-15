import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: {
      globals: Object.fromEntries(
        [
          'console',
          'process',
          'Buffer',
          'URL',
          'Headers',
          'Request',
          'Response',
          'fetch',
          'AbortController',
          'AbortSignal',
          'DOMException',
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
          'setImmediate',
          'window',
          'document',
          'navigator',
          'sessionStorage',
          'localStorage',
          'HTMLElement',
          'HTMLInputElement',
          'HTMLSelectElement',
          'HTMLDialogElement',
          'Event',
          'CustomEvent',
          'Storage',
          'crypto',
          'structuredClone',
          'TextEncoder',
          'TextDecoder',
          'innerWidth',
        ].map((name) => [name, 'readonly']),
      ),
    },
    rules: {
      'no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['apps/web/src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/**', '**/app/**'],
              message: 'Shared modules must not depend on features or application composition.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/app/**'],
              message: 'Feature modules must not depend on application composition.',
            },
          ],
        },
      ],
    },
  },
);
