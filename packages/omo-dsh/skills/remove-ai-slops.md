# Remove AI Slops

Remove AI-generated slop from a bounded set of changed files without changing behavior. Order is
fixed: lock behavior with green regression tests, run the deletion ladder, apply the categorized
cleanup, then verify with real gates and a critical review. Behavior is locked by passing tests
before a line is removed; a checklist is not safety.

DeepSeek Harness has no LSP. Tools: `read`, `write`, `edit`, `grep`, `glob`, `todo_write`, `bash`
(background with `run_in_background`, then `job_output`/`job_kill`), `terminal_open`/`terminal_send`/
`terminal_read`, `subagent`, `workflow`. There is no `lsp_diagnostics`, no `task(...)`, and no
background-output polling. Tests and typecheck are the repository's own commands.

## Scope

- Default: branch diff against `merge-base main`, or the repository's default branch.
- Explicit: the file list the caller passed.
- A file outside the set is report-only, even when you notice slop in it.

## Slop taxonomy

Ten categories; every entry carries its keep rule. A category stripped of the keep rule is vandalism.

**1. Redundant comments.** Docstrings repeating the signature, section dividers, commented-out code,
vague `TODO`/`Note`. Keep WHY comments (business rule, edge case, workaround, incident), ticket
links, regex notes, BDD markers (`# given`, `# when`, `# then`).

**2. Defensive clutter.** Guards for impossible nulls, try/catch that cannot throw, type checks on
typed parameters, defaults for required parameters, back-compat shims, validation at three layers,
broad catches (empty `catch {}`, `catch (e) { console.error(e) }`, `except Exception`). Keep boundary
validation (user input, network, disk), I/O handling, nullable fields, one logging top-level catch.
Deleting a trust-boundary guard needs an adversarial test that fails without it, or the guard stays.

**3. Needless complexity.** Nesting past three levels, nested ternaries, four-predicate booleans,
over five parameters without an options object, fifty-line god functions, `if/else if` chains on a
type or enum. Keep established patterns and measured hot paths. Refactor to guard clauses, explicit
if/else, exhaustive `switch`/`match` with a never-case.

**4. Needless abstraction and wrappers.** Pass-through wrappers, single-use helpers, a
one-implementer interface with no test seam, a factory that only calls a constructor. Keep a real
seam (test injection, multiple implementers, framework boundary). Inline the rest.

**5. Dead code and leftovers.** Unused imports and private functions, unreachable branches, stale
flags, debug leftovers (`console.log`, `print`, `dbg!`). Keep code reached by reflection, dynamic
dispatch, manifest, or convention-based route. Without LSP, `grep` every reference across source,
tests, scripts, and configs; only an empty set justifies deletion.

**6. Duplication and copy-paste.** Copied branches with trivial differences, two helpers doing one
thing, repeated magic numbers. Keep incidental duplication where sites may diverge; a premature
shared abstraction costs more than the copy. Extract only when the copies must change together.

**7. Boundary violations, hidden coupling, misleading names.** Wrong-layer imports, a handler doing
business logic, module A reading module B's private state, side effects in a pure-named function,
names that lie (`get*` writes, `is*` throws, `validate` mutates). Keep established shortcuts. Move
the behavior or rename to the truth, with every reference updated. Flag unclear ownership.

**8. Behavior-preserving performance equivalents.** Only when equivalence is evident: quadratic scan
to set lookup, loop-invariant hoist, one-shot eager collection made lazy, string concat to join, loop
calls batched, redundant clones dropped, cached `.length`. No algorithm change with subtle
correctness implications, no micro-optimization without a benchmark, no rewrite needing an
equivalence proof (that is a refactor). When in doubt, skip.

**9. Missing tests.** Behavior no test pins. Add the narrowest test; do not delete code. Prose
(prompt, `SKILL.md`, rule, markdown) has no behavioral seam: do not pin its wording or length; pin a
machine-consumed value or leave it to review.

**10. Oversized modules.** Any source file over 250 pure LOC (non-blank, non-comment). Measure with
`awk '!/^[[:space:]]*$/ && !/^[[:space:]]*(#|\/\/)/' FILE | wc -l`. A 230-LOC file about to grow is
already over. Name responsibilities, split by concept (never `utils`, `helpers`, `service`), show the
plan, keep the index re-export-only, re-measure, rerun tests. Token-count splits are not splits;
"generated" holds only inside a build output directory.

## Detection heuristics

