import { isQaInstall, recordDownload, requestCountry } from "./datapoint"
import type { RequestContext } from "./env"
import { type Channel, channelPointerKey, isReleaseVersion } from "./release-names"

const POINTER_TTL_SECONDS = 60

async function fromR2(ctx: RequestContext, channel: Channel): Promise<string | null> {
  try {
    const object = await ctx.env.RELEASES.get(channelPointerKey(channel))
    if (object === null) return null
    const version = (await object.text()).trim()
    return isReleaseVersion(version) ? version : null
  } catch (error) {
    if (error instanceof Error) return null
    throw error
  }
}

export async function serveChannel(request: Request, ctx: RequestContext, channel: Channel): Promise<Response> {
  const cacheKey = new Request(`https://get.omo.dev/channels/${channel}`, { method: "GET" })
  const cached = await ctx.cache.match(cacheKey)
  const response =
    cached ??
    (await (async () => {
      const version = await fromR2(ctx, channel)
      if (version === null) {
        return new Response("channel unavailable\n", { status: 503, headers: { "Cache-Control": "no-store" } })
      }
      const fresh = new Response(`${version}\n`, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": `public, max-age=${POINTER_TTL_SECONDS}`,
          "X-Omo-Source": "r2",
        },
      })
      ctx.waitUntil(ctx.cache.put(cacheKey, fresh.clone()))
      return fresh
    })())
  if (request.method === "GET" && response.ok) {
    const version = (await response.clone().text()).trim()
    recordDownload(ctx.env, {
      kind: "channel",
      source: "worker",
      version,
      asset: channel,
      country: requestCountry(request),
      qa: isQaInstall(request),
    })
  }
  return response
}
