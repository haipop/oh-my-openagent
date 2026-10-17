# Init Deep

Build a hierarchical AGENTS.md knowledge base: a root file plus scored per-directory files. Each file must fit an agent context budget and add what the parent does not carry. Track the four phases in `todo_write`, completing each only when checked.

## Tool surface

- `bash` measures and verifies; `read` inspects; `grep` and `glob` locate content and paths; `write` and `edit` produce docs; `todo_write` tracks phases; `subagent` fans out analysis. Aggregate with `find`, `grep`, `wc -l`, `awk`, `sort`, `uniq`.
- Background work: start a `bash` job with `run_in_background`, read it with `job_output` (`wait: true` only when blocked), stop it with `job_kill`.
- Absent here: `task(...)` (use `subagent`), every `lsp_*` tool (no LSP is installed), ast-grep and `sg` (use `grep`/`glob` plus `find`/`wc -l`), and `background_output` (use `job_output`).

## Phase 1: discovery

### Measure scale

Run these first; the numbers drive scoring and fan-out.

```bash
find . -type f -not -path '*/.git/*' -not -path '*/node_modules/*' | wc -l
find . -type d -not -path '*/.git/*' -not -path '*/node_modules/*' | awk -F/ '{ if (NF>m) m=NF; n++ } END { print n, m }'
find . -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.py' -o -name '*.go' -o -name '*.rs' \) \
  -not -path '*/node_modules/*' -exec wc -l {} + 2>/dev/null | tail -1
find . -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.py' \) -not -path '*/node_modules/*' \
  -exec wc -l {} + 2>/dev/null | awk '$1 > 500 { n++ } END { print n+0 }'
```

Decide locations only after the numbers exist; a small repository needs one root file, a monorepo a scored subset.

### Read what exists

```bash
find . -type f \( -name 'AGENTS.md' -o -name 'CLAUDE.md' \) -not -path '*/node_modules/*'
```

`read` every hit and harvest conventions, anti-patterns, and commands. Read before writing: `write` replaces a file wholesale, so existing files go through `edit`. In create-new mode read everything first, then regenerate; never delete before harvesting.

### Structural discovery without LSP or ast-grep

LSP is absent, so exports, imports, and references are lexical; state in the CODE MAP that counts are text occurrences, not resolved references.

```bash
grep -rn --include='*.ts' -E '^export (async )?(function|class|const|interface|type|enum) ' . | head -80
glob '**/index.ts'
grep -rl --include='*.ts' -E "^import .* from ['\"]\." . | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn | head -20
grep -rn --include='*.ts' -w 'createServer' . | wc -l
grep -rn --include='*.md' -iE '\b(NEVER|DO NOT|ALWAYS|MUST NOT|DEPRECATED)\b' . | head -40
```

For each candidate symbol subtract its declaration site and rank by count; join ranks with file size for the CODE MAP and mark counts under 5 as low confidence.

### Fan out with subagent

Send several `subagent` calls in one message, each scoped to one question: layout deviations, entry points, build and test and CI commands, conventions and config, forbidden patterns. Each prompt carries the repository root, scope, measurements, and required output: findings with paths and line numbers. Subagents report only; one writer keeps the docs consistent. Merge bash numbers, existing docs, grep findings, and reports.

Enumerate cheaply in bash: `for d in */; do printf '%s ' "$d"; find "$d" -type f | wc -l; done`. Cap at six concurrent subagents per wave, adding waves by scale:

| Factor | Threshold | Additional subagents |
|---|---|---|
| Total files | >100 | +1 per 100 files |
| Total lines | >10k | +1 per 10k lines |
| Files over 500 lines | >10 | +1 |
| Monorepo | detected | +1 per package |
| Languages | >1 | +1 per language |

## Phase 2: scoring and selection

