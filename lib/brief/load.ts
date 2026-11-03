import { readFile } from "node:fs/promises"
import path from "node:path"
import { normalizeBrief } from "./normalize"
import { TagsFile, isReaderSlug, type ReaderSlug } from "./schema"
import type { Brief } from "./types"

// Server only. Reads one reader's brief and company tags from data/briefs.
// A slug only ever reaches its own files.
const DIR = path.join(process.cwd(), "data", "briefs")

export async function readRawBrief(slug: ReaderSlug): Promise<unknown> {
  return JSON.parse(await readFile(path.join(DIR, `brief-${slug}.json`), "utf8"))
}

export async function readTags(slug: ReaderSlug): Promise<TagsFile | null> {
  try {
    return TagsFile.parse(JSON.parse(await readFile(path.join(DIR, `${slug}.tags.json`), "utf8")))
  } catch {
    return null
  }
}

export async function loadBrief(slug: string): Promise<Brief | null> {
  if (!isReaderSlug(slug)) return null
  return normalizeBrief(await readRawBrief(slug), await readTags(slug))
}
