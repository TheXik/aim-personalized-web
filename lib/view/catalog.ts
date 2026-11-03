import type { Brief } from "../brief/types"
import { TIERS } from "../brief/types"
import { allowedValues } from "./rules"
import { filterSummary, pinSummary } from "./engine"
import type { ViewSpec } from "./spec"

// What the model may know about this week's brief: names and counts only.
// Never paragraphs, headlines or "what it means" lines, so text inside the
// brief cannot steer the model (indirect prompt injection).
export function buildCatalog(brief: Brief) {
  return {
    tiers: TIERS.map((t) => ({ tier: t, items: brief.items.filter((i) => i.tier === t).length })),
    statuses: [...new Set(brief.items.map((i) => i.status))],
    figure_types: [...new Set(brief.items.map((i) => (i.figure ? i.figure.type : "none")))],
    currents: brief.currents.map((c) => ({ label: c.label, status: c.status })),
    scopes: allowedValues(brief, "scope"),
    companies: allowedValues(brief, "company"),
    items_with_numbers: brief.items.filter((i) => i.hasNumber).length,
  }
}

// The current spec as the model sees it: ids plus a readable summary per directive.
export function specForModel(spec: ViewSpec) {
  return {
    filters: spec.filters.map((f) => ({ id: f.id, summary: filterSummary(f), this_week_only: f.expires !== null })),
    pins: spec.pins.map((p) => ({ id: p.id, summary: pinSummary(p), this_week_only: p.expires !== null })),
    parts: spec.parts,
    group: spec.group,
    order: spec.order,
    layout: spec.layout,
    sections: spec.sections,
    renames: spec.renames,
  }
}
