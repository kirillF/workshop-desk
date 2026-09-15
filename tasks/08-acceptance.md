# WD-08 — Clean-checkout release and acceptance

Status: DONE. Executor: Luna MAX; parent integration fixes and verification.
Dependencies: WD-07.
Normative source: [PROJECT_SPEC.md](../docs/PROJECT_SPEC.md) v0.3 — All AC-01–21; Product Definition of Done; Sections 12–14.

Read [execution instructions](README.md) and root AGENTS.md before starting.

## Owned Scope

Root build/start/check/test scripts and lockfile; isolated acceptance setup; README/AGENTS/docs/architecture and source-to-check links; only necessary fixes in existing components.

You are not alone in the codebase. Preserve changes made by others and accommodate
existing work. This ownership applies while executing this task; related files
may be owned by subsequent tasks later. Coordinate overlapping edits rather than
reverting them.

## Work

Complete build and start for compiled frontend/API, alongside dev. Ensure all specified commands exist and do the documented work. Check dependency installation from a clean checkout or isolated copy, document prerequisites, addresses, database location, optional settings, browser setup, stop behavior, and reset behavior.
Audit the AC map in tasks/README.md and replace planned evidence with actual test names/results in tasks/results/08.md. Run the appropriate complete type/static, unit/component, API integration, and browser suites separately. Do not treat a written report as a passing suite.
Check seed idempotence, persistence, explicit reset, test database isolation, normal-mode exclusion of control routes, and offline operation after dependency installation. Ensure root guidance leads to one actual requirement/implementation/consumer/check without preparation-chat context. Add nested instructions only for distinct rules.
Fix defects within scope; report any requirement contradiction rather than quietly weakening it. Product readiness does not certify presentation readiness or AI-review effectiveness.

## Acceptance

All AC-01–21 have actual pass/fail evidence with no missing acceptance hidden by a global green status. Development and built modes both work. No placeholder scripts or endpoints remain. Unknown limitations are stated. The final handoff includes changed files, tests, remaining risks, and exact working launch commands.

## Boundaries

No deployment, commits/pushes/public PRs without separate authorization, model benchmarks, or claims about unperformed AI review.

## Handoff

Write tasks/results/08.md with the implemented scope, exact checks and outcomes,
AC coverage, limitations, and the next task. Update this task status only to reflect
actual completion. Do not invent a commit hash for an uncommitted working tree;
record that state and the file scope. No additional features are authorized by
this task card.
