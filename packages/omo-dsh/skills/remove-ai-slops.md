# Remove AI Slops

Clean AI-generated slop from a bounded set of changed files while strictly preserving behavior.
Lock behavior with regression tests first, run a categorized multi-pass cleanup, then verify with
quality gates and a critical review. Revert and direct-edit when verification fails.

The core safety invariant: **behavior is locked by green tests before a single line is removed.** A
checklist alone is not safety; a passing regression test is.

## Inputs

- **Default scope**: branch diff vs the repository's base branch (`main`, `master`, or `dev`).
- **Optional scope**: an explicit file list passed by the caller.

## Categories (what counts as slop)

Judge against these categories. The first three are stylistic, the next three structural, the next
two about hidden cost, and the last about behavior coverage.

### Stylistic

1. **Obvious comments**: comments restating code, trivial docstrings, section dividers,
   commented-out code, vague TODOs.
   - KEEP: comments explaining WHY (business logic, edge cases, workarounds), ticket links,
     regex or algorithm explanations, and BDD markers (`# given`, `# when`, `# then`).

2. **Over-defensive code**: null checks for guaranteed values, try/except around code that cannot
   raise, type checks for statically typed params, default values for required params, backward-compat
   shims, validation duplicated at multiple layers, broad exception catching (`except Exception`,
   empty `catch {}`, `catch (e) { console.error(e) }` without narrowing).
   - KEEP: validation at system boundaries (user input, external APIs), I/O error handling, nullable
     DB fields. A top-level boundary catch-all with explicit logging and re-raise is acceptable.
   - REFACTOR: catch the specific exception you expect; add `instanceof` narrowing or re-throw.
   - PROOF REQUIRED: before deleting a guard at a trust boundary, Phase 2 must include an adversarial
     regression (malformed or hostile input) that fails if the guard is removed. No adversarial test
     means the guard stays.

3. **Excessive complexity**: deep nesting (more than 3 levels), nested ternaries, boolean expressions
   combining 4+ predicates, long parameter lists (more than 5 args without a record/object), god
   functions (more than 50 lines doing many things), clever one-liners, `if/elif/else` chains for
   type or enum discrimination where the language has a better match construct.
   - KEEP: established complexity patterns in the codebase and performance-critical idioms.
   - REFACTOR: nested if-chains into guard clauses, complex ternaries into explicit if/else.

### Structural

4. **Needless abstraction**: pass-through wrappers, single-use helpers, speculative indirection,
   interfaces with one implementer that buy no testability, factories that only call a constructor.
   - KEEP: abstractions with a real seam (testability, multiple implementers, framework mandates).

5. **Boundary violations**: wrong-layer imports, leaky responsibilities, hidden coupling, side
   effects in pure-named functions.
   - KEEP: pragmatic short-circuits already established as a pattern. Flag for human judgment if unsure.

6. **Dead code**: unused imports, unused private functions, unreachable branches, stale feature
   flags, debug leftovers (`console.log`, `print(...)`, `dbg!`), removed-but-still-referenced code.
   - KEEP: code reached through reflection, dynamic dispatch, or string lookup; rollback flags the
     user confirms.

### Hidden cost

7. **Duplication**: copy-pasted branches with trivial differences, redundant helpers,
   repeated literal or magic-number sequences.
   - KEEP: incidental duplication that serves different intents and could diverge. Prefer separate
     copies over a premature shared abstraction.

8. **Performance equivalences** (behavior-preserving only): O(n²) to O(n) with a set lookup, hoisting
   loop-invariant work, avoiding unnecessary intermediate collections, `join` instead of string
   concatenation in a loop, batching redundant calls, dropping redundant clones, caching a length
   computed in a loop.
   - Hard rule: apply only when equivalence is obvious. Do not change algorithms with subtle
     correctness implications. Do not micro-optimize hot paths without a benchmark. If in doubt, SKIP.

### Behavior coverage

9. **Missing tests**: behavior present in the changed files that no regression test pins. The fix is
   to ADD the narrowest test, not to remove code. A prose file (prompt, `SKILL.md`, rule, markdown)
   has no behavioral seam: do not add a wording or length pin; cover only a machine-consumed value
   or leave it to review.

### Structural

