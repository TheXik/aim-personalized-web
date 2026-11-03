import { describe, expect, it } from "vitest"
import { validateRule } from "@/lib/view/rules"
import { ViewSpec } from "@/lib/view/spec"
import { fixtures, flatOrder, HAS_BRIEFS, loadBrief, readerText, render, resolveSpec, rulesOf } from "./helpers"

// Deterministic engine fixtures from research/06-requests.json. No model calls.
// expect.items are hand labels written before the engine existed. A failure here
// means the engine and a careful reader disagree, so look at both before "fixing" either.

// Already covered in lib/view/engine.test.ts.
const COVERED_BY_LEAD = new Set(["SL01", "SL02", "SL03"])

const applyCases = fixtures.filter((f) => f.expected === "apply" && f.spec && !COVERED_BY_LEAD.has(f.id))

describe("research 06 fixtures: suite shape", () => {
  it("has 60 reader requests and 15 hostile ones", () => {
    expect(fixtures.filter((f) => f.expected !== "refuse")).toHaveLength(60)
    expect(fixtures.filter((f) => f.expected === "refuse")).toHaveLength(15)
  })

  it("every follow-up points at a request in the suite", () => {
    for (const f of fixtures.filter((x) => x.follows)) expect(fixtures.some((x) => x.id === f.follows)).toBe(true)
  })

  it("refused and unsupported requests carry no spec", () => {
    for (const f of fixtures.filter((x) => x.expected !== "apply")) expect(f.spec).toBeNull()
  })
})

// The cases below need the real briefs in data/briefs. Without them (CI) they are not registered.
if (!HAS_BRIEFS) it.skip("research 06 engine fixtures need the real briefs in data/briefs")
else describe.each(applyCases.map((f) => [f.id, f] as const))("%s", (_, f) => {
  const spec = resolveSpec(f.spec!, loadBrief(f.brief))

  it("spec passes the ViewSpec schema", () => {
    expect(ViewSpec.safeParse(spec).success).toBe(true)
  })

  it("every phrase is in the brief or the reader's own words", () => {
    const brief = loadBrief(f.brief)
    for (const rule of rulesOf(spec)) expect(validateRule(rule, brief, readerText(f))).toEqual([])
  })

  if (f.expect?.items) {
    it(`shows the hand-labelled items in order${f.gap ? " (closest spec, see gap)" : ""}`, () => {
      expect(flatOrder(render(f.brief, spec))).toEqual(f.expect!.items)
    })
  }

  if (f.expect?.groups) {
    it("groups every item under the hand-labelled section", () => {
      const view = render(f.brief, spec)
      const got: Record<string, number[]> = {}
      for (const s of view.sections) got[s.title] = s.items.map((i) => i.index)
      expect(got).toEqual(f.expect!.groups)
    })
  }

  if (f.expect?.sectionTitles) {
    it("renames sections with the reader's words", () => {
      const view = render(f.brief, spec)
      for (const [key, title] of Object.entries(f.expect!.sectionTitles!)) {
        expect(view.sections.find((s) => s.key === key)).toMatchObject({ title, titleSource: "reader" })
      }
    })
  }

  if (f.expect?.collapsed) {
    it("collapses the named sections", () => {
      const view = render(f.brief, spec)
      for (const key of f.expect!.collapsed!) expect(view.sections.find((s) => s.key === key)?.collapsed).toBe(true)
    })
  }

  if (f.expect?.parts || f.expect?.layout) {
    it("passes parts and layout through to the page", () => {
      const view = render(f.brief, spec)
      if (f.expect!.parts) expect(view.parts).toMatchObject(f.expect!.parts)
      if (f.expect!.layout) expect(view.layout).toMatchObject(f.expect!.layout)
    })
  }

  it("never renders a blank page", () => {
    const view = render(f.brief, spec)
    expect(view.shownTotal > 0 || view.emptyFallback !== null).toBe(true)
  })
})

describe.runIf(HAS_BRIEFS)("research 06 fixtures: follow-ups", () => {
  it("CZ12 undo returns exactly the CZ04 spec", () => {
    const cz04 = fixtures.find((f) => f.id === "CZ04")!
    const cz12 = fixtures.find((f) => f.id === "CZ12")!
    expect(cz12.spec).toEqual(cz04.spec)
  })

  it("IN14 drops Bessemer for this week only", () => {
    const f = fixtures.find((x) => x.id === "IN14")!
    const brief = loadBrief("enterprise-ai")
    const drop = f.spec!.filters.find((x) => x.id === "f2")!
    expect(drop.expires).toBe(brief.recapId)
    const view = render("enterprise-ai", f.spec!)
    expect(view.directives.find((d) => d.id === "f2")).toMatchObject({ state: "active", hidden: 1 })
  })
})
