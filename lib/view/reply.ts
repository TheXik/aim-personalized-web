import type { Brief, Item } from "../brief/types"
import type { ApplyResult, Change, RejectReason } from "./apply"
import { substitutionNote } from "../chat/substitution"
import { applyOps } from "./apply"
import { buildView, DEFAULT_TITLES, filterSummary, pinSummary } from "./engine"
import type { ApplicableOp, NotSupportedReason } from "./ops"
import { describeRule } from "./rules"
import type { Rule, SectionKey, ViewSpec } from "./spec"

// The chat reply, composed in code from what actually changed. The model writes
// none of it. Headlines quoted here are the brief's own text.

export type Offer = { label: string; ops: ApplicableOp[] }
// substituted: the change applied is a stand-in for what was asked (see
// lib/chat/substitution.ts), so the reply says so and the UI keeps the
// "Ask your own AI" route open.
export type Reply = { text: string; changed: boolean; offer: Offer | null; substituted: boolean }

const SETTING_COPY: Record<string, (to: unknown) => string> = {
  "parts.paragraphs": (to) => (to === "none" ? "Headlines only, no paragraphs." : to === "first" ? "Showing the first paragraph only." : "Showing full paragraphs."),
  "parts.means": (to) => (to ? "Showing the “what it means” lines." : "Hiding the “what it means” lines."),
  "parts.figures": (to) => (to === "hide" ? "Hiding the figures." : to === "collapsed" ? "Figures folded, one tap to open." : "Showing the figures."),
  "parts.sources": (to) => (to ? "Showing sources." : "Hiding sources."),
  "parts.oneLiners": (to) => (to === "collapsed" ? "One-liners folded into one line." : "One-liners shown in full."),
  group: (to) => (to === "tier" ? "Back to the default sections." : to === "none" ? "One list, no sections." : `Grouped by ${to}.`),
  order: (to) =>
    ({ default: "Default order.", newest: "Newest first.", numbers_first: "Items with numbers first.", figures_first: "Items with figures first." })[
      String(to)
    ] ?? "Order changed.",
  "layout.items": (to) => (to === "compact" ? "Compact items." : to === "table" ? "Items as a table." : "Standard items."),
  "layout.figures": (to) => (to === "prominent" ? "Figures shown large." : "Figures inline."),
  "sections.currents": (to) => (to ? "Showing the threads." : "Hiding the threads."),
  "sections.updates": (to) => (to ? "Showing “Read the updates”." : "Hiding “Read the updates”."),
}

const NOT_SUPPORTED_COPY: Record<NotSupportedReason, string> = {
  new_text: "This page only rearranges what the brief says. Writing new text, like summaries, translations or advice, could change the facts, so I don't do it.",
  outside_knowledge: "The brief doesn't say that, and I never add facts. If you name the companies or topics, I can filter or pin them.",
  ambiguous: "I can read that in more than one way, so I left the page as it was.",
  off_topic: "I can only change how this brief is shown.",
  other: "That's not something this page can do yet. It can show only some stories, put some first or last, group by company, thread or area, sort by newest or by numbers, and hide parts of each story.",
}

// Replies stay short: a count plus at most three short names (companies), never
// full headlines. The page itself shows the stories.
function shortNames(items: Item[], max = 3): string {
  const names = [...new Set(items.map((i) => i.primaryCompany).filter((n): n is string => !!n))]
  if (names.length === 0) return ""
  const head = names.slice(0, max)
  const more = names.length - head.length
  return ` (${head.join(", ")}${more > 0 ? ` and ${more} more` : ""})`
}
const count = (n: number) => `${n} ${n === 1 ? "item" : "items"}`

export function describeOp(op: ApplicableOp): string {
  switch (op.op) {
    case "filter":
      return filterSummary(op)
    case "pin":
      return pinSummary(op)
    case "remove":
      return `Remove setting ${op.id}`
    case "reset":
      return "Back to the default design"
    case "group":
      return SETTING_COPY.group(op.by).replace(/\.$/, "")
    case "order":
      return SETTING_COPY.order(op.by).replace(/\.$/, "")
    case "rename":
      return `Rename “${DEFAULT_TITLES[op.section]}” to “${op.text}”`
    default: {
      const first = Object.entries(op).find(([k, v]) => k !== "op" && v !== null)
      const path = first ? (op.op === "parts" ? `parts.${first[0]}` : `${op.op}.${first[0]}`) : null
      return path && SETTING_COPY[path] ? SETTING_COPY[path](first![1]).replace(/\.$/, "") : "Change the layout"
    }
  }
}