10. **Oversized modules**: a source file beyond the project's agreed size budget (measure with
    `awk '!/^[[:space:]]*$/ && !/^[[:space:]]*(#|\/\/)/' <file> | wc -l`, or the repository's own
    checker if it ships one). This is an architectural defect, not a style preference.
    - Do not only flag it. Plan the split by responsibility, present the plan to the user, extract
      clean modules with explicit re-exports, then re-measure. Never create catch-all dump files
      (`utils.*`, `helpers.*`, `service.*`) and never split by token count.
    - KEEP: genuinely self-contained single-responsibility scripts, and files the repository opts
      out through a documented marker.

## Quality gates

A pass is complete only when every applicable gate is green. Report `N/A` explicitly for gates the
repository does not have; never silently skip.

| Gate | How to run |
|---|---|
| Regression tests | the project's test runner, all green |
| Lint | the project's linter, zero errors (pre-existing warnings only) |
| Typecheck | the project's typecheck command, zero new errors on changed files |
| Unit and integration tests | the project's test runner, all green (pre-existing failures noted, not introduced) |
| Static or security scan | the project's scanner, zero new findings or `N/A` |

There are no LSP tools in the DeepSeek Harness. Typecheck means the repository's own command (look
in `AGENTS.md`, `package.json`, `Makefile`, or CI config) through `bash`; if the repository has none,
say so and report `N/A` for that gate.

## Process

### Phase 0: plan with todo_write

Create todos for all phases. Mark one `in_progress` at a time.

### Phase 1: determine scope

If file paths were passed, that is the scope. Otherwise:

```bash
git diff $(git merge-base origin/HEAD HEAD)..HEAD --name-only
```

Filter out deleted files, binary files, and generated or vendored files (`node_modules/`, `dist/`,
`target/`, lockfiles). List the final scope.

### Phase 2: lock behavior with regression tests (non-negotiable)

For each in-scope source file:

1. Identify the public or observable behavior the file exposes.
2. Find existing tests with `grep` and `glob`.
3. If behavior is uncovered or weakly covered, write the narrowest regression test that pins current
   behavior BEFORE editing the file. Pin observable outputs, not implementation details. A prose file
   is exempt from test pinning.
4. Run the relevant tests. They must be green before any cleanup starts.

If you cannot establish a green baseline, STOP and report. Do not clean up unverified ground.

### Phase 3: cleanup plan, existence first, then smells

The largest, safest deletion is code that should not have existed. Before categorizing smells, run
the deletion ladder on each changed unit:

- **Delete entirely**: the behavior is not needed.
- **Reuse**: an existing helper in the repository already does it.
- **Platform / stdlib / dependency**: the language, runtime, or an installed dependency already
  does it (native date input instead of a hand-rolled picker, `URLSearchParams` instead of a custom
  query parser).
- **Simplify in place**: it must exist; make it smaller.

Only units that land on simplify-in-place proceed to the smell categories.

For a diff that fixes a bug, `grep` the callers of every shared function it touches. Prefer one root
cause fix at the shared seam over repeated guards at each caller.

Then write an explicit plan before spawning helpers:

```text
File: src/foo.ts
  Ladder: 2 units simplify-in-place; 1 unit delete (native input replaces custom picker)
  Categories: dead code, excessive complexity, performance
  Order: dead code -> complexity -> performance
  Risk: medium (touches caching layer)
```

Intentional shortcuts: if the plan keeps a bounded simplification, mark it in code with a `debt:`
comment naming the ceiling and the upgrade trigger, and list it under "Remaining Risks / Deferred".
That section is the debt ledger.

Order rule (safest to riskiest): comments, dead code, defensive, duplication, complexity,
abstraction or boundary, performance, tests, oversized modules.

### Phase 4: parallel slop removal with subagents

Process files with `subagent` calls, batched five at a time. Each child receives the file path, the
deletion-ladder step, the applicable categories, and the hard constraints.

1. Slice the in-scope file list into chunks of up to 5.
2. For each chunk, send all `subagent` calls in one message (independent work runs in parallel).
3. Collect each child's report. A slow child is not a failed child: wait for its message instead of
   relaunching it.
4. Launch the next chunk. If total files are 5 or fewer, one batch is enough.
5. A child that returns without the deliverable gets one retry later. If the retry fails, escalate that
   file under "Issues Found & Fixed".

Per-file prompt shape:

