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
  /[$€£]\s?\d|\d(?:[\d.,]*\d)?\s?(?:%|×|\+|x\b|X\b|bn\b|B\b|M\b|K\b|T\b|million|billion|trillion|GW|MW|days|acres|cases|tools|seconds|customers|users|employees)/

export function hasNumberText(s: string): boolean {
  return NUMBER_RE.test(s)
}

export function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length
}

// cyrb53, a small fast 53-bit hash, as 14 hex chars. Used to check that a tags
// file entry belongs to the item at its index without storing the headline.
// Not a security hash: it only has to catch a tags file from another brief.
export function headlineHash(s: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0")
}
