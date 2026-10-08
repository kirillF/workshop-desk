# C efficiency, short-term memory and caching

`focused-v3-exploratory-ids` builds on `focused-v3-efficient` and keeps v3's three isolated sessions, model, effort, timeout,
schemas, investigation focuses and engineer-approved handoff. The revision changes
how work is organized, not the evidence threshold or available source.

## What changes

1. The verifier receives its own complete publication/verification rubric instead
   of the full A/B discovery instructions followed by a second rubric.
2. Read the diff, locate relevant contracts and follow changed behavior. Reuse reads
   within a session; avoid repeated whole specifications and overlapping module dumps.
   Read complete relevant sections/functions and expand when evidence is insufficient.
3. Use existing preflight results with attribution. Run a focused probe when it
   resolves a concrete uncertainty instead of reflexively rerunning the whole suite.
4. Keep records concise without repeating a proposal in every field. Full candidate
   evidence, negative checks, unresolved questions and unchecked areas still reach
   verification. No string truncation, quotas or hard read caps are introduced.
5. Put stable procedures before variable case context. Candidate data remains last.
   This preserves the reusable portion of our prompt; it cannot guarantee reuse of
   the CLI's full rendered context.

## Memory has three different meanings here

| Mechanism | Scope | Policy |
| --- | --- | --- |
| Current conversation and optional factual notes | One review stage | Reuse observations and source pointers; verify their interpretation. |
| Persistent agent/project memory or earlier review answers | Other sessions/runs | Disabled/excluded to preserve independent investigation. |
| Provider prompt cache | Matching rendered input prefixes | May reuse computation; does not insert earlier conclusions into a new prompt. |

For long work or compaction, the reviewer may keep a short index in
`.review-tmp/review-notes.md`: inspected paths/lines, source obligations, observed
checks and unresolved questions. This is optional, not a new mandatory reporting step
or private reasoning log. The existing runner archives scratch outside reviewer
access and resets it before each stage. Notes are not passed to the verifier;
structured checks are the explicit handoff.

Do not resume the author or first investigator's session to obtain cache reuse.
Do not replace independent source checks with another investigator's summary.
Automatic compaction settings are unchanged: these short stages do not justify
an additional summarization call or aggressive deletion of evidence.

## Caching decisions

OpenAI documents exact-prefix reuse, stable instructions before variable data and
separate cache-read/write accounting. The existing CLI already reports cached input.
API cache controls are not automatically valid Codex CLI flags; this revision adds
none and makes no assumption about cross-session routing or cache retention.
[OpenAI: prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).

A cache hit lowers repeated computation, not the amount of context the model must
use. A high hit ratio can coexist with irrelevant input. Track total input, cached
input, input minus cached input, output and elapsed time separately. The difference
is not a billing estimate: cache writes, pricing and unreported details can matter.
Do not sum root usage and stage usage; root usage already aggregates the stages.

Preflight evidence is reused within the same reviewed snapshot, not cached across
arbitrary revisions. A future persistent test-result cache would need keys covering
source, dependencies, runtime, command and environment. A file-content cache would
need revision/content identity and must not carry prior reviewer conclusions.
Neither adds enough demonstrated benefit to justify implementation in this revision.

## How the supplied articles inform the change

