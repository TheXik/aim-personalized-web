import { z } from "zod"

// Zod schema for one brief as Aim's API returns it (data/briefs/brief-*.json).
// Lenient on purpose: unknown status values, empty subject, null scope and every
// nullable figure field must parse. Unknown figure types parse as UnknownFigure.

const nullableString = z.string().nullable().catch(null)

export const TimelineBlock = z.object({
  t: z.literal("timeline"),
  head: z.string(),
  lead: nullableString.optional(),
  points: z.array(z.object({ date: z.string(), text: z.string(), update_id: nullableString.optional() })),
})

export const ChartBlock = z.object({
  t: z.literal("chart"),
  chart_type: z.string(),
  head: z.string(),
  title: nullableString.optional(),
  unit: nullableString.optional(),
  lead: nullableString.optional(),
  foot: nullableString.optional(),
  max_value: z.number().nullable().catch(null).optional(),
  data: z.array(
    z.object({
      label: z.string(),
      value: z.number(),
      key: nullableString.optional(),
      highlight: z.boolean().catch(false).optional(),
      note: nullableString.optional(),
    }),
  ),
})

export const TableBlock = z.object({
  t: z.literal("table"),
  head: z.string(),
  title: nullableString.optional(),
  lead: nullableString.optional(),
  cols: z.array(z.string()),
  rows: z.array(z.object({ cells: z.array(z.object({ text: z.string() })) })),
})

const ComparisonSide = z.object({ name: z.string(), points: z.array(z.object({ text: z.string() })) })

export const ComparisonBlock = z.object({
  t: z.literal("comparison"),
  shape: nullableString.optional(),
  head: z.string(),
  lead: nullableString.optional(),
  them: ComparisonSide,
  us: ComparisonSide,
})

export const UnknownBlock = z.looseObject({ t: z.string(), head: z.string().optional() })

export const FigureBlock = z.union([TimelineBlock, ChartBlock, TableBlock, ComparisonBlock, UnknownBlock])

export const RawFigure = z.object({
  scope: z.string().catch("item"),
  fresh_update_ids: z.array(z.string()).catch([]),
  block: FigureBlock,
})

export const RawItem = z.object({
  tier: z.string(),
  headline: z.string(),
  paragraphs: z.array(z.string()).catch([]),
  means: nullableString.optional(),
  status: z.string().catch("unknown"),
  date: nullableString.optional(),
  current: nullableString.optional(),
  scope_id: nullableString.optional(),
  cited_update_ids: z.array(z.string()).catch([]),
  cited_signal_ids: z.array(z.string()).catch([]),
  read_update_ids: z.array(z.string()).catch([]),
  figure: RawFigure.nullable().catch(null).optional(),
})

export const RawCurrent = z.object({
  label: z.string(),
  line: z.string().catch(""),
  status: z.string().catch("unknown"),
  since: nullableString.optional(),
  since_label: nullableString.optional(),
  cited_signal_ids: z.array(z.string()).catch([]),
})

export const RawCitation = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: nullableString.optional(),
  date: nullableString.optional(),
  sourceCount: z.number().catch(0),
  severityLevel: z.string().catch("green"),
})

export const RawBriefFile = z.object({
  recap: z.object({
    id: z.string(),
    period_start: z.string(),
    period_end: z.string(),
    doc: z.object({
      subject: z.string().catch(""),
      verdict: z.string(),
      currents: z.array(RawCurrent).catch([]),
      items: z.array(RawItem),
    }),
  }),
  citations: z.array(RawCitation).catch([]),
  scopes: z.array(z.object({ id: z.string(), name: z.string() })).catch([]),
})

export type RawBriefFile = z.infer<typeof RawBriefFile>
export type RawItem = z.infer<typeof RawItem>
export type RawCurrent = z.infer<typeof RawCurrent>
export type RawCitation = z.infer<typeof RawCitation>
export type TimelineBlock = z.infer<typeof TimelineBlock>
export type ChartBlock = z.infer<typeof ChartBlock>
export type TableBlock = z.infer<typeof TableBlock>
export type ComparisonBlock = z.infer<typeof ComparisonBlock>
export type UnknownBlock = z.infer<typeof UnknownBlock>
export type FigureBlock = z.infer<typeof FigureBlock>

// Company tags, one file per brief: data/briefs/<slug>.tags.json.
// index = position in the raw recap.doc.items. headline_hash = headlineHash() of
// that item's headline, so the file holds no brief text. recap_hash = headlineHash()
// of the recap id, so no Aim id is stored either. Ignored when the recap differs.
export const TagsFile = z.object({
  version: z.literal(2),
  recap_hash: z.string(),
  source: z.string(),
  method: z.string(),
  items: z.array(z.object({ index: z.number().int(), headline_hash: z.string(), companies: z.array(z.string()) })),
})
export type TagsFile = z.infer<typeof TagsFile>

export const READERS = ["space-launch", "enterprise-ai", "cz-sk-ai"] as const
export type ReaderSlug = (typeof READERS)[number]
export const isReaderSlug = (s: string): s is ReaderSlug => (READERS as readonly string[]).includes(s)
