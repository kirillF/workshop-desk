# Workshop Desk — Product Specification

Version: 0.3 · 2026-09-14
Status: v0.3 implemented and acceptance scenarios verified on 2026-09-15.
See [acceptance evidence](acceptance.md) and [architecture](architecture.md) for
actual scope and limitations. No AI review performance results are claimed.
Product owner: the project author.

All project documentation is maintained in English. The UI language is a separate
product requirement. FR, INV, and AC identifiers are stable across revisions.
This document is the normative product source; its revision supplies shared source
metadata for the properties below. Implementation and test links are added as they
exist. Hypotheses and unresolved decisions do not become requirements automatically.

## Approved follow-up amendment

[Authentication and organizer preview](AUTH_SPEC.md) defines the approved v0.4
change currently under implementation. It replaces the v0.3 demo identity selector
with local session login and organizer-only read-only preview. The v0.3 acceptance
status above describes the baseline, not completion of this amendment.

## 1. Purpose

Workshop Desk is a locally runnable technical workshop booking service.
Participants book seats or join a waiting list; organizers manage registrations.
The application uses a real frontend, API, and persistent database.

The first version makes form recovery, status transitions, capacity constraints,
and asynchronous UI behavior explicit and verifiable. Ordinary development and
review must be possible using project documentation without conversation history.

## 2. First-Version Scope

The deliverable must be a runnable, functional application, rather than only
mockups, code fragments, or test fixtures. Every declared user action must be
available in the UI and executed through a real API. Test controls supplement the application rather than replacing its behavior.

Included:

- Workshop catalog.
- Workshop details and registration form.
- Confirmed registrations, waiting list, and cancellation.
- Organizer panel with optimistic actions.
- Real local API and persistent storage.
- Fixed demo users and seed data.
- Agent documentation for navigation, implementation, verification, and review.
- Controlled reproduction of failures and response ordering.
- Checks for functional requirements and selected event sequences.
- Ordinary development tasks, requirement links, and reproducible check commands.

Excluded: account signup, production authentication, payments, email/push,
multiple organizations, schedule or capacity editing, automatic queue promotion,
WebSockets, offline mode, SSR, deployment, a custom AI platform, and a broad
model comparison. Also excluded: an invariant-registry service, review dashboard,
custom agent orchestrator, automatic severity scoring service, and mandatory
multi-tool or multi-pass experiments. Review artifacts are ordinary files or
existing PR/tool reports, not new Workshop Desk product features.

One local service and one database are sufficient. Distributed infrastructure
is not required to demonstrate invariants across components.

## 3. Users and Interface

### Participant

Views the catalog, workshop details, and their registration status. Can book
a seat, join a waiting list, and cancel their own registration.

### Organizer

Views registrations for a selected workshop. Can confirm a waitlisted
registration or cancel any active registration. Cannot change capacity.

### Demo Identity

In local mode, users are selected from a fixed list. Selection is stored per
tab so two tabs can represent different participants. The API receives the
selected user ID and checks the role and registration ownership against
server-side data.

This is a local demo mechanism, not production authentication. Every screen
shows the current user. Switching users clears the previous user's cache and
form state. Requests and their side effects are scoped to the originating
user, workshop, and interaction generation. Late responses must not repopulate a
new user's active state, dismiss a newly opened form, or display a success/error
for the new interaction. Aborting a client request does not imply server rollback.
Returning to a previous context fetches current server state before enabling actions.

### Screens

1. **Catalog:** title, short description, time, capacity, available seats,
   and the current user's registration status.
2. **Workshop:** description, location, time, available actions, name and
   comment form, and the current user's registration state.
3. **Organizer panel:** workshop selector, confirmed and waitlisted
   registrations, counters, row actions, and operation-specific errors.

The first-version UI language is Russian. Desktop and mobile widths are
supported. Forms and dialogs are keyboard accessible; fields have labels,
errors are associated with fields, and focus remains in the context of the
unfinished action after an error. Loading, empty, and load-failure states are
distinct.

