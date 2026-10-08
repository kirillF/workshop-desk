# Evaluate the review system

The evaluated unit is the model, instruction, input, available project context,
tools, permissions and output contract together. Save that configuration and the
actual trace. A schema-valid response and a true defect are different outcomes.

## Executable held-out evaluation

Use [HELDOUT.md](HELDOUT.md) for the prepared B/C pilot and `review:eval` commands.
The workflow freezes inputs and reviewer configuration, includes correct controls,
binds human judgments to the actual artifacts, and separates detection, control
noise, verifier losses, invalid runs and cost. The old demo cases remain calibration.

## A small, useful corpus

Use diverse prepared PRs: introduced implementation defects, requirement conflicts,
legitimate changes that resemble bugs, and correct controls. Include different
frontend boundaries and sources of intent. Keep expected diagnoses, fixed branches,
regression tests added after discovery and adjudication outside reviewer access.
Separate examples used to tune the procedure from held-out changes. Synthetic
mutations are useful only when their scenario is reachable and realistic.

For each trial, an engineer records:

- Known defects detected and missed, matched by meaning rather than exact wording.
- Confirmed comments, false positives, duplicates and unresolved questions.
- Whether evidence supports the comment and the proposed next action is usable.
- Validation errors, environment failures and incomplete runs separately from misses.
- Wall time and CLI-reported token usage, when available. Record prices separately
  if calculating money; do not infer a price from token count alone.

Use precision for noise and recall for known-defect coverage, with explicit
numerators/denominators. Keep unresolved items separate. Report correct-control
false positives too. Repeat trials to expose variability. A tiny demo corpus is a
regression suite and teaching aid, not an industry benchmark.

## Change one thing at a time

Keep source revisions, description, permissions, checks, model and effort constant
when comparing input/reporting changes. Compare models under a fixed harness first;
then evaluate model-specific simplifications separately. Promote a change only if
its benefit holds on unseen cases and correct controls at an acceptable cost.

Read failures in this order: execution environment, input/provenance, tool use,
interpretation, final reporting. Do not automatically add a longer instruction for
every miss. Remove instructions that add cost or suppress supported findings.

## Why this C design

C uses two fresh investigations (semantics and implementation/test assumptions),
then verification. The common input is still B's plain text; the final report remains
compact. The schema records concise checks, evidence and dispositions, not a transcript of
reasoning or an exhaustive coverage matrix. Product requirements stay in their own files.

Evaluate discovery and filtering separately: inspect `checks.json`, `candidates.json`, stage reports
and `dispositions.json`. Count useful additional defects, incorrect candidates,
duplicates, and supported issues lost during verification. A verifier is not an oracle.
Compare against both single-session C and repeated ordinary reviews at a comparable
inference budget. Keep held-out changes and correct controls; do not tune generic
instructions with answers to the demo cases.

The runtime permits exactly three sessions with a shared timeout and records their
usage. Extra specialists, adaptive model selection and unbounded retries are not
enabled. Browser/runtime access can help when evidence is observable behavior;
configure an isolated application environment before enabling those capabilities.

## Primary sources informing this design

