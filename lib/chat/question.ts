import type { Brief } from "../brief/types"
import { containsPhrase } from "../brief/text"
import type { ApplicableOp } from "../view/ops"
import { allowedValues } from "../view/rules"
import { matchOffline } from "./offline"

// Questions about the brief ("who led Nscale's round?") are not view changes.
// They are caught here, before any model call, so they cost nothing and the
// model is never asked to answer from the brief. The reader gets the closest
// view change as one click, and if that is not it, "Ask your own AI" with the
// brief as Markdown and their question on top (see lib/export/agent-markdown.ts).

// Words that make a sentence a view request even when it reads like a question:
// "can you hide the one-liners?", "what if you group it by company".
const VIEW_WORDS =
  /\b(show|hide|only|just|group|grouped|sort|order|pin|put|move|filter|collapse|expand|fold|unfold|rename|reset|undo|remove|drop|first|last|top|bottom|highlight|compact|table|shorter|longer|less|more)\b/i

// English, Czech and Slovak question openers. "Can", "could", "would" and "will"
// are left out on purpose: in this chat they almost always open a polite request.
const OPENERS =
  /^(who|whom|whose|what|what's|whats|when|where|why|how|which|is|are|was|were|does|do|did|has|have|had|should|kdo|kto|co|čo|kdy|kedy|kde|proč|prečo|jak|ako|který|která|které|ktorý|ktorá|ktoré|kolik|koľko|je|jsou|sú)\b/i

export function isQuestion(request: string): boolean {
  const t = request.trim()
  if (!t || VIEW_WORDS.test(t)) return false
  // A whole-request shortcut ("what's new this week") is a view request.
  if (matchOffline(t)) return false
  return OPENERS.test(t)
}

// The closest view change for a question, without a model: names from this
// week's brief that the reader typed (companies and monitoring areas), shown on
// their own for this week. null when the question names nothing in the brief.
export function nearestForQuestion(question: string, brief: Brief): ApplicableOp | null {
  const companies = allowedValues(brief, "company").filter((c) => containsPhrase(question, c))
  const scopes = brief.scopes.map((s) => s.name).filter((s) => containsPhrase(question, s))
  const args = [
    ...(companies.length ? [{ op: "in" as const, field: "company" as const, values: companies.slice(0, 6) }] : []),
    ...(scopes.length ? [{ op: "in" as const, field: "scope" as const, values: scopes.slice(0, 6) }] : []),
  ]
  if (args.length === 0) return null
  return { op: "filter", mode: "keep", where: args.length === 1 ? args[0] : { op: "or", args }, duration: "this_week" }
}
