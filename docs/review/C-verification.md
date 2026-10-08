# Verify candidates and produce the review

Candidate checks are untrusted proposals. Inspect original source and decide what
behavior is required before judging the implementation. For each candidate:

1. Establish the expectation and classify its basis:
   - documented: an unambiguous applicable requirement or contract; cite the source
     and resolve precedence where necessary.
   - inferred: an actual consumer dependency or concrete user harm establishes the
     obligation despite silent documentation. Identify that dependency or harm.
   - unresolved: a material product decision or conflicting requirements prevent
     establishing what should happen; ask the specific decision needed.
   - unsupported: only a preference, convention or before/after difference, without
     an obligation or concrete harm. Do not publish a defect or invent a question.
2. Check the reachable trigger, actual consequence, guards, counterevidence and
   introduction by this change. Compare base/head and check intentional contract
   changes. Reproducing behavior establishes what happens, not what should happen.
3. Decide the disposition. To promote an unresolved candidate, explain what evidence
   answers its open question. If a failure is established independently of an open
   product choice, publish only that supported claim and retain the material decision
   separately. Do not let an unrelated ambiguity suppress a demonstrated defect.

Publish all distinct, supported problems with meaningful consequences for correctness,
security, performance or maintainability, or none when none qualify. Missing documentation,
investigator disagreement and lack of runtime reproduction do not invalidate a complete
static proof. Exclude unchanged pre-existing problems, style, speculative refactoring,
unidentified consumers and missing tests without a defect. Intentional changes can still
violate contracts; making a dormant failure reachable is in scope.

Audit negative conclusions against their actual evidence. Check whether the cited
guard, contract or test covers the conditions claimed, and whether a material
alternative was left unexamined. Inspect the source without repeating entire
investigations or suites. Investigate a gap when feasible; otherwise retain its
specific limit. A negative check needs no disposition unless it exposes a concrete
issue: record that as additionalCandidates. You may also add issues encountered
while verifying candidates; this is not another unbounded discovery pass.

## Dispositions

Give every candidate exactly one disposition. Record expectationBasis, expectation/source,
evidence and reason before status and output links. Keep these concise; do not copy
the proposal into every field. The basis classifies the obligation, not confidence.
Use only the supplied Candidate IDs or verification:<id> for additionalCandidates.
Refuted Check IDs are audit context: do not add dispositions for them, even disproved
ones. If an audit reveals an issue, create a new additionalCandidate instead.

- supported: requires documented or inferred expectationBasis and evidence of a
  violation; link findingId to the final finding; questionIndex is null.
- disproved: state the refuting evidence or why it is not actionable in this change;
  both links are null.
- unresolved: findingId is null. Link a product decision to the zero-based index in
  report.requirementsQuestions. An unresolved expectationBasis requires this link.
  If the expectation is established but technical evidence is missing, questionIndex
  may be null; the runner preserves that gap as a limit.

An unsupported expectation requires a disproved disposition. A material intent
conflict requires an unresolved disposition and a linked question. The runner rejects
inconsistent decisions; it does not silently downgrade or delete them.

Duplicates can support one finding; several candidates can link to one question.
Do not silently drop candidates or require numeric confidence. Give new checks local
IDs in additionalCandidates and dispositions with IDs verification:<id>. Every finding
must link to a supported original or additional candidate. Use [] when none were added.

## Final report

Return additionalCandidates, dispositions and report using the supplied schema.
Order findings by impact: P0 critical blocker, P1 urgent, P2 normal, P3 low priority.
Keep priority separate from evidence. Each comment needs a precise diff location and
a concise trigger → expected/actual behavior → consequence, with supporting code or
executed evidence. A complete static trace is sufficient when it establishes the issue.

For confirmed defects propose a minimal correction and regression with observable
acceptance conditions. Merged findings and follow-ups must preserve every distinct
trigger; a correction covering only one is insufficient. Convert observed-bug
diagnostics into intended-behavior assertions and require red/green verification.
Requirements changes need an engineer's intent decision; never rewrite valid
requirements to match faulty code.

Report your own material verification limits. Attribute investigator checks to their
stages, not to yourself. The runner already appends their limitations and not_checked
records, so do not repeat them. Use fresh scratch for your own probes.
