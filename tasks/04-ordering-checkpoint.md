# WD-04 — Deterministic ordering and organizer checkpoint

Status: DONE. Executor: Luna MAX; parent integration fixes and verification.
Dependencies: WD-03.
Normative source: [PROJECT_SPEC.md](../docs/PROJECT_SPEC.md) v0.3 — FR-05, FR-07; INV-05, INV-08; AC-08–09, AC-11, AC-13, AC-17; Sections 10, 13.

Read [execution instructions](README.md) and root AGENTS.md before starting.

## Owned Scope

Minimal test-mode hooks in apps/api and web test adapters if necessary; scenario runner; tests/e2e organizer scenarios; browser setup instructions and scoped evidence.

You are not alone in the codebase. Preserve changes made by others and accommodate
existing work. This ownership applies while executing this task; related files
may be owned by subsequent tasks later. Coordinate overlapping edits rather than
reverting them.

## Work

Implement the minimal controls needed to hold/reject commands before processing, hold or lose a response after commit, hold an earlier read response, and release events explicitly. Isolate control routes behind explicit test/demo mode. Use operation/event identifiers and readiness barriers; no random sleeps or general scheduling panel.
Create browser checks using the real API and isolated SQLite. Inspect row state before reconciliation, then release the final read and inspect rows/counters again. Exercise both A/B outcome orders, the quiescent stale-read boundary, and old-context callbacks. Match AC-08 capacity preconditions so independent confirmation is valid.
Provide documented commands to run the organizer interaction and ordered checks. Implement test:e2e and document browser installation. Keep the baseline correct; neither planted bugs nor speaker diagnoses belong in these product tasks.

## Acceptance

AC-08 and AC-09 pass with intermediate assertions before reconciliation. AC-13 passes when an older response arrives after the authoritative reconciliation. AC-17 passes within organizer scope. AC-11 additionally checks that the losing client receives a version conflict and refreshes its displayed state. Normal mode has no control routes. Scenario logs identify arrival, outcome, and response order. A developer can launch and exercise the organizer slice from README with no conversation context.

## Boundaries

No full-product completion claim, artificial partial fixes, speaker answers, paid review runs, or expanded fault-control UI.

## Handoff

Write tasks/results/04.md with the implemented scope, exact checks and outcomes,
AC coverage, limitations, and the next task. Update this task status only to reflect
actual completion. Do not invent a commit hash for an uncommitted working tree;
record that state and the file scope. No additional features are authorized by
this task card.