## 4. Data and Terminology

| Entity | Main fields |
|---|---|
| User | id, displayName, role: participant / organizer |
| Workshop | id, title, description, startsAt, location, capacity |
| Registration | id, workshopId, participantId, attendeeName, comment, status, version |

Registration.status: `confirmed`, `waitlisted`, `cancelled`.

Network states `pending` and `error` belong to client operations; they are not
API registration statuses.

There is one registration per (workshopId, participantId) pair. Registering
again after cancellation reuses the row, updates its fields, and increments
version. Version increases on every successful registration change.

`confirmedCount` is the number of confirmed registrations.
`availableSeats = capacity - confirmedCount`.
`waitlistedCount` is separate. A waitlisted participant does not occupy a seat.
Seat counts are integers; capacity is positive and fixed in the first version.

Times are stored as unambiguous UTC instants and displayed with a timezone
label. Seed times are relative to the reset date so stale dates do not make
the demo unusable. The first version does not enforce a time-based booking
cutoff.

## 5. Functional Requirements

### FR-01. Booking an Available Seat

The participant enters a name (required, 1–80 characters after trimming) and
an optional comment (up to 500 characters). Both client and API validate these
limits. Submission prevents duplicate execution of that operation only.

A successful booking returns a confirmed registration. Submission automatically
closes and resets the form only after success. The participant may explicitly
close it and discard the draft; a failed submission does not imply that action.
After synchronization, details, catalog, and the participant's status reflect the result.

### FR-02. The Last Seat Has Been Taken

Displayed availability can be stale. The server rechecks capacity when
changing data. If no seat is available, it returns SEATS_FULL.

The form stays open and preserves the name and comment. The user sees the
reason and a “Join waiting list” action. Joining requires a separate explicit
action; consent is not inferred automatically.

### FR-03. Waiting List

When a workshop is already full, the form offers waiting-list registration.
Successful submission creates a waitlisted registration and closes the form.
Only an organizer can move it to confirmed.

If a seat becomes available after the waiting-list form opens, explicitly
submitting “Join waiting list” still creates a waitlisted registration. The
application does not substitute a different action without consent.

The list is ordered for display, but FIFO promotion is not a requirement:
the organizer can select any waitlisted registration when a seat is available.

### FR-04. Cancellation and Re-registration

Participants can cancel only their own confirmed or waitlisted registrations.
Organizers can cancel any active registration. Cancelling a confirmed
registration releases a seat; cancelling a waitlisted one does not change
availableSeats.

Cancellation requires confirmation. Re-registration performs the normal
capacity check; the previous seat is not reserved.

### FR-05. Organizer Operations

The organizer can move waitlisted to confirmed when a seat is available.
The capacity check and status update are atomic.

Actions on different registrations can run concurrently. The UI optimistically
updates the affected row and marks it as awaiting a response. An error belongs
to that operation; other rows remain available. A rejection must not temporarily
restore an older acknowledged state of another registration and rely on a later
refresh to conceal that rollback error.

The shared operation layer applies policy CP-01 (Section 8). Server-side
version checks protect writes from other clients and delayed commands.

Counters are marked as synchronizing while relevant operations or reads are
pending. Exact optimistic counter calculation is not required. The completion
boundary is defined in FR-07.

### FR-06. Errors and Unknown Outcomes

A definitive business rejection guarantees no write by that command. Roll back
only its optimistic effect. A network timeout, connection loss, or ambiguous
server failure does not establish rejection or successful completion.

Show “Outcome unknown” and provide “Refresh status.” A successful GET updates the
visible registration snapshot; it does not determine the historical outcome of
the command, which may still be processing or may have been followed by other
writes. Do not label the command successful/failed merely by matching row values.
A failed refresh leaves actions requiring a current snapshot unavailable.

While the outcome is unknown, do not automatically resend the command or silently
release its client guard. After a successful refresh, offer an explicit “Continue
from current state” action explaining that the earlier command may still complete.
This action retires the old optimistic overlay, not the server command, and allows
a new user-chosen command using the refreshed expectedVersion. It is not a retry
of the original command or an assertion about its outcome.

