import type { Brief, Citation, Current, Item } from "../brief/types"
import type { Layout, Parts, ViewSpec } from "./spec"

// What the engine hands the UI: buildView(brief, spec) => PageView.
// The UI renders this and nothing else. Every string in it comes from the brief,
// from an allowlisted label or from fixed copy in code.

export type SectionKind = "pinned_top" | "tier" | "group" | "pinned_bottom"

export type SectionView = {
  key: string // stable within a render, e.g. "tier:detail", "group:scope:SpaceX", "pinned_top"
  kind: SectionKind
  title: string // default section name, an allowlisted label or the reader's rename
  titleSource: "default" | "scope" | "current" | "company" | "reader"
  items: Item[] // in display order
  hiddenCount: number // items of this section removed by filters
  collapsed: boolean // e.g. one-liners when parts.oneLiners is "collapsed"
  emptyNote: string | null // "No one-liners this week" style note, written in code
}

export type DirectiveState = "active" | "inactive" | "expired"

export type DirectiveView = {
  id: string
  kind: "filter" | "pin"
  summary: string // code-written chip text, e.g. "Only new" or "SpaceX at the bottom"
  state: DirectiveState // inactive: names a current that is not in this brief. expired: other week
  matched: number // items the rule matched this week
  hidden: number // items this directive removed (filters only)
  matchedHeadlines: string[] // so the reader can spot a miss
}

export type PageView = {
  recapId: string
  title: string
  titleIsVerdict: boolean
  verdict: string // never hidden
  periodStart: string
  periodEnd: string
  readingMinutes: number
  currents: Current[] | null // null when sections.currents is false
  sections: SectionView[]
  updates: Citation[] | null // "Read the updates", null when hidden or empty
  parts: Parts
  layout: Layout
  directives: DirectiveView[]
  hiddenTotal: number
  shownTotal: number
  // When filters leave no items, the page shows a notice and the full brief
  // below it instead of a blank page.
  emptyFallback: { notice: string; sections: SectionView[] } | null
  isDefault: boolean
}

// Function signatures every lane codes against.
export type BuildView = (brief: Brief, spec: ViewSpec) => PageView