- [Anthropic: Code Review](https://support.claude.com/en/articles/14233555-set-up-code-review-for-claude-code):
  focused investigations followed by verification and deduplication.
- [Cursor: Building a better Bugbot](https://cursor.com/blog/building-bugbot):
  measured experiments with multiple passes, filtering, tools and agentic investigation;
  plausible changes sometimes regressed the metrics.
- [Greptile v5](https://www.greptile.com/blog/greptile-v5): narrowly scoped bug hypotheses.
- [OpenAI: Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices):
  use evaluations to justify additional agent complexity.

- [OpenAI: Harness engineering](https://openai.com/index/harness-engineering/):
  repository knowledge should be navigable and important constraints enforceable.
  Here, concise AGENTS navigation leads to authoritative specifications and checks.
- [Anthropic: Harness design for long-running application development, March 2026](https://www.anthropic.com/engineering/harness-design-long-running-apps):
  separate evaluation from generation where useful, and test whether each harness
  component still earns its complexity as models change. Its application-building
  results are not a benchmark of this code-review procedure.
- [Anthropic: Demystifying evals for AI agents, January 2026](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents):
  inspect outcomes and traces, combine deterministic and human grading, separate
  capability evaluation from regression checks, and repeat trials.
- [OpenAI: Agent improvement loop](https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop):
  version the harness, inspect failure traces and evaluate a proposed change before
  adopting it.
- [Codex permissions](https://learn.chatgpt.com/docs/permissions):
  explicit filesystem/network policies and a sandbox probe, rather than relying
  only on an instruction not to inspect adjacent checkouts.

These sources motivate implementation choices. They do not establish that C is
state of the art in detection accuracy; that requires results from relevant evals.

## focused-v2 changes to evaluate

Discovery no longer receives final-publication filtering. It retains concrete
hypotheses and records attempted counterexamples, source expectations and unverified
boundaries. Verification establishes the expectation independently, records evidence
and counterevidence, permits attributable new candidates, and uses explicit question
links for consolidation. No demo diagnosis is embedded in the procedure.

For a miss, locate the earliest visible stage: was the relevant path inspected, was
a counterexample recorded, did it become a candidate, and did verification reject it?
Tool reads alone do not prove the model understood a path. Preserve the actual report
and trace; do not infer a hidden reasoning cause from an absent final comment.

Useful comparisons keep source, model, effort and permissions fixed. This revision
changes several investigation/reporting details together, so a better result alone
would not identify which individual instruction caused it. Test the combined system
first; ablate components separately if the cost or filtering warrants it.

Additional public implementation references:

- [Sentry find-bugs skill](https://github.com/getsentry/skills/blob/main/skills/find-bugs/SKILL.md):
  inventory relevant inputs and boundaries and state unverified areas.
- [Anthropic PR test analyzer](https://github.com/anthropics/claude-code/blob/main/plugins/pr-review-toolkit/agents/pr-test-analyzer.md):
  examine behavioral coverage and test assumptions.
- [Codex review task source](https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/core/src/tasks/review.rs):
  the built-in review task installs a review-specific base instruction. This custom
  workflow continues to use ordinary `codex exec`; its execution mode is unchanged.

## focused-v3: check breadth and repair completeness

This revision keeps the three sessions, final report schema, check schema, model
settings and permission boundary. It changes the discovery procedure to derive input
classes and state transitions from the affected contracts. Verification receives
negative check evidence as well as suspected/unresolved candidates and audits whether
the tested scenarios support the breadth of the conclusions. It does not assume that
more check records establish more coverage.

Evaluate whether the relevant class or transition was actually investigated. Separate
an absent scenario, an incorrect negative conclusion, a failed probe, a product-intent
ambiguity, and a supported candidate lost in verification. The interpretation still
requires an engineer; the runner cannot infer scenario completeness from prose.

Assess follow-ups too. A merged comment can have multiple triggers. Confirm that its
acceptance criteria and tests cover every distinct scenario, and that a passing probe
asserting faulty behavior is not reused unchanged as a regression. Handoff now carries
all supported candidates behind the selected finding, with source artifact hashes;
this preserves evidence, not automatic approval of every proposed interpretation.

The negative check input increases verification context. Record tokens and elapsed
time along with additional supported defects, false positives and unverified areas.
Do not add stages or accept a cost increase solely because the report looks fuller.

## focused-v3-efficient: cost with a quality constraint

Compare against the saved v3 inputs, source, model and effort. Stable prompt prefixes,
dedicated verification instructions, scoped reading and optional stage-local notes
are one efficiency revision. Stage count, schemas, candidate evidence, independence,
time budgets and model settings are unchanged. The verifier still gets negative checks.

Record input tokens, cached input, non-cached input (`input_tokens - cached_input_tokens`),
output tokens and elapsed time. Cache ratio alone is not an efficiency score: repeatedly
sending irrelevant context can have a high hit rate. Missing usage is unknown, not zero;
these counters alone are not a bill. Also compare tool calls and source output volume,
which are diagnostic proxies, not token estimates.

Inspect precision and known-defect recall separately, including correct controls,
unresolved requirements, verifier losses, merged scenario retention and repair usefulness.
A reduction in findings is not evidence of efficiency. Treat any lost confirmed scenario
or additional false positive as requiring investigation before promoting the change.
Repeated runs and held-out changes are needed before claiming preserved quality.
See [C-EFFICIENCY.md](C-EFFICIENCY.md) for this revision's design and source references.

## focused-v3-exploratory: undocumented behavior

Keep the efficiency revision's model, sessions, budgets and evidence contracts.
Evaluate exploratory detection separately from specification compliance. Include:

- An undocumented behavior that an actual consumer relies on and that the change breaks.
- A defect in new functionality without a previous equivalent implementation.
- An intentional behavior change that resembles a regression but violates no commitment.
- An ambiguous expectation that needs a product decision rather than a code fix.

Adjudicate reachability, concrete consequence, base/head attribution, counterevidence
and the basis for the expectation. Do not score every before/after difference as a
true positive. Track added tool reads, time and tokens as well as useful additional
comments and false positives. No new stage, schema field or forced scenario count
is introduced, and no detection improvement is established by deterministic tests.

## focused-v3-expectation-gate: verify the obligation before publishing

The first pilot exposed a publication error: an investigator left the required
behavior unresolved, but verification published a defect without establishing the
obligation. Reproducing the implementation's behavior did not resolve product intent.
The generic refinement classifies the expectation separately from the violation,
records candidate decisions before the final report, and rejects inconsistent
expectation/disposition links. It adds one verifier field and no session. Discovery,
the final report, model settings, time budgets and A/B are unchanged.

Deterministic tests cover unresolved intent incorrectly published as a finding,
unsupported preferences, material questions, technical evidence gaps, inferred
obligations, promotion after resolving intent, and historical artifact validation.
These checks validate the protocol, not the truth of the model's interpretation.

Evaluate the next revision on new cases that distinguish these outcomes. Track
false positives, useful inferred findings, questions, verification losses and cost.
Do not suppress undocumented failures simply to reduce the number of comments.
The inspected pilot is now calibration data; keep its frozen inputs and outputs
unchanged and do not call another run on it an unseen evaluation. This revision
has no new model-result evidence yet.
