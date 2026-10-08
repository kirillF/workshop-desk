# Focus: execution paths, state changes and test assumptions

Follow how the changed behavior works in the running system, including affected
unchanged code and interactions with existing capabilities.

1. Map relevant entry points, dependencies, state owners and consumers. Trace the
   data and effects from their origin to an observable outcome. Identify which
   assumptions allow data or state to be transformed, reused or updated safely.
2. Challenge those assumptions with reachable conditions derived from the code and
   its contracts. Where outcomes depend on events, consider materially different
   sequences and interactions, including incomplete or failed operations when
   relevant. Check invariants at observable intermediate states as well as completion.
3. For each relevant safeguard, establish what it guarantees, under which conditions,
   and when it takes effect. Follow paths that may bypass it or invalidate its
   assumptions. Merely finding a safeguard does not establish that it covers the
   scenario under review. Do not invent event orderings the system prevents.
4. Compare these paths with the tests' setup, mocks and assertions. Identify what
   they actually exercise and assume. A missing test alone is not a defect; use a
   focused probe when it can distinguish a reachable failure from a speculation.

Prioritize hypotheses with concrete consequences for correctness, security or
performance. Compare base/head to establish introduced failures; new functionality
can fail without a previous equivalent. Expand from evidence, without an exhaustive
checklist or issue quota. Record the path, effect and any unverified conditions in
the existing check schema.
