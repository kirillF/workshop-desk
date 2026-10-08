# Workshop Desk — Agent Instructions

## Current State

WD-01–08 and the WD-09–12 authentication/preview amendment are implemented. Read README.md for startup, docs/architecture.md for
component boundaries, and docs/acceptance.md for actual AC evidence and limits.
Read the current Git revision and working tree before changing code. Do not infer
exhaustive correctness from green tests.

## Sources and Scope

Use docs/PROJECT_SPEC.md as the normative baseline and docs/AUTH_SPEC.md as the
approved authentication/preview amendment. The amendment takes precedence for
identity, session and preview behavior; see tasks/09–12 for current execution. Refer to stable FR, INV,
and AC identifiers instead of copying their definitions into other documents.
Distinguish required behavior from the selected implementation policies.
The project author owns unresolved product intent and contract changes.

Keep all project documentation in English. Preserve unrelated work. Do not add
features or infrastructure merely to make review more elaborate. Keep changes within the requested product scope and rerun affected checks.

## Evidence and Working Practices

Before changing behavior, identify the relevant requirement, actual implementation,
and affected consumers. Treat code-derived properties as hypotheses unless their
source supports them. When sources conflict, state the concrete decision needed;
do not silently weaken assertions or rewrite intent to match code.

As implementation becomes available, add verified setup/check commands to README
and link actual enforcement and tests from the product documentation. Add local
AGENTS.md files only when a component has distinct instructions. Tests must use
isolated data and must not reset working demo data.

Report the revision, checks run, actual results, and unresolved limitations for
material changes. A successful tool run or an absence of findings is not a claim
of complete correctness. Use existing review-tool context mechanisms when selected;
check their applicability instead of assuming a file was loaded.

## Review workflow

Use docs/REVIEWING.md for the shared A/B/C runner, source references, evidence
validation and engineer-approved fix handoffs. docs/review/ is the canonical
instruction and schema directory. Requirements retain the precedence above.
Saved review runs are historical evidence, not reviewer input.

## Implementation Boundaries

Use React + TypeScript + Vite and the existing npm workspaces. Application
composition belongs in apps/web/src/app; domain UI and lifecycle ownership belong
in features; shared modules must not import features or app. Keep mutation outcome
and stale-response guards in registrations/model, session ownership in auth/model,
and read-only preview generations in participant-preview/model.

API modules own auth, workshops and registration commands/projections. Shared HTTP
and database modules must not depend on route composition. Keep capacity, ownership,
version checks and writes inside the same transaction. Do not introduce a generic
framework, state library or runtime dependency without a concrete requirement.

Run npm run check, npm run lint and npm run format:check. Select meaningful test
layers using docs/TESTING.md, and run the full regression/coverage/build gates for
cross-cutting changes. Never weaken a test or coverage threshold to accommodate
refactoring. Report separate coverage denominators; E2E counts are not coverage.
