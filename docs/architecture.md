# Architecture

## Runtime and composition

The npm workspace has three runtime boundaries:

- `apps/web` is the React/Vite browser application.
- `apps/api` is a native Node HTTP server backed by Node's SQLite API.
- `packages/contracts` contains the shared TypeScript DTOs, enums, and response
  guards used at the application boundary.

The backend keeps the native `node:http` server. The refactor adds module
boundaries without adding a web framework, dependency-injection container, or
runtime package. `bootstrap.ts` composes one database handle, the configured
origin and cookie policy, the login limiter, gated test controls, and the route
function. It also owns server start, shutdown, and database close behavior.

`routes.ts` is the HTTP orchestration boundary. It decodes the route, applies
CORS and request metadata, authenticates where required, delegates to feature
modules, and sends the resulting response. It does not own the SQL for a
feature command or projection. The native server callback catches an unhandled
error and delegates its public mapping to the shared HTTP response layer.

## Backend module map

The canonical backend source is organized as follows:

```text
apps/api/src/
  bootstrap.ts                 server composition and lifecycle
  routes.ts                    native HTTP route orchestration
  modules/
    auth/
      crypto.ts                password and session-token primitives
      cookie.ts                session-cookie transport adapter
      preview.ts               organizer preview authorization and reads
      service.ts               login, session, participant discovery
      index.ts                 auth feature barrel
    workshops/
      repository.ts            workshop row mapping and read queries
      projections.ts           catalog and workshop-detail projections
      index.ts                 workshop feature barrel
    registrations/
      validation.ts            request validation
      repository.ts             actor and registration row mapping/reads
      commands.ts              create, confirm, cancel, re-register commands
      projections.ts           participant and organizer read projections
      index.ts                 registration feature barrel
  shared/
    http/
      request.ts               header, path, content-type, body parsing
      cors.ts                  exact-origin policy and CORS headers
      errors.ts                ApiProblem and public status mapping
      response.ts              JSON response and unknown/database error mapping
      index.ts                 shared HTTP barrel
    database/
      lifecycle.ts             open, schema, seed, reset, summary, close
      transaction.ts           explicit SQLite transaction helper
      index.ts                 shared database barrel
    test-controls.ts           test-only queue and fault controls
  [legacy root barrels]        compatibility adapters to canonical modules
```

The root files `auth.ts`, `crypto.ts`, `db.ts`, `organizer.ts`, `server.ts`,
and `test-controls.ts` are compatibility barrels for existing scripts and
tests. New backend code should import the module or shared path directly. The
barrels contain no second implementation and can be removed only after their
consumers migrate.

## Backend dependency direction

The intended import direction is from composition and transport toward shared
utilities and feature behavior:

```text
bootstrap
  -> routes
  -> database lifecycle, auth limiter, shared HTTP

routes
  -> auth, workshops, registrations
  -> shared HTTP, gated test controls

feature modules
  -> shared database transactions and repositories
  -> shared HTTP problems where a public domain failure is required
  -> contracts

shared HTTP / shared database
  -> contracts and Node primitives
```

Feature modules do not import `bootstrap.ts` or `routes.ts`; the route layer
assembles them. Registration command and projection code stays below routing
and does not write directly to `ServerResponse`. `modules/auth/cookie.ts` is a
small transport adapter because cookie headers are part of the auth boundary.
The database lifecycle module does not depend on the auth service or session
state. It reuses the pure password-hashing helper when creating seeded
credentials, so seed data follows the same password format as login.

`shared/http/errors.ts` is the single definition of `ApiProblem` and the
public `ApiErrorCode` to HTTP status mapping. `request.ts` owns bounded JSON
body reading, JSON content-type checks, header extraction, and path decoding.
`cors.ts` owns exact-origin normalization, headers, and preflight checks.
`response.ts` owns JSON/cache headers and maps API problems, SQLite busy/locked
errors, and unexpected errors to the public response shape. Route handlers may
choose a status for a successful operation, but do not duplicate the shared
error mapping.

## Persistence and command ownership

`shared/database/lifecycle.ts` owns schema creation, migrations, seed data,
explicit demo reset, summaries, and closing the one server database handle.
The schema keeps one `(workshop_id, participant_id)` registration row. A
cancelled row remains available for re-registration so its identity and
version history are preserved.

`shared/database/transaction.ts` provides the explicit transaction boundary.
The helper rolls back on every thrown error and commits only after the callback
returns. It does not abstract away transaction choice:

- Registration commands use `IMMEDIATE` transactions.
- Read projections use `DEFERRED` transactions where a consistent snapshot is
  needed.

`modules/registrations/commands.ts` owns the writes for create/re-register,
cancel, and organizer confirm. Each command checks the server-resolved actor,
role and ownership, target existence, expected version, allowed state
transition, capacity, and the conditional update result inside the same
`IMMEDIATE` transaction that changes the row. Only `confirmed` rows consume
capacity. The response reads the committed row through the repository before
the transaction returns.

`modules/workshops/projections.ts` owns catalog and detail read models,
including server-owned confirmed, waitlisted, and available-seat counters.
`modules/registrations/projections.ts` owns participant `my-registration` and
organizer registration-list projections. Repositories map database rows and
centralize actor/registration lookup so commands and projections use the same
status and version fields.

The HTTP layer classifies a definitive command rejection as a public 4xx/503
problem. A dropped response, transport failure, or unexpected server error is
ambiguous to the caller. The backend does not claim historical exactly-once
execution; expected-state and version checks protect a later explicit request
from applying an obsolete transition.

