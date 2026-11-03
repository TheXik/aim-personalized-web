import { z } from "zod"
import { GroupBy, Label, Layout, OrderBy, Parts, Rule, SectionKey } from "./spec"

// What the model returns: a few edit operations on the reader's current spec.
// Code applies them (./apply.ts), validates the result and writes the reply
// from the diff (./reply.ts). The model never writes text that reaches the page.
// Azure strict mode rules apply: z.union only, .nullable() only, all keys required.

// "standing" lasts every week. "this_week" expires with this brief's recap id.
const Duration = z.enum(["standing", "this_week"])

const FilterOp = z.object({ op: z.literal("filter"), mode: z.enum(["keep", "hide"]), where: Rule, duration: Duration })
const PinOp = z.object({ op: z.literal("pin"), where: Rule, to: z.enum(["top", "bottom"]), label: Label.nullable(), duration: Duration })
const RemoveOp = z.object({ op: z.literal("remove"), id: z.string().max(12) }) // id of a filter or pin in the current spec
const PartsOp = z.object({
  op: z.literal("parts"),
  paragraphs: Parts.shape.paragraphs.nullable(),
  means: z.boolean().nullable(),
  figures: Parts.shape.figures.nullable(),
  sources: z.boolean().nullable(),
  oneLiners: Parts.shape.oneLiners.nullable(),
})
const GroupOp = z.object({ op: z.literal("group"), by: GroupBy })
const OrderOp = z.object({ op: z.literal("order"), by: OrderBy })
const LayoutOp = z.object({ op: z.literal("layout"), items: Layout.shape.items.nullable(), figures: Layout.shape.figures.nullable() })
const SectionsOp = z.object({ op: z.literal("sections"), currents: z.boolean().nullable(), updates: z.boolean().nullable() })
const RenameOp = z.object({ op: z.literal("rename"), section: SectionKey, text: z.string().max(40) })
const ResetOp = z.object({ op: z.literal("reset") })

// Every op the page can apply. Also the type of not_supported.nearest.
export const ApplicableOp = z.union([FilterOp, PinOp, RemoveOp, PartsOp, GroupOp, OrderOp, LayoutOp, SectionsOp, RenameOp, ResetOp])
export type ApplicableOp = z.infer<typeof ApplicableOp>

// new_text: needs words the brief does not have (summaries, translation, advice).
// outside_knowledge: needs facts outside the brief (where a company is based).
// ambiguous: two readings conflict, the reply asks which one.
// off_topic: not about this page.
export const NotSupportedReason = z.enum(["new_text", "outside_knowledge", "ambiguous", "off_topic", "other"])
export type NotSupportedReason = z.infer<typeof NotSupportedReason>

const NotSupportedOp = z.object({ op: z.literal("not_supported"), reason: NotSupportedReason, nearest: ApplicableOp.nullable() })

export const Op = z.union([FilterOp, PinOp, RemoveOp, PartsOp, GroupOp, OrderOp, LayoutOp, SectionsOp, RenameOp, ResetOp, NotSupportedOp])
export type Op = z.infer<typeof Op>

export const MAX_OPS = 6
export const Edit = z.object({ ops: z.array(Op).max(MAX_OPS) })
export type Edit = z.infer<typeof Edit>
