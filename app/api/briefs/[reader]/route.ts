import { MISSING_BRIEF_MESSAGE, rawBrief } from "@/lib/brief/data"
import { isReaderSlug } from "@/lib/brief/schema"

// Stands in for Aim's API: returns the brief unchanged, with some latency
// so the page's loading state is real. A slug only ever gets its own brief.
const LATENCY_MS = 300

export async function GET(_req: Request, ctx: RouteContext<"/api/briefs/[reader]">) {
  const { reader } = await ctx.params
  if (!isReaderSlug(reader)) return Response.json({ error: "unknown reader" }, { status: 404 })
  const raw = rawBrief(reader)
  if (raw === null) return Response.json({ error: "missing_brief", message: MISSING_BRIEF_MESSAGE }, { status: 404 })
  await new Promise((r) => setTimeout(r, LATENCY_MS))
  return Response.json(raw, { headers: { "cache-control": "no-store" } })
}
