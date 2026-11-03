import { Suspense } from "react"
import { notFound } from "next/navigation"
import { READERS, TagsFile, isReaderSlug, type ReaderSlug } from "@/lib/brief/schema"
import { BriefApp, BriefLoading } from "@/components/brief/brief-app"
import spaceLaunchTags from "@/data/briefs/space-launch.tags.json"
import enterpriseAiTags from "@/data/briefs/enterprise-ai.tags.json"
import czSkAiTags from "@/data/briefs/cz-sk-ai.tags.json"

const READER_NAMES: Record<ReaderSlug, string> = {
  "space-launch": "European launch provider",
  "enterprise-ai": "San Francisco enterprise AI founder",
  "cz-sk-ai": "Czech and Slovak AI founder",
}

// Company tags are our own derived data, checked word for word against each item.
// They ship with the page. The brief itself loads in the browser through the API.
const TAGS: Record<ReaderSlug, unknown> = {
  "space-launch": spaceLaunchTags,
  "enterprise-ai": enterpriseAiTags,
  "cz-sk-ai": czSkAiTags,
}

export function generateStaticParams() {
  return READERS.map((reader) => ({ reader }))
}

export default function ReaderPage(props: PageProps<"/r/[reader]">) {
  return (
    <Suspense fallback={<BriefLoading />}>
      <Reader params={props.params} />
    </Suspense>
  )
}

async function Reader({ params }: { params: PageProps<"/r/[reader]">["params"] }) {
  const { reader } = await params
  if (!isReaderSlug(reader)) notFound()
  const parsed = TagsFile.safeParse(TAGS[reader])
  return <BriefApp key={reader} reader={reader} readerName={READER_NAMES[reader]} tags={parsed.success ? parsed.data : null} />
}
