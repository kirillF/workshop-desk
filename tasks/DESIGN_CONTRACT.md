# Implementation Design Freeze

Status: COMPLETE
Invariant approval: APPROVED
Risk approval: APPROVED
Budget approval: APPROVED
Approved by: Project author (user)
Approval evidence: Existing conversation: user requested applying the specification review recommendations, creating the Luna implementation task breakdown, then explicitly instructed "реализуй с помощью luna" and corrected the executor to "это должна быть luna max". This record preserves that authorization; it does not create a new product decision.

## Outcome

Implement the locally runnable Workshop Desk product described by PROJECT_SPEC.md v0.3, following WD-01 through WD-08 and their acceptance gates.

## Scope

In: React frontend, Node API, persistent SQLite, seed/reset, documented operation invariants, deterministic test controls, English agent documentation and Russian product UI.
Out: custom code-review product, planted defects, paid review experiments, deployment, commits and publication.

## Invariants

PROJECT_SPEC.md INV-01 through INV-08 are normative. Each task owns the subset named in its card. Preserve capacity bounds, pair uniqueness, conditional versioned writes and server-owned permissions; preserve unaffected optimistic rows, user drafts, and reconciliation ordering. Unknown command outcomes require the specified explicit continuation, not inference from a GET.

## Weaknesses and risks

Client correlation cannot prove historical command outcomes. Demo identity selection is not production authentication. Deterministic scenarios establish their checked behavior, not complete correctness or review-tool superiority. SQLite local execution does not establish distributed production scalability. Runtime checks alone cannot establish business acceptance. Recover through scoped fixes and rerun affected checks; never weaken an invariant to label a task complete.

## Assumptions and unknowns

The author accepts specification v0.3 and its task decomposition as the implementation source. Exact task duration and model cost are not measured. Existing documentation is authoritative; no speaker material may supply hidden implementation requirements. Routine tool choices may change within the same contract.

## Ownership and decision rights

Luna MAX authors the assigned task implementation. Parent integrates and independently verifies it. Task cards define file ownership, with one production task at a time by default. The user owns changes to product requirements. No commits, external publication or paid runs are authorized.

## Resource budget

- Hard limits: no numerical implementation time or token cap was supplied; the talk-preparation discussion is not a promise all implementation fits in that window.
- Working allocation: eight bounded task cards, minimal local dependencies, no unrelated artifacts or features.
- Verification reserve: at least 20 percent of each task effort for meaningful checks and handoff, as recorded in tasks/README.md.
- Current consumption: WD-01–08 implemented and verified; see docs/acceptance.md.
- Remaining work under this contract: none. Model cost was not measured.
- Stop conditions: stop affected work for a product contract change or concrete external blocker; preserve verification and disclose incomplete acceptance.

## Acceptance scenarios

Use each task card and AC-01 through AC-21. Include success, capacity contention, duplicate entry points, stale versions, forbidden actions, reordered reads/responses, failures before and after commit, reload and context changes. Check intermediate states before reconciliation where specified.

## Verification

Evidence includes actual commands/results in tasks/results, real API tests using isolated DBs, browser verification and deterministic interleavings. Parent checks work independently. Full completion requires every acceptance criterion, clean dependency setup, build/start and English runtime/agent documentation. Distinguish verified facts from remaining work.

## Change control

Private implementation details and safe staging/integration choices do not need reapproval. Changes to product invariants, scope, decision rights or a user-supplied hard budget require the user's decision before affected work continues.

## Approval

The existing explicit implementation instruction approves execution of the already prepared specification/task breakdown. Do not ask the user to approve the same work again. This file consolidates that existing contract for agents; it adds no new behavior or resource promise.
