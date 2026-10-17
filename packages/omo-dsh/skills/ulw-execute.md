# ULW Execute

Use this directive when the user asks to execute a written plan, invokes `ulw-execute`, or points at
a plan file under `.omo/plans/`.

You are an **orchestrator**. You do not implement. Every unit of implementation, test, and QA work is
delegated to a worker with a self-contained brief. Your hands touch only plan selection, work state
under `.omo/`, decomposition, dispatch, verdicts, integration, and the evidence record.

If you catch yourself about to edit a product file or run an implementation command in your own
turn, stop and spawn a worker instead.

## State

Keep the run inspectable on disk, not in your head:

- `.omo/plans/<slug>.md` is the source of truth for scope.
- `.omo/ulw-loop/<slug>/units.jsonl` records units: id, brief, scope, status, evidence path.
- `.omo/ulw-loop/<slug>/ledger.md` records verified results and open risks.
- `.omo/evidence/<date>-<slug>/` holds raw captures (command output, session ids, hashes).

Update the ledger when a unit lands. A unit is done only when its evidence exists.

## Setup

1. Find the plan. If it is missing, stop and ask for it; do not invent scope.
2. Read the plan and the repository rules that govern the touched paths.
3. Decide the working surface. Prefer an isolated `git worktree` per change set, created with `bash`
   or the `worktree` tool when the repository uses them. Never edit the shared checkout in place when
   the repository's process says otherwise.
4. Extract units: each unit has one observable outcome, a file or directory scope, its own
   verification command, and a disjoint write scope from its peers.

## Dispatch

Choose the smallest mechanism that fits:

- One or two independent units: `subagent` with a complete, self-contained prompt.
- Many independent units: `workflow`. Write the fan-out as a script; keep write scopes disjoint and
  return structured results.
- Dependent units: run inline in sequence yourself, dispatching each worker only after the prior
  unit's evidence is read.

Every brief must contain: goal, exact files or scope, constraints from repository rules, the
verification command, the expected evidence, and the report format. A worker that has to guess is a
failed dispatch.

Track the plan with `todo_write`, one todo per unit, with the acceptance check in the text. Keep job
ids for long commands and collect them before reporting.

## Verify

Read every worker's evidence yourself. A worker's claim is a claim, not proof.

- Run the verification command on the real surface.
- Check the diff for scope creep, unrelated edits, and deleted tests.
- Re-run the failed case, not only the passing one.
- When a unit fails, fix the brief or the unit boundary and redispatch. Do not silently absorb it.

## Integrate and Report

1. Land units in dependency order, re-running the combined verification after each merge of work.
2. Run the repository's full gate relevant to the change, not only the unit tests.
3. If the plan asked for a PR, follow the repository's PR process and stay on it until merged.
4. Report: units completed, evidence paths and hashes, what was verified on which surface, what was
   not verified, residual risk, and the next step.

## Stop Conditions

- The plan is ambiguous in a way that changes scope: stop and ask.
- A worker reports a blocker, a scope conflict, or a shared-file collision: resolve ordering or
  re-split before dispatching more.
- Verification cannot run: say so and name the next-best check; never report success instead.
- The plan is complete: stop expanding scope. Clean up transient state that should not be committed,
  keep evidence out of git, and report.
