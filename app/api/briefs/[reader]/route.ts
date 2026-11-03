import { readRawBrief } from "@/lib/brief/load"
import { isReaderSlug } from "@/lib/brief/schema"

// Stands in for Aim's API: returns the brief unchanged, with some latency
// so the page's loading state is real. A slug only ever gets its own brief.
const LATENCY_MS = 300

export async function GET(_req: Request, ctx: RouteContext<"/api/briefs/[reader]">) {
  const { reader } = await ctx.params
  if (!isReaderSlug(reader)) return Response.json({ error: "unknown reader" }, { status: 404 })
  await new Promise((r) => setTimeout(r, LATENCY_MS))
  return Response.json(readRawBrief(reader), { headers: { "cache-control": "no-store" } })
}
