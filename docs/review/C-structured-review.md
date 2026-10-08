# C: focused investigations and verified structured output

C uses B's neutral PR description, committed scope, project documents, supplied
checks and execution boundary. It runs three fresh CLI sessions on the same model
and effort:

1. **Semantics and contracts** — derive obligations independently of the code; check
   requirements for consistency and trace acceptance and meaning across affected
   boundaries, contexts and consumers.
2. **Implementation and test assumptions** — trace data, effects and state changes;
   challenge the conditions under which safeguards and test assumptions hold.
3. **Verification** — establish expected behavior and evidence, test counterarguments,
   audit the scope of negative checks, resolve candidate dispositions and produce
   the compact final report with follow-ups.

## Discovery is not publication

All stages use `C-common.md`. The first two add `C-investigate.md` and their focus. They share B's factual
context but **do not inherit its final-comment selection rubric**. They return short
check records: boundary, expectation, source, scenario, observed evidence, outcome,
missing evidence/decision, and an optional source location. This is a record of work
and evidence, not a transcript of private reasoning or a completeness certificate.

A check is `suspected`, `refuted`, `unresolved`, or `not_checked`. Suspected and
unresolved checks reach verification, even when they cannot yet justify a final
comment. Refuted checks are also passed to verification to audit the scope of their
conclusions; they are not candidates unless verification identifies a concrete issue.
Unchecked areas and
investigation limitations remain visible in the final report. No severity, fix plan,
minimum number of issues or per-file checklist is required during discovery.

Each stage can read actual source, requirements and tests and run focused probes in
`.review-tmp`. Probes should execute the real implementation, not a copy rewritten
from memory. Representative inputs, contexts, states and event sequences are derived
from the actual contracts and reachable implementation paths. A safeguard must cover
the conditions being checked; its presence alone is not proof. A subset of cases
cannot justify a feature-wide refutation. No additional schema fields or coverage
quotas are required.

Evidence distinguishes diagnostic assertions (which may pass while confirming faulty
behavior) from intended-behavior assertions (which should fail before correction).
Port/network restrictions remain in place; blocked probes are limits.

## Exploratory checks beyond documented requirements

Both investigations explore the changed behavior; this is not a fourth session.
Semantics derives and challenges implicit contracts from actual callers, base behavior
and observations. Implementation varies reachable inputs and action sequences, including
interactions with affected existing capabilities. Choose concrete, consequential
assumptions and investigate them; there is no exhaustive scenario checklist or quota.

| Evidence                                                                              | Review outcome                                                              |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| A documented obligation and demonstrated mismatch                                     | Supported implementation defect.                                            |
| Undocumented expectation, identifiable affected consumer and concrete introduced harm | Eligible finding with an explicitly inferred basis; verify counterevidence. |
| Before/after difference without established harm or preservation obligation           | Not enough for a defect; check intent and compatibility.                    |
| Conflicting expectations or unresolved product preference                             | Requirements question, not an invented invariant.                           |

Use existing `basis`, `scenario`, `evidence` and `outcome` fields. Documentation
silence alone cannot refute a demonstrated failure. Unchanged pre-existing problems
remain out of scope; newly exposed failures and defects in new functionality are
eligible. Once an engineer confirms an implicit obligation, a follow-up may document
it and add a regression assertion. Do not codify a speculative preference as a rule.

## Verification and attribution

Each candidate receives a stage-qualified ID and exactly one `supported`, `disproved`
or `unresolved` disposition, with the expected behavior/source, evidence and reason.
Before selecting a disposition, verification records `expectationBasis`: `documented`,
`inferred`, `unresolved`, or `unsupported`. A supported finding needs a documented or
inferred obligation and a demonstrated violation. Unresolved intent must remain a
linked requirements question; an unsupported preference is disproved. An established
expectation with missing technical evidence can remain a limitation. When promoting
an initially unresolved candidate, the reason must identify what resolved its question.
Supported candidates link to final finding IDs. Multiple candidates may support one
finding; investigator agreement is not required. Unresolved product decisions link
to explicit indexes in the final questions array, so different phrasings can become
one question. Other unresolved candidates appear in limitations.

