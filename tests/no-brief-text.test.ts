import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { figureText } from "@/lib/brief/normalize"
import { fold } from "@/lib/brief/text"
import { HAS_REAL_BRIEFS, REAL_BRIEFS_SKIP, REAL_SLUGS, loadReal, rawReal } from "./briefs"

// The repository goes public without Aim's briefs. This fails if any file git
// would commit carries (a) a run of RUN or more consecutive words from a real
// brief, (b) an Aim id (recap, update or signal id) or (c) a whole headline,
// thread label, scope name, subject, verdict or figure title.
// Company names are allowed: they are tag data, and a scope can be a company.
// On failure it reports file names only, never the matched text, because CI
// logs are public.
const RUN = 10
const BINARY = /\.(ico|png|jpe?g|gif|webp|woff2?|ttf|pdf)$/i

const words = (s: string) =>
  fold(s)
    .replace(/[^\p{L}\p{N}$€£%]+/gu, " ")
    .split(" ")
    .filter(Boolean)

function shingles(s: string): string[] {
  const w = words(s)
  const out: string[] = []
  for (let i = 0; i + RUN <= w.length; i++) out.push(w.slice(i, i + RUN).join(" "))
  return out
}

const AIM_ID = /\b(?:rcp|sig|upd)_[A-Za-z0-9]{6,}\b/g

describe.skipIf(!HAS_REAL_BRIEFS)(REAL_BRIEFS_SKIP, () => {
  const briefs = HAS_REAL_BRIEFS ? REAL_SLUGS.map(loadReal) : []
  const companies = new Set(briefs.flatMap((b) => b.items.flatMap((i) => i.companies)).map(fold))

  const texts = briefs.flatMap((b) => [
    b.verdict,
    ...b.currents.flatMap((c) => [c.label, c.line]),
    ...b.items.flatMap((i) => [i.headline, ...i.paragraphs, i.means ?? "", figureText(i.figure)]),
    ...b.citations.flatMap((c) => [c.title, c.subtitle ?? ""]),
  ])
  const needles = new Set(texts.flatMap(shingles))

  // Whole strings that are short enough to slip under RUN words.
  const wholes = [
    ...briefs.flatMap((b) => [b.title, b.verdict, ...b.currents.map((c) => c.label), ...b.scopes.map((s) => s.name)]),
    ...briefs.flatMap((b) => b.items.flatMap((i) => [i.headline, i.figure?.block.head ?? ""])),
  ]
    .map(fold)
    .filter((s) => s.length >= 12 && !companies.has(s))

  const ids = new Set(
    HAS_REAL_BRIEFS ? REAL_SLUGS.flatMap((s) => JSON.stringify(rawReal(s)).match(AIM_ID) ?? []) : [],
  )

  // Tracked files plus new files that are not ignored: what the next commit can hold.
  const files = HAS_REAL_BRIEFS
    ? execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
        .split("\n")
        .filter((f) => f && !BINARY.test(f) && !/^data\/briefs\/brief-.*\.json$/.test(f))
    : []

  const read = (f: string) => {
    try {
      return readFileSync(f, "utf8")
    } catch {
      return null // listed but deleted in the working tree
    }
  }

  it(`no committed file holds ${RUN}+ consecutive words of a real brief`, () => {
    const hits = files.filter((f) => {
      const t = read(f)
      return t !== null && shingles(t).some((s) => needles.has(s))
    })
    expect(hits).toEqual([])
  })

  it("no committed file holds an Aim id", () => {
    const hits = files.filter((f) => (read(f)?.match(AIM_ID) ?? []).some((id) => ids.has(id)))
    expect(hits).toEqual([])
  })

  it("no committed file holds a whole headline, label, scope name or title", () => {
    const hits = files.filter((f) => {
      const t = read(f)
      if (t === null) return false
      const ft = fold(t)
      return wholes.some((w) => ft.includes(w))
    })
    expect(hits).toEqual([])
  })
})
