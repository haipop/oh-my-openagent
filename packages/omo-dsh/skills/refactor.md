# Refactor

Use this directive when the user asks to refactor, simplify, extract, restructure, modernize, or
clean up code.

A refactor changes structure without changing behavior. If behavior must change, that is a feature
change and gets its own plan, its own tests, and its own commit.

## Phase 0: Contract

Before touching anything, write down:

1. The behavior that must not change, named as observable outcomes.
2. The structure problem being fixed, named with file paths and a measurement (duplication count,
   file size, dependency edge, function length).
3. The blast radius: who imports this, which tests cover it, what ships from it.
4. The stop line: what "done" looks like and what is explicitly out of scope.

If the behavior is not covered by tests, lock it first with characterization tests that pass before
the change. A refactor without a baseline is a rewrite with extra steps.

## Decomposition

Choose the smallest strategy that reaches the goal:

- `SAFE`: extract functions, rename, move code behind the same public API, add types. Behavior
  provably identical by inspection.
- `STRUCTURED`: split modules, change internal boundaries, introduce shared primitives. Requires tests
  at the boundary.
- `AGGRESSIVE`: replace an algorithm or subsystem. Requires a plan, a rollback path, and comparative
  verification.

Prefer in this order: delete unused code, inline single-use abstraction, extract duplication into one
place, move code to its natural module, split oversized files. In that order, because deletion is the
only refactor that cannot introduce a bug.

## Step Discipline

One step is one atomic, reversible change that leaves the tree green:

1. State the step: what moves, from where to where, and why.
2. Make the change with `edit` or `write`, keeping the diff reviewable.
3. Run the targeted tests, then the package suite.
4. Read the diff: no unrelated edits, no renamed public symbols without updating every call site, no
   dropped behavior hidden as cleanup.
5. Commit or record the step, then start the next.

Never batch independent refactors into one step. When a step fails, revert it before trying another.

## Measurement

Prove the refactor paid:

- Run the repository's lint, typecheck, and tests before and after.
- Report the metric the refactor targeted: lines removed, duplication sites collapsed, file size,
  import edges, public API surface.
- If the metric did not improve, say so and reconsider; a refactor that moves complexity around is a
  net cost.

## Cleanup Rules

- Delete dead code, do not comment it out.
- Delete tests for deleted code; do not keep them passing vacuously.
- Keep public APIs stable unless the user asked for a breaking change; then bump and document it.
- Do not reformat unrelated code in the same diff.
- Do not add abstraction for a single caller.
- Do not mix dependency upgrades, formatting sweeps, and structural moves in one change.

## Report

State: what changed structurally, what behavior was verified unchanged and by which command, the
metric before and after, files touched, and residual risk. If part of the refactor was skipped for
safety, name it and why.