Every write, including initial creation and re-registration, conditionally applies
to the expected server state (Section 9). Thus a delayed earlier command and a
new command based on the same version cannot both apply. A conflict requires a
fresh read and another explicit user decision; the latest user intent is not
promised to win automatically. No exactly-once delivery or historical operation
receipt is provided in this version.

Before explicit continuation, a definitive late response may resolve its matching
operation. After continuation, late responses cannot apply old callbacks or roll
back a newer interaction; reconcile through a fresh read where needed. Operation
IDs here are client correlation identifiers, not a server idempotency protocol.

Pending/unknown operation descriptors (logical key, client operation ID, status)
are retained in per-tab session storage without form contents. On reload, pending
becomes unknown and requires refresh/explicit continuation. Closing the tab ends
that local record; server conditional writes still apply. Identity changes do not
release guards belonging to the previous identity.

### FR-07. Consistency Across Views

A registration change updates its representations and related counters in the
current client. Response eligibility is scoped to identity, workshop, interaction,
and read generation; versioned rows must not regress below an acknowledged version.
A read started before a relevant acknowledged mutation is not authoritative for
its subsequent reconciliation.

For a quiescent scenario with no further server writes: after relevant operations
have definitive outcomes and a read started after those outcomes succeeds, rows
and counters match that response. Delivering older in-flight reads afterward must
not change that result. “Synchronizing” clears at this boundary. A harness can
observe the boundary without arbitrary polling delays.

When other clients continue to write, the UI represents an observed server snapshot,
not perpetual equality with the database. Refresh may finish while an operation
remains “Outcome unknown”; those are separate states under FR-06.

Independent tabs refresh on explicit action, focus return, or screen re-entry.
Instant cross-tab synchronization is not promised. Server constraints apply
independently of the UI.

## 6. Registration Transitions

| Initial state | Action | Result |
|---|---|---|
| Absent / cancelled | Book a seat | confirmed if a seat is available |
| Absent / cancelled | Join waiting list | waitlisted |
| waitlisted | Confirm as organizer | confirmed if a seat is available |
| confirmed / waitlisted | Cancel | cancelled |

Other transitions return INVALID_TRANSITION. Submitting an application for an
active registration returns ALREADY_REGISTERED without changes. Organizers
cannot move cancelled directly to confirmed.

## 7. Required Properties

These properties express required behavior. Their sources are the referenced FR clauses within this document revision. Implementation policies are listed separately
in Section 8. An inferred property remains a hypothesis until the owner confirms it.

| ID | Property and scope | Source | Suitable check |
|---|---|---|---|
| INV-01 | Every committed DB state satisfies 0 ≤ confirmedCount ≤ capacity | FR-01, FR-02, FR-05 | API integration: concurrent requests for the last seat |
| INV-02 | waitlisted and cancelled do not reduce available seats | Section 4, FR-03, FR-04 | Domain test and consumer rendering |
| INV-03 | At most one Registration per workshopId + participantId | Section 4 | DB constraint and repeated application |
| INV-04 | While the user and workshop remain unchanged, after SEATS_FULL form values survive until editing, explicit closure, or successful submission | FR-02 | Browser test of the original scenario |
| INV-05 | Rolling back operation A on R1 does not undo an acknowledged change to R2, where R1 ≠ R2 | FR-05 | Controlled response interleaving |
| INV-06 | A command with an obsolete expected state cannot change the registration; two commands on the same workshop/participant pair against the same expected state cannot both commit | FR-05, FR-06, Section 9 | Concurrent conditional API writes, including creation and re-registration |
| INV-07 | Participants cannot modify others' registrations or confirm waitlisted registrations | Section 3 | Negative API tests |
| INV-08 | At the quiescent reconciliation boundary defined in FR-07, rows/counters match the authoritative response and remain unaffected by older reads; a refreshed snapshot does not imply a known command outcome | FR-06, FR-07 | Ordered reads, acknowledged writes, and unknown-outcome checks |

