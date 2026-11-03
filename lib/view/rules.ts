import type { Brief, Item } from "../brief/types"
import { containsPhrase, fold } from "../brief/text"
import { RULE_LIMITS, type Rule } from "./spec"

// ---------- Evaluation ----------

function fieldValues(item: Item, field: "tier" | "status" | "current" | "scope" | "company" | "figure"): string[] {
  switch (field) {
    case "tier":
      return [item.tier]
    case "status":
      return [item.status]
    case "current":
      return item.current ? [item.current] : []
    case "scope":
      return [item.scope]
    case "company":
      return item.companies
    case "figure":
      return [item.figure ? item.figure.type : "none"]
  }
}

const searchText = (item: Item, field: "headline" | "text") =>
  field === "headline" ? item.headline : [item.headline, ...item.paragraphs].join(" ")

export function matches(rule: Rule, item: Item): boolean {
  switch (rule.op) {
    case "eq":
    case "in": {
      const vs = rule.op === "eq" ? [rule.value] : rule.values
      const folded = vs.map(fold)
      if (fieldValues(item, rule.field).some((x) => folded.includes(fold(x)))) return true
      // Company: also match the name word for word in the item, so company
      // rules keep working on a brief that has no tags file yet.
      return rule.field === "company" && vs.some((v) => containsPhrase(searchText(item, "text"), v))
    }
    case "contains": {
      const hay = searchText(item, rule.field)
      return rule.values.some((v) => containsPhrase(hay, v))
    }
    case "has_number":
      return item.hasNumber
    case "and":
      return rule.args.every((r) => matches(r, item))
    case "or":
      return rule.args.some((r) => matches(r, item))
    case "not":
      return !matches(rule.arg, item)
  }
}

// ---------- Shape checks ----------

export function ruleSize(rule: Rule, depth = 1): { depth: number; nodes: number } {
  if (rule.op === "and" || rule.op === "or") {
    const kids = rule.args.map((r) => ruleSize(r, depth + 1))
    return { depth: Math.max(depth, ...kids.map((k) => k.depth)), nodes: 1 + kids.reduce((n, k) => n + k.nodes, 0) }
  }
  if (rule.op === "not") {
    const k = ruleSize(rule.arg, depth + 1)
    return { depth: k.depth, nodes: 1 + k.nodes }
  }
  return { depth, nodes: 1 }
}

// Current labels a rule refers to. A rule that names only labels absent from
// this brief is "inactive" this week (thread lifetime).
export function currentLabels(rule: Rule): string[] {
  switch (rule.op) {
    case "eq":
      return rule.field === "current" ? [rule.value] : []
    case "in":
      return rule.field === "current" ? rule.values : []
    case "and":
    case "or":
      return rule.args.flatMap(currentLabels)
    case "not":
      return currentLabels(rule.arg)
    default:
      return []
  }
}

export function isThreadInactive(rule: Rule, brief: Brief): boolean {
  const labels = currentLabels(rule)
  if (labels.length === 0) return false
  const present = new Set(brief.currents.map((c) => fold(c.label)))
  return !labels.some((l) => present.has(fold(l)))
}

// Validation against this week's brief and the reader's own message.
// Every literal must come from an allowlist, the brief's text or the reader.
export type RuleProblem =
  | { kind: "too_big" }
  | { kind: "unknown_value"; field: string; value: string }
  | { kind: "unknown_phrase"; value: string }

const ENUMS: Record<string, string[]> = {
  tier: ["detail", "brief", "one_liner"],
  status: ["new", "updated", "carried", "other"],
  figure: ["timeline", "chart", "table", "comparison", "unknown", "none"],
}

export function allowedValues(brief: Brief, field: string): string[] {
  if (field in ENUMS) return ENUMS[field]
  if (field === "current") return brief.currents.map((c) => c.label)
  if (field === "scope") return [...brief.scopes.map((s) => s.name), "Other"]
  if (field === "company") return [...new Set(brief.items.flatMap((i) => i.companies))]
  return []
}

