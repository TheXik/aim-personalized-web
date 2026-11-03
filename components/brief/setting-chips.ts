import { DEFAULT_SPEC, type ViewSpec } from "@/lib/view/spec"

// Chips for saved settings that are not filters or pins (the engine lists those).
// Every label is fixed copy in code. Removing a chip puts that one setting back to default.

export type SettingChip = { id: string; label: string }

const GROUP = { tier: "", none: "One list", current: "Grouped by thread", scope: "Grouped by area", company: "Grouped by company" } as const
const ORDER = { default: "", newest: "Newest first", numbers_first: "Numbers first", figures_first: "Figures first" } as const

export function settingChips(spec: ViewSpec): SettingChip[] {
  const d = DEFAULT_SPEC
  const out: SettingChip[] = []
  if (spec.group !== d.group && GROUP[spec.group]) out.push({ id: "group", label: GROUP[spec.group] })
  if (spec.order !== d.order && ORDER[spec.order]) out.push({ id: "order", label: ORDER[spec.order] })
  if (spec.parts.paragraphs !== d.parts.paragraphs)
    out.push({ id: "parts.paragraphs", label: spec.parts.paragraphs === "first" ? "First paragraph only" : "Headlines only" })
  if (spec.parts.means !== d.parts.means) out.push({ id: "parts.means", label: "No “what it means”" })
  if (spec.parts.figures !== d.parts.figures)
    out.push({ id: "parts.figures", label: spec.parts.figures === "collapsed" ? "Figures on tap" : "No figures" })
  if (spec.parts.sources !== d.parts.sources) out.push({ id: "parts.sources", label: "No sources" })
  if (spec.parts.oneLiners !== d.parts.oneLiners) out.push({ id: "parts.oneLiners", label: "One-liners folded" })
  if (spec.layout.items !== d.layout.items)
    out.push({ id: "layout.items", label: spec.layout.items === "compact" ? "Compact" : "As a table" })
  if (spec.layout.figures !== d.layout.figures) out.push({ id: "layout.figures", label: "Figures up front" })
  if (spec.sections.currents !== d.sections.currents) out.push({ id: "sections.currents", label: "Threads hidden" })
  if (spec.sections.updates !== d.sections.updates) out.push({ id: "sections.updates", label: "No “Read the updates”" })
  if (spec.renames.length > 0) out.push({ id: "renames", label: "Your section names" })
  return out
}

export function clearSetting(spec: ViewSpec, id: string): ViewSpec {
  const d = DEFAULT_SPEC
  const [head, key] = id.split(".") as [string, string | undefined]
  switch (head) {
    case "group":
      return { ...spec, group: d.group }
    case "order":
      return { ...spec, order: d.order }
    case "renames":
      return { ...spec, renames: [] }
    case "parts":
      return key ? { ...spec, parts: { ...spec.parts, [key]: d.parts[key as keyof typeof d.parts] } } : spec
    case "layout":
      return key ? { ...spec, layout: { ...spec.layout, [key]: d.layout[key as keyof typeof d.layout] } } : spec
    case "sections":
      return key ? { ...spec, sections: { ...spec.sections, [key]: d.sections[key as keyof typeof d.sections] } } : spec
    default:
      return spec
  }
}
