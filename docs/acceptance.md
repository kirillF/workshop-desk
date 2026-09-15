# Acceptance evidence

Specification v0.3; verified 2026-09-15. Executor: Luna MAX, with parent integration
fixes and independent tests. This is an uncommitted local source tree; no Git
revision exists. These are selected executable scenarios, not an exhaustive proof.

## Suites

| Command | Result |
|---|---|
| `npm ci --offline --no-audit --no-fund` | PASS in isolated copy using the previously populated cache |
| `npm run check` | PASS: contracts, API, web |
| `npm run test:unit` | PASS: 7 tests |
| `npm run test:integration` | PASS: 16 real HTTP/SQLite tests |
| `npm run test:e2e` | PASS: 21 Chromium tests |
| `npm run build` | PASS: compiled API and bundled frontend |
| `npm run dev`, `npm start` | PASS: readiness, HTTP page, state persistence, coordinated shutdown |

The complete suites were run from `/private/tmp/workshop-desk-clean.NcX5lG`, with
no source dependency on the original project's node_modules or database. Chromium
was installed separately before the run. Optional fsevents install scripts were
not approved; install, checks, dev, build and browser tests still passed. A built
browser session additionally verified catalog, organizer confirmation and counters.

## AC map

Browser scenarios below are in [acceptance.spec.mjs](../tests/e2e/acceptance.spec.mjs)
and include their AC IDs in test names. API files are
[organizer.test.mjs](../tests/integration/organizer.test.mjs) and
[participant-and-controls.test.mjs](../tests/integration/participant-and-controls.test.mjs).
Shared operation checks are in [operations.test.ts](../tests/unit/operations.test.ts).

| Criterion | Observed evidence | Result |
|---|---|---|
| AC-01 | Browser booking, form close/reset, reload, persisted confirmed row and counter | PASS |
| AC-02 | API `simultaneous participant seat requests cannot overbook the last seat` | PASS |
| AC-03 | Browser SEATS_FULL retains both fields; no waitlist row before explicit action | PASS |
| AC-04 | Browser waitlist/re-registration and cancellation keep availability unchanged; API owner cancellation | PASS |
| AC-05 | Browser organizer success and full-workshop rejection; atomic API confirmation races | PASS |
| AC-06 | API active duplicate returns ALREADY_REGISTERED without another row/seat | PASS |
| AC-07 | Browser cancellation then re-registration reuses ID at version 3; API rechecks expected state/capacity | PASS |
| AC-08 | Browser holds A, acknowledges B, rejects A; asserts both rows before releasing both reconciliation reads | PASS |
| AC-09 | Same browser sequence with A rejected before B acknowledgement | PASS |
| AC-10 | Browser closes/reopens guarded creation and re-registration, verifies disabled submission and exactly one POST; unit shared logical guard | PASS |
| AC-11 | Two isolated browser clients use same version; second displays rejection and synchronizes; API one-winner test | PASS |
| AC-12 | Postcommit response body lost; browser remains unknown after GET; no new mutation, explicit continuation | PASS |
| AC-13 | Browser releases old captured GET after acknowledgement/new reconciliation; rows/counters stay current; unit epoch check | PASS |
| AC-14 | Direct API participant confirmation and other-owner cancellation are forbidden without mutation | PASS |
| AC-15 | Browser invalid field/focus, definitive 503 draft preservation, initial network failure/retry and cancellation error | PASS |
| AC-16 | Browser keyboard booking at 390/1280px; labels, field focus, dialog Escape and return focus; no page overflow | PASS |
| AC-17 | Browser late success after form reopen, workshop switch/return, late rejection after identity switch; context/read generations in unit tests | PASS |
| AC-18 | Before-commit hold times out; GET observes old row without resolving unknown guard | PASS |
| AC-19 | Browser explicit continuation with old/new PATCH race and late callback during new guard; API verifies only new version wins; unit retired callback | PASS |
| AC-20 | Browser creation/re-registration shared guards; API delayed initial POST after another client creates/cancels cannot resurrect row | PASS |
| AC-21 | Browser reload restores unknown, verifies one arrival/no resend, refresh remains unknown; unit persisted descriptors omit drafts | PASS |

