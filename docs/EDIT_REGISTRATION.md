# Edit participant registration

A participant can change the attendee name and comment of their own active registration without cancelling it. Existing name/comment limits apply. PATCH /registrations/:id accepts action=edit, expectedVersion and the new fields.

Editing preserves registration identity, status and occupied capacity, including on a full workshop or a waitlisted registration with spare capacity. It increments the row version. Cancelled registrations cannot be edited. Stale versions are rejected without a write. Only the owning participant may edit; organizer editing is outside this change. Preview writes remain forbidden.

The form keeps the version observed when opened, retains inputs after a definitive failure and uses existing unknown-outcome handling. Explicit close discards the draft. This amendment extends FR-01 and the API contract; other requirements remain in force.

## Verification

Acceptance scenarios are exercised in tests/components/registration-form.test.tsx, tests/integration/organizer.test.mjs and tests/e2e/acceptance.spec.mjs.
Run `npm run check`, `npm run lint`, `npm run format:check`, `npm test`,
`npm run test:coverage`, `npm run build` and `npm run test:e2e`.
Browser tests use isolated fixture databases; do not reset the working demo database.
