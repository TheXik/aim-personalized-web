import type { Brief } from "../brief/types"
import type { ApplyResult, Change, RejectReason } from "./apply"
import { buildView, DEFAULT_TITLES, filterSummary, pinSummary } from "./engine"
import type { ApplicableOp, NotSupportedReason } from "./ops"
import { describeRule } from "./rules"
import type { Rule, SectionKey, ViewSpec } from "./spec"

// The chat reply, composed in code from what actually changed. The model writes
// none of it. Headlines quoted here are the brief's own text.

export type Offer = { label: string; ops: ApplicableOp[] }
export type Reply = { text: string; changed: boolean; offer: Offer | null }

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
  other: "That's not something this page can do yet.",
}

function headlines(hs: string[], max = 3): string {
  const shown = hs.slice(0, max).map((h) => h.replace(/\.$/, ""))
  return shown.join(". ") + (hs.length > max ? `, and ${hs.length - max} more` : "")
}

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

function rejectionLine(r: RejectReason): string {
  switch (r.kind) {
    case "unknown_phrase":
      return `“${r.value}” isn't in this week's brief, so I didn't filter on it.`
    case "unknown_value":
      return `This brief has no ${r.field} called “${r.value}”.`
    case "too_big":
      return "That rule was too complex, try something simpler."
    case "limit":
      return r.what === "size" ? "That would make your settings too large." : `You have the most ${r.what} I keep. Remove one first.`
    case "unknown_id":
      return "I couldn't find that setting."
    case "label_not_allowed":
    case "not_reader_words":
      return `I can only name sections with words from the brief or your own message, not “${r.text}”.`
  }
}

function changeLine(c: Change, after: ReturnType<typeof buildView>): string {
  switch (c.kind) {
    case "filter_added": {
      const d = after.directives.find((x) => x.id === c.filter.id)!
      const when = c.filter.expires ? " This week only." : ""
      if (c.filter.mode === "keep") {
        return d.matched === 0
          ? `${filterSummary(c.filter)}: nothing matches this week.${when}`
          : `${filterSummary(c.filter)}. Showing ${d.matched}: ${headlines(d.matchedHeadlines)}.${when}`
      }
      return `${filterSummary(c.filter)}, ${d.hidden} hidden.${when}`
    }
    case "pin_added": {
      const d = after.directives.find((x) => x.id === c.pin.id)!
      return d.matched === 0 ? `${pinSummary(c.pin)}: nothing matches this week.` : `${pinSummary(c.pin)}: ${headlines(d.matchedHeadlines)}.`
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

export function composeReply(brief: Brief, before: ViewSpec, result: ApplyResult): Reply {
  const after = buildView(brief, result.spec)
  const lines = result.changes.map((c) => changeLine(c, after))
  let offer: Offer | null = null

  for (const r of result.rejected) lines.push(...r.reasons.slice(0, 1).map(rejectionLine))

  if (result.notSupported) {
    lines.push(NOT_SUPPORTED_COPY[result.notSupported.reason])
    const n = result.notSupported.nearest
    if (n) offer = { label: describeOp(n), ops: [n] }
  }

  const changed = JSON.stringify(before) !== JSON.stringify(result.spec)

  if (changed) {
    const total = brief.items.length
    if (after.shownTotal === 0) {
      lines.push("Nothing is left with these settings, so the full brief shows below.")
    } else if (after.hiddenTotal > total / 2) {
      lines.push(`This hides ${after.hiddenTotal} of ${total} items.`)
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
  return { text: lines.join(" "), changed, offer }
}

export const ruleText = describeRule
