# Validate on changes that did not shape the reviewer

Use this workflow before promoting another C revision. Filters, Edit and GET are
calibration cases: their results have repeatedly influenced our instructions. They
remain useful regression checks, but cannot establish transfer to new changes.

The new runner freezes the review code, prompts, input, source commits, oracle,
model, effort, timeout, variants and repeat count. It calls the existing isolated
review runner. It never passes the oracle, paired control, evaluation metadata or
previous results to the reviewer. Normal project requirements remain available.

## Prepared pilot

The local suite lives in `.review-evals/heldout-pilot-20261007/suite.json`.
Its four snapshots are two new frontend features, each with a defect-bearing
implementation and a correct control:

- Optional catalog ordering by available seats.
- A registration form action that clears the draft comment.

Branches `demo/eval-unseen-p01` through `demo/eval-unseen-p04` are attached under
`~/devel/workshop-desk-demos/eval-unseen-p01` through `eval-unseen-p04`.
The reviewer gets detached snapshots, not these branch names or sibling branches.
The original main checkout is unchanged by the feature implementations.

The suite defaults to **B and C, one repeat: eight reviews**. B and C receive the
same PR description and project documents. C still spends up to three sessions
per review; this is a comparison of the two procedures, not equal inference cost.
A may be added to `variants` before freezing. For repeatability, set `repeats` to
3 before freezing (24 B/C reviews). Decide the batch size before seeing results.
Repeated runs on the same change are not additional independent examples.

These are deliberately small synthetic controls. They test the evaluation
workflow and two defect families, not production representativeness or broad
review quality. Their author also worked on the harness, so case selection is not
independent. The prompts have no case-specific additions. A later acceptance set
should include independently selected real PRs, intentional behavior changes,
undocumented consumer expectations and ambiguous requirements. Split related
changes by defect family; do not put near-identical variants in both partitions.

## Run from your CLI

```sh
cd ~/devel/workshop-desk
export WORKSHOP_REVIEW_MODEL=gpt-6-sol
export WORKSHOP_REVIEW_EFFORT=medium

# Read-only input/ref checks. No model request.
npm run review:eval -- plan .review-evals/heldout-pilot-20261007/suite.json

# A frozen copy is prepared at .review-runs/heldout-pilot-20261007-01.
# Environment checks only; no review model is invoked.
npm run review:eval -- preflight .review-runs/heldout-pilot-20261007-01

# You start the eight reviews. Settings come from the frozen manifest.
npm run review:eval -- run .review-runs/heldout-pilot-20261007-01
```

For a different model, repeat count, or future unseen suite, create a **new** frozen
directory. Changing environment variables after freezing does not change that batch.

```sh
npm run review:eval -- freeze path/to/suite.json .review-runs/heldout-new-01
```

The runner counterbalances B/C ordering, has no automatic retries and preserves
failed runs. Ordinary failures do not hide the remaining predeclared runs; Ctrl+C
stops the batch. A started run directory cannot be reused. A replacement batch is
a new experiment; retain and report the old failures, not just the successful retry.

## Establish the oracle before scoring

`oracle.json` is private evaluation data, not a reviewer instruction. Every case
has a classification, known defect IDs, concrete expected behavior and evidence.
The prepared pilot also has hidden component tests and saved validation logs.
The same hidden test must fail with a behavioral assertion on the defective head
and pass on the correct control. A syntax error or broken environment is not a
positive oracle result. The ordinary committed tests and static checks must pass
on both. Hidden tests are never inserted in a reviewer snapshot.

An oracle can be incomplete. A useful additional defect is not a false positive
because it is absent from our list. If a supposedly correct control contains a
confirmed additional defect, investigate and retire that control; do not silently
edit its frozen oracle to improve the reported numbers.

## Adjudicate actual comments

```sh
npm run review:eval -- adjudicate .review-runs/heldout-pilot-20261007-01 \
  .review-evals/heldout-pilot-20261007/adjudication-01.json
```

This creates an engineer worksheet from validated runs. It also marks the source
suite exposed, preventing another freeze of it as held-out. It does not rate the
model's prose. Fill:

1. `reviewedBy`: the engineer making the judgment. Prefer an independent reviewer
   who has not been tuning the instructions; assess comments before comparing variants.
2. `comments`: C finding IDs are prefilled. For B, inventory every actionable
   comment manually with a stable ID and an exact quote from `result.txt`. Set
   `commentsComplete: true` only after checking the entire report, including noise.
3. Each comment's `verdict`: `confirmed`, `false_positive`, `duplicate`, or
   `unresolved`. Explain the evidence. Match confirmed comments to `defectIds`
   by the actual scenario and consequence, not wording. Empty `defectIds` on a
   confirmed comment means an additional defect. Link duplicates to the confirmed
   primary comment using `duplicateOf`.
4. Every known defect: read the final report and, for C, `candidates.json` and
   `dispositions.json`. Add IDs of candidates that genuinely describe this defect,
   or leave `candidateIds: []`. Record evidence and set `inspectionComplete: true`.
   Merely opening a relevant file is not discovery. A refuted check that never became
   a candidate is also not counted as discovery in this metric; discuss it separately.

Use the actual head and a concrete reproduction or source argument. A requirement
question is not automatically a defect. The worksheet is bound to the exact run,
oracle and manifest hashes; stale judgments fail validation. Structured C findings
must all be accounted for. Plain-text B inventory completeness requires the engineer's
attestation because arbitrary prose cannot be safely split into comments automatically.

```sh
npm run --silent review:eval -- score .review-runs/heldout-pilot-20261007-01 \
  .review-evals/heldout-pilot-20261007/adjudication-01.json
```

## Read the result

- **Known-defect recall:** distinct known defects matched / known defect opportunities
  in adjudicated, valid runs. Multiple comments do not multiply a detection.
- **Precision:** confirmed comments / (confirmed + false-positive comments).
  Duplicates and unresolved comments have separate counts; neither is hidden as correct.
- **Control noise:** control runs with false positives, plus controls compromised by
  additional real defects. Silence on a defective case is still a miss.
- **Discovery versus verification:** a known defect correctly identified in a C
  candidate but absent from final findings is recorded as `discoveredButNotReported`.
  This requires human matching; the count does not establish why verification lost it.
- **Execution and evidence:** invalid runs and missing adjudications stay visible.
  They do not become successful zero-finding reviews or disappear into recall.
- **Cost:** total measured wall time and input/cached/output tokens, with missing
  counters explicitly counted. These are not dollar estimates. C's aggregate usage
  is used once; stage counters are not added again.

Do not promote a revision from a single aggregate score. Review each family and
control, confirm no useful scenario was lost in verification, then compare cost.
Predeclare acceptable noise and budget for your project. If you tune after reading
these results, this pilot becomes calibration. Use new families for the next transfer
claim. The exposure file prevents accidental reuse through this command; it cannot
detect that a human inspected results elsewhere or that a copied suite is the same
example. That boundary still requires honest experiment management.

No new agent reviews were run while preparing this workflow. Deterministic checks
validate the cases and evaluation machinery; they say nothing about C's detection
performance until you run and adjudicate the batch.
