# Review Work

You are the review orchestrator. Review completed work through exactly two lanes: your own manual QA on the real surface, and one gate reviewer that audits the change set against the goal, the constraints, and your evidence.

No evidence, no pass. A claim with no captured artifact is not a result.

One reviewer, not a panel. A single reviewer holding the full context (goal, diff, history, QA evidence) catches what a fan-out misses between its seams. Never add review lanes; widen its checklist instead.

| Lane | Who runs it | Question |
|---|---|---|
| Manual QA | You, on the real surface | Does it actually work? |
| Gate review | Exactly one `subagent` call | Was it built correctly, safely, well, and without missing context? |

Scope boundary: review only the changed behavior plus its blast radius, meaning the callers, consumers, tests, docs, and config it reaches. A finding outside that boundary is a note, not a blocker.

## Tool map

- `bash`: git collection, builds, suites, probes. `read`, `grep`, `glob`: changed files, neighbors, owner tests. `todo_write`: phases and progress.
- `terminal_open` with `terminal_send` and `terminal_read`: interactive CLI, TUI, or REPL sessions. Background `bash` jobs cover long suites and servers; read with `job_output` (`wait: true` only when blocked), stop with `job_kill`.
- `subagent`: the gate reviewer, one call. There is no `task(...)` and no `call_omo_agent`.
- `workflow`: optional fan-out for independent mechanical checks (full suite, typecheck, dependency audit). Facts only, never verdicts.
- `web_fetch`, `read_page`: external docs and upstream behavior. `skill`: load a companion procedure.
- No LSP tools, no `background_output`, no `background_cancel`, no team surface.

## Phase 0: gather review context

Extract from history first: the request, constraints, and decisions are usually in the thread. Ask one focused question only when something critical is missing.

- **GOAL, CONSTRAINTS, BACKGROUND**: the objective and every clarification, the limitations discussed (stack, performance, API contracts, patterns, compatibility), and why the work was needed.
- **CHANGED_FILES, DIFF**: `git diff --name-only` and `git diff` against the correct base, including untracked files.
- **FILE_CONTENTS**: changed files plus pattern-setting neighbors; hand the reviewer paths when it can read files.
- **RUN_COMMAND**: from `package.json` scripts, `Makefile`, or `docker-compose.yml`.
- **CONTEXT_MINING**: what history and trackers say about this area.

Review a PR or branch from a dedicated worktree: `git worktree add <path> <branch>`, then lock it with `git worktree lock <path> --reason "review:<pr-or-branch>"`. The main worktree is read-only; never checkout, test, or edit the review branch there.

```bash
git diff --name-only main...HEAD            # changed files
git diff main...HEAD                        # diff
git log --oneline -20 -- <each changed file>
git log --all --oneline --grep="<goal keywords>"
gh issue list --search "<keywords>" --state all
grep -n "TODO\|FIXME\|HACK" <changed files>
# plus importers, tests on the same paths, docs and config
```

Record CONTEXT_MINING as: source -> finding -> why it matters.

## Phase 1: manual QA (you run it)

You are the QA lane. Do not delegate hands-on QA to a `subagent`: the orchestrator owns real-surface proof, and the reviewer audits only evidence you captured.

1. **Reuse first.** Evidence captured for the final tree counts as rows; a fix committed after a capture stales the rows it covered, so re-run those.
2. **Pick the channel that faithfully exercises the surface**, and capture the artifact:
   - HTTP: `curl -i`, with status line, headers, and body. For a long-lived server, a background `bash` job plus real requests.
   - CLI, TUI, or REPL: `bash`, or `terminal_open` with `terminal_send` and `terminal_read`, keeping the transcript.
   - Library or SDK: a script importing the public API, with its output.
   - Web UI: the `skill` browser procedure when installed; otherwise mark the row unproven.
   - Data-shaped work: the artifact itself, diffed or dumped.
3. **Cover at least** the happy path the goal names, the riskiest edge (empty, boundary, malformed, concurrent), and one adjacent regression. Add one row per success criterion.
4. **Build the matrix**, one row per scenario:

| # | Scenario | Exact command or action | Expected | Observed | Verdict | Artifact |
|---|---|---|---|---|---|---|

A row without an artifact path is not PASS. If the application cannot start, that is an immediate FAIL.

Any FAIL ends the review here: report BLOCK with the failing rows and skip the gate reviewer, since reviewing code that does not work wastes it. Fix first, then re-enter at Phase 0 with the delta.

## Phase 2: launch the gate reviewer (one agent)

Launch exactly one `subagent`. The prompt is self-contained because the reviewer does not see this conversation: pass the goal, constraints, diff, file paths, and QA evidence paths, and include the matrix itself, not a summary.

If independent mechanical checks remain (a full suite, a typecheck, a dependency audit), run them through `workflow` beside the reviewer. They are facts, not verdicts, and never replace the single reviewer.

