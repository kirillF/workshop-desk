# Organizer registration filters

This amendment extends the organizer list in PROJECT_SPEC.md. Search matches the
registration name or account display name, case-insensitively, after trimming the
query. Status and name filters combine with AND. Filtering is local to the selected
workshop; switching to another workshop displays its unfiltered list. Refreshing the
same workshop keeps the selected filters.

Returning from the existing participant preview keeps the organizer's search and
status filters while registrations are refreshed. Only Reset or a workshop switch
clears them.

Workshop capacity, confirmed/waitlisted totals and available seats describe the whole
workshop. A separate “found X of Y” count describes the visible registrations.
Distinguish an empty workshop from no matching results. Reset clears both filters.

Commands keep the existing authorization, version checks and operation lifecycle.
Rows may leave the filtered list during optimistic updates. Pending feedback and
server rejection messages must remain visible even for hidden rows. Unknown outcomes
remain in the existing independent recovery panel; filtering must never dismiss a
guard or imply that a command succeeded.

## Verification

Acceptance scenarios are exercised in tests/components/organizer-filters.test.tsx and tests/e2e/acceptance.spec.mjs.
Run `npm run check`, `npm run lint`, `npm run format:check`, `npm test`,
`npm run test:coverage`, `npm run build` and `npm run test:e2e`.
Browser tests use isolated fixture databases; do not reset the working demo database.
