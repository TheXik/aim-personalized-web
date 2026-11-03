// Text helpers shared by normalisation, rules and label checks.

// Fold text for matching: Unicode NFKC, lower case, typographic quotes to ASCII,
// non-breaking and figure hyphens to "-", collapsed whitespace.
export function fold(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐‑‒­]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// Whole-word or whole-phrase match, case-insensitive. "ESA" matches "ESA's" but
// not "Mesa". Built from escaped literals only, so no user-controlled regex.
export function containsPhrase(haystack: string, phrase: string): boolean {
  const p = fold(phrase)
  if (!p) return false
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(p)}(?![\\p{L}\\p{N}])`, "u")
  return re.test(fold(haystack))
}

// Strict "has a number" test from research 06: currency amounts, percentages,
// multiples and quantities with units. Never ids like "Pad 40", "LC-39A", "Crew-13".
const NUMBER_RE =
  /[$€£]\s?\d|\d(?:[\d.,]*\d)?\s?(?:%|×|x\b|X\b|bn\b|B\b|M\b|K\b|T\b|million|billion|trillion|GW|MW|days|acres|cases|tools|seconds)/

export function hasNumberText(s: string): boolean {
  return NUMBER_RE.test(s)
}

export function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length
}
