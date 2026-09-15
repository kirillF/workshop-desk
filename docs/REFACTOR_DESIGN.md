# Workshop Desk — Review and Refactoring Contract

Status: VERIFIED
Invariant approval: APPROVED
Risk approval: APPROVED
Budget approval: APPROVED
Approved by: Kirill (project owner)
Approval evidence: User replied "approve" after the contract and React feature-based structure were presented, 2026-09-15.

## Outcome

Refactor the existing runnable application into cohesive modules, fix demonstrated
lifecycle defects, and establish layered tests with measured coverage. Preserve
PROJECT_SPEC.md and AUTH_SPEC.md behavior, Russian UI and English documentation.

## Review findings and evidence

Static review on 2026-09-15; current source is not a Git repository. Findings below
are grounded in the inspected source, not in a new full runtime or coverage run.
Previously reported 8 unit, 22 API and 29 browser passes are historical baseline
results and must be rerun against the refactor.

1. **P1 — Logout can falsely appear successful.** App.tsx:2770–2772 discards every
   logout error and clears local identity in finally. If the POST fails before
   reaching the API, its HttpOnly cookie and server session remain valid; reload
   can restore that session. A hung request also has no explicit logout timeout
   or recoverable pending UI. Separate explicit logout from handling an already
   expired session; serialize logout attempts, bound waiting, hide private content
   while pending, and expose retry when revocation cannot be confirmed. Never
   describe local state clearing as proof of server revocation.
2. **P2 — Frontend responsibilities share one lifecycle boundary.** App.tsx is
   2,799 lines. Rendering, auth, preview generations, drafts, reconciliation,
   mutation orchestration and browser persistence are colocated. Extract modules
   by invariant ownership, not arbitrary file length. Moving JSX alone would
   leave the temporal coupling intact.
3. **P2 — Test layers leave transport and UI behavior dependent on E2E.** The only
   unit suite targets OperationStore; HTTP suites exercise API/SQLite; browser
   suites carry auth, forms and preview verification. Add direct API-client tests
   with injected fetch and component/hook-level session/preview tests. Keep real
   database and concurrency assertions at integration level and representative
   journeys at E2E level. Do not replace reliable real-HTTP tests with mocks.
4. **P2 — Coverage is unmeasured and unenforced.** package.json has no coverage
   command, report or gate. Test totals are not a coverage percentage. Capture a
   reproducible per-layer/per-module baseline with source mapping, report branch
   coverage and exclusions, and introduce focused gates for critical modules.
5. **P2 — API cross-cutting concerns depend on a feature module.** auth.ts imports
   ApiProblem from organizer.ts; that module combines errors, input parsing,
   transactions, projections and registration transitions. Extract shared errors
   and HTTP concerns; distinguish booking commands and read projections without
   moving capacity/version checks outside the transaction.
6. **P3 — Compatibility residue and hygiene.** api.ts still exposes ignored
   demoUserId options and App.tsx retains the DemoUser alias. Remove unused
   compatibility paths after checking callers. Introduce consistent formatting
   and practical lint rules, especially hook dependency and unused-code checks;
   avoid a repository-wide suppression baseline.

## Scope

- In: apps/web, apps/api, shared contracts where necessary, tests, check tooling,
  package manifests/lockfile and architecture/testing/acceptance documentation.
- Out: new product features, redesign, framework replacement, distributed storage,
  production deployment/auth provider, review tooling, slides, commits and pushes.
- Framework: retain React + TypeScript + Vite. Use app/, features/{auth,workshops,registrations,organizer,participant-preview}/ and shared/{api,ui,lib}/. Backend uses modules/ and shared/{http,database}/.
- Target frontend boundaries: application composition; session lifecycle; preview
  lifecycle; catalog/participant/organizer views; booking orchestration; operation
  store; transport and payload validation; shared presentation/storage utilities.