INV-01–03 are state properties; INV-06–07 constrain allowed operations;
INV-04–05 and INV-08 describe behavior over time. These properties do not cover
all functional requirements, such as the obligation to display an error.

This document supplies the shared owner and revision; do not repeat them on every
property. Record property-specific preconditions/exceptions and add links to actual
enforcement and checks. Agent agreement and passing tests do not promote hypotheses.

For INV-04, changing demo identity clears the previous identity's state as required
by Section 3. The property concerns preservation within the same registration
interaction, not persistence across identity or workshop changes.

One counterexample disproves the corresponding assertion. Passing a finite
set of ordinary tests does not prove it for all executions.

## 8. Architecture and Selected Policies

A small TypeScript monorepo is proposed:

```text
apps/web/             React SPA: catalog, registration, organizer panel
apps/api/             Node.js HTTP API, business operations, SQLite
packages/contracts/   DTOs, validation schemas, statuses, error codes
AGENTS.md             shared agent instructions, source map, commands
apps/web/AGENTS.md    optional distinct frontend instructions
apps/api/AGENTS.md    optional distinct API instructions
README.md             developer setup and usage
.env.example          documented local settings
docs/PROJECT_SPEC.md  authoritative product behavior and properties
docs/decisions/       significant architectural decisions only
docs/architecture.md  boundaries, data flows, cache, and server state
tasks/                tasks available to developers and reviewers
tests/integration/    real API and database checks
tests/e2e/            user scenarios
```

Library versions and HTTP/query/test frameworks are selected before
implementation using current documentation. Do not create additional packages
in advance. Shared contracts contain neither DB access nor UI implementation.

The server owns capacity, transitions, permissions, and registration versions.
Checking and writing occur in one transaction. Verify the absence of overbooking
with concurrent requests, not only sequential ones.

The client owns input, operation states, cache, and UI recovery. Optimistic updates
and disabled buttons do not establish server concurrency protection.

### CP-01. Chosen Client Serialization Policy

The logical registration key is (actorId, workshopId, participantId), including
creation before a Registration ID exists. Every UI entry point uses one shared
operation layer. It permits at most one actively tracked command per key. A known
success/rejection releases the guard. An unknown outcome retains it until the
explicit continuation in FR-06; that exception permits an older server command to
remain in flight. All writes therefore require conditional server enforcement.

Different logical keys may proceed concurrently. Correlate callbacks with a unique
client operation ID and context generation; an earlier callback cannot release a
newer guard. CP-01 is a bounded implementation policy, not a universal invariant:
other products can allow overlapping operations with a different correct protocol.

### Projection Ownership

The API owns available-seat and status counters. Catalog, details, and organizer
views consume server projections; they do not independently count all non-cancelled
registrations. Client-only projections are introduced only for actual UI needs and
must document their inputs and semantics. Do not duplicate business calculations
just to create another component boundary.

The monorepo simplifies reproduction but does not prove compatibility between
different deployed client versions. Version skew is a boundary to discuss;
a separate compatibility matrix is outside the first version.

## 9. API Contract

All operations use JSON. Errors contain a stable code, a readable message,
and optional fieldErrors. The client does not use message text as a machine
discriminator.

| Method and path | Purpose |
|---|---|
| GET /workshops | Catalog with server counters |
| GET /workshops/:id | Details and counters |
| GET /workshops/:id/my-registration | Own registration or null |
| POST /workshops/:id/registrations | attendeeName, comment, mode: seat / waitlist, expectedVersion: null / integer |
| GET /workshops/:id/registrations | Organizer's registration list |
| PATCH /registrations/:id | action: confirm / cancel, expectedVersion |

A successful mutation returns the current Registration. The client refetches
counters. All commands atomically check expected state and business constraints.
POST with expectedVersion: null means the pair must have no registration row;
with an integer it means that existing cancelled row must have that version.
Rows are retained after cancellation, so a delayed initial POST cannot reactivate
a later cancelled registration. PATCH always requires an integer expectedVersion.
Versions are monotonic for the lifetime of the row; demo reset starts a new dataset
and requires client reset. A new registration starts at version 1.

