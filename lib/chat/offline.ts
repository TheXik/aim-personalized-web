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
  {
    // "Old" means not new this week: updated or carried-over stories. Their
    // thread cards go too, because a card only shows while it has a story.
    re: /\b(hide|remove|drop|no|without) (the )?(old|older|stale) (threads?|currents?|stories|news|items)\b/i,
    ops: [{ op: "filter", mode: "hide", where: { op: "in", field: "status", values: ["updated", "carried"] }, duration: "standing" }],
  },
  {
    re: /\b(hide|remove|drop|no|without) (the )?(threads?|currents?)( to follow)?\b/i,
    ops: [{ op: "sections", currents: false, updates: null }],
  },
  { re: /\bshow (the )?(threads?|currents?)( to follow)?( again)?\b/i, ops: [{ op: "sections", currents: true, updates: null }] },
  {
    re: /\b(hide|remove|drop|no|without) (the )?(figures?|charts?|tables?|graphs?)\b/i,
    ops: [{ op: "parts", paragraphs: null, means: null, figures: "hide", sources: null, oneLiners: null }],
  },
  {
    re: /\bshow (the )?(figures?|charts?|graphs?)( again)?\b/i,
    ops: [{ op: "parts", paragraphs: null, means: null, figures: "show", sources: null, oneLiners: null }],
  },
  {
    re: /\b(hide|remove|drop|no|without) (the )?(sources?|links?)\b/i,
    ops: [{ op: "parts", paragraphs: null, means: null, figures: null, sources: false, oneLiners: null }],
  },
]

// Filler that may surround a shortcut without changing what it means.
const FILLER = /\b(please|pls|thanks|thank you|can you|could you|just|now|always|for me|the page|it)\b/gi

// A shortcut fires only when every part of the request is one. "Only what's new
// this week, but keep the OpenAI pause" has a part no shortcut covers, so it
// gets no shortcut at all rather than a silently partial change.
// ---------- Typo-tolerant section toggles (EN, CZ, SK) ----------
// "remvo the threads / currents", "skryj grafy", "odstraň vlákna": a verb, then
// one or more known page parts. One typo is allowed in words of 4+ letters.

const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

// Edit distance with swaps of neighbours (optimal string alignment).
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[a.length][b.length]
}

// Short words must match exactly, 4 to 5 letters allow one typo, longer words
// two ("remvo" for "remove").
function within1(a: string, b: string): boolean {
  if (a === b) return true
  const n = b.length
  if (n < 4) return false
  return distance(a, b) <= (n >= 6 ? 2 : 1)
}

const HIDE = ["hide", "remove", "drop", "delete", "without", "no", "skip", "skryj", "skryt", "schovej", "schovat", "odeber", "odebrat", "odstran", "odstranit", "zrus", "zrusit", "skry", "odober", "odobrat"]
const SHOW = ["show", "unhide", "restore", "zobraz", "zobrazit", "ukaz", "ukazat", "vrat", "vratit"]
const FILLER_WORDS = new Set(["the", "a", "an", "all", "my", "those", "these", "please", "pls", "me", "prosim", "vsechny", "vsetky", "ty", "tie", "and", "or", "a", "i", "aj", "na", "to", "follow"])

type Part = { words: string[][]; hide: ApplicableOp | null; show: ApplicableOp | null }
const PARTS: Part[] = [
  {
    words: [["threads"], ["thread"], ["currents"], ["current"], ["vlakna"], ["vlakno"], ["temata"], ["tema"], ["temy"]],
    hide: { op: "sections", currents: false, updates: null },
    show: { op: "sections", currents: true, updates: null },
  },
  {
    // "Also this week" is the one-liners section. Showing it again needs the
    // model, which can remove the filter by id.
    words: [["also", "this", "week"], ["also"], ["one", "liners"], ["oneliners"], ["one-liners"], ["jednoradkove"], ["jednoriadkove"]],
    hide: { op: "filter", mode: "hide", where: { op: "eq", field: "tier", value: "one_liner" }, duration: "standing" },
    show: null,
  },
  {
    words: [["charts"], ["chart"], ["figures"], ["figure"], ["graphs"], ["graph"], ["grafy"], ["graf"], ["obrazky"]],
    hide: { op: "parts", paragraphs: null, means: null, figures: "hide", sources: null, oneLiners: null },
    show: { op: "parts", paragraphs: null, means: null, figures: "show", sources: null, oneLiners: null },
  },
  {
    words: [["sources"], ["source"], ["links"], ["zdroje"], ["odkazy"]],
    hide: { op: "parts", paragraphs: null, means: null, figures: null, sources: false, oneLiners: null },
    show: { op: "parts", paragraphs: null, means: null, figures: null, sources: true, oneLiners: null },
  },
]

export function matchToggle(request: string): ApplicableOp[] | null {
  const tokens = plain(request)
    .split(/[^a-z0-9-]+/)
    .filter((t) => t && !FILLER_WORDS.has(t))
  if (tokens.length < 2) return null
  const verb = tokens[0]
  const hide = HIDE.some((v) => within1(verb, v))
  const show = !hide && SHOW.some((v) => within1(verb, v))
  if (!hide && !show) return null
  const ops: ApplicableOp[] = []
  let i = 1
  while (i < tokens.length) {
    let hit: { part: Part; len: number } | null = null
    for (const part of PARTS) {
      for (const phrase of part.words) {
        const slice = tokens.slice(i, i + phrase.length)
        if (slice.length === phrase.length && phrase.every((w, k) => within1(slice[k], w))) {
          if (!hit || phrase.length > hit.len) hit = { part, len: phrase.length }
        }
      }
    }
    if (!hit) return null // an unknown word: let the model read it
    const op = hide ? hit.part.hide : hit.part.show
    if (!op) return null
    if (!ops.some((o) => JSON.stringify(o) === JSON.stringify(op))) ops.push(op)
    i += hit.len
  }
  return ops.length ? ops : null
}

export function matchOffline(request: string): ApplicableOp[] | null {
  // "hide sources and charts": one verb for several page parts.
  const toggle = matchToggle(request)
  if (toggle) return toggle
  const parts = request
    .split(/[,;.!?]|\band\b|\bthen\b|\balso\b(?!\s+this\s+week)/i)
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
    if (hit) {
      ops.push(...hit.ops)
      continue
    }
    const toggle = matchToggle(part)
    if (!toggle) return null
    ops.push(...toggle)
  }
  return ops
}