| Factor | Weight | High threshold | Source |
|---|---|---|---|
| File count | 3x | >20 | `find` |
| Subdirectories | 2x | >5 | `find` |
| Code ratio | 2x | >70% | `find` + `wc -l` |
| Unique patterns | 1x | own config | `glob` |
| Module boundary | 2x | index.ts or __init__.py | `glob` |
| Export count | 2x | >10 | `grep` |
| Symbol density | 2x | >30 in scope | `grep` |
| Reference centrality | 3x | >20 occurrences | `grep` |

Depth cap defaults to 3. Root is always created. Above 15 create; 8 to 15 create only for a distinct domain; under 8 skip and let the parent cover it. Never create above the depth cap, inside generated or vendored trees (`node_modules`, `dist`, `build`, `vendor`, `third_party`, migrations), or where the only content is config the parent documents.

## Phase 3: generation

Root first, because children link to it. Then children in waves of at most six `subagent` writers, one file each; a writer receives the path, score, parent path, harvested facts, and the template. Check existence with `read` first: existing gets `edit`, absent gets `write`.

### Root template

````markdown
# PROJECT KNOWLEDGE BASE

**Generated:** {YYYY-MM-DD} | **Commit:** {short sha} | **Branch:** {branch}

## OVERVIEW
{what this is, core stack}

## STRUCTURE
{root}/
├── {dir}/    # non-obvious purpose only

## COMMANDS
```bash
{dev, test, build, lint: the exact invocation}
```

## CONVENTIONS
{only deviations from the language standard}

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|

## CODE MAP
| Symbol | Type | Location | Refs | Role |
|--------|------|----------|------|------|

## ANTI-PATTERNS (THIS PROJECT)
{forbidden here, with the file that enforces it}
````

50 to 150 lines; nothing true of every repository.

### Child template

````markdown
# {DIRECTORY}

Parent: [../AGENTS.md](../AGENTS.md)
Scope: {what this directory owns; what the parent covers instead}

## OVERVIEW
{one line}

## STRUCTURE
{only above five children}

## COMMANDS
{only commands that differ}

## CONVENTIONS
{only rules that differ}

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|

## ANTI-PATTERNS
{only local ones}
````

30 to 80 lines, parent link first. A child never repeats parent content; link to the parent section. Detail above 80 lines belongs in a smaller child or nowhere.

### Commands rule

Document commands you ran, not commands you guessed. Every documented command was executed in this session with its observed exit code, or copied from a manifest and verified to exist (`grep` the name in `package.json`, `Makefile`, or the workflow). Mark anything else `# unverified` or remove it. Never invent a flag.

## Phase 4: verification and audits

1. Links resolve. Resolve each relative link against its own file's directory, then check anchors by slugifying headings and grepping the fragment.

```bash
find . -name 'AGENTS.md' -print0 | while IFS= read -r -d '' f; do
  d=$(dirname "$f")
  grep -oE '\]\([^)]+\)' "$f" | sed 's/^](//; s/)$//' | grep -vE '^(#|https?:)' | while IFS= read -r t; do
    test -e "$d/${t%%#*}" || echo "BROKEN $f -> $t"
  done
done
```

2. Commands exist. Extract each fenced `bash` block, confirm every named script or binary exists in the manifest or on `PATH`, and run the cheap ones to compare with the documented effect.

3. Token budget. `wc -l` and `wc -c` every file: root 50 to 150 lines, child 30 to 80, each under 6 KB, whole corpus under 1200 lines. Trim, never pad.

4. Stale docs. Every path and symbol named must exist now; for example `grep -rn --include='AGENTS.md' -E 'src/old-path|OldSymbol' .`.

5. Cross-links and duplication. Every child names its parent and every parent lists its children; sibling scopes agree; repeated parent text becomes a link; files outside the decision list are deleted, not orphaned.

## Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Guessed commands | The next agent runs what does not exist |
| Fixed agent count | Small repos and monorepos get the same shallow scan |
| Child repeating the parent | Doubles context cost and drifts |
| Generic advice | True everywhere, worth nothing here |

Adapted from OmO's init-deep skill for DeepSeek Harness.
