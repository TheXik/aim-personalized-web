import type { Brief } from "../brief/types"
import { applyOps } from "../view/apply"
import { buildCatalog, specForModel } from "../view/catalog"
import type { Edit, Op } from "../view/ops"
import { composeReply, type Offer } from "../view/reply"
import { parseStoredSpec, type ViewSpec } from "../view/spec"
import { matchOffline } from "./offline"

// One chat turn, with the model injected so it can be tested without Azure.

export const MAX_REQUEST_CHARS = 500

export type ModelResult =
  | { ok: true; output: Edit }
  | { ok: false; reason: "timeout" | "content_filter" | "rate_limited" | "invalid_output" | "budget" | "error" }

export type ChatDeps = {
  brief: Brief
  callModel: (prompt: string) => Promise<ModelResult>
  log?: (entry: Record<string, unknown>) => void
}

export type ChatResponse = {
  spec: ViewSpec
  reply: string
  changed: boolean
  offer: Offer | null
  source: "model" | "offline" | "none"
}

const FAILURE_COPY: Record<Exclude<ModelResult, { ok: true }>["reason"], string> = {
  timeout: "That took too long, so I left your page as it was. Try again, or pick a suggestion.",
  content_filter: "I can't help with that. Your page is unchanged.",
  rate_limited: "The assistant is busy right now. Your page is unchanged, try again in a moment.",
  invalid_output: "I couldn't turn that into a change. Your page is unchanged. Try saying it another way.",
  budget: "The model budget for this demo is used up. Your page is unchanged, the suggestions still work.",
  error: "The assistant is unavailable right now. Your page is unchanged.",
}

export async function handleChat(input: { request: unknown; spec: unknown }, deps: ChatDeps): Promise<ChatResponse> {
  const spec = parseStoredSpec(input.spec)
  const request = typeof input.request === "string" ? input.request.trim().slice(0, MAX_REQUEST_CHARS) : ""
  const log = deps.log ?? (() => {})
  if (!request) return { spec, reply: "Tell me how you'd like the page, for example “numbers first”.", changed: false, offer: null, source: "none" }

  const prompt = JSON.stringify({ catalog: buildCatalog(deps.brief), current_spec: specForModel(spec), request })
  const result = await deps.callModel(prompt)

  let ops: Op[]
  let source: ChatResponse["source"] = "model"
  let prefix = ""
  if (result.ok) {
    ops = result.output.ops
  } else {
    const offline = result.reason === "content_filter" ? null : matchOffline(request)
    if (!offline) {
      log({ event: "chat_failed", reason: result.reason })
      return { spec, reply: FAILURE_COPY[result.reason], changed: false, offer: null, source: "none" }
    }
    ops = offline
    source = "offline"
    prefix = "The assistant is unavailable, so I used a built-in shortcut. "
  }

  const applied = applyOps(spec, ops, { brief: deps.brief, request })
  const reply = composeReply(deps.brief, spec, applied)

  if (applied.notSupported || applied.rejected.length) {
    // Unmet requests grow the grammar. The request is the reader's own text.
    log({
      event: "unmet",
      reason: applied.notSupported?.reason ?? null,
      rejected: applied.rejected.map((r) => r.reasons[0]?.kind),
      request,
    })
  }

  return { spec: applied.spec, reply: prefix + reply.text, changed: reply.changed, offer: reply.offer, source }
}