- changed files: `git diff --name-only "$(git merge-base main HEAD)"..HEAD`;
- size: the `awk` measurement above;
- unused symbol: `grep -rn "\bNAME\b" .`, reading every hit, tests included;
- copy-paste: `git diff -M`, then search one distinctive line of the suspected copy;
- debug leftovers: `grep -rn "console\.log\|debugger\|dbg!" <scope>`;
- broad catch: `grep -rn "catch\s*(\|except " <scope>`, reading each hit for narrowing;
- speculative code: `grep -rn "might need\|for later\|future use" <scope>`.

A hit is a candidate, never a finding. Read the code around it before classifying.

## Phase 0: plan in todos

One `todo_write` list: scope, baseline tests, ladder, cleanup passes, gates, review, report. One todo
`in_progress`.

## Phase 1: fix the scope

Use the explicit list when given. Otherwise run the changed-files command and drop deleted files,
binaries, generated and vendored paths (`node_modules/`, `dist/`, `build/`, `vendor/`, lockfiles).
Print the list before touching anything.

## Phase 2: lock behavior with regression tests

1. Name the observable behavior: exported functions, handlers, CLI commands, classes used elsewhere.
2. Find existing coverage with `grep` over the project's test layout.
3. If coverage is missing or weak, write the narrowest regression test that pins current behavior
   before editing. Pin observable outputs, not implementation details.
4. Run the suite or the relevant tests. It must be green before cleanup starts.

No green baseline means stop and report. Cleanup on unverified ground is a behavior-change time bomb.
Prose files are exempt from step 3.

## Phase 3: deletion ladder, then smells

The largest safe deletion is code that should never have existed. For each changed unit, in order:

- delete entirely: the behavior is not needed (YAGNI, speculative);
- reuse: an existing helper here already does it;
- platform, stdlib, native, or dependency: the language, runtime, or an installed dependency already
  does it (hand-rolled picker to `<input type="date">`, custom parser to `URLSearchParams`);
- simplify in place: it must exist; make it smaller.

Only units on the last rung reach the categories. One function replaced by a platform call is a
bigger, safer win than any line-level cleanup.

When the diff fixes a bug, `grep` the callers of every shared function it touches and prefer one
root-cause fix at the seam; a per-caller patch that leaves a sibling caller broken is a partial fix.

Plan before editing or delegating:

```text
File: src/foo.ts
  Ladder: 2 simplify-in-place, 1 delete (native input replaces custom picker)
  Categories: dead code, complexity, performance
  Risk: medium (touches the cache layer)
```

Intentional shortcuts (a small scan fine under N rows, a global lock, a bounded O(n^2) path) get a
`debt:` comment naming the ceiling and the upgrade trigger, plus a line under "Remaining Risks". A
simplification with a known ceiling and no marker is indistinguishable from a bug.

Order, safest to riskiest: comments, dead code, defensive, duplication, complexity, abstraction and
boundary, performance, tests, oversized modules.

## Phase 4: execute

One category at a time; run the relevant test after each. Read the diff after each pass and revert a
hunk that no longer matches its stated category.

Batch a long list: slices of at most five files, one `subagent` per file, all launched in one
message. Each prompt is self-contained (file, ladder, categories and keep rules, constraints, report
shape) because the child does not see this conversation. Collect results as they notify; do not poll.
Above about ten files, `workflow` can fan out the same prompt, with verification still done once in
Phase 5. A silent child, a summary with no diff, or an ack-only reply is inconclusive: verify the
file yourself and retry once, without stalling the batch.

Long commands: start a test or typecheck with `bash` and `run_in_background`, collect with
`job_output` (`wait: true` only when blocked), stop abandoned work with `job_kill`. A watcher or REPL
belongs in the terminal tools, not a background job.

Constraints: behavior preserved and skipped when equivalence is not evident; no public API signature
change; no removed type annotations; no new abstraction or dependency; diff minimal and scoped; no
file outside scope touched.

## Phase 5: gates and critical review

Run every applicable gate; report `N/A` with a reason instead of hiding a skipped one.

| Gate | How to run it here | Pass condition |
|---|---|---|
| Baseline and regression tests | project test command from `package.json` or `AGENTS.md` | all green |
| Typecheck | project's own command (`bun run typecheck`, `tsc --noEmit`, `cargo check`, `go vet`) | zero new errors |
| Lint | project linter | zero new errors |
| Unit and integration | project test runner | green, pre-existing failures named |
| Static or security scan | project scanner | zero new findings, or `N/A` |
| Diff sanity | `git diff --stat`, `git status` | in-scope files only, slop-sized hunks |

