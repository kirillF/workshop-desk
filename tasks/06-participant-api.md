# WD-06 — Participant creation and re-registration API

Status: DONE. Executor: Luna MAX; parent integration fixes and verification.
Dependencies: WD-05.
Normative source: [PROJECT_SPEC.md](../docs/PROJECT_SPEC.md) v0.3 — FR-01–04, FR-06; INV-01–03, INV-06–07; AC-02, AC-04, AC-06–07, AC-14, AC-20; Section 9.

Read [execution instructions](README.md) and root AGENTS.md before starting.

## Owned Scope

apps/api POST registration; packages/contracts request validation; tests/integration participant scenarios; relevant API documentation.

You are not alone in the codebase. Preserve changes made by others and accommodate
existing work. This ownership applies while executing this task; related files
may be owned by subsequent tasks later. Coordinate overlapping edits rather than
reverting them.

## Work

Implement POST /workshops/:id/registrations with required expectedVersion null/integer. Absence means no row exists; re-registration requires the cancelled row and matching version. Existing active rows return ALREADY_REGISTERED; other expected-state mismatches return VERSION_CONFLICT. Preserve identity and authorization authority on the server.
Validate name/comment and explicit seat/waitlist mode. Capacity/version/uniqueness/transition changes are atomic. Explicit waiting-list intent stays waitlisted even if capacity has become available. Cancelled rows are retained and versions advance, so a delayed initial POST cannot reactivate a later cancelled row.
Test actual concurrent participant requests for one remaining seat and repeated requests for the same pair. Extend coverage to a delayed initial POST after creation/cancellation and stale re-registration versions.

## Acceptance

AC-02 passes through concurrent participant HTTP calls; no overbooking. API portions of AC-04, AC-06, AC-07, AC-14, AC-20 pass. Validate field limits on the server. Initial version is 1; re-registration reuses its row and advances version. Every rejected command leaves state unchanged. Existing organizer contract checks remain passing where shared code changed.

## Boundaries

No participant screens in this task, new statuses, queue promotion policy, or duplicate client seat calculations.

## Handoff

Write tasks/results/06.md with the implemented scope, exact checks and outcomes,
AC coverage, limitations, and the next task. Update this task status only to reflect
actual completion. Do not invent a commit hash for an uncommitted working tree;
record that state and the file scope. No additional features are authorized by
this task card.
