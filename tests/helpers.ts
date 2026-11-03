import { readFileSync } from "node:fs"
import { normalizeBrief } from "@/lib/brief/normalize"
import { TagsFile } from "@/lib/brief/schema"
import type { Brief } from "@/lib/brief/types"
import { buildView } from "@/lib/view/engine"
import type { PageView } from "@/lib/view/model"
import type { Rule, ViewSpec } from "@/lib/view/spec"

export type Slug = "space-launch" | "enterprise-ai" | "cz-sk-ai"

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
  replyRef: string
  note: string | null
}

export const fixtures: Fixture[] = JSON.parse(readFileSync("tests/fixtures/requests.json", "utf8")).requests

export const rawBrief = (slug: Slug) => JSON.parse(readFileSync(`data/briefs/brief-${slug}.json`, "utf8"))
const tags = (slug: Slug) => TagsFile.parse(JSON.parse(readFileSync(`data/briefs/${slug}.tags.json`, "utf8")))

const cache = new Map<Slug, Brief>()
export function loadBrief(slug: Slug): Brief {
  if (!cache.has(slug)) cache.set(slug, normalizeBrief(rawBrief(slug), tags(slug)))
  return cache.get(slug)!
}

// Item indices across all sections, in display order.
export const flatOrder = (view: PageView) => view.sections.flatMap((s) => s.items.map((i) => i.index))

export const render = (slug: Slug, spec: ViewSpec) => buildView(loadBrief(slug), spec)

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
