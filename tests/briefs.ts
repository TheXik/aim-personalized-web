import { existsSync, readFileSync } from "node:fs"
import { normalizeBrief } from "@/lib/brief/normalize"
import { TagsFile } from "@/lib/brief/schema"
import type { Brief } from "@/lib/brief/types"

// Aim's three sample briefs are not in the repository. Tests that need them
// skip with this message when data/briefs/ is empty. Everything else runs on
// the synthetic briefs in tests/fixtures (invented companies and text).

export const REAL_SLUGS = ["space-launch", "enterprise-ai", "cz-sk-ai"] as const
export type RealSlug = (typeof REAL_SLUGS)[number]

export const HAS_REAL_BRIEFS = REAL_SLUGS.every((s) => existsSync(`data/briefs/brief-${s}.json`))
export const REAL_BRIEFS_SKIP = "real Aim briefs (skipped unless data/briefs/brief-*.json are present)"

const json = (path: string) => JSON.parse(readFileSync(path, "utf8"))

export const rawReal = (slug: RealSlug): unknown => json(`data/briefs/brief-${slug}.json`)
export const realTags = (slug: RealSlug) => TagsFile.parse(json(`data/briefs/${slug}.tags.json`))
export const loadReal = (slug: RealSlug): Brief => normalizeBrief(rawReal(slug), realTags(slug))

export type SyntheticName = "orbital" | "fintech"
export const rawSynthetic = (name: SyntheticName): unknown => json(`tests/fixtures/synthetic-${name}.json`)
export const syntheticTags = (name: SyntheticName) =>
  existsSync(`tests/fixtures/synthetic-${name}.tags.json`) ? TagsFile.parse(json(`tests/fixtures/synthetic-${name}.tags.json`)) : null
export const loadSynthetic = (name: SyntheticName): Brief => normalizeBrief(rawSynthetic(name), syntheticTags(name))
