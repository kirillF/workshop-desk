# Workshop Desk — Implementation Tasks for Luna

Status: WD-01–12 DONE; final auth acceptance verified on 2026-09-15. See [acceptance evidence](../docs/acceptance.md) and [auth handoffs](results/09.md), [10](results/10.md), [11](results/11.md), [12](results/12.md).
Source: [Product Specification v0.3](../docs/PROJECT_SPEC.md).
Executor: Luna MAX (`gpt-5.6-luna`, max reasoning), explicitly requested by the user.
Parent integration applies changes and independently verifies acceptance.

## Authentication and preview follow-up

Approved requirements: [AUTH_SPEC.md](../docs/AUTH_SPEC.md). This amendment
supersedes the v0.3 demo identity switcher. The latest user request explicitly
approved task preparation and launching implementation with Luna MAX.

| Task | Scope | Dependency |
|---|---|---|
| [WD-09](09-auth-api.md) | Password login, server sessions, roles and read-only preview authorization | v0.3 baseline |
| [WD-10](10-auth-ui.md) | Login/logout and role-specific navigation | WD-09 |
| [WD-11](11-preview-ui.md) | Organizer Services menu and participant preview | WD-09/10 |
| [WD-12](12-auth-acceptance.md) | Auth/security scenarios, existing browser regression, build and handoff | WD-09–11 |

Executor: Luna MAX, working sequentially. Current source of actual progress is each
task card/result; dispatch does not establish completion. Parent owns requirement
and task-list preparation, and reviews integration evidence. No monetary estimate
is available. Implementation must preserve the Praktika redesign and existing data.

## Execution Order

Use one task at a time in the same project. The tasks share contracts and state;
parallel execution is not the default. Read completed handoffs before each task.

| Task | Deliverable | Dependency |
|---|---|---|
| [WD-01](01-bootstrap.md) | Runnable workspaces, real DB, health, seed/reset | None |
| [WD-02](02-organizer-api.md) | Organizer API, conditional writes, capacity/permission checks | WD-01 |
| [WD-03](03-organizer-ui.md) | Organizer UI and shared scoped operation layer | WD-02 |
| [WD-04](04-ordering-checkpoint.md) | Deterministic ordering, browser evidence, runnable checkpoint | WD-03 |
| [WD-05](05-unknown-outcomes.md) | Unknown outcomes, explicit continuation, reload recovery | WD-04 |
| [WD-06](06-participant-api.md) | Participant POST and conditional re-registration | WD-05 |
| [WD-07](07-participant-ui.md) | Catalog, form, waiting list, cancellation, accessibility | WD-06 |
| [WD-08](08-acceptance.md) | Built startup, clean-checkout verification, full acceptance | WD-07 |

### Milestones and Honest Partial Completion

- **After WD-04:** a runnable organizer interaction with known-outcome ordering checks.
  This is the first candidate for a technical walkthrough. Unknown-outcome completion
  and the participant flow remain incomplete. Do not label this Stage A or v0.3 done.
- **After WD-05:** Stage A is complete in organizer scope, including uncertain outcomes.
- **After WD-08:** the full product is complete only if every product acceptance check
  passes and startup/documentation requirements are verified.

For the discussed 5–6-hour talk-preparation window, WD-01–04 are the first application
work checkpoint, not a promise that all eight tasks fit that window. Protect time for
slides and rehearsal. Stop expanding application scope at the checkpoint when asked;
do not quietly remove requirements to declare completion. Task durations have not
been measured. Report cost/time where observable rather than inventing estimates.

## Instructions for Every Task

1. Read root AGENTS.md, the task card, its source clauses, and dependency results.
   Confirm what exists before editing; no task may assume a predecessor succeeded
   merely because its files are present.
2. Implement only the selected task's scope. Choose routine implementation details
   within the specification without repeatedly asking for approval. Consult current
   primary framework documentation for APIs and version choices when needed.
3. Preserve unrelated work. Do not spawn more agents, publish, deploy, or run paid
   model comparisons. Do not commit or push unless separately authorized.
