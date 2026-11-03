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

// One chat turn, with the model injected so it can be tested without Azure.

export const MAX_REQUEST_CHARS = 500

export type ModelResult =
  | { ok: true; output: Edit }
  | { ok: false; reason: "timeout" | "content_filter" | "rate_limited" | "invalid_output" | "budget" | "error" }

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
  // Set when the chat cannot do the request (a question, or a change this page
  // cannot make). The UI offers "Ask your own AI" with the brief as Markdown and
  // this question on top: right away when there is no offer, otherwise after
  // the reader says the offered view is not it.
  askAi: { question: string } | null
  // The direct line to Lukáš (lib/chat/contact.ts), or null. Never set when
  // CONTACT_EMAIL is empty.
  contact: ContactOffer | null
}

type Turn = Omit<ChatResponse, "contact"> & { decline: string | null }

const FAILURE_COPY: Record<Exclude<ModelResult, { ok: true }>["reason"], string> = {
  timeout: "That took too long, so I left your page as it was. Try again, or pick a suggestion.",
  content_filter: "I can't help with that. Your page is unchanged.",
  rate_limited: "The assistant is busy right now. Your page is unchanged, try again in a moment.",
  invalid_output: "I couldn't turn that into a change. Your page is unchanged. Try saying it another way.",
  budget: "The model budget for this demo is used up. Your page is unchanged, the suggestions still work.",
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
  return { ...res, contact }
}

async function turn(input: ChatInput, deps: ChatDeps): Promise<Turn> {
  const spec = sanitizeSpec(parseStoredSpec(input.spec), deps.brief)
  const request = typeof input.request === "string" ? input.request.trim().slice(0, MAX_REQUEST_CHARS) : ""
  const log = deps.log ?? (() => {})
  if (!request) return { spec, reply: "Tell me how you'd like the page, for example “numbers first”.", changed: false, offer: null, source: "none", askAi: null, decline: null }

  // Questions never reach the model. Closest view first, then "Ask your own AI".
  if (isQuestion(request)) {
    const nearest = nearestForQuestion(request, deps.brief)
    const trial = nearest ? applyOps(spec, [nearest], { brief: deps.brief, request }) : null
    const offer = nearest && trial && trial.rejected.length === 0 && trial.changes.length > 0 ? { label: describeOp(nearest), ops: [nearest] } : null
    log({ event: "question", request })
    return {
      spec,
      reply: offer
        ? "This page doesn't answer questions. It only changes what you see, so every word stays from your brief. The closest view is one click away."
        : "This page doesn't answer questions. It only changes what you see, so every word stays from your brief. You can ask your own AI with this week's brief.",
      changed: false,
      offer,
      source: "none",
      askAi: { question: request },
      decline: "question",
    }
  }

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
      return { spec, reply: FAILURE_COPY[result.reason], changed: false, offer: null, source: "none", askAi: null, decline: null }
    }
    ops = offline
    source = "offline"
    prefix = "The assistant is unavailable, so I used a built-in shortcut. "
  }

  const applied = applyOps(spec, ops, { brief: deps.brief, request })
  const reply = composeReply(deps.brief, spec, applied, request)

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
  return { spec: applied.spec, reply: prefix + reply.text, changed: reply.changed, offer: reply.offer, source, askAi: couldNot ? { question: request } : null, decline }
}