export function briefText(brief: Brief): string {
  return [
    brief.verdict,
    ...brief.currents.flatMap((c) => [c.label, c.line]),
    ...brief.items.flatMap((i) => [i.headline, ...i.paragraphs]),
  ].join(" \n ")
}

export function validateRule(rule: Rule, brief: Brief, readerText: string): RuleProblem[] {
  const size = ruleSize(rule)
  if (size.depth > RULE_LIMITS.maxDepth || size.nodes > RULE_LIMITS.maxNodes) return [{ kind: "too_big" }]
  const problems: RuleProblem[] = []
  const text = briefText(brief)
  const walk = (r: Rule) => {
    switch (r.op) {
      case "eq":
      case "in": {
        const allowed = allowedValues(brief, r.field).map(fold)
        for (const v of r.op === "eq" ? [r.value] : r.values) {
          if (!allowed.includes(fold(v))) problems.push({ kind: "unknown_value", field: r.field, value: v })
        }
        break
      }
      case "contains":
        for (const v of r.values) {
          if (!containsPhrase(text, v) && !containsPhrase(readerText, v)) problems.push({ kind: "unknown_phrase", value: v })
        }
        break
      case "and":
      case "or":
        r.args.forEach(walk)
        break
      case "not":
        walk(r.arg)
        break
    }
  }
  walk(rule)
  return problems
}

// ---------- Code-written descriptions (chips, band titles, replies) ----------

const TIER_NAMES: Record<string, string> = { detail: "in-detail stories", brief: "in-brief items", one_liner: "one-liners" }
const STATUS_NAMES: Record<string, string> = { new: "new this week", updated: "updated stories", carried: "carried-over stories", other: "other stories" }

const quote = (s: string) => `“${s}”`
const joinList = (xs: string[], word: "or" | "and") =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${word} ${xs[xs.length - 1]}`

// style "rule" reads like a filter ("SpaceX or Blue Origin"). style "title"
// reads like a section heading ("SpaceX and Blue Origin").
export function describeRule(rule: Rule, style: "rule" | "title" = "rule"): string {
  const list = (xs: string[]) => joinList(xs, style === "title" ? "and" : "or")
  switch (rule.op) {
    case "eq":
    case "in": {
      const vs = rule.op === "eq" ? [rule.value] : rule.values
      switch (rule.field) {
        case "tier":
          return list(vs.map((v) => TIER_NAMES[v] ?? v))
        case "status":
          return list(vs.map((v) => STATUS_NAMES[v] ?? v))
        case "figure":
          return vs.length === 1 && vs[0] === "none" ? "items without a figure" : `items with a ${list(vs)}`
        case "current":
          return `the thread ${list(vs.map(quote))}`
        case "scope":
          return list(vs.map(quote))
        case "company":
          return list(vs)
      }
      return list(vs)
    }
    case "contains":
      return `items mentioning ${list(rule.values)}`
    case "has_number":
      return "items with numbers"
    case "and": {
      // Read has_number and negations as modifiers: "one-liners without numbers".
      const nouns: string[] = []
      const mods: string[] = []
      for (const a of rule.args) {
        if (a.op === "has_number") mods.push("with numbers")
        else if (a.op === "not" && a.arg.op === "has_number") mods.push("without numbers")
        else if (a.op === "not") mods.push(`except ${describeRule(a.arg, style)}`)
        else nouns.push(describeRule(a, style))
      }
      return [nouns.length ? nouns.join(" and ") : "items", ...mods].join(" ")
    }
    case "or":
      return rule.args.map((a) => describeRule(a, style)).join(" or ")
    case "not":
      return rule.arg.op === "has_number" ? "items without numbers" : `everything except ${describeRule(rule.arg, style)}`
  }
}

export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)
