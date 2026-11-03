// Server only: the sample briefs, bundled at build time from data/briefs/. Stands in
// for Aim's API. The server-only import fails the build if a client file imports this,
// which would put Aim's data into a public /_next/static chunk.
// Aim's brief files are not in the repository. import.meta.glob (Turbopack and
// Vitest) bundles whichever files exist, so a fresh clone still builds and the
// app explains how to add them. No runtime file reads, so it runs on Workers too.
import "server-only"
import type { ReaderSlug } from "./schema"

const briefs = import.meta.glob<unknown>("/data/briefs/brief-*.json", { eager: true, import: "default" })
const tags = import.meta.glob<unknown>("/data/briefs/*.tags.json", { eager: true, import: "default" })

export const rawBrief = (slug: ReaderSlug): unknown | null => briefs[`/data/briefs/brief-${slug}.json`] ?? null
export const rawTags = (slug: ReaderSlug): unknown | null => tags[`/data/briefs/${slug}.tags.json`] ?? null

