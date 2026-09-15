# WD-01 — Runtime and persistent bootstrap

Status: DONE. Executor: Luna MAX; parent integration verification.
Dependencies: none.
Normative source: [PROJECT_SPEC.md](../docs/PROJECT_SPEC.md) v0.3 — Sections 4, 8, 10, 13.

Read [execution instructions](README.md) and root AGENTS.md before starting.

## Owned Scope

Root package/workspace configuration and lockfile; apps/web startup shell; apps/api startup, database schema, seed/reset; packages/contracts initial entity shapes; README.md, .env.example, AGENTS.md current-state section.

You are not alone in the codebase. Preserve changes made by others and accommodate
existing work. This ownership applies while executing this task; related files
may be owned by subsequent tasks later. Coordinate overlapping edits rather than
reverting them.

## Work

Create the TypeScript/npm workspaces, a React shell, Node API, and SQLite storage. Choose the smallest compatible HTTP/query/test tooling after checking current primary documentation. Pin runtime and dependency versions; record only material choices in docs/architecture.md.
Provide db:setup, idempotent db:seed, explicit demo:reset, dev, and check. One dev command starts web and API and stops both cleanly. Implement GET /health with database readiness. Create the specified users/workshops/registrations and an organizer scenario with spare capacity independent of cancellation. Use real storage from the beginning.
Add meaningful isolated database checks for schema uniqueness, seed idempotence, and restart persistence. Establish the test:integration entry point for the API; do not create fake passing scripts for absent suites. README distinguishes working commands from remaining deliverables.

## Acceptance

From a clean dependency installation, setup/seed/dev works without secrets or required .env. Open the shell and check API health. Verify a second seed preserves a changed test fixture, restart preserves data, and explicit reset restores the dataset in an isolated test database. Verify graceful stop and a clear port-conflict error. Report the actual browser/API addresses and SQLite path.

## Boundaries

No business mutation UI, presentation content, synthetic regressions, custom reviewer, or dependency framework beyond what startup requires.

## Handoff

Write tasks/results/01.md with the implemented scope, exact checks and outcomes,
AC coverage, limitations, and the next task. Update this task status only to reflect
actual completion. Do not invent a commit hash for an uncommitted working tree;
record that state and the file scope. No additional features are authorized by
this task card.
