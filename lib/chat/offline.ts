import type { ApplicableOp } from "../view/ops"

// Built-in shortcuts for the most common requests. Used only when the model is
// down, slow or unavailable, so the page keeps working without it. No model call.
const SHORTCUTS: { re: RegExp; ops: ApplicableOp[] }[] = [
  { re: /\b(reset|start over|default (design|view))\b/i, ops: [{ op: "reset" }] },
  {
    re: /\bonly (what('?s| is) )?new\b|\bnew this week\b|\bjust (the )?new\b/i,
    ops: [{ op: "filter", mode: "keep", where: { op: "eq", field: "status", value: "new" }, duration: "standing" }],
  },
  {
    re: /\b(hide|no|drop|remove) (the )?one[- ]?liners\b/i,
    ops: [{ op: "filter", mode: "hide", where: { op: "eq", field: "tier", value: "one_liner" }, duration: "standing" }],
  },
  { re: /\bnumbers? (first|on top|up top)\b/i, ops: [{ op: "pin", where: { op: "has_number" }, to: "top", label: null, duration: "standing" }] },
  { re: /\bgroup(ed)? (it |them )?by compan(y|ies)\b/i, ops: [{ op: "group", by: "company" }] },
  { re: /\bgroup(ed)? (it |them )?by (thread|current)s?\b/i, ops: [{ op: "group", by: "current" }] },
  { re: /\bgroup(ed)? (it |them )?by (topic|scope|area)s?\b/i, ops: [{ op: "group", by: "scope" }] },
  { re: /\bheadlines only\b|\bjust (the )?headlines\b/i, ops: [{ op: "parts", paragraphs: "none", means: false, figures: null, sources: null, oneLiners: null }] },
  { re: /\bnewest first\b|\blatest first\b/i, ops: [{ op: "order", by: "newest" }] },
]

// Filler that may surround a shortcut without changing what it means.
const FILLER = /\b(please|pls|thanks|thank you|can you|could you|just|now|always|for me|the page|it)\b/gi

// A shortcut fires only when every part of the request is one. "Only what's new
// this week, but keep the OpenAI pause" has a part no shortcut covers, so it
// gets no shortcut at all rather than a silently partial change.
export function matchOffline(request: string): ApplicableOp[] | null {
  const parts = request
    .split(/[,;.!?]|\band\b|\bthen\b|\balso\b/i)
    .map((p) => p.replace(FILLER, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
  if (parts.length === 0) return null
  const ops: ApplicableOp[] = []
  for (const part of parts) {
    const hit = SHORTCUTS.find((s) => {
      const m = part.match(s.re)
      // The match has to be the whole part, give or take two leftover words.
      return m && part.replace(m[0], " ").trim().split(/\s+/).filter(Boolean).length <= 2
    })
    if (!hit) return null
    ops.push(...hit.ops)
  }
  return ops
}