// Never quotes a literal the code rejected: it came from the model, and no
// model-written text may reach the reader (decision 5).
function rejectionLine(r: RejectReason): string {
  switch (r.kind) {
    case "unknown_phrase":
      return "One of those words isn't in this week's brief, so I didn't filter on it."
    case "unknown_value":
      return `This brief has no ${r.field} with that name.`
    case "too_big":
      return "That rule was too complex, try something simpler."
    case "limit":
      return r.what === "size" ? "That would make your settings too large." : `You have the most ${r.what} I keep. Remove one first.`
    case "unknown_id":
      return "I couldn't find that setting."
    case "matches_nothing":
      return "Nothing in this week's brief matches that, so I left the page as it was."
    case "unclear":
      return "I wasn't sure which stories you meant by “other”, so I left that part out."
    case "label_not_allowed":
    case "not_reader_words":
      return "I can only name sections with words from the brief or your own message."
  }
}

function changeLine(c: Change, after: ReturnType<typeof buildView>): string {
  switch (c.kind) {
    case "filter_added": {
      const d = after.directives.find((x) => x.id === c.filter.id)!
      const when = c.filter.expires ? " Just for this week's brief." : ""
      if (c.filter.mode === "keep") return `${filterSummary(c.filter)}: ${after.shownTotal} of ${after.shownTotal + after.hiddenTotal} shown.${when}`
      return `${filterSummary(c.filter)}: ${d.hidden} hidden.${when}`
    }
    case "pin_added": {
      const d = after.directives.find((x) => x.id === c.pin.id)!
      if (d.matched === 0) return `${pinSummary(c.pin)}: nothing matches this week.`
      // Count only what the reader can see: a filter may hide the pinned items.
      const shown = after.sections.filter((s) => s.key.endsWith(`:${c.pin.id}`)).flatMap((s) => s.items)
      if (shown.length === 0) return `${pinSummary(c.pin)}: those items are hidden by another setting.`
      return `${pinSummary(c.pin)}: ${count(shown.length)}${shortNames(shown)}.`
    }
    case "removed":
      return `Removed “${"mode" in c.what ? filterSummary(c.what) : pinSummary(c.what)}”.`
    case "setting":
      return SETTING_COPY[c.path]?.(c.to) ?? "Layout changed."
    case "renamed":
      return `Renamed “${DEFAULT_TITLES[c.section as SectionKey] ?? c.section}” to “${c.text}”.`
    case "reset":
      return "Back to the default design."
  }
}

const isStatusNew = (r: Rule) => r.op === "eq" && r.field === "status" && r.value === "new"

export function composeReply(brief: Brief, before: ViewSpec, result: ApplyResult, request: string): Reply {
  const after = buildView(brief, result.spec)
  const lines = result.changes.map((c) => changeLine(c, after))
  let offer: Offer | null = null

  for (const r of result.rejected) lines.push(...r.reasons.slice(0, 1).map(rejectionLine))

  if (result.notSupported) {
    lines.push(NOT_SUPPORTED_COPY[result.notSupported.reason])
    // Offer the nearest op only if it passes the same checks as an applied op,
    // so its label is built from brief names or the reader's own words only.
    const n = result.notSupported.nearest
    if (n) {
      const trial = applyOps(result.spec, [n], { brief, request })
      if (trial.rejected.length === 0 && trial.changes.length > 0) offer = { label: describeOp(n), ops: [n] }
    }
  }

  const changed = JSON.stringify(before) !== JSON.stringify(result.spec)

  if (changed) {
    const total = brief.items.length
    if (after.shownTotal === 0) {
      lines.push("Nothing is left with these settings, so the full brief shows below.")
    } else if (after.hiddenTotal > total / 2) {
      // One count per reply: the change line already says how many show.
      // When "only new" hides most of the page, offer the wider reading.
      const newOnly = result.changes.find((c) => c.kind === "filter_added" && c.filter.mode === "keep" && isStatusNew(c.filter.where))
      if (newOnly && newOnly.kind === "filter_added" && !offer) {
        offer = {
          label: "Show new and updated stories",
          ops: [
            { op: "remove", id: newOnly.filter.id },
            { op: "filter", mode: "keep", where: { op: "in", field: "status", values: ["new", "updated"] }, duration: newOnly.filter.expires ? "this_week" : "standing" },
          ],
        }
      }
    }
  }

  if (lines.length === 0) lines.push("Nothing changed. Your page already looks like that.")
  const note = substitutionNote(request, result.changes)
  if (note) lines.unshift(note)
  return { text: lines.join(" "), changed, offer, substituted: note !== null }
}

export const ruleText = describeRule
