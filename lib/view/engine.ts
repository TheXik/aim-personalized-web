import type { Brief, Item, Tier } from "../brief/types"
import { TIERS } from "../brief/types"
import type { DirectiveState, DirectiveView, PageView, SectionView } from "./model"
import { capitalize, describeRule, isThreadInactive, matches } from "./rules"
import { DEFAULT_SPEC, type Filter, type Pin, type Rule, type SectionKey, type ViewSpec } from "./spec"

// Pure function from (brief, spec) to the page. No model, no I/O, no clock.

export const DEFAULT_TITLES: Record<SectionKey, string> = {
  currents: "This week’s threads",
  detail: "In detail",
  brief: "In brief",
  one_liner: "Also this week",
  pinned_top: "Pinned",
  pinned_bottom: "Further down",
  updates: "Read the updates",
}

const TIER_EMPTY: Record<Tier, string> = {
  detail: "No in-detail stories",
  brief: "No in-brief items",
  one_liner: "No one-liners",
}

function stateOf(d: { expires: string | null; where: Rule }, brief: Brief): DirectiveState {
  if (d.expires !== null && d.expires !== brief.recapId) return "expired"
  if (isThreadInactive(d.where, brief)) return "inactive"
  return "active"
}

export function filterSummary(f: Pick<Filter, "mode" | "where">): string {
  return f.mode === "keep" ? `Only ${describeRule(f.where)}` : `Hiding ${describeRule(f.where)}`
}

export function pinSummary(p: Pick<Pin, "to" | "where">): string {
  return `${capitalize(describeRule(p.where))} ${p.to === "top" ? "first" : "last"}`
}

function sortItems(items: Item[], order: ViewSpec["order"]): Item[] {
  const byPos = (a: Item, b: Item) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a.index - b.index
  const copy = [...items]
  switch (order) {
    case "default":
      return copy.sort(byPos)
    case "newest":
      return copy.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || byPos(a, b))
    case "numbers_first":
      return copy.sort((a, b) => Number(b.hasNumber) - Number(a.hasNumber) || byPos(a, b))
    case "figures_first":
      return copy.sort((a, b) => Number(!!b.figure) - Number(!!a.figure) || byPos(a, b))
  }
}

type GroupKey = { key: string; title: string; titleSource: SectionView["titleSource"]; rank: number }

function groupOf(item: Item, spec: ViewSpec, brief: Brief): GroupKey {
  switch (spec.group) {
    case "tier":
    case "none":
      return spec.group === "none"
        ? { key: "all", title: "This week", titleSource: "default", rank: 0 }
        : { key: `tier:${item.tier}`, title: DEFAULT_TITLES[item.tier], titleSource: "default", rank: TIERS.indexOf(item.tier) }
    case "current": {
      const i = item.current ? brief.currents.findIndex((c) => c.label === item.current) : -1
      return i >= 0
        ? { key: `group:current:${item.current}`, title: item.current!, titleSource: "current", rank: i }
        : { key: "group:current:other", title: "Other", titleSource: "default", rank: 1_000 }
    }
    case "scope": {
      const i = item.scopeId ? brief.scopes.findIndex((s) => s.id === item.scopeId) : -1
      return i >= 0
        ? { key: `group:scope:${item.scope}`, title: item.scope, titleSource: "scope", rank: i }
        : { key: "group:scope:other", title: "Other", titleSource: "default", rank: 1_000 }
    }
    case "company": {
      if (!item.primaryCompany) return { key: "group:company:other", title: "Other", titleSource: "default", rank: 1_000_000 }
      // Rank by first appearance in default reading order.
      const first = brief.items.findIndex((i) => i.primaryCompany === item.primaryCompany)
      return { key: `group:company:${item.primaryCompany}`, title: item.primaryCompany, titleSource: "company", rank: first }
    }
  }
}

function renameFor(spec: ViewSpec, key: SectionKey): string | null {
  return spec.renames.find((r) => r.section === key)?.text ?? null
}

function buildSections(visible: Item[], hidden: Item[], spec: ViewSpec, brief: Brief): SectionView[] {
  const groups = new Map<string, GroupKey & { items: Item[]; hidden: number }>()
  const touch = (item: Item) => {
    const g = groupOf(item, spec, brief)
    if (!groups.has(g.key)) groups.set(g.key, { ...g, items: [], hidden: 0 })
    return groups.get(g.key)!
  }
  // Seed every group the full brief has, so emptied groups can say so.
  for (const item of brief.items) touch(item)
  for (const item of visible) touch(item).items.push(item)
  for (const item of hidden) touch(item).hidden++

  return [...groups.values()]
    .sort((a, b) => a.rank - b.rank)
    .map((g) => {
      const tier = g.key.startsWith("tier:") ? (g.key.slice(5) as Tier) : null
      const rename = tier ? renameFor(spec, tier) : null
      return {
        key: g.key,
        kind: tier ? "tier" : "group",
        title: rename ?? g.title,
        titleSource: rename ? "reader" : g.titleSource,
        items: sortItems(g.items, spec.order),
        hiddenCount: g.hidden,
        collapsed: tier === "one_liner" && spec.parts.oneLiners === "collapsed",
        emptyNote: g.items.length === 0 ? `${tier ? TIER_EMPTY[tier] : `Nothing from ${g.title}`} with your current settings.` : null,
      } satisfies SectionView
    })
}

