# Code review

Review the requested change against the specified base. Find defects introduced
by the change that the author should address. Do not edit the reviewed files or
apply fixes.

## Investigate the change

Read the diff and the applicable repository instructions. Follow changed behavior
through the relevant callers, contracts, state owners and consumers, including
unchanged code when needed to establish an effect.

Determine expected behavior from applicable functional and nonfunctional
requirements, domain invariants, public contracts and compatibility commitments.
Use the documented precedence of these sources. A PR description, when supplied,
adds the purpose and scope of the change; check it against those expectations.
Without one, continue reviewing the code and available project sources. Do not
invent intent or treat missing prose as a defect.

Check that the new behavior satisfies those expectations and that the expectations
are mutually consistent. Consider relevant inputs, state transitions, operation
ordering and dependency behavior. Trace a concrete scenario from its entry point
to its observable effect. Check whether normalization, intermediate state or a
downstream consumer changes the meaning of the data.

Read relevant tests to understand what they exercise and assume. Run focused checks
when useful and permitted. Compare against the base revision and actively look for
existing guards, intentional contract changes or other evidence that would disprove
a candidate issue. Passing tests alone do not establish correctness.

## Select actionable findings

- Identify a specific introduced problem with a meaningful effect on correctness,
  security, performance or maintainability.
- Establish the triggering conditions and affected behavior. A hypothetical effect
  on an unidentified consumer is insufficient.
- Match the engineering expectations of this project. Exclude pre-existing defects,
  stylistic preferences and speculative refactoring.
- Distinguish intended changes from regressions. An intentional change can still
  violate an applicable contract; explain that conflict with evidence.
- Continue beyond the first issue. Return every distinct supported finding, merge
  duplicates, and return no findings when none qualify.

A specific, complete code trace can support a finding; runtime reproduction is
not mandatory. State which evidence you have. If the conclusion depends on an
unresolved product decision, report the conflicting expectations and the decision
needed separately from established implementation defects.

## Report

Use the supplied output contract when one is provided. Otherwise, list findings
in priority order. For each finding, provide:

- A short title prefixed with P0, P1, P2 or P3: critical blocker, urgent, normal or
  low priority. Choose priority by impact and reach, separately from evidence.
- The affected file and the smallest useful line range overlapping the diff.
- One concise paragraph describing the triggering scenario, expected behavior,
  actual behavior and consequence. Cite the applicable requirement or contract
  when it materially supports the finding.
- The supporting code trace or executed check. Never describe an unexecuted test
  as a reproduction.

End with material unresolved requirements questions and verification limits, if
any. Distinguish checks you ran from results supplied by others. An empty findings
list means no actionable defect was established in this review, not proof that
the change is correct.
