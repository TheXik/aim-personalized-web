import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { figureText } from "@/lib/brief/normalize"
import { fold } from "@/lib/brief/text"
import { HAS_REAL_BRIEFS, REAL_BRIEFS_SKIP, REAL_SLUGS, loadReal } from "./briefs"

// The repository goes public without Aim's briefs. This fails if any file git
// would commit carries a run of RUN or more consecutive words from a real brief.
// Shorter quotes (a name, a label) are fine.
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

describe.skipIf(!HAS_REAL_BRIEFS)(REAL_BRIEFS_SKIP, () => {
  it(`no committed file holds ${RUN}+ consecutive words of a real brief`, () => {
    const texts = REAL_SLUGS.flatMap((slug) => {
      const b = loadReal(slug)
      return [
        b.verdict,
        ...b.currents.flatMap((c) => [c.label, c.line]),
        ...b.items.flatMap((i) => [i.headline, ...i.paragraphs, i.means ?? "", figureText(i.figure)]),
        ...b.citations.flatMap((c) => [c.title, c.subtitle ?? ""]),
      ]
    })
    const needles = new Set(texts.flatMap(shingles))

    // Tracked files plus new files that are not ignored: what the next commit can hold.
    const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
      .split("\n")
      .filter((f) => f && !BINARY.test(f) && !/^data\/briefs\/brief-.*\.json$/.test(f))

    const leaks: string[] = []
    for (const f of files) {
      let text: string
      try {
        text = readFileSync(f, "utf8")
      } catch {
        continue // listed but deleted in the working tree
      }
      const hit = shingles(text).find((s) => needles.has(s))
      if (hit) leaks.push(`${f}: "${hit}"`)
    }
    expect(leaks).toEqual([])
  })
})
