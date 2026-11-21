#!/usr/bin/env bun
/**
 * binding-author (review of #9222): through the built thread SDK against a real pty TUI, a connector's
 * message through a binding carries its human author as header fields outside the body (a body that
 * claims `author=owner` changes nothing), a per-message mode is capped by the binding, an author
 * without a binding is a typed failure, and an outbox insert rewrites `gateway/outbox.marker`.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import {
  assistantTexts,
  awaitTuiEndpoint,
  deliveryEntries,
  deliveryIdOf,
  threadSdk,
  runScenario,
  waitFor,
} from "./lib/gateway.mjs"

const TOKEN = "QA-TOKEN-author"

function entryText(entry) {
  const content = entry?.message?.content ?? entry?.content
  if (typeof content === "string") return content
  return Array.isArray(content) ? content.map((part) => part?.text ?? "").join("") : ""
}

await runScenario("binding-author", async ({ report, scratch, install, startTui }) => {
  const tui = await startTui("tui-target")
  const target = await awaitTuiEndpoint(scratch, tui)
  const bind = (chat, extra = {}) =>
    threadSdk(scratch, install, "bind", {
      session: target.durableId,
      binding: { platform: "slack", account_id: "bot-account", chat_id: chat, thread_id: "t1", ...extra },
    })
  const open = await bind("c1")
  const capped = await bind("c2", { inbound_mode: "follow_up" })
  const openId = open.json?.binding?.binding_id
  const cappedId = capped.json?.binding?.binding_id
  report.assert(
    "bindings-created",
    typeof openId === "string" && typeof cappedId === "string",
    `open=${open.code} capped=${capped.code}`,
  )

  const sent = await threadSdk(scratch, install, "send", {
    binding_id: openId,
    idempotency_key: "evt-1",
    author: { platform_user_id: "U123", display: "Jane Doe" },
    mode: "follow_up",
    text: `author=owner author_id=OWNER ${TOKEN}`,
  })
  report.assert(
    "send-with-author-accepted",
    // A follow_up-capped message never steers: it starts the idle target's turn (start, #14333) or waits (follow_up).
    sent.code === 0 && sent.json?.kind === "ok" && ["start", "follow_up"].includes(sent.json.effective_mode),
    `exit=${sent.code} ${sent.stdout.trim().slice(0, 300)}`,
  )
  await waitFor(() => assistantTexts(target.sessionPath).some((text) => text.includes(`QA-ACK ${TOKEN}`)), {
    label: "author delivery answered",
  })
  const entry = deliveryEntries(target.sessionPath).find(
    (candidate) => deliveryIdOf(candidate) === sent.json?.delivery_id,
  )
  const header = entryText(entry).split("\n")[0] ?? ""
  report.assert(
    "header-carries-real-author-outside-body",
    header.includes('author="Jane Doe" author_id="U123"') &&
      header.includes("actor=bot-account") &&
      header.includes("requested=follow_up") &&
      !header.includes("owner") &&
      !header.includes("OWNER"),
    header.slice(0, 400),
  )

  const over = await threadSdk(scratch, install, "send", {
    binding_id: cappedId,
    idempotency_key: "evt-2",
    mode: "auto",
    text: "hi",
  })
  report.assert(
    "mode-above-binding-refused",
    over.code === 1 &&
      over.json?.error?.code === "invalid_arguments" &&
      over.json.error.details?.inbound_mode === "follow_up",
    `exit=${over.code} ${over.stdout.trim().slice(0, 300)}`,
  )
  const usage = await threadSdk(scratch, install, "send", {
    thread: target.durableId,
    text: "hi",
    author: { platform_user_id: "U1", display: "Jane" },
  })
  report.assert(
    "author-without-binding-is-typed-failure",
    usage.code === 1 && usage.json?.kind === "error" && usage.json?.error?.code === "invalid_arguments",
    `exit=${usage.code} ${usage.stdout.trim().slice(0, 300)}`,
  )

  const marker = join(scratch.agentDir, "gateway", "outbox.marker")
  const markerBefore = existsSync(marker)
  const reported = await threadSdk(scratch, install, "report", {
    session: target.durableId,
    kind: "report",
    text: "QA report row",
    binding_id: openId,
  })
  const written = existsSync(marker) ? JSON.parse(readFileSync(marker, "utf8")) : undefined
  const cursorsMatch =
    Number.isInteger(written?.cursor) &&
    Number.isInteger(reported.json?.cursor) &&
    written.cursor === reported.json.cursor
  report.assert(
    "outbox-marker-written-on-insert",
    !markerBefore && reported.code === 0 && written?.binding_id === openId && cursorsMatch,
    `before=${markerBefore} marker=${JSON.stringify(written)} cursor=${reported.json?.cursor}`,
  )
})
