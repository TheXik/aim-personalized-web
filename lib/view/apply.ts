import type { Brief } from "../brief/types"
import { containsPhrase, fold } from "../brief/text"
import { allowedValues, validateRule, type RuleProblem } from "./rules"
import type { ApplicableOp, NotSupportedReason, Op } from "./ops"
import { DEFAULT_SPEC, SPEC_LIMITS, ViewSpec, type Filter, type Label, type Pin } from "./spec"

// Applies the model's ops to the reader's spec. Pure. Every literal is checked
// against this week's brief or the reader's own message before it is saved.

export type ApplyContext = { brief: Brief; request: string }

export type Change =
  | { kind: "filter_added"; filter: Filter }
  | { kind: "pin_added"; pin: Pin }
  | { kind: "removed"; id: string; what: Filter | Pin }
  | { kind: "setting"; path: string; from: unknown; to: unknown }
  | { kind: "renamed"; section: string; text: string }
  | { kind: "reset" }

export type RejectReason =
  | RuleProblem
  | { kind: "limit"; what: "filters" | "pins" | "renames" | "size" }
  | { kind: "unknown_id"; id: string }
  | { kind: "label_not_allowed"; text: string }
  | { kind: "not_reader_words"; text: string }

export type Rejection = { op: ApplicableOp; reasons: RejectReason[] }

export type ApplyResult = {
  spec: ViewSpec
  changes: Change[]
  rejected: Rejection[]
  notSupported: { reason: NotSupportedReason; nearest: ApplicableOp | null } | null
}

const nextId = (prefix: string, taken: string[]) => {
  for (let n = 1; ; n++) if (!taken.includes(`${prefix}${n}`)) return `${prefix}${n}`
}

// Reader words used as a label or section name must not read as a claim: no
// digits, no currency and at most 6 words. "My competitors" passes,
// "SpaceX will fail by 2027" does not.
export const looksLikeClaim = (text: string) => /[\d$€£%]/.test(text) || text.trim().split(/\s+/).length > 6

const sameRule = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// Labels: scope, current and company text must be a name in this brief and is
// stored in the brief's own spelling. Reader labels must be the reader's words.
function checkLabel(label: Label | null, ctx: ApplyContext): { label: Label | null; problem: RejectReason | null } {
  if (!label) return { label: null, problem: null }
  if (label.source === "reader") {
    return label.text.length <= 40 && !looksLikeClaim(label.text) && containsPhrase(ctx.request, label.text)
      ? { label, problem: null }
      : { label: null, problem: { kind: "not_reader_words", text: label.text } }
  }
  const exact = allowedValues(ctx.brief, label.source).find((v) => fold(v) === fold(label.text))
  return exact ? { label: { source: label.source, text: exact }, problem: null } : { label: null, problem: { kind: "label_not_allowed", text: label.text } }
}

