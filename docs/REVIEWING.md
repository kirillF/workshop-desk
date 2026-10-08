# Reviewing changes

## One workflow, three variants

| Variant | Input and procedure                                                          | Result                                                                          |
| ------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A       | Shared generic review, repository instructions and relevant source documents | Concise findings and limitations                                                |
| B       | A plus the complete, neutral PR description                                  | Same report format; intent and scope are reviewed explicitly                    |
| C       | B's input; two focused investigations followed by candidate verification     | Verified proposals, requirements questions, follow-ups and a disposition ledger |

C uses the same neutral context as B, with separate instructions for semantics,
implementation/test assumptions, and verification. It does not contain known-defect
hints or require runtime reproduction for every finding. Each investigation gets a
fresh session and cannot see the other's conclusions. Verification checks all
candidates against source and records supported/disproved/unresolved dispositions.
The verifier distinguishes documented or inferred obligations from unresolved intent
and unsupported preferences. Validation rejects findings that the verifier itself
marks as dependent on unresolved intent; it does not adjudicate whether its source
interpretation is correct. Material intent decisions remain requirements questions.
See [C workflow](review/C-structured-review.md) for the exact stages and artifacts.
A valid report is not a completeness certificate.

`docs/review/` owns the instructions and schemas. `scripts/review/` owns execution,
validation and handoff. Saved prompts and results are records of earlier
procedures, not the configuration for new runs.

## Prepare and run

Requires the repository's Node/npm versions, installed dependencies and Codex CLI
0.160.0 with permission profiles. The native sandbox was checked on macOS. Other
hosts must pass the same preflight; the runner never falls back to unrestricted
execution. This is a custom `codex exec` workflow, not the built-in `codex review`.

From the project root, start with a neutral input. The examples refer to existing
demo branches; branch names are resolved to commits before execution. Only committed
changes are reviewed. Uncommitted work and the author's conversation are excluded.
For another PR, edit a copy of an example and select its base/head and requirements.
The runner refuses blank PR descriptions for B/C.

```sh
export WORKSHOP_REVIEW_MODEL=gpt-6-sol
export WORKSHOP_REVIEW_EFFORT=medium

# Environment checks only: no model request.
npm run review:preflight -- C docs/review/examples/get.json . .review-runs/get-preflight-01

# Run yourself from a fresh terminal. Always choose a new output directory.
npm run review:local -- C docs/review/examples/get.json . .review-runs/get-c-01
npm run review:validate -- .review-runs/get-c-01
```

Use `edit.json` or `filters.json` for the other cases. Replace `C` with `A` or `B`
for the same execution environment and scope. A ignores the PR description.
Do not compare different model settings or source revisions as a test of prompting.
When source is another checkout, the optional final argument is the checkout whose
installed dependencies should be copied. Keep dependencies compatible with its lockfile.

To inspect a prepared prompt without launching anything:

```sh
npm run --silent review:compose -- C docs/review/examples/get.json
```

B and C use one plain-text formatter for scope, PR description, context-document
paths and supplied checks. C uses separate discovery instructions and a focused instruction per stage; verification
also receives candidates and negative check evidence as readable text. A uses the same formatter without
the PR description. JSON input files are runner configuration and archived evidence.
The compact final output schema is unchanged: finding ID, priority, title, location,
body and proposed follow-ups, plus requirements questions and limitations.

Use `review:compose -- C input.json semantics` (the default), `implementation`, or
`verification` to preview a stage. Verification's candidate section is populated at
runtime; a preview is not its final input. Actual stage prompts are saved before
execution. C always uses the focused flow; A and B still use one session each.

The actual run saves `prompt.txt`, resolved `input.json`, `output.schema.json`,
permissions, exact CLI arguments, model/effort, runtime version, source fingerprint and preflight
logs. Read these when explaining what the reviewer actually received. Normal CLI
system instructions still exist. A/B `prompt.txt` is the supplied user prompt; C's
root prompt is the verifier input, and each stage has its own exact `prompt.txt`.
`trace.jsonl` for C combines the original traces with `reviewStage` labels; stage
traces are also preserved unchanged. Candidate reports are not sent to the second
investigation. All model sessions use the selected model and effort.

Model execution has a 15-minute time limit, excluding preflight. C allocates 35%
to each investigation and reserves 30% for verification; stages run sequentially. Override it explicitly with
`WORKSHOP_REVIEW_TIMEOUT_SECONDS` if needed. Completed runs record total wall time
and CLI-reported token usage (or null when unavailable). C records usage per stage and in aggregate. There are no automatic
retries or passes beyond its three declared stages. Failed runs retain their evidence.

## Full matrix: A/B/C on Filters, Edit and GET

Use [MATRIX.md](review/MATRIX.md) for the nine-run CLI batch. It freezes all three
base/head pairs and the harness before starting. The prepared Filters/Edit branches
restore the baseline agent instructions; feature code and requirements are unchanged.

## Validate on unseen changes

Use [the held-out workflow](review/HELDOUT.md) before claiming a harness revision
transfers beyond Filters, Edit and GET. It prepares neutral paired changes, freezes
B/C settings, keeps oracle tests outside reviewer access, and scores engineer-judged
results separately from schema validation. `review:eval` never starts model calls
unless its `run` command is explicitly selected.

## Execution boundary

