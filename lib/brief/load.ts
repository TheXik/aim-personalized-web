import { RAW_BRIEFS, RAW_TAGS } from "./data"
import { normalizeBrief } from "./normalize"
import { TagsFile, isReaderSlug, type ReaderSlug } from "./schema"
import type { Brief } from "./types"

// Server side. One reader's brief and company tags. A slug only ever reaches its own data.

export const readRawBrief = (slug: ReaderSlug): unknown => RAW_BRIEFS[slug]

export function readTags(slug: ReaderSlug): TagsFile | null {
  const parsed = TagsFile.safeParse(RAW_TAGS[slug])
  return parsed.success ? parsed.data : null
}

export async function loadBrief(slug: string): Promise<Brief | null> {
  if (!isReaderSlug(slug)) return null
  return normalizeBrief(readRawBrief(slug), readTags(slug))
}