function applyOne(spec: ViewSpec, op: ApplicableOp, ctx: ApplyContext, changes: Change[]): { spec: ViewSpec; reasons: RejectReason[] } {
  const expires = (d: "standing" | "this_week") => (d === "this_week" ? ctx.brief.recapId : null)
  const ids = [...spec.filters.map((f) => f.id), ...spec.pins.map((p) => p.id)]

  switch (op.op) {
    case "reset":
      changes.push({ kind: "reset" })
      return { spec: DEFAULT_SPEC, reasons: [] }

    case "filter": {
      const problems = validateRule(op.where, ctx.brief, ctx.request)
      if (problems.length) return { spec, reasons: problems }
      if (spec.filters.some((f) => f.mode === op.mode && sameRule(f.where, op.where))) return { spec, reasons: [] }
      if (spec.filters.length >= SPEC_LIMITS.filters) return { spec, reasons: [{ kind: "limit", what: "filters" }] }
      const filter: Filter = { id: nextId("f", ids), mode: op.mode, where: op.where, expires: expires(op.duration) }
      changes.push({ kind: "filter_added", filter })
      return { spec: { ...spec, filters: [...spec.filters, filter] }, reasons: [] }
    }

    case "pin": {
      const problems: RejectReason[] = validateRule(op.where, ctx.brief, ctx.request)
      const { label, problem } = checkLabel(op.label, ctx)
      if (problem) problems.push(problem)
      if (problems.length) return { spec, reasons: problems }
      if (spec.pins.some((p) => p.to === op.to && sameRule(p.where, op.where))) return { spec, reasons: [] }
      if (spec.pins.length >= SPEC_LIMITS.pins) return { spec, reasons: [{ kind: "limit", what: "pins" }] }
      const pin: Pin = { id: nextId("p", ids), where: op.where, to: op.to, label, expires: expires(op.duration) }
      changes.push({ kind: "pin_added", pin })
      return { spec: { ...spec, pins: [...spec.pins, pin] }, reasons: [] }
    }

    case "remove": {
      const f = spec.filters.find((x) => x.id === op.id)
      const p = spec.pins.find((x) => x.id === op.id)
      if (!f && !p) return { spec, reasons: [{ kind: "unknown_id", id: op.id }] }
      changes.push({ kind: "removed", id: op.id, what: (f ?? p)! })
      return { spec: { ...spec, filters: spec.filters.filter((x) => x.id !== op.id), pins: spec.pins.filter((x) => x.id !== op.id) }, reasons: [] }
    }

    case "parts": {
      let parts = spec.parts
      for (const key of ["paragraphs", "means", "figures", "sources", "oneLiners"] as const) {
        const to = op[key]
        if (to === null || to === parts[key]) continue
        changes.push({ kind: "setting", path: `parts.${key}`, from: parts[key], to })
        parts = { ...parts, [key]: to }
      }
      return { spec: { ...spec, parts }, reasons: [] }
    }

    case "group":
    case "order": {
      const key = op.op
      if (spec[key] === op.by) return { spec, reasons: [] }
      changes.push({ kind: "setting", path: key, from: spec[key], to: op.by })
      return { spec: { ...spec, [key]: op.by }, reasons: [] }
    }

    case "layout":
    case "sections": {
      const key = op.op
      let next: Record<string, unknown> = { ...spec[key] }
      for (const [k, to] of Object.entries(op)) {
        if (k === "op" || to === null || next[k] === to) continue
        changes.push({ kind: "setting", path: `${key}.${k}`, from: next[k], to })
        next = { ...next, [k]: to }
      }
      return { spec: { ...spec, [key]: next } as ViewSpec, reasons: [] }
    }

    case "rename": {
      if (looksLikeClaim(op.text) || !containsPhrase(ctx.request, op.text)) return { spec, reasons: [{ kind: "not_reader_words", text: op.text }] }
      const others = spec.renames.filter((r) => r.section !== op.section)
      if (others.length >= SPEC_LIMITS.renames) return { spec, reasons: [{ kind: "limit", what: "renames" }] }
      changes.push({ kind: "renamed", section: op.section, text: op.text })
      return { spec: { ...spec, renames: [...others, { section: op.section, text: op.text }] }, reasons: [] }
    }
  }
}

export function applyOps(start: ViewSpec, ops: Op[], ctx: ApplyContext): ApplyResult {
  let spec = start
  const changes: Change[] = []
  const rejected: Rejection[] = []
  let notSupported: ApplyResult["notSupported"] = null

  for (const op of ops) {
    if (op.op === "not_supported") {
      notSupported ??= { reason: op.reason, nearest: op.nearest }
      continue
    }
    const before = changes.length
    const r = applyOne(spec, op, ctx, changes)
    if (r.reasons.length) {
      changes.length = before
      rejected.push({ op, reasons: r.reasons })
      continue
    }
    spec = r.spec
  }

  // Final guard: the result must parse and stay small, or nothing changes.
  const parsed = ViewSpec.safeParse(spec)
  if (!parsed.success || JSON.stringify(spec).length > SPEC_LIMITS.bytes) {
    return { spec: start, changes: [], rejected: [...rejected, ...ops.filter((o): o is ApplicableOp => o.op !== "not_supported").map((op) => ({ op, reasons: [{ kind: "limit" as const, what: "size" as const }] }))], notSupported }
  }
  return { spec: parsed.data, changes, rejected, notSupported }
}
