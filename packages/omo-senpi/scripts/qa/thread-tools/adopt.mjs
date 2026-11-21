#!/usr/bin/env bun
/**
 * adopt (todo 16, IS-3): a session on a Desktop-thread shard host (`i-*`) is taken into a local
 * Senpi terminal after a takeover release from the host. The terminal shows the prior
 * exchange, registers its own `tui` endpoint for the SAME durable id, the host no longer lists the
 * session, the transcript carries the host's `session_released` entry, and a later delivery reaches
 * the adopted terminal.
 */
import {
  EndpointClient,
  assistantTexts,
  awaitTuiEndpoint,
  deliveryEntries,
  deliveryIdOf,
  deliveryRow,
  openHostSession,
  runScenario,
  sessionEntries,
  startShardHost,
  threadSdk,
  waitFor,
} from "./lib/gateway.mjs"

await runScenario("adopt", async ({ report, scratch, install, startTui }) => {
  const shard = await startShardHost(scratch, install, `qa-adopt-${process.pid}`)
  const hostSession = await openHostSession(shard.client, scratch.work)
  const prompted = await shard.client.request({
    type: "prompt",
    sessionId: hostSession.routingId,
    message: "prior exchange on the host QA-TOKEN-adopt-prior",
  })
  report.assert("host-prompt-started", prompted.success === true, JSON.stringify(prompted.data ?? prompted.error))
  await waitFor(
    () => assistantTexts(hostSession.sessionPath).some((text) => text.includes("QA-ACK QA-TOKEN-adopt-prior")),
    { label: "host session answered" },
  )
  await waitFor(
    () =>
      shard.client.records.some(
        (record) => record.type === "agent_settled" && record.sessionId === hostSession.routingId,
      ),
    { label: "host session settled" },
  )
  // A client still attached makes the release answer `attached`; this one detaches (the session is retained).
  shard.client.close()

  const probe = await EndpointClient.connect(shard.socket, "shard-probe")
  const released = await waitFor(
    async () => {
      const reply = await probe.request({
        type: "release_session",
        reason: "takeover",
        sessionId: hostSession.routingId,
      })
      // The settled event can precede the RPC host removing its pending prompt record.
      return reply.error === "turn_active" && reply.errorData?.busy?.includes("prompt") ? undefined : reply
    },
    { label: "host releases the settled session", timeoutMs: 5000 },
  )
  if (released.success !== true || released.data?.session_path !== hostSession.sessionPath) {
    throw new Error(`release did not return the hosted session file: ${JSON.stringify(released)}`)
  }
  const adopted = await startTui("tui-adopted", { args: ["--session", released.data.session_path] })
  const endpoint = await awaitTuiEndpoint(scratch, adopted)
  report.assert(
    "adopted-same-durable-id",
    endpoint.durableId === hostSession.durableId,
    `host=${hostSession.durableId} terminal=${endpoint.durableId}`,
  )
  const flat = (text) => text.replace(/\s+/g, "")
  await adopted.waitScreen((text) => flat(text).includes("QA-ACKQA-TOKEN-adopt-prior"), {
    label: "prior exchange visible in the terminal",
    scope: "history",
  })
  report.assert("prior-exchange-visible", true, "QA-ACK QA-TOKEN-adopt-prior rendered")

  const listed = await probe.request({ type: "list_sessions" })
  const stillHosted = (listed.data?.sessions ?? []).some(
    (session) => session.durableSessionId === hostSession.durableId,
  )
  report.assert(
    "host-no-longer-lists-it",
    listed.success === true && !stillHosted,
    `host sessions=${JSON.stringify((listed.data?.sessions ?? []).map((session) => session.durableSessionId))}`,
  )
  probe.close()
  report.assert(
    "session-released-entry",
    sessionEntries(hostSession.sessionPath).some((entry) => entry.customType === "session_released"),
    "custom entry session_released present",
  )

  const threads = await threadSdk(scratch, install, "list")
  const rows = Array.isArray(threads.json?.threads)
    ? threads.json.threads.filter((thread) => thread.thread === hostSession.durableId)
    : []
  const located = await threadSdk(scratch, install, "locate", { thread: hostSession.durableId })
  report.assert(
    "listed-once-as-tui",
    rows.length === 1 &&
      rows[0].surface === "tui" &&
      rows[0].status === "live" &&
      located.json?.thread?.endpoint?.kind === "tui" &&
      located.json.thread.alive === true,
    JSON.stringify({ rows, endpoint: located.json?.thread?.endpoint?.kind }),
  )

  const sent = await threadSdk(scratch, install, "send", {
    thread: hostSession.durableId,
    text: "QA-TOKEN-after-adopt reaches the adopted terminal",
  })
  const deliveryId = sent.json?.delivery_id
  await waitFor(
    () => assistantTexts(hostSession.sessionPath).some((text) => text.includes("QA-ACK QA-TOKEN-after-adopt")),
    { label: "adopted terminal answers a delivery" },
  )
  const row = await waitFor(
    async () => {
      const current = await deliveryRow(scratch.agentDir, deliveryId)
      return current?.state === "applied" ? current : undefined
    },
    { label: "row applied" },
  )
  const entries = deliveryEntries(hostSession.sessionPath).filter((entry) => deliveryIdOf(entry) === deliveryId).length
  report.assert(
    "delivery-after-adopt",
    sent.json?.endpoint_kind === "tui" && row.admission_kind === "started" && entries === 1,
    `endpoint_kind=${sent.json?.endpoint_kind} admission_kind=${row.admission_kind} entries=${entries}`,
  )
})
