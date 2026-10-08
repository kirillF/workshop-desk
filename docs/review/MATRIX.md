# A/B/C review matrix

Run each review variant on each of the three changes: nine reviews and fifteen fresh model sessions.
A uses the generic procedure and repository context. B adds the PR description.
C adds two focused investigations and candidate verification to B's plain-text
input. It retains the compact final report and records all candidate dispositions. A uses the same input formatting without the PR description. All are custom
`codex exec` runs; this batch does not include the built-in review command.

| Case    | Head branch                  | Variants |
| ------- | ---------------------------- | -------- |
| Filters | `demo/pr-filters`             | A, B, C  |
| Edit    | `demo/pr-edit`                | A, B, C  |
| GET     | `demo/pr-get`                 | A, B, C  |

The base is `main`. Each branch adds one feature change to the same project,
agent instructions, reviewer prompts and runner. The feature diffs, tests,
requirements and neutral PR descriptions match the original demo changes.
The runner freezes the current review instructions for each new batch; earlier batches
retain their own instructions. New runs use plain-text scope and check sections,
including A/B. C uses discovery-specific instructions with the same factual context and the compact report
described in REVIEWING.md. The earlier branches and result directories are retained.
The optional worktree setup is documented in [Demo PRs](../DEMO_PRS.md).

## Run from your terminal

```sh
cd ~/devel/workshop-desk
export PATH="/opt/homebrew/bin:$PATH"
export WORKSHOP_REVIEW_MODEL=gpt-6-sol
export WORKSHOP_REVIEW_EFFORT=medium
export WORKSHOP_REVIEW_CONCURRENCY=3

# Validate nine inputs and fifteen stage prompts and resolve branches. No model requests.
node scripts/review/matrix.mjs plan

# Optional: all three source snapshots, environment and project checks only.
node scripts/review/matrix.mjs preflight

# Run all nine reviews with up to three concurrent worker processes.
# Each job includes its own preflight.
node scripts/review/matrix.mjs run
```

Each invocation creates a new timestamped directory under `.review-runs` and prints
its path. To name it yourself, append a **new** path to `run` or `preflight`.
Existing output directories are never reused. The default concurrency is 3; set
`WORKSHOP_REVIEW_CONCURRENCY` to 1 for sequential execution, or 2–9 to change the limit.
Each active review runs in a separate Node process with its own checkout, writable
scratch/cache directories, output and fresh model sessions. Processes share no
conversation or results. They use the same frozen harness, dependencies, model,
effort and timeout. C still runs its three internal stages sequentially;
verification starts only after both investigations finish.

The batch stops dispatching jobs on the first failure or interruption, cancels
all active workers, waits for their owned reviewer/test processes to stop, and retains
all completed and failed artifacts; it does not retry models or launch fix agents.
The model-execution timeout is 15 minutes per review. C shares that limit across
three stages (35% / 35% / 30%); no repeat trials are scheduled.

The batch resolves all branches once and copies the current instructions, schemas
and runner into its output directory before starting. It also copies the installed
dependencies once; later package installations in the working project do not alter
the remaining variants. All variants within one case
therefore receive the same base/head, documents, dependencies and supplied checks.
C uses fresh sequential sessions over its read-only snapshot, clears writable
state between stages, and shares candidate and negative-check reports only with verification. New runs use
`focused-v3-expectation-gate`; the compact report/check fields and session count are
unchanged. The runtime verifier schema constrains disposition IDs to actual candidates.
Independent snapshots contain only those revisions; memory, author conversations,
previous outputs and prepared fixes are excluded by the existing runner controls.

## Inspect the output

```text
matrix.json                 branches/revisions, hashes, settings, concurrency, PIDs and status
workers/                    separate stdout/stderr logs for each worker
inputs/                     frozen per-case input
harness/                    frozen runner, instructions, schemas and dependencies
filters-A/ ... filters-C/
edit-A/    ... edit-C/
get-A/     ... get-C/
```

A/B write `result.txt`; C writes `result.json`. Every run preserves `prompt.txt`,
`trace.jsonl`, checks, configuration, metadata and validation. Every variant rejects missing/empty reports and incomplete or malformed execution
traces. C additionally validates JSON structure, unique IDs and finding locations. C also records `checks.json`, `candidates.json`, `dispositions.json` and exact per-stage
artifacts under `stages/`. All three stages and their candidate-to-result mappings
must validate. Tool executions remain in the trace; prose evidence still needs engineer assessment. These checks do not
establish the completeness or correctness of findings.
The matrix intentionally contains no answer key, known-defect hints or success
criterion based on a minimum number of findings.

The runtime correction disables login-shell startup and checks Node/npm/Git through
a non-login shell before model execution. Preflight runs type checks, unit and
component tests. API integration/E2E checks requiring ports remain outside this
sandbox and are not claimed as passed by this batch.

Treat previous runs as historical: the environment and root instruction presence
have been corrected. Compare variants within this new batch; a single trial per
case is a diagnostic exercise, not a statistically stable ranking. C now uses more
model calls than B. A comparison of specialization should also include repeated
ordinary reviews at a comparable total inference budget.

Concurrent jobs share machine resources and API rate limits. Reduce concurrency
if CPU/RAM contention or rate limits cause failures. Parallel elapsed times are
not directly comparable to earlier sequential timings.

Ctrl+C cancels all active workers and their reviewer/preflight process groups,
records interrupted statuses and leaves queued jobs pending. Timeouts and startup failures also stop the
batch. A failed preparation has a failed manifest, including when no reviewer ran.
Choose a new output directory for a new attempt; this command does not resume or
silently rerun previous work.
