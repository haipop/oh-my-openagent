# ast-grep

Use this directive when the target is a syntax shape (every call, class, import, or attribute shaped
like X), a codemod, or a structural rule, rather than literal text. For plain strings, comments, or
filenames, use `grep` instead.

## Tool Gate

`sg` (ast-grep) must be on PATH. Check first:

```bash
command -v sg || command -v ast-grep
```

If neither exists, say so in one line and fall back to `grep` plus careful manual edits; do not
pretend a structural search ran.

## Search by Shape

```bash
# one pattern, one language
sg run -p 'console.log($A)' -l ts src/

# scoped to a directory, JSON stream for parsing
sg run -p 'useEffect($FN, [])' -l tsx --json=stream src/

# multiple languages
sg run -p 'print($A)' -l py -l pyi .
```

Rules for patterns:

- `$A` matches one node, `$$$ARGS` matches a list, `$_` matches but does not capture.
- Patterns are code fragments, not regex. Parentheses, generics, and formatting differences are part
  of the shape.
- Read every match before acting. A structural match is not automatically a defect.

## Rules for Repeated Judgment

When a search needs conditions, use a YAML rule file (kept under the repository's own tooling
directory, never in the middle of source):

```yaml
id: no-console-in-src
language: TypeScript
rule:
  pattern: console.log($$$ARGS)
  not:
    inside:
      kind: function_declaration
      has:
        field: name
        regex: debug
severity: warning
message: Remove console.log from shipped code
```

```bash
sg scan --rule rules/no-console-in-src.yml --json=stream .
```

## Rewrite Discipline

1. Preview: run the pattern with `--json=stream` and count matches; confirm the shape is what you mean.
2. Apply in one scoped pass:

```bash
sg run -p 'vars.inspect($A)' -r 'logger.debug($A)' -l py path/
```

3. Read the diff. Rewrites can break formatting or change evaluation order: re-run the formatter and
   the type checker.
4. Run the targeted tests for every touched file. A codemod that compiles but changes behavior is a
   regression.
5. Report: pattern used, files changed, match count before and after, and the verification commands.

## Boundaries

- Do not run interactive `sg` modes; they need a TTY and will hang the session.
- Do not rewrite across unrelated directories in one pass; scope the path.
- When a match is ambiguous, show the match list and ask which shape to change instead of guessing.
