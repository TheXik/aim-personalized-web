import { readFileSync } from "node:fs"
import type { Brief } from "@/lib/brief/types"
import { buildView } from "@/lib/view/engine"
import type { PageView } from "@/lib/view/model"
import type { Rule, ViewSpec } from "@/lib/view/spec"

import { HAS_REAL_BRIEFS, loadReal, rawReal, type RealSlug } from "./briefs"

export type Slug = RealSlug

// One fixture per request in research/06-requests.json, translated to ViewSpec v1.
export type Fixture = {
  id: string
  brief: Slug
  reader: string
  lang: string
  kind: string
  text: string
  follows: string | null
  research_outcome: string
  expected: "apply" | "not_supported" | "refuse"
  spec: ViewSpec | null
  gap: string | null
  expect: {
    items?: number[]
    groups?: Record<string, number[]>
    parts?: Partial<ViewSpec["parts"]>
    layout?: Partial<ViewSpec["layout"]>
    sectionTitles?: Record<string, string>
    collapsed?: string[]
    specUnchanged?: boolean
    reason?: string | null
    mustNot?: string[]
  } | null
  appOnly: boolean
}

export const fixtures: Fixture[] = JSON.parse(readFileSync("tests/fixtures/requests.json", "utf8")).requests

// Aim's briefs are not in git (the repo is public). The research 06 suite is
// labelled on them, so it runs only when data/briefs has them (tests/briefs.ts).
export const HAS_BRIEFS = HAS_REAL_BRIEFS
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rawBrief = (slug: Slug) => rawReal(slug) as any

const cache = new Map<Slug, Brief>()
export function loadBrief(slug: Slug): Brief {
  if (!cache.has(slug)) cache.set(slug, loadReal(slug))
  return cache.get(slug)!
}

// Item indices across all sections, in display order.
export const flatOrder = (view: PageView) => view.sections.flatMap((s) => s.items.map((i) => i.index))

export const render = (slug: Slug, spec: ViewSpec) => {
  const brief = loadBrief(slug)
  return buildView(brief, resolveSpec(spec, brief))
}

// Every rule a spec carries, for the literal check.
export const rulesOf = (spec: ViewSpec): Rule[] => [...spec.filters.map((f) => f.where), ...spec.pins.map((p) => p.where)]

// The reader's words for the literal check: this message plus every message it follows.
export function readerText(f: Fixture): string {
  const parts = [f.text]
  let parent = f.follows ? fixtures.find((x) => x.id === f.follows) : undefined
  while (parent) {
    parts.push(parent.text)
    parent = parent.follows ? fixtures.find((x) => x.id === parent!.follows) : undefined
  }
  return parts.join(" ")
}

// Next week's space brief, built in memory from the real one, so no copy of
// Aim's text is ever committed. Test data only, never shown to readers.
// Items and threads are found by position, so no brief text is typed out here.
// - new recap id and period
// - removed: the Crew-13 brief item (raw 4) and its thread (current 2)
// - moved tier: the Rocket Factory Augsburg one-liner (raw 7) becomes a brief item, same text
// - added: one one-liner whose headline starts with [SYNTHETIC]
// - kept word for word: the first thread's label (current 0)
// - renamed: the PSLV thread (current 3) gets a new, invented label
type RawItem = { tier: string; headline: string; paragraphs: string[]; current: string | null; [k: string]: unknown }
type RawCurrent = { label: string; status: string; since_label: string | null; [k: string]: unknown }

export function nextWeekSynthetic(raw: ReturnType<typeof rawBrief>) {
  const d = structuredClone(raw)
  const doc = d.recap.doc as { subject: string; currents: RawCurrent[]; items: RawItem[] }
  d.recap.id += "-synthetic-next-week"
  d.recap.period_start = "2026-09-28"
  d.recap.period_end = "2026-10-05"

  const items = doc.items
  const crew = items[4]
  const rfa = items[7]
  const [kept, , gone, renamed] = doc.currents
  if (crew.tier !== "brief" || !crew.headline.includes("Crew-13") || !rfa.headline.includes("Rocket Factory Augsburg") || crew.current !== gone?.label) {
    throw new Error("brief-space-launch.json changed, update nextWeekSynthetic")
  }
  items.splice(items.indexOf(crew), 1)
  doc.currents = doc.currents.filter((c) => c !== gone)
  items.splice(items.indexOf(rfa), 1)

  const promoted: RawItem = { ...structuredClone(rfa), tier: "brief", status: "updated", date: "2026-09-30", paragraphs: [rfa.headline] }
  const headline = "[SYNTHETIC] Sirius Space Services ran a second 90-second STAR1 engine firing."
  const added: RawItem = {
    ...structuredClone(items[items.length - 1]),
    tier: "one_liner", status: "new", date: "2026-10-01", current: null, headline, paragraphs: [headline],
    cited_update_ids: ["upd_synthetic0001"], cited_signal_ids: ["sig_synthetic0001"], read_update_ids: [], figure: null,
  }
  const lastBrief = items.map((i) => i.tier).lastIndexOf("brief")
  items.splice(lastBrief + 1, 0, promoted)
  items.push(added)

  kept.since_label = "five weeks"
  const oldLabel = renamed.label
  Object.assign(renamed, { label: "[SYNTHETIC] PSLV return to flight slips", status: "updated", since_label: "three weeks" })
  for (const i of items) if (i.current === oldLabel) i.current = renamed.label
  doc.subject = "[SYNTHETIC] Next-week test brief"
  return d
}

// Fixtures say "$current:N" or "$scope:N" instead of quoting a thread label or a
// scope name, and "$recap" instead of the recap id. This swaps in the brief's own
// values at test time.
export function resolveSpec(spec: ViewSpec, brief: Brief): ViewSpec {
  const swap = (v: unknown): unknown => {
    if (typeof v === "string") {
      if (v === "$recap") return brief.recapId
      const m = /^\$(current|scope):(\d+)$/.exec(v)
      if (!m) return v
      const n = Number(m[2])
      const text = m[1] === "current" ? brief.currents[n]?.label : brief.scopes[n]?.name
      if (!text) throw new Error(`fixture placeholder ${v} has no match in ${brief.recapId}`)
      return text
    }
    if (Array.isArray(v)) return v.map(swap)
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)]))
    return v
  }
  return swap(spec) as ViewSpec
}