```text
Remove AI slops from: <file>

First run the deletion ladder (delete entirely / reuse existing repo code / platform or stdlib /
simplify in place); only code that must exist proceeds to smell removal.

Evaluate every category in the remove-ai-slops taxonomy, applying its KEEP and REFACTOR rules.

Apply changes in this order: comments -> dead code -> defensive -> duplication -> complexity ->
abstraction/boundary -> performance -> oversized modules.

Hard constraints:
- Behavior MUST be preserved. When equivalence is not obvious, SKIP.
- Do not change public API signatures.
- Do not remove type hints.
- Do not introduce new abstractions or dependencies.
- Keep the diff minimal and scoped to slop removal.

Report changes grouped by category with before/after, why it is slop, and why it is safe.
Report each skipped issue with the reason.
```

### Phase 5: verify with quality gates and critical review

Run the gates above, then walk the checklist.

Safety:

- No functional logic accidentally removed.
- Error handling preserved, especially around I/O, network, and external APIs.
- Type hints intact.
- Imports still valid.
- No breaking public API changes.

Behavior:

- Return values unchanged (verified by the Phase 2 tests).
- Side effects and exception behavior unchanged.
- Edge cases preserved.

Quality:

- Removed changes are genuinely slop, not intentional patterns.
- Remaining code follows project conventions.
- No orphaned code or dead references.
- Performance changes are obviously equivalent.
- No new abstractions introduced.

### Phase 6: fix issues

If a gate fails or a checklist item flips:

1. Identify the change that caused it.
2. Explain why it broke.
3. Revert that file or the problematic hunk (`git checkout -- <file>` or a targeted `edit`).
4. If genuine slop remains, edit the file directly, applying only provably safe changes.
5. Re-run the failing gate and re-walk the checklist for that file.
6. Repeat until gates are green and the checklist is clean.

After three failed attempts on the same file, STOP and escalate to the user with the file, what you
tried, what failed, and your hypothesis. Do not keep editing.

## Output format

```text
AI SLOP REMOVAL REPORT
======================

Scope: [branch diff / explicit file list]
Files: [N files]

Behavior Lock:
  - Existing coverage: [N files already covered]
  - Tests added: [M new regression tests at <paths>]
  - Baseline status: GREEN

Cleanup Plan:
  - <file>: [ladder] -> [category order]

Per-File Results (each cut shows what replaces it):
  <file>
    - Ladder/delete: <what> (<lines>) -> <replacement>
    - Dead code: <n> removed -> nothing
    - Excessive complexity: <n> simplified
    - Skipped (preserved): <n> with reasons

Quality Gates:
  - Regression tests: PASS | FAIL | N/A
  - Lint: PASS | FAIL | N/A
  - Typecheck: PASS | FAIL | N/A
  - Unit/integration tests: PASS | FAIL | N/A
  - Static/security scan: PASS | FAIL | N/A

Critical Review:
  - Safety: PASS | FAIL
  - Behavior: PASS | FAIL
  - Quality: PASS | FAIL

Issues Found & Fixed: [None] or [issue -> fix]
Net Impact: LOC -<n>, dependencies -<n>, files deleted <n>

Remaining Risks / Deferred (debt ledger): [None] or [item -> ceiling and trigger]

Final Status: CLEAN | ISSUES FIXED | REQUIRES ATTENTION
```

## Anti-patterns

- **Skipping Phase 2.** Removing code on uncovered ground is a behavior-change time bomb.
- **Bundling unrelated refactors.** A cleanup commit that also changes algorithms is impossible to
  review or bisect. Stay scoped to slop.
- **Algorithm changes disguised as performance.** If equivalence needs a proof, it is a refactor,
  not a slop fix.
- **Silent skips.** Say `N/A` and why. Never claim PASS without evidence.
- **Removing comments that explain WHY.** Only remove comments that restate WHAT.
- **Touching files outside scope.** Report out-of-scope slop under "Remaining Risks".

## Second opinion

When a file is high-risk (shared seam, concurrency, security boundary), send the proposed diff and
the behavior-lock evidence to one `subagent` for an adversarial review before applying it. The child
gets the file, the diff, the tests, and the question. Do not delegate the whole cleanup and then
merge its output unreviewed.

## Tool persistence

- When a tool call fails, retry with adjusted parameters.
- Never silently skip a failed tool call.
- Never claim a gate passed without running it and reading the output.
- Keep inspecting (typecheck, tests, direct reads) until the result is grounded.

## Quality assurance

- Never remove code that serves a functional purpose.
- Always verify the change compiles or parses and passes the typecheck.
- Always preserve test coverage; add tests rather than remove them.
- When uncertain, keep the original code. The default action in doubt is SKIP, not GUESS.

Adapted from OmO's remove-ai-slops skill for DeepSeek Harness.
