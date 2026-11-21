#!/usr/bin/env bun
/**
 * report-origin-auto-steer (review of #13396): the same two bound chat threads as report-origin, under the DEFAULT
 * inbound mode (auto). Thread A's message starts a run that stays streaming; thread B's message arrives while it runs,
 * so the engine steers it into that run (decision.ts: auto steers a running turn). The model answers B with a
 * `thread_report` that names no binding. The report must reach B, the thread that asked, and not A.
 */
import {
  assistantTexts,
  awaitToolResult,
  awaitTuiEndpoint,
  callDirective,
  deliveryRow,
  holdDirective,
  threadSdk,
  runScenario,
  waitFor,
} from "./lib/gateway.mjs"

await runScenario("report-origin-auto-steer", async ({ report, fake, scratch, install, startTui }) => {
  const tui = await startTui("tui-target")
  const target = await awaitTuiEndpoint(scratch, tui)
  const bind = (chat) =>
    threadSdk(scratch, install, "bind", {
      session: target.durableId,
      binding: { platform: "slack", account_id: "bot-account", chat_id: chat, thread_id: "t1" },
    })
  const a = (await bind("chat-a")).json?.binding?.binding_id
  const b = (await bind("chat-b")).json?.binding?.binding_id
  report.assert("two-bindings", typeof a === "string" && typeof b === "string", `a=${a} b=${b}`)

  const fromA = await threadSdk(scratch, install, "send", {
    binding_id: a,
    idempotency_key: "evt-a",
    text: `${holdDirective("ro-a")} QA-TOKEN-from-a`,
  })
  report.assert(
    "a-sent",
    fromA.code === 0 && fromA.json?.kind === "ok",
    `exit=${fromA.code} ${fromA.stdout.trim().slice(0, 300)}`,
  )
  await waitFor(() => fake.heldTags().includes("ro-a"), { label: "A's answer streaming" })

  const fromB = await threadSdk(scratch, install, "send", {
    binding_id: b,
    idempotency_key: "evt-b",
    text: callDirective("thread_report", { kind: "report", text: "answer-for-b" }),
  })
  report.assert(
    "b-sent",
    fromB.code === 0 && fromB.json?.kind === "ok",
    `exit=${fromB.code} ${fromB.stdout.trim().slice(0, 300)}`,
  )
  const admitted = async (id) =>
    await waitFor(async () => (await deliveryRow(scratch.agentDir, id))?.admission_kind ?? undefined, {
      label: `admission of ${id}`,
    })
  const kinds = { a: await admitted(fromA.json?.delivery_id), b: await admitted(fromB.json?.delivery_id) }
  report.assert("a-started-b-steered-into-it", kinds.a === "started" && kinds.b === "steered", JSON.stringify(kinds))

  const from = fake.requests.length
  report.assert("release-a", fake.release("ro-a"), "A's answer released")
  const reported = await awaitToolResult(fake, "thread_report", from, { label: "the report answering B" })
  report.assert(
    "report-resolves-to-b",
    reported?.kind === "ok" && reported.binding_id === b,
    `${JSON.stringify(reported).slice(0, 400)} a=${a} b=${b}`,
  )
  await waitFor(() => assistantTexts(target.sessionPath).some((text) => text.includes("QA-RELEASED ro-a")), {
    label: "A's answer in the transcript",
  })

  const outbox = async (bindingId) =>
    (await threadSdk(scratch, install, "outbox", { binding_id: bindingId, after_cursor: 0 })).json?.rows?.map(
      (row) => row.text,
    ) ?? null
  const rows = { a: await outbox(a), b: await outbox(b) }
  report.assert(
    "only-b-outbox-has-the-row",
    JSON.stringify(rows) === JSON.stringify({ a: [], b: ["answer-for-b"] }),
    JSON.stringify(rows),
  )
})
