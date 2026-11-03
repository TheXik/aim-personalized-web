import cz from "@/data/briefs/brief-cz-sk-ai.json"
import ea from "@/data/briefs/brief-enterprise-ai.json"
import space from "@/data/briefs/brief-space-launch.json"
import czTags from "@/data/briefs/cz-sk-ai.tags.json"
import eaTags from "@/data/briefs/enterprise-ai.tags.json"
import spaceTags from "@/data/briefs/space-launch.tags.json"
import type { ReaderSlug } from "./schema"

// The sample briefs, bundled at build time. Stands in for Aim's API.
// Static imports, not file reads, so the app also runs on Cloudflare Workers.
export const RAW_BRIEFS: Record<ReaderSlug, unknown> = { "space-launch": space, "enterprise-ai": ea, "cz-sk-ai": cz }
export const RAW_TAGS: Record<ReaderSlug, unknown> = { "space-launch": spaceTags, "enterprise-ai": eaTags, "cz-sk-ai": czTags }