For an already active pair, POST returns ALREADY_REGISTERED without writing.
Otherwise a mismatched expected state returns VERSION_CONFLICT. Check role and
ownership before returning state details. Transactional enforcement includes
uniqueness, expected state, capacity, and transition validation together. Participants
can read their own state; the complete list is available to organizers.

Codes: VALIDATION_ERROR (400), FORBIDDEN (403), NOT_FOUND (404),
SEATS_FULL / ALREADY_REGISTERED / VERSION_CONFLICT / INVALID_TRANSITION (409).
A demo server rejection before commit uses SERVICE_UNAVAILABLE (503).
Unexpected failures return 500; the UI does not expose server internals.

Each GET reads a consistent local DB snapshot, including its counters. A GET
started after a known committed transaction includes that transaction or a later
state; it cannot establish the outcome of an independently pending command.
The API does not introduce artificial eventual consistency or background writes.

## 10. Seed Data and Reproduction Controls

Reset creates one organizer, four participants, and three workshops:

- A workshop with several available seats.
- A workshop with one available seat.
- A full workshop with two waitlisted participants.

The dataset is small enough to show all relevant registrations on screen.
A page reload does not reset the DB. Reset is an explicit local command with
a clear warning; it does not run at startup.

One small test/demo harness supports controlled scenarios:

- Hold a selected mutation **before** processing.
- Hold a read response representing an earlier DB state, then deliver it after
  a later mutation, to reproduce AC-13.
- Return a specified rejection **before** changing the DB.
- Process a request but hold or lose its response **after** commit.
- Release requests and responses in a specified order.
- Expose the control queue without technical details in the product UI.

The harness requires explicit test/demo mode. Control routes are absent in
normal mode. Controls live in a runner or separate local panel; the product
interface exposes no fault-injection controls. Random delays and sleeps do not
establish reproducibility.

Scenario control must observe operation arrival, commit/rejection, and response
release explicitly. Readiness barriers identify these events; elapsed sleeps do
not stand in for them. Record operation IDs, affected registration IDs, requested
versions, outcome, and event order in a local scenario log. No tracing platform
is required. Logs must let a developer distinguish a rejected write, a committed
write with a lost response, and a stale read.

Controls must permit inspection before reconciliation as well as afterward, and
must support a read completing before a held mutation commits. Use the smallest
runner or test hooks needed by acceptance. No general scheduling UI is required.

## 11. Acceptance Scenarios