Birgitta Böckeler separates guidance from feedback and deterministic checks from
model judgment. Our application: retain the preflight and artifact validators;
spend inference on semantic checks and counterevidence. Keep the approved fix handoff
as a separate feedback step. More instructions alone are not stronger enforcement.
[Harness engineering for coding agent users](https://martinfowler.com/articles/harness-engineering.html).

Martin Fowler's agentic programming framing retains human responsibility for both
behavior and implementation. An engineer still adjudicates comments, resolves product
intent and authorizes a fix. Efficiency does not mean automatic acceptance of a
shorter report.
[Agentic Programming](https://martinfowler.com/bliki/AgenticProgramming.html).

Anthropic describes on-demand retrieval and structured notes for maintaining relevant
working context. Here this becomes scoped source reads and optional stage-local notes.
It does not justify importing author memory or sharing conclusions between independent
investigators. Notes should save repeated navigation, not introduce another required
process for a short review.
[Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).

## Baseline and acceptance

Saved baseline: `.review-runs/c-focused-v3-20261007-084042/`, three cases, nine sessions.
It records 3,236,001 input tokens, including 2,754,176 cached (85.1%), and 42,161 output
tokens. Summed case duration is 864,454 ms (14m24s), including per-case overhead.
Do not interpret total input as unique source text or the context window size.

For the earlier `focused-v3-efficient` revision, using exactly those saved inputs
and check records, the verifier prompts
are 16–19% shorter in characters. Discovery prompt length is effectively unchanged
(19 extra characters per stage); all nine prompts together are 10.8% shorter.
The candidate/negative-check/limit input suffix is byte-identical. These are offline
prompt-size measurements, not token, latency or accuracy measurements. Most observed
input volume came from tools and repeated accumulated context, so targeted reading
is the more important behavioral change to evaluate.

For the next CLI run compare confirmed comments, false positives, known misses,
requirements questions, verifier filtering and repair acceptance conditions alongside
usage and time. Precision alone is insufficient: returning fewer comments can hide a
recall regression. Preserve missed scenarios as part of the comparison. Repeat and
include held-out changes and correct controls before claiming preserved quality.
The earlier exploratory revision added checks of undocumented assumptions,
affected existing workflows and new-feature failures. Verification no longer implies
that every finding needs a written requirement. It still needs a reachable trigger,
concrete harm, an affected consumer and an attributable change. Old behavior alone
is insufficient. These checks reuse the same three sessions and evidence fields.
Recomposing the same nine saved prompts gives 93,559 characters: 6.2% above the
efficient revision and 5.2% below original v3. This is added instruction text, not
measured inference cost; broader exploration may require more work.
See [the exploratory review policy](C-structured-review.md#exploratory-checks-beyond-documented-requirements).

No model reviews were run while implementing these revisions.

## Run the same three cases

```sh
(
  set -e
  cd ~/devel/workshop-desk
  export PATH="/opt/homebrew/bin:$PATH"
  export WORKSHOP_REVIEW_MODEL=gpt-6-sol
  export WORKSHOP_REVIEW_EFFORT=medium
  review_output=".review-runs/c-efficient-$(date +%Y%m%d-%H%M%S)"
  for review_case in filters edit get; do
    npm run review:local -- C \
      "docs/review/examples/$review_case.json" \
      . "$review_output/$review_case-C"
  done
)
```

This runs nine model sessions. Do not change the harness or input files while the
loop runs. Each output must be new; failures stop the loop. `run.json` records usage
per stage and in aggregate; stage traces distinguish reads, probes and repeated work.


## Protocol correction after the exploratory run

The ID-constrained revision changes no investigation instructions or model budgets.
The actual verifier schema now restricts original candidate IDs to the supplied
candidate set. Refuted checks remain audit input, not disposition targets. New
verifier candidates still need explicit checks and final cross-reference validation.
This prevents the observed extra negative-check dispositions without an extra call
or silently discarding arbitrary output. Historical failed runs stay failed.

## Generic instruction revision

The next prompt revision replaces the detailed validation and state-copying recipes
with a shared investigation method: derive obligations, select materially different
conditions, follow affected behavior to consumers, and test the assumptions behind
safeguards. Cases come from the reviewed change, not a predefined defect catalogue.
Negative conclusions remain limited to the paths and conditions actually examined.

A/B instructions, PR descriptions, output schemas, isolation and model budgets are
unchanged. The workflow identifier stays `focused-v3-exploratory-ids` because the
execution and validation contracts are unchanged; saved prompt text and artifact
hashes distinguish instruction revisions. Historical results retain their original
prompts. Shorter instructions do not establish lower inference cost or better recall.
