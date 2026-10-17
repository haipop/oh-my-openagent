# Data Scientist

Answer a data question through the cheapest engine that can prove it, on the surface that keeps repeat queries cheap.

## Tool map

- `bash`: one-shot queries, `python3 - <<'PY'` blocks, and background jobs for long scans (read with `job_output`, stop with `job_kill`).
- `terminal_open` with `terminal_send` / `terminal_read`: a resident shell or kernel.
- `read`, `grep`, `glob` for files; `write`, `edit` to keep one query file; `todo_write` for lanes; `skill` for procedures; `subagent` for independent lanes.
- Absent: `task(...)`, LSP, `background_output`, ast-grep MCP.

## Engine ladder

Take the lowest rung that can prove the answer; climb only when it cannot.

| Rung | Use when |
|---|---|
| shell + awk | one column, one filter, one count |
| DuckDB | joins, group-by, windows, files read in place |
| Polars | DataFrame pipelines, streaming past RAM |
| pandas | already installed, or the notebook needs it |
| numpy | tests, linear algebra, FFT, sampling |

Measure instead of trusting remembered multipliers.

## Surfaces

One-shot when the question is single and final:

```bash
duckdb -c "SELECT region, sum(amount) FROM 'orders.parquet' GROUP BY 1 ORDER BY 2 DESC LIMIT 10"
python3 -c "import polars as pl; print(pl.read_parquet('d.parquet').describe())"
awk -F, 'NR>1 {s+=$3} END {print NR-1, s}' data.csv
```

Resident kernel when exploration runs past a few steps: open one shell, load once, reuse the connection.

```
terminal_open
terminal_send:  python3 -i -q
terminal_send:  import duckdb; con = duckdb.connect(); con.execute("CREATE TABLE o AS SELECT * FROM 'orders.parquet'")
terminal_send:  con.sql("SELECT region, sum(amount) s FROM o GROUP BY 1").show()
```

Load into memory when the working set fits under a quarter of free RAM and you will query it repeatedly; otherwise read in place or stream. Never collect a larger than RAM dataset. Probe first: `du -h data.csv; wc -l data.csv; vm_stat | head -5`.

## Inspection order

Stop at the first step that ends the question.

1. Size: bytes, lines, columns.
2. Schema: types, delimiter, encoding, header, null tokens.
3. Sample: head, tail, random rows (sorted files hide tail defects).
4. Key: candidate key, duplicates, uniqueness.
5. Nulls: null rate and distinct count per column.
6. Ranges: min, max, first and last date, unit or currency.

```bash
duckdb -c "DESCRIBE SELECT * FROM read_csv_auto('data.csv')"
duckdb -c "SELECT count(*) n, count(DISTINCT id) FROM 'data.csv'"
```

Hunt schema defects: numbers or dates typed as strings, leading zeros lost, a column split by a stray delimiter, mixed units, inconsistent null tokens (`NULL`, `NA`, `-`, empty).

## Cleaning

State every row removed and why, with counts before and after.

```bash
duckdb -c "SELECT count(*) FROM 'd.parquet' WHERE amount IS NULL OR amount < 0"
duckdb -c "COPY (SELECT id, cast(ts AS TIMESTAMP) ts, try_cast(amount AS DOUBLE) amount FROM 'd.csv' WHERE id IS NOT NULL) TO 'clean.parquet' (FORMAT PARQUET)"
```

Count what `try_cast` turned into null and report it; never drop rows silently.

## Join, group-by, aggregation

```bash
duckdb -c "SELECT count(*) FROM 'orders.parquet' ANTI JOIN 'customers.parquet' USING (customer_id)"
duckdb -c "SELECT c.region, count(*) n, sum(o.amount) total FROM 'orders.parquet' o JOIN 'customers.parquet' c USING (customer_id) GROUP BY 1 ORDER BY 2 DESC"
```

A join that multiplies rows is the most common wrong number: compare pre-join and post-join counts. Declare the grain, confirm `n` per group, put a count beside every aggregate, and avoid averages across groups with different counts.

## Time series

Fix timezone and grain first, then check continuity.

```bash
duckdb -c "SELECT date_trunc('month', ts) m, count(*) n, sum(amount) s FROM 'clean.parquet' GROUP BY 1 ORDER BY 1"
duckdb -c "SELECT ts, lag(ts) OVER (ORDER BY ts) prev FROM 'clean.parquet' ORDER BY ts LIMIT 5"
```

Check missing periods, duplicate timestamps, daylight saving jumps, and a partial trailing period. An incomplete final month reads as a decline, so state whether it is complete.

## Distributions

```bash
duckdb -c "SELECT min(x), median(x), quantile_cont(x, 0.95) p95, max(x) FROM 'clean.parquet'"
```

Report median and quantiles beside the mean. Check zero inflation, long tails, and sentinels (`0`, `-1`, `9999`). State the outlier rule.

## Plotting

Plot when asked, or when the answer is a shape prose cannot carry. Write the file, open the image, look at it before shipping.

```bash
python3 - <<'PY'
import duckdb, matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
df = duckdb.sql("SELECT date_trunc('month', ts) m, sum(amount) s FROM 'clean.parquet' GROUP BY 1").pl()
plt.plot(df["m"], df["s"], marker="o"); plt.title("Monthly revenue")
plt.savefig("revenue_monthly.png", dpi=150)
PY
```

Label both axes with units, title states the question, no chart junk, zero baseline for bars, sorted categories, thin gridlines. Inspect the render for clipped labels, unreadable ticks, and CJK glyph boxes (set a CJK font for non-Latin labels).

## Parallel lanes

Use `subagent` when questions are independent: one lane per question, with its input file, expected output, the command behind every number, and what it may not modify on disk. Build a shared cleaned table first, then fan out. Do not delegate one exploration step; the handoff costs more than the query.

## Reproducibility

- Keep one query file per analysis and rerun it from scratch.
- Pin input path and engine version: `duckdb --version`, `python3 -c "import polars; print(polars.__version__)"`.
- Never report a number you did not see in a command's output; paste the command beside it.
- Record row counts around each filter stage, and the run date.

## Report shape

```
Question: <question answered>
Data:     <paths, rows, date range, limits>
Method:   <engine, key command, filters, joins, grain>
Result:   <numbers and the producing command>
Caveats:  <nulls, gaps, join loss, outlier rule, unchecked>
```

Adapted from OmO's data-scientist skill for DeepSeek Harness.
