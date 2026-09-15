# WD-05 — Unknown outcomes and safe continuation

Status: DONE. Executor: Luna MAX; parent integration fixes and verification.
Dependencies: WD-04.
Normative source: [PROJECT_SPEC.md](../docs/PROJECT_SPEC.md) v0.3 — FR-06–07; CP-01; INV-06, INV-08; AC-12, AC-18–19, AC-21; Stage A.

Read [execution instructions](README.md) and root AGENTS.md before starting.

## Owned Scope

apps/web operation state, explicit continuation and per-tab descriptor persistence; existing scenario controls; organizer browser/component tests; product/architecture enforcement links.

You are not alone in the codebase. Preserve changes made by others and accommodate
existing work. This ownership applies while executing this task; related files
may be owned by subsequent tasks later. Coordinate overlapping edits rather than
reverting them.

## Work

Complete FR-06 exactly: separate current snapshots from historical command outcomes; retain the unknown guard; require a successful refresh and explicit Continue from current state before another user-selected command. Do not automatically retry. Use refreshed expectedVersion and keep prior callbacks from touching the new operation.
Persist only the per-tab operation descriptors required by the specification, not form contents. Reload maps pending to unknown. Identity changes preserve originating guards; returning to a context refetches state. Known matching late responses may resolve an operation before continuation; after continuation they cannot undo new work.
Use the harness for timeout before commit, GET before commit, lost response after commit, refresh failure, and competing old/new commands. Exercise another client's write between the original command and a read: displayed state is not proof of the original command history.
Complete Stage A without building an operation receipt service or claiming exactly-once execution.

## Acceptance

Organizer AC-12, AC-18, AC-19, AC-21 pass. GET before commit does not declare rejection/completion. Refresh failure does not enable continuation. At most one command against the same row version commits. Reload preserves the unknown workflow and no automatic resend occurs. Re-run affected ordering/context checks. Record Stage A coverage and explicitly exclude participant-only acceptance.

## Boundaries

No server operation-history resource, transparent retry/idempotency platform, or silent removal of the explicit-continuation requirement.

## Handoff

Write tasks/results/05.md with the implemented scope, exact checks and outcomes,
AC coverage, limitations, and the next task. Update this task status only to reflect
actual completion. Do not invent a commit hash for an uncommitted working tree;
record that state and the file scope. No additional features are authorized by
this task card.
