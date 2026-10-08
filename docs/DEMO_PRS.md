# Demo PRs

The project baseline and shared reviewer configuration are on `main`. Each branch
below adds a single demo change.

| Branch | Change | Review input |
| --- | --- | --- |
| `demo/pr-filters` | Organizer registration search and status filters | [filters.json](review/examples/filters.json) |
| `demo/pr-edit` | Editing an active registration's attendee name and comment | [edit.json](review/examples/edit.json) |
| `demo/pr-get` | Sharing equivalent simultaneous workshop GET requests | [get.json](review/examples/get.json) |

All three branches inherit identical reviewer instructions, schemas and execution
code from their common base. Only the feature change and its accompanying
requirements/tests differ. The input files contain neutral PR descriptions,
context-document paths and branch references, without known-defect hints.

## Inspect a change

```sh
git diff main...demo/pr-filters
git diff main...demo/pr-edit
git diff main...demo/pr-get
```

Optional checkouts for an editor or the application:

```sh
git worktree add ../workshop-desk-demos/pr-filters demo/pr-filters
git worktree add ../workshop-desk-demos/pr-edit demo/pr-edit
git worktree add ../workshop-desk-demos/pr-get demo/pr-get
```

Run `npm ci` in a new checkout, then follow the startup commands in the root README.
Use a separate `WORKSHOP_DB_PATH` when running more than one checkout.

## Reviewer prompts

- A: [Generic review](review/review.md).
- B: A plus [PR context](review/B-pr-context.md).
- C: [Shared context](review/C-common.md), [discovery](review/C-investigate.md),
  [semantics](review/C-semantics.md), [implementation](review/C-implementation.md)
  and [verification](review/C-verification.md).

The runner supplies the same case scope and neutral PR description to B and C.
A receives the scope and project context without a separate PR description.
C's two investigations run in independent sessions; verification receives both
reports and produces [structured output](review/output.schema.json).

Preview the supplied prompt without a model request:

```sh
npm run --silent review:compose -- A docs/review/examples/filters.json
npm run --silent review:compose -- B docs/review/examples/edit.json
npm run --silent review:compose -- C docs/review/examples/get.json semantics
npm run --silent review:compose -- C docs/review/examples/get.json implementation
npm run --silent review:compose -- C docs/review/examples/get.json verification
```

Verification previews have no candidates until the investigations finish.
Actual runs save their exact supplied prompts, resolved revisions and results.

## Run a review

From the main checkout with dependencies and the configured CLI installed:

```sh
export WORKSHOP_REVIEW_MODEL=gpt-6-sol
export WORKSHOP_REVIEW_EFFORT=medium
npm run review:local -- A docs/review/examples/filters.json . .review-runs/filters-a-01
npm run review:local -- B docs/review/examples/edit.json . .review-runs/edit-b-01
npm run review:local -- C docs/review/examples/get.json . .review-runs/get-c-01
```

Each output directory must be new. Use any variant on any of the three inputs.
See [Reviewing](REVIEWING.md) for the execution boundary, validation and fix handoff,
or [Matrix](review/MATRIX.md) for all nine reviews.
