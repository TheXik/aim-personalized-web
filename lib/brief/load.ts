import { rawBrief, rawTags } from "./data"
import { normalizeBrief } from "./normalize"
import { TagsFile, isReaderSlug } from "./schema"
import type { Brief } from "./types"

// Server side. One reader's brief and company tags. A slug only ever reaches its own data.
// null when the slug is unknown or the brief file is not installed.
export async function loadBrief(slug: string): Promise<Brief | null> {
  if (!isReaderSlug(slug)) return null
  const raw = rawBrief(slug)
  if (raw === null) return null
  const tags = TagsFile.safeParse(rawTags(slug))
  return normalizeBrief(raw, tags.success ? tags.data : null)
}
