# Refactor Review — 2026-09-15

## Result and scope

The approved refactor preserves the local booking product, Russian UI, persistent
SQLite data and public API contracts. React + TypeScript + Vite remain the frontend
stack. Feature modules replace the 2,799-line application component; session and
preview lifecycles have separate ownership, and registration orchestration delegates
to the existing operation store. Backend modules separate commands, projections,
repositories, HTTP concerns and database lifecycle without changing transaction scope.

Implementation was delegated to Luna MAX with disjoint frontend/backend ownership.
The parent reviewed integration, authored regression tests and configured quality gates.
No Git repository exists in this project, so this report identifies the verified
source snapshot by its application date and local validation evidence, not a commit.

## Review findings

| Priority | Finding                                                              | Resolution and evidence                                                                                                                                                                                                                                                                                                       |
| -------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | Logout cleared local identity even when server revocation failed.    | Fixed. SessionController bounds waiting, hides private UI, serializes attempts, distinguishes error from success and exposes retry. The added browser regression failed on the original snapshot and passes after the fix. Unit tests cover hung requests, retry, late completion, restore failure and old-generation expiry. |
| P2       | App combined presentation, session, preview and mutation lifecycles. | Extracted app composition, feature UI, auth/preview controllers and registration orchestration. Temporal invariants stay with their owning controller/store.                                                                                                                                                                  |
| P2       | Transport and component behavior depended almost entirely on E2E.    | Added credentialed-client, malformed-response, definitive/ambiguous error, session, preview and form tests. Real HTTP/SQLite and browser suites remain.                                                                                                                                                                       |
| P2       | Coverage had no measurement or gates.                                | Added V8 reports with focused module thresholds and a separate API integration floor. Aggregate gaps are explicit below.                                                                                                                                                                                                      |
| P2       | Auth imported shared errors from the organizer feature.              | Shared HTTP errors now have their own module; feature commands retain atomic SQLite boundaries.                                                                                                                                                                                                                               |
| P3       | Ignored demo identity options and inconsistent hygiene remained.     | Removed ignored client options; ESLint checks hooks, unused code and frontend import direction; Prettier formats source and tooling. Tiny root barrels remain for actual script/test consumers.                                                                                                                               |

The full browser run caught a refactor regression: a pending operation incorrectly
blocked reopening its form. The guard was removed from form opening; sending another
command remains blocked. Both existing creation/re-registration regression tests pass.
An old-session browser test depended on an incidental initial request. It now waits
for initial synchronization and explicitly refreshes before holding the old response;
its assertions about the new session remain unchanged.

## Verification

All commands were run against the final isolated source before application:

| Check                                                              | Result              |
| ------------------------------------------------------------------ | ------------------- |
| Contracts, API, web and test TypeScript checks                     | PASS                |
| ESLint, including hook dependencies and frontend import boundaries | PASS                |
| Prettier format check                                              | PASS                |
| Vitest unit/client tests                                           | 112 PASS            |
| React Testing Library component/hook tests                         | 20 PASS             |
| Native HTTP/SQLite integration tests                               | 22 PASS             |
| Playwright browser tests                                           | 30 PASS, no retries |
| Unit/component and API coverage gates                              | PASS                |
| API and Vite build                                                 | PASS                |

Reports are generated by `npm run test:coverage` into `coverage/unit-components`
and `coverage/api/lcov.info`. Browser failures retain traces in `test-results`.
These generated files are ignored. The earlier 8/22/29 test totals in historical
acceptance entries describe the pre-refactor implementation.

## Coverage, by denominator

Percentages below are lines / functions / branches:

| Scope                                      |  Lines | Functions | Branches |
| ------------------------------------------ | -----: | --------: | -------: |
| Session controller                         | 99.20% |      100% |   90.14% |
| Preview lifecycle hook                     |   100% |    94.11% |   94.28% |
| Operation store                            | 96.94% |      100% |   92.36% |
| HTTP client                                | 95.74% |      100% |   86.53% |
| Client payload validation                  | 97.29% |      100% |   98.55% |
| Server registration validation, unit layer |   100% |      100% |     100% |
| All included unit/component source         | 58.21% |    60.00% |   53.69% |
| API integration source                     | 90.56% |    92.66% |   79.87% |

Focused modules require 90% lines/functions and 85% branches. The separate API
floor is 89% lines, 90% functions and 78% branches. Its pre-refactor baseline was
89.30% / 96.12% / 78.75%. Extracted helper functions change its denominator; the
function percentage decreased while the integration suite remains complete and
passes its explicit floor. Vitest and native Node percentages are not merged.

The unit/component denominator includes every frontend source module except the
DOM entry point `main.tsx`, shared contracts, and selected pure API modules named
in `vitest.config.mjs`. It deliberately includes untested composition, organizer
presentation and registration orchestration. Those frontend paths currently rely
on E2E; 58.21% is not presented as 90% application coverage. API integration coverage
includes API source loaded by the native server suites, not the browser. Boot-time
CLI error paths and some HTTP error branches remain uncovered at that layer.

## Maintainability and limits

`use-registration-controller.ts` is still the largest orchestration hook. Draft,
read, acknowledgement and unknown-outcome transitions share operation guards; an
arbitrary split would add coupling. Additional focused controller tests are the
next useful improvement before splitting it further. No claim of exhaustive
concurrency correctness or production authentication readiness is made.

Tooling uses the official React Vite plugin, Vitest, React Testing Library,
Playwright, ESLint and Prettier. TypeScript is pinned to 6.0.3 because the installed
typescript-eslint peer range excludes 6.1 and newer; no forced peer resolution was
used. Runtime dependencies and the native Node HTTP/SQLite backend were retained.

The pre-refactor source backup is `/private/tmp/workshop-desk-before-refactor`.
Tests never reset or use the working `data/workshop.sqlite`. No commit, push or
production deployment is part of this change.

## Applied runtime verification

The verified source was applied to `/Users/kirillf/devel/workshop-desk` and matched
byte-for-byte outside generated/dependency/data directories. `npm ci` and the full
build succeeded in that directory. `npm start` serves the compiled application at
http://127.0.0.1:5173 with API health returning 200; `/__test/queue` returns 404 in
normal mode. Browser verification confirmed existing-session restore, organizer
participant preview, logout, reload staying signed out, and a new login. The three
workshop rows and seven registration rows are unchanged across restart and checks.
The browser is left on the organizer's catalog.
