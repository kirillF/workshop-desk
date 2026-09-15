# WD-03 — Organizer UI and scoped operation layer

Status: DONE. Executor: Luna MAX; parent integration fixes and verification.
Dependencies: WD-02.
Normative source: [PROJECT_SPEC.md](../docs/PROJECT_SPEC.md) v0.3 — FR-04–05, FR-07; CP-01; AC-05, AC-10, AC-17 in organizer scope; Section 3.

Read [execution instructions](README.md) and root AGENTS.md before starting.

## Owned Scope

apps/web organizer screen, API client, cache/operation state, identity/context handling; web unit/component tests; frontend documentation where needed.

You are not alone in the codebase. Preserve changes made by others and accommodate
existing work. This ownership applies while executing this task; related files
may be owned by subsequent tasks later. Coordinate overlapping edits rather than
reverting them.

## Work

Build the organizer screen against the real API: workshop selection, participant rows, counters, confirm/cancel actions, cancellation confirmation, pending states, and local errors. Keep UI copy Russian and documentation English. Handle loading/empty/error states and keyboard use.
Implement the shared logical-key operation layer and client operation/context identifiers from CP-01. Every control uses it; independent rows remain operable. Apply optimistic changes at the appropriate scope and synchronize projections from the server. Treat old read generations and late callbacks according to FR-07 and Section 3.
Implement known success/rejection behavior. On ambiguous network failure, display unknown state and retain the guard; do not present refresh as an operation receipt. Explicit continuation and reload recovery are completed in task 05. Document this intermediate limitation rather than offering an unsafe retry.
Use an actual second UI entry point only if useful; otherwise verify shared-layer double invocation in a focused component/integration test rather than inventing a screen solely for AC-10.

## Acceptance

Through the browser, load a workshop, confirm/cancel rows, and observe persistence after reload. Pending one row does not disable unrelated rows. Shared-layer duplicate invocation sends one command. A late response scoped to an old identity/workshop cannot update the new interaction. Run relevant component checks and task 02 API checks only where affected.

## Boundaries

No catalog, participant booking form, general state-management framework, or claims that full unknown-outcome acceptance passes.

## Handoff

Write tasks/results/03.md with the implemented scope, exact checks and outcomes,
AC coverage, limitations, and the next task. Update this task status only to reflect
actual completion. Do not invent a commit hash for an uncommitted working tree;
record that state and the file scope. No additional features are authorized by
this task card.
