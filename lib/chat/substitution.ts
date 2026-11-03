import type { Change } from "../view/apply"
import type { Rule } from "../view/spec"

// The page has no amount field and no deal type. When a reader asks for
// funding, amounts or "biggest", the model's closest option is a "with numbers"
// rule. That is a substitution, and the reply must say so (persona test A3).
// Deterministic: the reader's words against what was actually applied.

const AMOUNT_WORDS =
  /\b(fund(s|ed|ing)?|fundraising|raise[sd]?|raising|rounds?|biggest|largest|amounts?|money|deals?|valuations?|invest(ed|ment|ments|ors?)?|series [a-e]|financov[aá]n[ií]|kola?|nejv[eě]t[sš][ií]|najv[aä][cč][sš][ií]|investic[ei]?|investíci[ei]|pen[ií]ze|peniaze)\b/i

const usesNumbers = (r: Rule): boolean =>
  r.op === "has_number" || ((r.op === "and" || r.op === "or") && r.args.some(usesNumbers)) || (r.op === "not" && usesNumbers(r.arg))

// The plain-words note, or null when nothing was substituted.
export function substitutionNote(request: string, changes: Change[]): string | null {
  if (!AMOUNT_WORDS.test(request)) return null
  for (const c of changes) {
    if (c.kind === "pin_added" && usesNumbers(c.pin.where)) return "I can't sort by amount yet, so I put items with numbers first."
    if (c.kind === "filter_added" && usesNumbers(c.filter.where)) return "I can't filter by deal or amount yet, so I used items with numbers instead."
    if (c.kind === "setting" && c.path === "order" && c.to === "numbers_first") return "I can't sort by amount yet, so I put items with numbers first."
  }
  return null
}
