import type { Brief } from "../brief/types"
import { applyOps, sanitizeSpec } from "../view/apply"
import { buildCatalog, specForModel } from "../view/catalog"
import type { Edit, Op } from "../view/ops"
import { composeReply, describeOp, type Offer } from "../view/reply"
import { parseStoredSpec, type ViewSpec } from "../view/spec"
import { matchOffline } from "./offline"
import { CONTACT_EMAIL } from "../config"
import type { ContactOffer } from "./contact"
import { frustrationSignal } from "./frustration"
import { isQuestion, nearestForQuestion } from "./question"
import { buildFrontPage } from "../front/front-page"
import { buildView } from "../view/engine"

// One chat turn, with the model injected so it can be tested without Azure.

export const MAX_REQUEST_CHARS = 500

export type ModelResult =
  | { ok: true; output: Edit }
  // offline: live calls are switched off on this server (no CHAT_LIVE), not an outage.
  | { ok: false; reason: "timeout" | "content_filter" | "rate_limited" | "invalid_output" | "budget" | "offline" | "error" }

export type ChatDeps = {
  brief: Brief
  callModel: (prompt: string) => Promise<ModelResult>
  log?: (entry: Record<string, unknown>) => void
  // Records a request the chat could not do (lib/infra/declines.ts). Never throws.
  logDecline?: (d: { reason: string; request: string; frustrated: boolean }) => Promise<void> | void
}

export type ChatResponse = {
  spec: ViewSpec
  reply: string
  changed: boolean
  offer: Offer | null
  source: "model" | "offline" | "none"
  // The chat could not do it (a question, "not supported", or nothing applied).
  // The browser counts these in a row: two in a row show the direct line at once.
  declined: boolean
  // The direct line to Lukáš (lib/chat/contact.ts), or null. Never set when
  // CONTACT_EMAIL is empty.
  contact: ContactOffer | null
}

type Turn = Omit<ChatResponse, "contact" | "declined"> & { decline: string | null }

const FAILURE_COPY: Record<Exclude<ModelResult, { ok: true }>["reason"], string> = {
  timeout: "That took too long, so I left your page as it was. Try again, or pick a suggestion.",
  content_filter: "I can't help with that. Your page is unchanged.",
  rate_limited: "The assistant is busy right now. Your page is unchanged, try again in a moment.",
  invalid_output: "I couldn't turn that into a change. Your page is unchanged. Try saying it another way.",
  budget: "The model budget for this demo is used up. Your page is unchanged, the suggestions still work.",
  offline: "Live chat is off on this server, so I only understand short commands such as “hide the one-liners”, “numbers first”, “group it by company” or “hide the threads”. Your page is unchanged.",
  error: "The assistant is unavailable right now. Your page is unchanged.",
}

export type ChatInput = {
  request: unknown
  spec: unknown
  // How many turns in a row before this one the chat could not do. The browser
  // counts them from its own history. Two declines in a row count as frustration.
  declinesInARow?: unknown
}

export async function handleChat(input: ChatInput, deps: ChatDeps): Promise<ChatResponse> {
  const { decline, ...res } = await turn(input, deps)
  const request = typeof input.request === "string" ? input.request.trim().slice(0, MAX_REQUEST_CHARS) : ""
  const streak = typeof input.declinesInARow === "number" && Number.isFinite(input.declinesInARow) ? Math.min(Math.max(Math.floor(input.declinesInARow), 0), 50) : 0
  const frustrated = (request !== "" && frustrationSignal(request) !== null) || (decline !== null && streak >= 1)
  const contact: ContactOffer | null = !CONTACT_EMAIL
    ? null
    : frustrated
      ? { when: "now", reason: "frustrated" }
      : decline !== null
        ? { when: "after", reason: "declined" }
        : null
  if (decline !== null) await deps.logDecline?.({ reason: decline, request, frustrated })
  return { ...res, declined: decline !== null, contact }
}

