#!/usr/bin/env bun
/**
 * lost-ack (todo 16, IS-6 "never claim exactly-once after a lost ACK"): the sender dies between
 * admission into the store and its reply. SDK send with idempotency_key K runs with the store
 * worker's `afterDbCommit` hook armed (patch `sender_kill_after_commit`,
 * `THREAD_QA_AFTER_DB_COMMIT=sigkill`), so the sender is SIGKILLed the instant its delivery COMMIT
 * returned and never answers. The real pty TUI is stopped, so it cannot admit the row before
 * the retry. The same key is `idempotency_uncertain` (naming the first delivery and its queued
 * state) and adds no row. Continuing the terminal applies it once without more input.
 */
import {
  assistantTexts,
  awaitTuiEndpoint,
  threadSdk,
  deliveryEntries,
  deliveryIdOf,
  deliveryRow,
  runScenario,
  storeRows,
  useManualRecovery,
  waitFor,
} from "./lib/gateway.mjs"

const TOKEN = "QA-TOKEN-lost-ack"
const KEY = "qa-lost-ack-1"

await runScenario(
  "lost-ack",
  async ({ report, scratch, install, startTui }) => {
    useManualRecovery(scratch)
    const tui = await startTui("tui-target")
    const target = await awaitTuiEndpoint(scratch, tui)
    const text = `${TOKEN} whose acknowledgement is lost`
    const rowsFor = () =>
      storeRows(
        scratch.agentDir,
        "SELECT delivery_id, state FROM deliveries WHERE target_durable_id = ? AND body LIKE ?",
        [target.durableId, `%${TOKEN}%`],
      )

    let committed
    process.kill(tui.pid, "SIGSTOP")
    try {
      const stat = Bun.spawnSync(["ps", "-o", "stat=", "-p", String(tui.pid)])
        .stdout.toString()
        .trim()
      if (!stat.startsWith("T")) throw new Error(`expected a stopped receiver; ps stat=${stat}`)

      const lost = await threadSdk(
        scratch,
        install,
        "send",
        { thread: target.durableId, text, idempotency_key: KEY },
        { env: { THREAD_QA_AFTER_DB_COMMIT: "sigkill" } },
      )
      const rows = await rowsFor()
      committed = rows[0]
      const [receipt] = await storeRows(
        scratch.agentDir,
        "SELECT status, delivery_id FROM receipts WHERE idempotency_key = ?",
        [KEY],
      )
      report.assert(
        "sender-killed-after-commit-before-reply",
        lost.code !== 0 &&
          lost.stdout.trim() === "" &&
          committed?.state === "queued" &&
          receipt?.status === "prepared" &&
          receipt.delivery_id === committed.delivery_id,
        `exit=${lost.code} stdout=${JSON.stringify(lost.stdout.slice(0, 120))} row=${JSON.stringify(committed)} receipt=${JSON.stringify(receipt)}`,
      )

      const retry = await threadSdk(scratch, install, "send", {
        thread: target.durableId,
        text,
        idempotency_key: KEY,
      })
      const error = retry.json?.error
      report.assert(
        "retry-idempotency-uncertain",
        retry.code === 1 &&
          error?.code === "idempotency_uncertain" &&
          error.details?.delivery_id === committed?.delivery_id &&
          error.details?.state === "queued",
        `exit=${retry.code} ${retry.stdout.trim().slice(0, 300)}`,
      )
      const retryRows = await rowsFor()
      report.assert("retry-adds-no-row", retryRows.length === 1, JSON.stringify(retryRows))
    } finally {
      process.kill(tui.pid, "SIGCONT")
    }

    await waitFor(() => assistantTexts(target.sessionPath).some((line) => line.includes(`QA-ACK ${TOKEN}`)), {
      label: "the one delivery answered after SIGCONT",
    })
    const row = await waitFor(
      async () => {
        const current = await deliveryRow(scratch.agentDir, committed.delivery_id)
        return current?.state === "applied" ? current : undefined
      },
      { label: "row applied" },
    )
    const again = await threadSdk(scratch, install, "send", {
      thread: target.durableId,
      text,
      idempotency_key: KEY,
    })
    const entries = deliveryEntries(target.sessionPath).filter(
      (entry) => deliveryIdOf(entry) === committed.delivery_id,
    ).length
    const answers = assistantTexts(target.sessionPath).filter((line) => line.includes(`QA-ACK ${TOKEN}`)).length
    const finalRows = await rowsFor()
    report.assert(
      "no-duplicate-transcript-entry",
      entries === 1 &&
        answers === 1 &&
        finalRows.length === 1 &&
        again.json?.kind === "error" &&
        again.json.error?.code === "idempotency_uncertain",
      `entries=${entries} answers=${answers} rows=${finalRows.length} admission_kind=${row.admission_kind} retry_after_apply=${again.stdout.trim().slice(0, 200)}`,
    )
  },
  { patches: ["sender_kill_after_commit"] },
)
