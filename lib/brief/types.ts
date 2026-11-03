import type { ChartBlock, ComparisonBlock, TableBlock, TimelineBlock, UnknownBlock } from "./schema"

// The normalised brief every other module works with. Built by normalizeBrief()
// from the raw API JSON plus the optional company tags file.

export type Tier = "detail" | "brief" | "one_liner"
export const TIERS: readonly Tier[] = ["detail", "brief", "one_liner"]

// Raw status is kept too. Unknown values (for example the undocumented
// "carried over") map to "carried" when they look like it, else "other".
export type StatusKind = "new" | "updated" | "carried" | "other"

export type FigureType = "timeline" | "chart" | "table" | "comparison" | "unknown"

export type Figure =
  | { type: "timeline"; scope: "item" | "current"; block: TimelineBlock }
  | { type: "chart"; scope: "item" | "current"; block: ChartBlock }
  | { type: "table"; scope: "item" | "current"; block: TableBlock }
  | { type: "comparison"; scope: "item" | "current"; block: ComparisonBlock }
  | { type: "unknown"; scope: "item" | "current"; block: UnknownBlock }

export type Link = { id: string; href: string } // href = https://app.startaiming.com/o/<id>

export type Citation = {
  id: string
  href: string
  title: string
  subtitle: string | null
  date: string | null
  sourceCount: number
  severity: "green" | "orange" | "red" | "other"
}

export type Item = {
  key: string // `${recapId}:${index}`, stable for this week only
  index: number // position in raw recap.doc.items
  tier: Tier
  status: StatusKind
  statusRaw: string
  headline: string
  paragraphs: string[] // one-liners: [] when paragraphs[0] repeats the headline
  means: string | null // detail only
  date: string | null // ISO yyyy-mm-dd
  current: string | null // label of the current it belongs to
  scope: string // scope name, "Other" when scope_id is null or unknown
  scopeId: string | null
  companies: string[] // from tags file, exact strings from the item text, [] without tags
  primaryCompany: string | null // first tagged company in headline order, then text order
  hasNumber: boolean // strict test, computed in code
  figure: Figure | null
  sources: Link[] // cited_update_ids then cited_signal_ids, deduplicated
  updates: Citation[] // "Read the updates", detail only, from read_update_ids
}

export type Current = {
  index: number
  label: string
  line: string
  status: StatusKind
  statusRaw: string
  since: string | null
  sinceLabel: string | null // "two weeks"
  sources: Link[]
  itemKeys: string[] // items whose `current` equals this label, in display order
  figure: Figure | null // a figure with scope "current" from one of its items, if any
}

export type Brief = {
  recapId: string
  periodStart: string
  periodEnd: string
  title: string // subject, or the verdict when subject is empty
  titleIsVerdict: boolean
  verdict: string
  currents: Current[]
  items: Item[] // sorted: detail, brief, one_liner, JSON order inside a tier
  citations: Citation[]
  scopes: { id: string; name: string }[]
  readingMinutes: number
  hasTags: boolean
}