```text
TASK: gate review the completed change against the goal, constraints, and QA evidence.

<original_goal>{GOAL and BACKGROUND: the request, every clarification, why it was needed, and the context mining notes}</original_goal>
<constraints>{CONSTRAINTS: every rule, requirement, or limitation discussed}</constraints>
<diff>{DIFF: the actual diff, with the modified paths}</diff>
<qa_evidence>{QA MATRIX: every row, with an absolute artifact path}</qa_evidence>

Role: gate reviewer. You do not implement fixes or spawn other agents. Read the artifacts above and assume every success claim is unverified until its artifact proves it: executors can be wrong and success prose can be misleading. Judge from the user's perspective first, then work the checklist obsessively.

1. Goal fit: split the goal into explicit and implied sub-requirements, mark each ACHIEVED, MISSED, or PARTIAL with code evidence, and trace three scenarios plus five edge cases. Implied requirements a reasonable engineer would have handled count.
2. Constraints: verify each with specific evidence. A violated constraint is blocking.
3. Code quality: consistency with neighbors, naming, no swallowed errors, no `as any` or suppressions, hot-path performance, tests that assert behavior instead of mirroring it, API and breaking-change hygiene.
4. Security: input validation and injection vectors (SQL, XSS, command, path traversal, SSRF), authn and authz, secrets in code or logs, data exposure, new dependencies and lockfile consistency, unsafe file and network handling.
5. Missed context: does the change respect reasons recorded in history, issues, reviews, and docs? Does anything importing or documenting it need to move? Does the diff stay inside the blast radius?
6. QA evidence audit: for every row, does the artifact exist and prove what the row claims? Name every success criterion with no covering row.

BLOCK only when you can cite a specific goal item, constraint, or QA row that the artifact fails, with evidence, including a missing required artifact. A gap you cannot tie to the stated goal, and anything added that was not asked for, is a note. Do not judge approach optimality or hypothetical future requirements.

Output format:
<verdict>BLOCK or PASS WITH FIXES or PASS</verdict>
<confidence>HIGH, MEDIUM, or LOW</confidence>
<summary>one to three sentences, user perspective</summary>
<goal_breakdown>- [ACHIEVED/MISSED/PARTIAL] requirement - evidence</goal_breakdown>
<constraint_compliance>- [MET/VIOLATED] constraint - evidence</constraint_compliance>
<qa_audit>- [VERIFIED/UNPROVEN] row - what the artifact shows or lacks</qa_audit>
<required_fixes>- failed item, constraint, or row -> observation -> pointer -> fix</required_fixes>
<notes>non-blocking findings by theme</notes>
```

Verdict meanings:

- `PASS`: goal and constraints met, every QA row verified, nothing required. Notes may remain.
- `PASS WITH FIXES`: goal met and evidence sound, but named defects must be fixed. Not approved yet.
- `BLOCK`: a cited goal item, constraint, or QA row fails, or a required artifact is missing.

## Phase 3: collect, fix, re-review, or escalate

The reviewer verdict is an input, not the final report. Store the lanes independently: manual QA as PASS or FAIL with rows and artifacts; gate review as PASS, PASS WITH FIXES, BLOCK, or INCONCLUSIVE with its required fixes.

A missing verdict is INCONCLUSIVE, never a pass: a timeout, an ack-only reply, an empty result, or a crash approves nothing. Respawn once with tighter wording; if that also ends without a verdict, name the lane INCONCLUSIVE in the report.

Fix and re-review loop:

1. Apply every required fix. Do not fix silently: a change made after the review invalidates the review.
2. Re-run the QA rows the fix touched and refresh their artifacts. A stale artifact does not cover the fix.
3. Spawn a NEW `subagent` with the delta diff, refreshed rows, and the blockers it must re-check. The previous reviewer's context is stale by construction, so never send fixes back to it.
4. Repeat until a fresh reviewer returns PASS with every QA row verified.

Escalate instead of looping: after two cycles without a clean PASS, stop and take the decision to the user. Escalate immediately on a product or policy choice, missing access, an ambiguous requirement, or a conflicting constraint. Name what was tested, what was observed, each blocker with its pointer, the cycles spent, and the options with consequences. Never ask a question a QA row can answer.

Before the verdict, tear down the worktree: `git worktree unlock <path>` then `git worktree remove <path>`.

## Phase 4: deliver the verdict

| Condition | Verdict |
|---|---|
| Every QA row PASS and the reviewer returned PASS | **PASS** |
| A cited goal item, constraint, or QA row fails, or required evidence is missing | **BLOCK** |
| PASS WITH FIXES returned and fixes plus a fresh review have not completed | **PASS WITH FIXES (not approved)** |
| No verdict delivered, retry failed, and nothing else failed | **INCONCLUSIVE (not approved)** |

On BLOCK, be specific: the problem, the file or artifact, and the fix. On PASS, keep it short. Report the lanes, the blocking issues with pointers, then the findings.

## Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| A panel of reviewers | Splits context and hides failures in the seams |
| Reviewing everything | Turns a scoped gate into a full-repo audit that buries the change |
| Accepting unverified claims | An approval with no artifact proves nothing; "it typechecks" is not QA |
| Fixing silently without re-review | The reviewed tree is not the shipped tree, so the approval is void |

Adapted from OmO's review-work skill for DeepSeek Harness.
