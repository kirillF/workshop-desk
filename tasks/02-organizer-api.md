# WD-02 — Conditional organizer API

Status: DONE. Executor: Luna MAX; parent integration verification.
Dependencies: WD-01.
Normative source: [PROJECT_SPEC.md](../docs/PROJECT_SPEC.md) v0.3 — FR-04–07; INV-01–03, INV-06–07; AC-05, AC-11, AC-14; Section 9.

Read [execution instructions](README.md) and root AGENTS.md before starting.

## Owned Scope

apps/api read endpoints and PATCH operations; packages/contracts DTO/validation/error definitions; tests/integration; relevant architecture and requirement enforcement links.

You are not alone in the codebase. Preserve changes made by others and accommodate
existing work. This ownership applies while executing this task; related files
may be owned by subsequent tasks later. Coordinate overlapping edits rather than
reverting them.

## Work

Implement GET /workshops, GET /workshops/:id, GET /workshops/:id/my-registration, organizer GET /workshops/:id/registrations, and PATCH /registrations/:id. Use demo identity from the client and server-owned role/ownership checks; do not accept a role supplied by the client.
PATCH confirm/cancel atomically validates expectedVersion, transition, authorization, and capacity, then increments version. Return stable error codes. All server counters use confirmed registrations only and reads expose internally consistent snapshots. Keep capacity validation and update in one transaction.
Use seed data to test cancellation, confirmation, stale writes, and unauthorized direct API calls. Exercise real concurrent HTTP requests against an isolated database, including two distinct waitlisted rows competing for the last seat. Do not infer race safety from sequential tests.

## Acceptance

AC-05 and AC-11 pass through real API requests; AC-14 verifies participant rejection for confirm and another user's cancellation. Confirmed cancellation releases a seat; waitlisted cancellation does not. Concurrent distinct-row confirmation cannot overbook. Role/version/business rejections cause no write. Counters and returned versions are correct.

## Boundaries

POST registration belongs to task 06. Do not mark initial participant last-seat AC-02 complete from organizer-only tests.

## Handoff

Write tasks/results/02.md with the implemented scope, exact checks and outcomes,
AC coverage, limitations, and the next task. Update this task status only to reflect
actual completion. Do not invent a commit hash for an uncommitted working tree;
record that state and the file scope. No additional features are authorized by
this task card.
