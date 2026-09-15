# Praktika — interface direction

User-authorized redesign, 2026-09-15. Public Russian name: «Практика».
The repository and technical project name remain Workshop Desk.

## Contract

Outcome: a coherent minimal workshop catalog and matching participant/organizer
screens, inspired by the requested Square reference. White surfaces, graphite
primary actions, blue secondary links, restrained subject panels, clear typography
and consistent spacing. Workshop names describe content; availability is metadata.

Scope: stylesheet, presentation markup/copy, HTML metadata and seeded workshop
wording. No dependencies, new product features, hosting or schema changes. Local
runtime and all FR/INV behavior remain in scope. Preserve registration data,
conditional mutations, operation guards, form tokens, visible errors and labels.

Owner: parent integration. Existing explicit user redesign request authorizes these
reversible changes. No new numerical budget was supplied. One coherent direction,
no asset generation or delegation; reserve the final verification phase for type,
existing unit/API checks, build and local HTTP readiness. New functional requirements
or publication require a separate scope decision.

Risk: a visual redesign can affect wrapping and focus visibility even without
changing handlers. Responsive rules cover narrow widths; native form controls and
focus outlines are retained. Appearance remains a subjective user decision.

## Copy

- Проектирование API: contracts, errors and versioning.
- Архитектура React: component boundaries and state ownership.
- Надёжный фронтенд: network errors, repeated requests and races.

Existing database updates match only original seeded titles/descriptions and leave
registrations, capacity and times untouched. Fresh seeds use the same wording.

## Evidence

`npm run check`, 7 existing unit tests, 16 existing HTTP/SQLite tests and
`npm run build` passed after the redesign. The existing runtime browser assertion
was updated to the new page title. Browser interaction/visual QA was not rerun in
this redesign turn; earlier acceptance evidence describes the functional baseline.
No claim of a new full browser acceptance run is made.