The runner creates a standalone checkout containing only the selected base/head
snapshots and a copied dependency tree. It has no remote, shared Git object store
or references to prepared fixes. Repository files are read-only to review commands.
Scratch, test caches and generated output directories are writable. For C, every
permitted writable directory is cleared before each session; temporary reproductions
are archived outside the reviewer-readable snapshot. Preflight
checks actual isolation, Node/npm and Git availability, type checks, unit tests and
component tests through a non-login shell in that same sandbox. Login shells are
disabled for reviewer tools; PATH and Git configuration are pinned for both routes. Failure stops the run before a model request.

Memory, external memory import, plugins, apps, hooks, subagents, user configuration
and rule loading are disabled. Automatic AGENTS loading is disabled to avoid parent
or global instructions; the shared prompt requires the reviewer to read applicable
AGENTS files inside the selected snapshot. The source repository, previous results
and sibling worktrees are outside the tool-readable boundary. System runtime files
remain readable. These are controls on available context, not proof of unbiased
reasoning or a general-purpose containment system for hostile repositories.

Tool network access is disabled. API integration/E2E checks needing local ports are
not part of this review preflight. Report that limitation; use the normal fix
verification environment for those layers. The CLI itself still needs its configured
model service. Test data must remain isolated from the running demo database.

## What validation establishes

All variants require a non-empty result, valid JSONL trace and a completed review
turn. Missing artifacts, failed or interrupted execution and changed source fail
validation. Ctrl+C and timeouts stop the owned reviewer process group.

C validates the compact JSON shape, unique finding IDs, and source locations against
the recorded diff and file bounds. Artifact hashes and the source fingerprint are
rechecked before handoff. C additionally requires three successful stage traces,
valid check locations, a complete disposition ledger and final findings linked
to supported candidates. Duplicates may share a final finding. Unresolved candidates
remain visible rather than being silently removed. Missing or malformed stages stop
the workflow. `trace.jsonl` is the record of reviewer tool executions;
preflight checks have their own logs. The model records concise expectations and evidence. These are not independently
validated source quotations or execution proofs.

New runs use `focused-v3-expectation-gate`: discovery retains suspected and unresolved checks before
final-comment filtering. `checks.json` records relevant counterexamples and unverified
areas; `candidates.json` and `dispositions.json` expose later filtering. Verification
can audit the scope of negative conclusions, add evidence-backed candidates, and
consolidate questions through explicit links. Existing v1/v2/v3/efficient artifact validation
remains supported. The efficient revision removes duplicate verifier instructions and
uses targeted source reads, existing preflight evidence and optional stage-local notes.
Exploratory checks also challenge undocumented assumptions and affected existing
behavior; a spec citation is not mandatory for an evidence-backed regression.
See [C efficiency and memory](review/C-EFFICIENCY.md) for boundaries and evaluation.

Historical C reports use their saved output schema and workflow version. Their source quotations and
execution claims still receive the original provenance checks; they are not silently
converted to the compact format.

For new C reports, prose claims about requirements, causality or runtime reproduction
are **not** machine-validated. Check them against the actual source and trace. A valid
JSON report does not establish that a defect exists, a test reproduces it, or the
review is complete. An engineer still assesses reachability, impact, source precedence,
duplicate comments and false positives. The focused workflow spends more inference than B; its additional detection value
and filtering errors must be evaluated on fresh runs and correct controls.

## Close the feedback loop

1. Read the actual result and verify a useful comment against its sources and scenario.
2. Record a decision using `docs/review/decision.example.json`. Fill the exact reviewed
   head, result file SHA-256, accepted finding IDs, reason, change scope, behavior to
   preserve and acceptance conditions. Resolve product ambiguity before changing intent.
3. Generate the handoff from the validated report and that decision:

```sh
npm run review:handoff -- .review-runs/get-c-01 decision.json .review-runs/get-fix-task-01
```

4. Give its `prompt.txt` to a separate coding session in a new fix branch/worktree
   starting at the recorded reviewed head. The task includes the actual findings and
   engineer decision. For focused runs it also includes `supportingCandidates` mapped
   to the selected findings, retaining distinct scenarios even when comments merged.
   Its evidence hashes bind the task to the validated candidate and disposition files.
   The coding agent must cover each distinct trigger within the accepted scope.
   A passing diagnostic that asserts the bug must be converted to expected-behavior
   assertions before becoming a regression. Record the behavioral failure before the
   correction, the same regression passing afterward, and nearby valid behavior.
5. Inspect the patch and run verification in the fix checkout:

```sh
npm run review:verify -- /absolute/path/to/fix-worktree .review-runs/get-fix-verification-01
```

Every verification creates a new directory and records the tested commit, working
file fingerprint, commands, results and timestamps. It never replaces historical
logs. The full gate includes static checks, tests, coverage, build and browser E2E.
Install the browser beforehand; these checks may bind local test ports. The source
fingerprint excludes the untracked presentation directory; its exclusion is recorded.

6. Update the appropriate project source: clarify an ambiguous requirement; correct
   contradictory documentation; encode a stable invariant in a meaningful test or
   deterministic check. Change AGENTS only for a reusable working rule. Do not weaken
   a valid requirement or write a diagnosis into generic reviewer instructions.
7. Add the defective change and a correct control to reviewer evaluation. Re-reviewing
   this same known example is a regression check, not evidence of transfer to new PRs.
   See [Evaluation](review/EVALUATION.md).

Nothing in this flow automatically accepts a finding, edits product code, launches
a fix agent, commits or merges. The handoff requires the engineer's recorded decision.