async function turn(input: ChatInput, deps: ChatDeps): Promise<Turn> {
  const spec = sanitizeSpec(parseStoredSpec(input.spec), deps.brief)
  const request = typeof input.request === "string" ? input.request.trim().slice(0, MAX_REQUEST_CHARS) : ""
  const log = deps.log ?? (() => {})
  if (!request) return { spec, reply: "Tell me how you'd like the page, for example “numbers first”.", changed: false, offer: null, source: "none", decline: null }

  // Questions never reach the model. The chat only changes what you see, so a
  // question gets the closest change, then the direct line (contact "after").
  if (isQuestion(request)) {
    const offer = namesOffer(request, spec, deps.brief)
    log({ event: "question", request })
    return {
      spec,
      reply: offer
        ? "I change what you see, I can't answer questions. The closest change is one click away."
        : "I change what you see, I can't answer questions. Try “only new items” or “group it by company”.",
      changed: false,
      offer,
      source: "none",
      decline: "question",
    }
  }

  let ops: Op[]
  let source: ChatResponse["source"] = "model"

  // A request that is exactly a built-in shortcut (the example chips, "hide the
  // one-liners") needs no model: free, instant and the same every time.
  const shortcut = matchOffline(request)
  if (shortcut) {
    ops = shortcut
    source = "offline"
  } else {
    const prompt = JSON.stringify({ catalog: buildCatalog(deps.brief), current_spec: specForModel(spec), request })
    const result = await deps.callModel(prompt)
    if (result.ok) {
      ops = result.output.ops
    } else {
      // No shortcut matched (checked above), so every failure ends here.
      log({ event: "chat_failed", reason: result.reason })
      // No dead end: the closest view from names the reader typed, and the
      // Ask-your-own-AI route. Not after the content filter (a hostile request).
      const hostile = result.reason === "content_filter"
      return {
        spec,
        reply: FAILURE_COPY[result.reason],
        changed: false,
        offer: hostile ? null : namesOffer(request, spec, deps.brief),
        source: "none",
        decline: null,
      }
    }
  }

  const applied = applyOps(spec, ops, { brief: deps.brief, request })
  const reply = composeReply(deps.brief, spec, applied, request)

  // Every change must show on the page. Group tags appear on the "Also this
  // week" rows, so grouping while those rows are hidden changes nothing visible.
  const grouped = applied.changes.some((c) => c.kind === "setting" && c.path === "group" && (c.to === "company" || c.to === "scope"))
  if (grouped) {
    const front = buildFrontPage(buildView(deps.brief, applied.spec))
    if (!front.also.some((i) => front.groupOf[i.key])) {
      reply.text += " The groups show in “Also this week”, which your current settings hide."
    }
  }

  if (applied.notSupported || applied.rejected.length) {
    // Unmet requests grow the grammar. The request is the reader's own text.
    log({
      event: "unmet",
      reason: applied.notSupported?.reason ?? null,
      rejected: applied.rejected.map((r) => r.reasons[0]?.kind),
      request,
    })
  }

  // The chat could not do it: an explicit "not supported", or nothing applied.
  const couldNot = applied.notSupported !== null || (!reply.changed && applied.rejected.length > 0)
  const decline = couldNot ? (applied.notSupported ? `not_supported:${applied.notSupported.reason}` : "rejected") : null
  // No dead end: a refusal without a valid nearest op falls back to the names
  // the reader typed. A substitution keeps the Ask-your-own-AI route open.
  const offer = reply.offer ?? (couldNot ? namesOffer(request, applied.spec, deps.brief) : null)
  return {
    spec: applied.spec,
    reply: reply.text,
    changed: reply.changed,
    offer,
    source,
    decline,
  }
}

// The closest view from brief names the reader typed (companies, areas), as a
// one-click offer. Only offered when it passes the same checks as an edit.
function namesOffer(request: string, spec: ViewSpec, brief: Brief): Offer | null {
  const nearest = nearestForQuestion(request, brief)
  if (!nearest) return null
  const trial = applyOps(spec, [nearest], { brief, request })
  return trial.rejected.length === 0 && trial.changes.length > 0 ? { label: describeOp(nearest), ops: [nearest] } : null
}