## Limits

No Firefox/WebKit run, screen-reader audit, load test, distributed DB test, or AI
review comparison was performed. The browser uses controlled representative
interleavings, not every ordering or every AC crossed with every screen. API and
store tests complement browser evidence. Cookie authentication is covered by the
amendment below; unknown outcome recovery is conditional continuation, not historical proof.

Acceptance does not imply that the talk, slides, timing, or review-tool claims have
been prepared or validated. Model monetary cost was not measured.

## Authentication amendment evidence

AUTH_SPEC.md v0.4: implementation and acceptance completed on 2026-09-15.
Source revision: local source tree without a Git repository or commit. Luna MAX
implemented auth/preview and the final session/preview fixes; parent integration
added regression checks, applied changes and verified the combined application.

| Command | Result |
|---|---|
| `npm run check` | PASS: contracts, API, web |
| `npm test` | PASS: 8 unit + 22 API integration tests |
| `npm run test:e2e` | PASS: 29 Chromium browser tests |
| `npm run build` | PASS: compiled API and frontend |
| isolated `npm run dev` / `npm start` | PASS: HTTP/UI readiness, authenticated upgraded data, session across restart, logout, coordinated shutdown |

| Criterion | Amendment evidence | Result |
|---|---|---|
| AUTH-AC-01 | Invalid/correct login in browser; generic HTTP errors | PASS |
| AUTH-AC-02 | Browser reload/logout; HTTP expired cookie rejects protected reads and deletes expired session | PASS |
| AUTH-AC-03 | Forged header/query cannot change real actor; role/owner negative HTTP checks | PASS |
| AUTH-AC-04 | Participant directory/preview denial and absence of Services in participant UI | PASS |
| AUTH-AC-05 | Organizer menu, target catalog/status/details, read-only banner | PASS |
| AUTH-AC-06 | Disabled preview form; direct POST/PATCH reject without changes, including auth login/logout | PASS |
| AUTH-AC-07 | Held preview detail across workshop/target changes; explicit/reload/brand exit | PASS |
| AUTH-AC-08 | Held old read returns 200/401 after new login; legacy held mutation rejects without changing new draft; store reset makes old callbacks inert | PASS |
| AUTH-AC-09 | Exact credentialed CORS, cookie flags, password hashes and token digests | PASS |
| AUTH-AC-10 | HTTP five failures then 429; deterministic default 60-second boundary and shorter limiter window recover | PASS |
| AUTH-AC-11 | 29 browser scenarios plus 22 API tests preserve original concurrency and authorization behavior | PASS |
| AUTH-AC-12 | Keyboard login/menu/preview/exit at 390/1280px without overflow; build/dev/start; actual legacy schema and working-data upgrade preserve data | PASS |

Upgrade verification used a genuine pre-auth schema. Modified attendee fields,
registration version 9, workshop title and user identity remained equal after
migration and a repeated seed. Runtime checks verified the upgraded registration
through authenticated HTTP and a session persisted across dev/start restart.
The working database was backed up before migration; workshops, registrations and
user identity were compared before/after without resetting data.

The keyboard test waits for the asynchronous participant directory before Tab;
the first run exposed a test timing assumption, then the corrected scenario passed.
The limiter boundary is tested with explicit timestamps rather than a wall-clock
minute in every test run. These checks cover selected interleavings and Chromium,
not an exhaustive accessibility or security audit. `App.tsx` remains monolithic;
local seeded credentials and the Vite preview runner are intended for this demo.

## Refactor verification — 2026-09-15

The React feature/module refactor passed 112 unit/client, 20 component/hook,
22 real HTTP/SQLite integration and 30 browser tests. Type checks, lint, formatting,
focused coverage gates and both builds passed. The working database was preserved;
the compiled application was restarted and checked through the browser.
See [refactor review](REFACTOR_REVIEW.md) for fixed defects, exact coverage
percentages, source application evidence and remaining test gaps, and
[testing strategy](TESTING.md) for reproducible commands and layer boundaries.
These results supersede historical totals for the refactored source only.
