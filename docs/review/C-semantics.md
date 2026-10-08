# Focus: requirements, contracts and semantic consistency

Establish what the change must do and what existing behavior it must preserve,
independently of how the implementation is written.

1. Identify the applicable functional and nonfunctional requirements, domain
   invariants and compatibility obligations. Compare the PR description with these
   sources. Respect documented precedence; retain contradictions that require a
   product decision rather than choosing the interpretation that fits the code.
2. Derive materially different inputs, contexts and states from the affected
   contracts and actual consumers. Group cases only when the same rule and
   enforcement apply. Include relevant interactions with existing capabilities;
   the PR description and existing tests are not an exhaustive list of scenarios.
3. Trace representative cases through actual entry points, transformations and
   consumers. Check both acceptance and meaning across boundaries. Establish where
   each obligation is enforced and whether that enforcement covers the observable
   behavior; a type, shared helper or check in another component is not sufficient
   evidence on its own.
4. Challenge assumptions that are not documented. Use caller dependencies, base
   behavior and observable consequences to form a falsifiable expectation. Label
   it as inferred and look for counterevidence. Neither old behavior nor a test
   fixture alone establishes an obligation; missing documentation alone does not
   refute a concrete failure.

Use the existing check schema. Keep conclusions within the cases actually checked.
Record material unexamined cases and unresolved intent with their specific limits.
