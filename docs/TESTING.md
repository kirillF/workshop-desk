# Testing

This repository uses the standard runners already present in the npm
workspace. The layers answer different questions, so a passing result in one
layer is not a substitute for the others.

## Test layers

| Layer               | Tool and environment                                                                                       | Scope and evidence                                                                                                                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit and client API | Vitest in the `node` environment; `tests/unit/**/*.test.ts` and `tests/client/**/*.test.ts`                | Pure state machines, validation, crypto, response/error mapping, and the typed API client. These tests do not open SQLite or a listening HTTP server.                                                                                                                                          |
| Components          | Vitest with React Testing Library and `jsdom`; `tests/components/**/*.test.tsx`                            | User-visible React behavior for forms and session/preview screens and hooks. Network responses are controlled test inputs; this layer does not prove native HTTP or SQLite behavior.                                                                                                           |
| API integration     | Node's built-in `node:test` runner with native `node:http` and Node SQLite; `tests/integration/*.test.mjs` | Real `createApiServer` requests against isolated temporary databases. Covers schema and projections, authentication and CORS, capacity and version invariants, transaction behavior, and gated fault controls. It exercises the server without a browser.                                      |
| Browser E2E         | Playwright; `tests/e2e`                                                                                    | Representative multi-user browser journeys through Vite and a real API server, including organizer preview, participant registration, delayed or dropped responses, reconciliation, and visible accessibility states. It is the only layer that validates the complete browser-to-server path. |

Vitest's component setup uses React Testing Library cleanup after each test.
The integration and E2E suites create temporary databases and release queued
test-control events explicitly. They do not use the working demo database.

## Repository commands

Run these commands from the workspace root:

```sh
npm run check
npm run check:contracts
npm run check:api
npm run check:web
npm run check:tests
```

The aggregate check type-checks contracts, API, web, and tests. The individual
commands are useful when a change belongs to one boundary.

```sh
npm run test:unit
npm run test:components
npm run test:integration
npm run test:e2e
npm test
```

`npm test` runs unit, component, and API integration tests according to the
current package script. E2E is intentionally a separate `npm run test:e2e`
invocation because it starts browser and web-server processes.

Coverage and repository quality checks are available through the existing
scripts:

```sh
npm run test:coverage:unit
npm run test:coverage:api
npm run test:coverage
npm run lint
npm run format:check
npm run build
```

`npm run test:coverage:unit` uses Vitest's V8 provider and writes reports to
`coverage/unit-components`. `npm run test:coverage:api` uses Node's native V8
test coverage and writes the API LCOV report to `coverage/api/lcov.info`. The
API command includes `apps/api/src/**` and runs the native integration suite.

The local lifecycle scripts are separate from test validation:

```sh
npm run db:setup
npm run db:seed
npm run dev
npm run start
```

`npm run demo:reset` is an explicit development reset operation. Tests should
continue to use isolated temporary databases, and a working database should
not be reset as part of validation.

## Coverage gates

The focused Vitest thresholds require at least **90% lines, 90%
functions, and 85% branches**. They apply to the configured critical seams:

- `apps/web/src/features/auth/model/session-controller.ts`
- `apps/web/src/features/participant-preview/model/use-participant-preview.ts`
- `apps/api/src/modules/registrations/validation.ts`
- `apps/web/src/shared/api/*.ts`
- `apps/web/src/features/registrations/model/operations.ts`

The API integration coverage command has a separate baseline floor of **89%
lines, 78% branches, and 90% functions** for the API source included by its
Node coverage flags. This is a server-wide floor; it does not replace the
focused pure-module gates.

Coverage is evidence about executed paths, not a proof of every temporal or
concurrency property. The aggregate unit/component report excludes E2E
execution. Application composition and the async registration controller are
not directly covered by focused unit/component tests; their complete behavior
is exercised by browser tests. API integration tests cover the server side only. Their presence in the aggregate
denominator can therefore make that report look lower than the focused
pure-module gates. Vitest and Node use different V8 instrumentation,
source-map/transpilation paths, and denominator rules; their percentages are
therefore not directly interchangeable. Final run results and any
review-specific totals belong in `REFACTOR_REVIEW.md`.

## What each layer must preserve

Unit tests should keep pure validation, crypto, error mapping, and operation
ordering fast and deterministic. Component tests should assert user-visible
states and transitions, including captured seat versus waitlist intent,
unknown outcomes, continuation, stale reads, session expiry, and preview
context changes.

Integration tests must use the real native HTTP boundary when asserting public
status codes, cookies, CORS, SQLite transactions, capacity, ownership, or
version behavior. A direct function call is useful as a unit test but cannot
stand in for those HTTP assertions.

E2E tests should cover the bounded cross-user journeys and fault sequences that
depend on a browser, separate session contexts, or visible recovery UI. They
should wait on explicit queue events exposed by gated test controls instead of
arbitrary sleep durations. Test controls are available only when the server is
created in test mode or `WORKSHOP_TEST_MODE=1`; normal API mode has no control
routes.

No test layer establishes production-grade authentication, distributed
consistency, durable exactly-once execution, or exhaustive concurrency. The
application deliberately keeps a native Node backend and canonical standard
test tools rather than introducing a bespoke test framework.