| ID | Actions | Expected result |
|---|---|---|
| AC-01 | Book an available seat and reload | confirmed persists, a seat is occupied, and the form resets after success |
| AC-02 | Two participants concurrently request the last seat | Exactly one succeeds; the other receives SEATS_FULL; capacity is not exceeded |
| AC-03 | Receive SEATS_FULL with a completed form, then choose the waiting list | Fields survive; no waitlisted registration exists before explicit action; one exists afterward |
| AC-04 | Join the waiting list, then cancel that registration | Neither action changes available seats |
| AC-05 | Confirm a waitlisted registration with and without an available seat | Success occupies a seat; rejection leaves the registration unchanged |
| AC-06 | Resubmit an application for an active registration | ALREADY_REGISTERED; no duplicate or additional seat consumption |
| AC-07 | Cancel confirmed, then register again | A seat is released; re-registration rechecks capacity |
| AC-08 | Hold A cancelling R1; B confirms R2 successfully; A is rejected; hold reconciliation before releasing it | R1 is restored and R2 stays confirmed before reconciliation; afterward rows and counters converge to the DB |
| AC-09 | Repeat the interleaving with A's rejection before B's success | No lost changes or stuck pending state; the final result matches the DB |
| AC-10 | Two UI controls in one client modify the same registration without explicit unknown-outcome continuation | Only one command is sent while its shared guard is held |
| AC-11 | Two clients modify one registration with the same expectedVersion | One transition succeeds; the other receives VERSION_CONFLICT and synchronizes |
| AC-12 | A mutation commits but its response is lost | UI reports unknown outcome; GET refreshes state without claiming the historical outcome; no automatic retry; explicit continuation uses conditional state |
| AC-13 | An old read completes after a successful mutation | The old response does not leave the UI stale after synchronization |
| AC-14 | A participant directly calls the API to cancel another user's registration or confirm | FORBIDDEN; data is unchanged |
| AC-15 | Submit an invalid form or encounter an initial load failure | Clear error and a way to correct input or retry loading |
| AC-16 | Complete registration using a keyboard at narrow and wide widths | All actions are accessible; focus and errors preserve context |
| AC-17 | Switch identity/workshop or reopen the form while an older response is pending | Late success, rejection, and read cannot populate/reset the new interaction; returning to the original context refreshes it |
| AC-18 | Hold a mutation before commit; cause timeout; let GET complete before releasing the mutation | The read does not label the operation failed/completed; the unknown guard remains until explicit continuation |
| AC-19 | After unknown outcome, refresh and explicitly continue; race old/new commands against the same expected state | At most one commits; conflict prompts refresh; old callbacks cannot roll back or release the newer operation |
| AC-20 | Two controls create an absent registration; repeat with re-registration; deliver a delayed initial POST after cancellation | Shared logical guard covers creation; server enforces expected state; delayed initial POST cannot reactivate an existing row |
| AC-21 | Reload with a pending command, then refresh and continue | Stored descriptor becomes unknown; no automatic resend; conditional writes protect continuation |

AC-08 provides enough capacity for B independently of A's outcome. Otherwise,
the case mixes a rollback violation with a legitimate capacity rejection.

## 12. Agent Documentation and Development Workflow

Agent documentation is required and maintained against the implemented code.
Keep it short: root AGENTS.md gives navigation, verified commands, change/data
boundaries, and evidence-reporting rules. Add component AGENTS.md only for distinct
local instructions that would otherwise be easy to miss; do not repeat root policy.
README covers prerequisites and use. docs/architecture.md explains authority,
operation flow, and actual consumers. This specification owns product requirements;
other documents link to stable IDs rather than copying them.

Tasks describe intent, acceptance, scope, and source links. PR/task completion notes
state the revision, relevant checks and results, unresolved questions, and affected
evidence requiring renewal after changes. One short record for a consequential
change is sufficient; routine comments do not require a dossier.

Agents must identify applicable sources and distinguish explicit requirements,
confirmed interpretations, hypotheses, and conflicts. Code and tests are evidence
of behavior, not automatic authority for intent. State a missing domain decision
and consult the owner rather than silently rewriting requirements. Preserve
unrelated changes and use isolated test data.

A fresh agent must be able to navigate from root instructions to a requirement,
implementation, relevant consumer, and working check command without chat history.
This checks navigation and source interpretation; it does not demonstrate discovery
of previously undocumented requirements. Keep scenario diagnoses and expected
review answers out of ordinary agent instructions.

Document one supported existing review path when it is selected, including how
project context actually loads and any unavailable capabilities. No custom skill,
per-vendor instruction inventory, or paid review is required for application startup
or functional acceptance. Do not present planned commands as already working.

## 13. Implementation Plan and Readiness

### Required Startup Contract

From a clean checkout, a developer follows documented steps without manually
editing source files. The first implementation uses npm workspaces and one
lockfile. Runtime and library versions are pinned during implementation.
All commands below must exist and work.

```text
npm ci                    Install locked dependencies
npm run db:setup          Create/update the local schema without deleting data
npm run db:seed           Add seed data without overwriting existing data
npm run dev               Start frontend and API with one command
```

Local defaults require no secrets, accounts, or mandatory .env file.
.env.example documents optional settings. README specifies runtime versions,
frontend and API addresses, SQLite file location, and how to stop both processes.
Ports have configurable defaults; an occupied port produces a clear error.
Ordinary database and API usage does not require Docker.