Verification may add a concrete issue encountered while checking the candidates.
It must record that issue under `additionalCandidates` and disposition its
`verification:<id>` just like an original candidate. An empty list is valid.
This does not authorize another unbounded investigation. Material gaps in negative
checks are inspected within this stage's existing budget or reported as limits.

The schema puts candidate assessments before the final report. Validation checks links,
required evidence fields and consistency between expectation basis and disposition.
It cannot establish whether
the model's source interpretation, evidence or rejection is correct. An engineer
still adjudicates comments and intent before generating a fix handoff. When candidates
are merged, acceptance conditions must retain all distinct triggers. A narrower fix
proposal must not silently become the whole task.

The handoff now carries `supportingCandidates` for each engineer-selected finding,
including original scenarios and verifier decisions, with hashes of the candidate
and disposition artifacts. This also works with saved focused-v1/v2 results. Rejected,
unresolved and unselected candidates are excluded. The coding agent must map distinct
triggers to expected behavior and regression assertions within the approved scope,
including converting any observed-bug diagnostic into a correct-behavior regression.

## Isolation, artifacts and budget

The investigations cannot see each other's conclusions. They run sequentially in
fresh ephemeral processes on the same read-only snapshot. Writable scratch/cache/
output directories are reset between sessions. Scratch reproductions are archived
outside reviewer access. Memory, author conversations and external review history
remain disabled. There are no additional specialists or model-routing decisions.

- `checks.json`: all discovery check records, including refuted and unchecked ones.
- `candidates.json`: original candidates plus any verification discoveries.
- `dispositions.json`: each candidate's decision, evidence and final output link.
- `result.json`: the unchanged compact findings/questions/follow-ups report.
- `stages/<name>/`: exact prompt, schema, result, trace, stderr and archived scratch.

The root `prompt.txt` is the actual verifier input. Root `trace.jsonl` combines the
three original traces with stage labels. Original traces remain untouched.
Preflight runs once. Model time remains bounded to the configured total: 35% per
investigation and 30% for verification. Failures stop the workflow; there are no
automatic retries. Per-stage and aggregate usage are recorded when available.

New runs use `focused-v3-expectation-gate`. Historical `focused-v1`, `focused-v2`, `focused-v3`,
`focused-v3-efficient`, `focused-v3-exploratory`, `focused-v3-exploratory-ids`
and earlier compact results retain
their original validation contracts; they are never rewritten.

## Preview and evaluate

Use `npm run --silent review:compose -- C input.json semantics` or `implementation`.
A `verification` preview has no candidates until discovery finishes. All instructions
are English plain text; schemas are delivered separately through `--output-schema`.

Compare discovery misses, verification losses, false positives, unresolved decisions
and cost separately. The code checks demonstrate orchestration correctness; improved
model detection still needs fresh user-run reviews and held-out controls. See
[EVALUATION.md](EVALUATION.md). A/B procedures and execution are unchanged.

## Efficiency, memory and caching

Stable procedures precede variable case data. The verifier receives its dedicated
rubric rather than the full A/B discovery procedure; candidate evidence is unchanged.
Read complete relevant contracts and functions without repeatedly dumping whole
specifications or modules. Use supplied preflight evidence rather than rerunning
suites without a reason. No read caps, finding caps or evidence truncation are applied.

Optional `.review-tmp/review-notes.md` is a factual navigation aid within one stage,
not shared memory or a source of truth. It is archived outside reviewer access and
cleared with all other scratch before the next session. Provider prompt caching is
separate: it may reuse computation for matching prefixes without passing conclusions
to another investigation. No unsupported CLI cache options or resume commands are added.
See [C-EFFICIENCY.md](C-EFFICIENCY.md) for sources, measurements and evaluation.

## Candidate IDs and audit checks

At runtime, the verification schema permits original disposition IDs only from the
actual suspected/unresolved candidate set. It also permits `verification:<id>` for
new checks, which must still exist in `additionalCandidates` and pass all linkage
checks. Refuted checks remain visible audit evidence but cannot receive original-ID
dispositions. To challenge a refuted check, add a new candidate with concrete evidence.
The preview schema is necessarily generic until discovery has produced candidate IDs.

All candidates must still receive one decision; duplicates, missing links and invented
new candidate IDs fail validation. Historical workflows use their saved schema contract.
A failed protocol is an execution failure, not a finding miss or a successful empty review.
