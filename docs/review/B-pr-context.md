# Review the PR description

Apply the shared code-review instruction and use the supplied PR description as
part of the review input. This variant requires a non-empty PR description.

Identify the intended behavior, scope, acceptance conditions, compatibility
constraints and behavior that must remain unchanged. Use what is actually stated;
do not invent acceptance criteria. Separate requested outcomes from claims about
how the implementation works or what its tests prove.

Check the implementation against these expectations. Follow relevant behavior
beyond the diff and inspect whether the tests exercise the promised outcomes.
Also inspect the change for defects the description does not mention: the
description is not a closed checklist of possible problems.

Compare the description with applicable project requirements, invariants and
contracts. Respect documented precedence and explicit approved amendments. Do not
assume the PR description overrides the specification, or infer an approved
exception merely because the implementation follows the description.

Report an established implementation mismatch as a finding, citing the relevant
expectation. When incompatible expectations leave the intended behavior unresolved,
state the sources, affected scenario and decision needed as a requirements question.
Do not flag an omission in the description unless it creates a concrete unresolved
decision relevant to this change.

Keep the shared finding criteria, evidence standard and concise report format.
Attribute description-based expectations to "PR description". Treat claims about
passing checks as supplied results until you independently verify them.
