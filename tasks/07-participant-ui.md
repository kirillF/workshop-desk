# WD-07 — Participant UI and full functional flows

Status: DONE. Executor: Luna MAX; parent integration fixes and verification.
Dependencies: WD-06.
Normative source: [PROJECT_SPEC.md](../docs/PROJECT_SPEC.md) v0.3 — FR-01–07; AC-01, AC-03–04, AC-06–07, AC-15–17, AC-20–21 in participant scope; Sections 3, 13.

Read [execution instructions](README.md) and root AGENTS.md before starting.

## Owned Scope

apps/web catalog/detail/registration form and shared operation integration; participant browser/component tests; README user flow documentation.

You are not alone in the codebase. Preserve changes made by others and accommodate
existing work. This ownership applies while executing this task; related files
may be owned by subsequent tasks later. Coordinate overlapping edits rather than
reverting them.

## Work

Build catalog and details with server-owned counters and current-user registration state. Implement validated name/comment entry, seat booking, explicit waiting-list action after capacity conflict, own cancellation, and re-registration. Preserve input after failure; automatic reset occurs only on success, with explicit dismissal supported.
Use the shared key before a Registration ID exists. Integrate unknown-outcome continuation and descriptor recovery from task 05 rather than adding a separate mutation path. Fence late responses across identity/workshop/form interaction changes.
Provide narrow/wide layouts, keyboard labels/focus/error behavior, loading/empty/retry states. Use server counters; do not add redundant business counting. Complete all user flows through UI, including direct access restrictions and recovery.

## Acceptance

AC-01, AC-03, AC-04, AC-06, AC-07 pass through UI. AC-15–17 cover invalid fields, failed initial reads, keyboard navigation, widths, and stale interactions. Participant parts of AC-20/21 pass. Unknown outcomes do not silently clear drafts or retry commands. Confirmed/waitlisted/cancelled counts and states remain consistent across screens after the defined boundary.

## Boundaries

No scheduling editor, authentication service, FIFO requirement, external integrations, or presentation-specific screens.

## Handoff

Write tasks/results/07.md with the implemented scope, exact checks and outcomes,
AC coverage, limitations, and the next task. Update this task status only to reflect
actual completion. Do not invent a commit hash for an uncommitted working tree;
record that state and the file scope. No additional features are authorized by
this task card.
