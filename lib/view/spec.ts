import { z } from "zod"

// The reader's saved view spec, version 1. Pure data, never code.
// The default spec is the default design. A spec applies to any week's brief
// without the model: see buildView() in ./engine.ts.
//
// Every schema here also has to pass Azure strict structured outputs, because
// ./ops.ts reuses Rule and the enums. So: z.union (never z.discriminatedUnion,
// Azure rejects oneOf), .nullable() (never .optional()), and every key required.

// ---------- Rules: a small AST with a fixed operator list ----------

// Fields compared exactly (after normalising case, quotes and hyphens).
// tier: detail | brief | one_liner. status: new | updated | carried | other.
// current: a current label. scope: a scope name or "Other". company: a tagged company.
// figure: timeline | chart | table | comparison | none.
export const EqField = z.enum(["tier", "status", "current", "scope", "company", "figure"])
export type EqField = z.infer<typeof EqField>

// Fields searched for whole words or phrases. text = headline plus paragraphs.
// The "what it means" line is never searched, it talks to the reader.
export const TextField = z.enum(["headline", "text"])
export type TextField = z.infer<typeof TextField>

export type Rule =
  | { op: "eq"; field: EqField; value: string }
  | { op: "in"; field: EqField; values: string[] }
  | { op: "contains"; field: TextField; values: string[] }
  | { op: "has_number" }
  | { op: "and"; args: Rule[] }
  | { op: "or"; args: Rule[] }
  | { op: "not"; arg: Rule }

export const Rule: z.ZodType<Rule> = z.lazy(() =>
  z.union([
    z.object({ op: z.literal("eq"), field: EqField, value: z.string().max(80) }),
    z.object({ op: z.literal("in"), field: EqField, values: z.array(z.string().max(80)).max(12) }),
    z.object({ op: z.literal("contains"), field: TextField, values: z.array(z.string().max(60)).max(12) }),
    z.object({ op: z.literal("has_number") }),
    z.object({ op: z.literal("and"), args: z.array(Rule).max(6) }),
    z.object({ op: z.literal("or"), args: z.array(Rule).max(6) }),
    z.object({ op: z.literal("not"), arg: Rule }),
  ]),
)

export const RULE_LIMITS = { maxDepth: 4, maxNodes: 24 } as const

// ---------- Labels: only from allowlists, never model text ----------

// scope, current and company labels must equal a name in this week's brief.
// reader labels must be words the reader typed in the chat message (checked in code).
export const Label = z.object({
  source: z.enum(["scope", "current", "company", "reader"]),
  text: z.string().max(80), // brief names run to 49 chars. Reader labels are capped at 40 in code
})
export type Label = z.infer<typeof Label>

// ---------- Directives ----------

// expires: null lasts forever. A recap id means "this week only" and the
// directive stops applying when a brief with another recap id is shown.
// A rule that names a current label stops applying while no current has that
// label (thread lifetime, computed by the engine, not stored).
export const Filter = z.object({
  id: z.string().max(12),
  mode: z.enum(["keep", "hide"]),
  where: Rule,
  expires: z.string().nullable(),
})
export type Filter = z.infer<typeof Filter>

export const Pin = z.object({
  id: z.string().max(12),
  where: Rule,
  to: z.enum(["top", "bottom"]),
  label: Label.nullable(),
  expires: z.string().nullable(),
})
export type Pin = z.infer<typeof Pin>

// ---------- Page settings ----------

export const Parts = z.object({
  paragraphs: z.enum(["all", "first", "none"]),
  means: z.boolean(),
  figures: z.enum(["show", "collapsed", "hide"]),
  sources: z.boolean(),
  oneLiners: z.enum(["show", "collapsed"]), // hiding one-liners is a filter on tier
})
export type Parts = z.infer<typeof Parts>

export const GroupBy = z.enum(["tier", "none", "current", "scope", "company"])
export type GroupBy = z.infer<typeof GroupBy>

export const OrderBy = z.enum(["default", "newest", "numbers_first", "figures_first"])
export type OrderBy = z.infer<typeof OrderBy>

export const Layout = z.object({
  items: z.enum(["standard", "compact", "table"]),
  figures: z.enum(["inline", "prominent"]),
})
export type Layout = z.infer<typeof Layout>

export const Sections = z.object({
  currents: z.boolean(), // the verdict can never be hidden
  updates: z.boolean(), // "Read the updates"
})
export type Sections = z.infer<typeof Sections>

export const SectionKey = z.enum(["currents", "detail", "brief", "one_liner", "pinned_top", "pinned_bottom", "updates"])
export type SectionKey = z.infer<typeof SectionKey>

export const Rename = z.object({ section: SectionKey, text: z.string().max(40) }) // reader's own words only
export type Rename = z.infer<typeof Rename>

// ---------- The spec ----------

export const SPEC_LIMITS = { filters: 6, pins: 4, renames: 6, bytes: 8_000 } as const

export const ViewSpec = z.object({
  version: z.literal(1),
  filters: z.array(Filter).max(SPEC_LIMITS.filters),
  pins: z.array(Pin).max(SPEC_LIMITS.pins),
  parts: Parts,
  group: GroupBy,
  order: OrderBy,
  layout: Layout,
  sections: Sections,
  renames: z.array(Rename).max(SPEC_LIMITS.renames),
})
export type ViewSpec = z.infer<typeof ViewSpec>

export const DEFAULT_SPEC: ViewSpec = {
  version: 1,
  filters: [],
  pins: [],
  parts: { paragraphs: "all", means: true, figures: "show", sources: true, oneLiners: "show" },
  group: "tier",
  order: "default",
  layout: { items: "standard", figures: "inline" },
  sections: { currents: true, updates: true },
  renames: [],
}

// Parse a stored spec. Anything invalid or from another version falls back to
// the default design, so a bad localStorage value can never break the page.
export function parseStoredSpec(value: unknown): ViewSpec {
  const parsed = ViewSpec.safeParse(value)
  return parsed.success ? parsed.data : DEFAULT_SPEC
}

export const specStorageKey = (reader: string) => `aim.view.v1.${reader}`