export function buildView(brief: Brief, spec: ViewSpec): PageView {
  const directives: DirectiveView[] = []

  // 1. Filters
  const activeFilters: Filter[] = []
  for (const f of spec.filters) {
    const state = stateOf(f, brief)
    if (state === "active") activeFilters.push(f)
    const matched = brief.items.filter((i) => matches(f.where, i))
    const removes = state === "active" ? brief.items.filter((i) => (f.mode === "keep" ? !matches(f.where, i) : matches(f.where, i))) : []
    directives.push({
      id: f.id,
      kind: "filter",
      summary: filterSummary(f),
      state,
      matched: matched.length,
      hidden: removes.length,
      matchedHeadlines: matched.map((i) => i.headline),
    })
  }
  const passes = (i: Item) => activeFilters.every((f) => (f.mode === "keep" ? matches(f.where, i) : !matches(f.where, i)))
  const visible = brief.items.filter(passes)
  const hidden = brief.items.filter((i) => !passes(i))

  // 2. Pins: each active pin takes the visible items it matches, first pin wins.
  const pinnedKeys = new Set<string>()
  const top: SectionView[] = []
  const bottom: SectionView[] = []
  for (const p of spec.pins) {
    const state = stateOf(p, brief)
    const matched = brief.items.filter((i) => matches(p.where, i))
    directives.push({
      id: p.id,
      kind: "pin",
      summary: pinSummary(p),
      state,
      matched: matched.length,
      hidden: 0,
      matchedHeadlines: matched.map((i) => i.headline),
    })
    if (state !== "active") continue
    const items = visible.filter((i) => !pinnedKeys.has(i.key) && matches(p.where, i))
    items.forEach((i) => pinnedKeys.add(i.key))
    if (items.length === 0) continue
    const sectionKey: SectionKey = p.to === "top" ? "pinned_top" : "pinned_bottom"
    const rename = renameFor(spec, sectionKey)
    const section: SectionView = {
      key: `${sectionKey}:${p.id}`,
      kind: sectionKey,
      title: rename ?? p.label?.text ?? capitalize(describeRule(p.where)),
      titleSource: rename ? "reader" : (p.label?.source ?? "default"),
      items: sortItems(items, spec.order),
      hiddenCount: 0,
      collapsed: false,
      emptyNote: null,
    }
    ;(p.to === "top" ? top : bottom).push(section)
  }

  // 3. Everything else, grouped.
  const rest = visible.filter((i) => !pinnedKeys.has(i.key))
  const grouped = buildSections(rest, hidden, spec, brief)
    // A group that only lost items to a pin is not "empty", drop it quietly.
    .filter((s) => s.items.length > 0 || s.hiddenCount > 0)

  const sections = [...top, ...grouped, ...bottom]

  // 4. Never a blank page: show a notice and the full brief below it.
  const emptyFallback =
    visible.length === 0 && brief.items.length > 0
      ? {
          notice: `Nothing this week matches your settings (${directives
            .filter((d) => d.kind === "filter" && d.state === "active")
            .map((d) => d.summary.toLowerCase())
            .join(", ")}). Here is the full brief.`,
          sections: buildSections(brief.items, [], DEFAULT_SPEC, brief),
        }
      : null

  const title = (key: SectionKey) => ({
    title: renameFor(spec, key) ?? DEFAULT_TITLES[key],
    source: renameFor(spec, key) ? ("reader" as const) : ("default" as const),
  })

  return {
    recapId: brief.recapId,
    title: brief.title,
    titleIsVerdict: brief.titleIsVerdict,
    verdict: brief.verdict,
    periodStart: brief.periodStart,
    periodEnd: brief.periodEnd,
    readingMinutes: brief.readingMinutes,
    currents: spec.sections.currents ? brief.currents : null,
    sections,
    updates: spec.sections.updates && brief.citations.length > 0 ? brief.citations : null,
    titles: { currents: title("currents"), updates: title("updates") },
    parts: spec.parts,
    layout: spec.layout,
    directives,
    hiddenTotal: hidden.length,
    shownTotal: visible.length,
    emptyFallback,
    isDefault: JSON.stringify(spec) === JSON.stringify(DEFAULT_SPEC),
  }
}