Typecheck has no LSP fallback. Discover the command from repository instructions and manifests, run
it, quote the result. When none exists for that path, write `N/A (no typecheck configured for PATH)`
and say what substituted (tests, build, targeted script). Never imply an editor check.

Critical review. Safety: no functional logic removed; I/O, network, and external API error handling
intact; type annotations intact; imports valid; no public API change. Behavior: return values pinned
by Phase 2 tests; side effects and error behavior unchanged; edge cases preserved. Quality: removed
code was slop, not an intentional pattern; conventions followed; no orphaned references; performance
changes plainly equivalent; no new abstraction.

## Phase 6: fix or revert

Name the change and why it broke; `git checkout -- <file>` or revert only the offending hunk with a
targeted `edit`; reapply only what you can prove safe; rerun the failing gate and re-walk the
checklist. Three failures on one file: stop and escalate with the file, attempts, failures, and your
hypothesis.

## Second opinion with subagent

One `subagent` reviewer when self-review is weak: more than about 150 changed lines, a deleted guard
at a trust boundary, a performance change whose equivalence is not readable at a glance, an ownership
call on a boundary violation, or a user who asked for review. Do not use it to replace your own
verification, and do not run a team or a loop for it.

Give the child the diff, the categories and keep rules, the constraints, and one question: list every
deletion you can prove unsafe, with file and line, or answer `none`. The answer is advisory; verify
each claim against the code.

## Change-size discipline

- One atomic commit per category per coherent file group, with the category in the message.
- Never mix dead-code deletion, a rename, and a performance change in one commit.
- Every hunk is explainable in one sentence; a hunk needing a paragraph is a refactor.
- When cleanup grows into a rewrite, stop, split, and report the rest.
- Commit only when asked; never include evidence artifacts, secrets, or generated local state.

## Output format

```text
AI SLOP REMOVAL REPORT
======================

Scope: [branch diff vs merge-base main / explicit file list]
Files: [N] (list)

Behavior Lock:
  - Existing coverage: [N files]
  - Tests added: [M at path]
  - Baseline: GREEN

Cleanup Plan:
  - file: [ladder] then [category order]

Per-File Results:
  file
    - Ladder/delete: custom picker (48 lines) replaced by <input type="date">
    - Dead code: 3 removed (L12-14, L40), unreachable
    - Complexity: 1 (nested ternary L42 to if/else)
    - Performance: 1 (L90 scan to set lookup, behavior identical)
    - Skipped: 2 (boundary guard, WHY comment L88)

Quality Gates:
  - Regression tests: PASS (12 passed)
  - Typecheck: PASS (`bun run typecheck`, 0 new errors) | N/A (none configured)
  - Lint: PASS
  - Unit/integration: PASS (45 passed)
  - Static/security: N/A (not configured)

Critical Review: Safety PASS, Behavior PASS, Quality PASS

Issues Found & Fixed: [None] or [issue, then fix]

Net Impact: LOC -74 (91 removed, 17 added), deps -1, files deleted 1

Remaining Risks / Deferred (the debt ledger):
  - [None] or [boundary violation in X flagged, not refactored]
  - `debt:` markers: [None] or [file:line, ceiling, upgrade trigger]

Final Status: CLEAN | ISSUES FIXED | REQUIRES ATTENTION
```

## Anti-patterns

- Skipping Phase 2. Removing code on uncovered ground is a behavior-change time bomb.
- Bundling unrelated refactors. A commit mixing dead-code deletion, a rename, and a performance
  change cannot be reviewed or bisected.
- Algorithm changes wearing a performance label. When equivalence needs proof, it is a refactor.
- Silent skips. Write `N/A` and why, or the failure and why it stands. Never claim PASS without
  output.
- Deleting WHY comments. "It is obvious from the code" is rarely true for the next reader.
- Touching files outside scope. Report noticed slop under Remaining Risks.
- Trusting a subagent summary. Read the diff and run the gates yourself.
- Pretending to have LSP. An unrun typecheck is a false green.

## Verification honesty

- Read the error and retry with adjusted arguments when a command fails.
- Never silently skip a failed command.
- Never report a gate without running it and reading the output.
- While more inspection is needed, keep using `grep`, `read`, tests, and the typecheck until the
  result is grounded.
- The default when in doubt is SKIP, not GUESS.

Adapted from OmO's remove-ai-slops skill for DeepSeek Harness.