GET /health checks database readiness. The UI is available at the documented
address after startup. API failures produce a connection error with retry,
not an empty screen. Stopping the shared command stops both child processes.
Restarting preserves registrations in the DB.

To verify the built application:

```text
npm run build             Build frontend and API
npm start                 Run built artifacts with the same real API
```

For verification and reproducibility:

```text
npm run check             Type and static checks
npm test                  Unit/component checks
npm run test:integration   API checks with a separate temporary SQLite database
npm run test:e2e           Browser checks with isolated data
npm run demo:reset         Explicitly restore the local demo dataset
```

README documents browser installation if required by the selected runner.
Test commands do not use the working demo database. Harness scenarios have
separate documented commands. Acceptance verifies that control routes are
absent in normal mode.

Dependency installation may require internet access. Once installed, the normal
application runs without external services or AI keys. AI review is connected
separately and is not a product startup dependency.

### Stage A — Organizer Vertical Slice

Start with a runnable organizer view backed by the real API and SQLite. Seed a
confirmed and a waitlisted registration, with spare capacity independent of a
pending cancellation. Implement confirm/cancel, conditional writes, scoped client
operations, and minimal deterministic request/response controls. Provide working
setup/start and relevant check commands from the first slice.

Verify AC-05, AC-08–11, AC-13–14, AC-17–19, and AC-21 within this slice. Test known
rejections, both response orders, unknown outcomes, and intermediate state before
reconciliation. No catalog or full participant UI is required at this stage.

### Stage B — Complete the Product

Add catalog, details, participant booking/waitlist/cancellation, explicit draft
dismissal, and creation/re-registration version checks. Complete seed/reset,
responsive keyboard-accessible states, docs, built startup, and all AC-01–21.
The final scope remains a functional service, not an organizer-only prototype.

### Product Definition of Done

- A clean checkout runs using documented prerequisites; dev and built startup work.
- All declared user actions work through real UI/API/DB paths.
- All AC-01–21 have observable verification; suite status and omissions are explicit.
- Seed is idempotent, reset is explicit, persistence survives restart, and tests
  cannot reset the working demo database.
- Unknown outcomes, current snapshots, and definitive command outcomes are distinct.
- Root agent instructions lead to requirements, code, consumers, and working checks.
- Documentation describes the implemented version, with one normative product source.
- Type/static, integration, and browser checks run separately with visible outcomes.
- Required ordering scenarios reproduce without random sleeps; test control routes
  are absent in normal mode.
- Ordinary operation needs no AI key or external service after dependency installation.

Product readiness is separate from readiness of any presentation or review experiment.

## 14. Limits and Scope Management

Keep one local API and DB; add infrastructure only for a required behavior.
The selected conditional-write protocol is not an operation history or exactly-once
service. Missing acknowledgments may leave historical outcomes unknown even after
work can safely continue from a refreshed conditional state.

The project author owns product intent and scope. Internal implementation choices
may vary while preserving observable requirements and the explicitly selected
client policy. Contract changes require updating their normative clauses and
relevant checks, rather than weakening assertions to fit the code.

Reserve at least 20% of each implementation stage for verification and documentation.
No numerical delivery estimate is established. Surface insufficient capacity for
required acceptance instead of silently dropping it. No delegation or external
publication is enabled by default.

## 15. Revision Record

### 0.3 — 2026-09-14

Separated product requirements from presentation/review-experiment material.
Distinguished current state from operation outcome; specified explicit continuation
and conditional writes for POST as well as PATCH. Defined logical client keys,
late-response isolation, reload behavior, and a quiescent reconciliation boundary.
Separated CP-01 serialization policy from INV-06 server protection. Assigned server
ownership of counters. Added AC-17–21 and moved the organizer slice to the first
implementation stage. Reduced documentation requirements to navigable, authoritative
sources and evidence appropriate to the change.

### Earlier Revisions

0.1 established the functional booking service. 0.2 strengthened source authority,
intermediate rollback checks, and review evidence but combined product and teaching
requirements. This revision supersedes that combined document.