- Target backend boundaries: server bootstrap; HTTP parsing/CORS/response/errors;
  session auth; booking commands and projections; SQLite lifecycle; gated controls.
- No generic repository framework, dependency injection container, event bus or
  state library unless an identified invariant cannot reasonably be owned by the
  existing TypeScript/React design. Test/lint tooling may add dev dependencies.

## Invariants

- Capacity, unique participant/workshop registration, version checks, ownership
  and state transitions remain enforced together inside SQLite transactions.
- Unknown mutation outcomes remain unknown until documented explicit continuation;
  no automatic mutation retry or GET-based claim of historical success is added.
- Old reads or completions cannot overwrite new context, newer acknowledged rows,
  reopened drafts, or another authenticated session.
- Preview uses the real organizer session, selects only participant projections,
  and cannot mutate data or hide its read-only state while still active.
- Logout must not report confirmed revocation when only local cleanup succeeded;
  confirmed logout invalidates the server session and reload cannot restore it.
- Existing data, seed idempotence, route contracts and documented local startup
  remain compatible. Test data is isolated from the working demo database.
- Tests import supported module interfaces rather than private implementation
  details; no test is deleted or weakened merely to accommodate extraction.

## Weaknesses and risks

The weakest invariant is temporal isolation across auth/context/operation changes.
Extracting hooks can change effect order, callback identity and subscriptions even
when JSX is identical. The highest-impact failure is stale private state or an
incorrectly released mutation guard. Preserve deterministic held-response tests,
add narrow counterexamples before changing behavior, and verify each extraction.

Coverage cannot establish ordering correctness or requirement completeness. A
single repository percentage can hide untested auth branches or be inflated by
render-only modules. Report module/layer metrics and missing branches explicitly.

No Git history exists for rollback. Make an isolated source snapshot before edits;
recover only owned files from it while preserving unrelated user changes. Do not
reset the working DB. Existing working DB backup is not a source-code backup.

## Assumptions and unknowns

- The requested best practices mean proportional modularity and maintainability
  for this local demo, not production platform expansion.
- Current unit/integration coverage percentages and component-tool compatibility
  are unknown. Measure baseline before selecting final module-specific gates.
- Proposed starting gates: critical pure lifecycle/validation modules at least
  90% lines/functions and 85% branches; report all remaining application modules
  and prohibit unexplained regression. Exclusions must be named and justified.
  A gate adjustment requires evidence; never lower it silently to obtain green.
- User clarification during execution: use canonical industry-standard technologies. Retain React/Vite; use Vitest, React Testing Library, Playwright, ESLint and Prettier. Registry peer metadata limits typescript-eslint to TypeScript <6.1; select TypeScript 6.0.3 with ESLint 10 instead of forced peer resolution or Biome. This changes dev tooling only and requires all type/build checks.
- New dev tooling must support the pinned runtime. Use current primary docs when
  selecting/configuring it; no runtime dependency migration is assumed.

## Ownership and decision rights

- Parent agent: review, source backup, design, implementation/integration, test
  architecture, coverage baseline, verification and English project documentation.
- Existing preference: use Luna MAX if implementation is delegated; each delegated
  batch gets exclusive module ownership and this contract. No concurrent edits to
  shared composition/test setup without explicit coordination.
- User: accepts scope, invariants, disclosed risks and budget; decides material
  product changes or evidence-driven scope amendments.
- No publication, commits, deployment or DB reset is authorized by this contract.

## Resource budget

- Discovery: bounded source inventory, two focused source passes and one contract;
  no new benchmark/research project or broad dependency survey.
- Implementation: three verified batches: auth/transport defects and tests;
  frontend module extraction; backend boundaries and test/coverage tooling.
- At most one new component/coverage test stack and one formatting/lint setup;
  reuse existing test runners where appropriate. Maximum two delegated workers
  concurrently, only when ownership is disjoint. No external service calls beyond
  primary tooling documentation/package installation if required.