## Authentication and participant preview

`modules/auth/crypto.ts` contains the pure scrypt password and session-token
primitives. `service.ts` owns password login, server-side actor resolution,
session restore and revocation, participant discovery, and the login rate
limiter. `cookie.ts` sets and clears the HttpOnly, SameSite=Lax session cookie;
the Secure attribute follows the configured secure-cookie policy. Legacy demo
identity headers do not grant access.

`preview.ts` authorizes organizer-only participant discovery and preview reads.
The preview user is a read-projection selector. It never replaces the real
session actor, and route-level guards reject mutation requests that carry a
preview selector. The normal mutation path still checks the authenticated
actor, role, ownership, expected version, and business invariants.

## Frontend feature boundaries

`apps/web/src/app/App.tsx` owns application composition and the outer session
state machine. `app/AuthenticatedApp.tsx` composes authenticated views and
coordinates the selected catalog, workshop, organizer, and preview contexts.
`main.tsx` is only the browser entry point. The root `App.tsx` remains a
compatibility barrel that re-exports the app and extracted auth surfaces.

Feature ownership is split into these seams:

| Feature or layer               | Canonical ownership                                                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/auth`                | Session restore, login/logout attempts, expiry generations, and auth screens.                                                                        |
| `features/workshops`           | Catalog presentation and workshop selection surface.                                                                                                 |
| `features/registrations`       | Participant draft/form lifecycle, registration controller, operation state, participant view, cancellation, synchronization, and unknown-outcome UI. |
| `features/organizer`           | Organizer participant directory and registration-list/confirmation view.                                                                             |
| `features/participant-preview` | Organizer-selected preview target, preview read generations, and read-only preview view.                                                             |
| `shared/api`                   | Credentialed fetch client, response guards, error classification, and request options.                                                               |
| `shared/lib`                   | Formatting, storage, and cross-feature error helpers.                                                                                                |
| `shared/ui`                    | Status and workshop-metric presentation shared by feature views.                                                                                     |

`features/registrations/model/operations.ts` keeps authoritative server
snapshots separate from optimistic overlays. Each operation has a correlation
ID, logical actor/workshop/participant key, context generation, interaction
generation, expected version, and status. `use-registration-controller.ts`
coordinates reads, drafts, mutation commands, and reconciliation around that
store. `session-controller.ts` owns session transitions independently from
authenticated views. The preview controller owns preview generations so a
leaving or changed context cannot accept an old read.

`shared/api/client.ts` sends credentialed requests and classifies definitive
responses separately from unknown outcomes. Reads use `no-store` and explicit
request context. The server remains authoritative for rows and counters;
optimistic UI state is an overlay until a matching response and fresh read
establish the observed state. `api.ts` and `operations.ts` at the web root are
compatibility barrels for existing imports.

## Invariant ownership

The acceptance properties remain cross-layer contracts. Their primary owners
and evidence boundaries are:

| Property                                                                          | Primary owner                                                                 | Consumer or evidence boundary                                                         |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| INV-01/02: capacity, waitlist, and counters                                       | `registrations/commands.ts` plus `workshops/projections.ts`                   | Catalog, details, organizer metrics; real HTTP race and browser journeys.             |
| INV-03/06: one registration identity, cancellation, re-registration, and versions | Database pair constraint plus `registrations/commands.ts`                     | Participant commands; duplicate, re-registration, and delayed-command checks.         |
| INV-04: captured form intent and draft isolation                                  | `use-registration-controller.ts` and registration form components             | Seat/waitlist selection and context-switch component/E2E behavior.                    |
| INV-05: operation overlays and rollback isolation                                 | `registrations/model/operations.ts`                                           | Participant and organizer views; unit, component, and fault-sequence evidence.        |
| INV-07: server-owned authorization and preview isolation                          | `auth/service.ts`, `auth/preview.ts`, route guards, and registration commands | Every protected read/write; direct HTTP negative cases and browser preview.           |
| INV-08: stale-read, unknown-outcome, continuation, and reload ordering            | Operation store generations/epochs/version floors plus backend projections    | Sync panel and unknown-operation UI; unit, component, integration, and E2E sequences. |

The frontend clears private state, drafts, preview context, and operation state
when a session expires or explicit logout completes. A timeout or transport
failure leaves a mutation `unknown` and guarded. A GET refreshes observed rows
and counters; it does not retroactively settle the command. An explicit
continuation retires the old guard before the user chooses a new action against
the observed version. No application-level automatic mutation retry is
installed.

## Test-only controls and recovery boundary

`shared/test-controls.ts` provides deterministic before/after/drop queues and
request logs for integration and browser fault scenarios. `bootstrap.ts`
creates them only when `testMode` is explicitly enabled or
`WORKSHOP_TEST_MODE=1`; normal server mode has no control routes. Tests use
isolated temporary databases and real HTTP listeners, and release queued
events explicitly.

The starting monolith has no Git source backup in this checkout. The extracted
modules and compatibility barrels are the current source of truth; rollback
must not depend on repository history being available here. This document
describes the implemented seams and invariants, not a claim that the demo has
production-grade authentication, distributed consistency, notifications,
offline writes, or exactly-once delivery.

See [acceptance.md](acceptance.md) for the acceptance scenarios and
[TESTING.md](TESTING.md) for the runner, coverage, and evidence contract.