4. Reserve at least 20% of the available task effort for meaningful verification and
   the handoff. With no numeric budget, the task card is the scope limit. If a hard
   time limit is supplied, surface remaining work before spending the verification
   reserve on optional polish.
5. Keep the product baseline correct. Use normative acceptance scenarios, not speaker
   scripts or intentionally defective patches. Do not load talk preparation files
   into an ordinary review session.
6. Run the task's relevant checks. A later acceptance task does not excuse skipping
   meaningful tests now. Do not add tests that only mirror implementation details.
7. Update the task card to IN_PROGRESS, DONE, or BLOCKED as appropriate, and write a
   concise results file. BLOCKED names the concrete missing input or failure. A
   failed check is not a completed task; continue fixes within authorized scope.
8. Keep all project documentation in English and product UI copy in Russian.

The root AGENTS.md and product specification remain authoritative. Task cards locate
requirements rather than overriding them. If a card conflicts with v0.3, explain and
correct the decomposition; changing product behavior requires an explicit decision.

## Acceptance Ownership

The table assigns execution ownership, not present passing status. All criteria now have recorded evidence in docs/acceptance.md. WD-08 verifies the
complete map rather than replacing the earlier tests.

| Product criterion | First implementation/check owner | Completion or extension |
|---|---|---|
| AC-01 | WD-07 | WD-08 |
| AC-02 | WD-06 | WD-08 |
| AC-03 | WD-07 | WD-08 |
| AC-04 | WD-06 API | WD-07 UI, WD-08 |
| AC-05 | WD-02 API | WD-03 UI, WD-08 |
| AC-06 | WD-06 API | WD-07 UI, WD-08 |
| AC-07 | WD-06 API | WD-07 UI, WD-08 |
| AC-08 | WD-04 | WD-08 |
| AC-09 | WD-04 | WD-08 |
| AC-10 | WD-03 | WD-07 creation path, WD-08 |
| AC-11 | WD-02 | WD-04 client behavior, WD-08 |
| AC-12 | WD-05 | WD-07 participant path, WD-08 |
| AC-13 | WD-04 | WD-07 views, WD-08 |
| AC-14 | WD-02 | WD-06 participant endpoints, WD-08 |
| AC-15 | WD-03 initial loading | WD-07 forms, WD-08 |
| AC-16 | WD-07 | WD-08 |
| AC-17 | WD-03/WD-04 organizer contexts | WD-07 form interactions, WD-08 |
| AC-18 | WD-05 | WD-08 |
| AC-19 | WD-05 PATCH | WD-06/WD-07 POST, WD-08 |
| AC-20 | WD-06 server | WD-07 client guard, WD-08 |
| AC-21 | WD-05 | WD-07 participant contexts, WD-08 |

Runtime, persistence, seed/reset, and isolation begin in WD-01; normal-mode control
exclusion is checked in WD-04; all build/start and documentation criteria close in
WD-08. Add actual test locations to task results when implemented.

## Prompt to Start a Task

Replace the task filename with the chosen card. This prompt authorizes only that
card; it does not implicitly execute the entire backlog.

```text
Implement tasks/01-bootstrap.md in /Users/kirillf/devel/workshop-desk.
Read AGENTS.md and tasks/README.md first. Use docs/PROJECT_SPEC.md v0.3 as the
normative source and inspect the current project state. Stay within the task's
owned scope, preserve others' edits, and complete its meaningful checks. Do not
load talk preparation materials, introduce planted defects, or run other agents.
Do not publish or commit. Update the task status and write tasks/results/01.md
with changed files, exact checks/results, limitations, and the next task.
Stop after this task; do not start the next one automatically.
```

## Results Format

Create tasks/results/NN.md only when the task is executed. Include status, source
revision, changed files, working commands, check outcomes and AC scope, unavailable
checks, remaining risks, and next task. If no implementation commit exists, identify
the working-tree state honestly. Keep it short; existing test output can be linked.