- Reserve at least 20 percent of effort for full regression, coverage inspection,
  build/start and review of the resulting module boundaries.
- At halfway, compare actual remaining work against the three batches. After
  three-quarters, defer cosmetic extraction that does not own a real invariant.
- Current consumption: all three implementation batches and final verification complete.
- Hard limits: existing demo scope, at most two concurrent delegated workers, no production deployment or data reset.
- Working allocation: the three implementation batches above.
- Verification reserve: at least 20 percent of effort.
- Remaining budget: no required implementation or verification remains in the approved scope.
- Stop conditions: stop affected execution if an approved invariant or scope boundary cannot be retained.
- Numeric token/time/cost limits were not supplied and are not invented.
- Stop affected work if behavior, dependency scope or invariants need amendment;
  never trade verification reserve for unrelated cleanup.

## Acceptance scenarios

- Existing booking, waiting list, cancellation, version conflict and concurrent
  last-seat paths pass through real HTTP/SQLite and representative browser flows.
- Logout success, network failure, malformed reply, held reply and repeated clicks
  have explicit state transitions; late 401 does not revoke a newer session.
- Session restore differentiates an unavailable service from expired credentials;
  retry does not leak private state or silently authenticate an old response.
- Preview target/workshop/exit races and form read-only behavior remain correct.
- API client tests cover credentialed requests, validation, 401/403/409, 5xx,
  malformed JSON, abort and transport failure without retrying mutations.
- Component tests cover user-visible session/preview/form behavior with controlled
  dependencies; transaction correctness stays in integration tests.
- Type checks, lint, format check, unit/component/integration/E2E, coverage and build
  have documented commands, pass, and can be reproduced locally.
- Normal built startup works with preserved working data; test controls stay gated.

## Verification

Record pre/post module map, per-layer test totals, per-module coverage (lines,
functions, branches), exclusions and uncovered critical paths. Reproduce each
behavioral defect with a failing regression before its fix where practical.
Review the diff against invariants rather than only reading test outcomes. Check
import direction, effect ownership and public module interfaces after extraction.
Deliver review findings with fixed/deferred status and links to evidence; do not
claim exhaustive correctness or production readiness.

## Change control

Changes to invariants, scope, decision rights, budget envelope or reserve require
an amendment and explicit approval. Private file naming and extraction choices
within these boundaries do not require repeated approval.

## Approval

Decision requested: approve the bounded refactor, invariants, risks, ownership,
three-batch scope and protected verification reserve.
Decision: Approved by the user, including the React + TypeScript + Vite feature structure.

## Verification evidence — 2026-09-15

All three batches completed with two Luna MAX delegates and parent integration.
112 unit/client, 20 component/hook, 22 HTTP/SQLite and 30 Playwright tests passed.
Type checks, ESLint, Prettier, coverage gates, dependency installation and build
passed. The original logout regression failed on the source backup and passed
on the refactor. A pending-form regression found during E2E was fixed without
weakening its assertions. An old-session test now explicitly triggers its held
request rather than depending on initial-fetch timing.

Critical module gates pass at 90% lines/functions and 85% branches. API coverage
is 90.56% lines, 92.66% functions and 79.87% branches. The broader unit/component
report is 58.21% lines, 60% functions and 53.69% branches; composition and booking
orchestration currently rely on E2E and remain explicit coverage limitations.
The registration orchestration hook remains large; further splitting is deferred
within the approved proportional-modularity scope to preserve invariant ownership.

The applied source at /Users/kirillf/devel/workshop-desk matched the verified
snapshot. Clean dependency installation/build and normal compiled startup passed.
Browser checks confirmed restore, organizer preview, logout, reload signed out,
and fresh login. API health returns 200 and test controls return 404 in normal
mode. All three workshop and seven registration rows remained unchanged.
Detailed evidence: /Users/kirillf/devel/workshop-desk/docs/REFACTOR_REVIEW.md.
No commit, push, production deployment or working data reset was performed.
