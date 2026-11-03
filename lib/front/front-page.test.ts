import { describe, expect, it } from "vitest"
import { HAS_REAL_BRIEFS, REAL_BRIEFS_SKIP, loadReal, loadSynthetic } from "@/tests/briefs"
import type { Brief } from "@/lib/brief/types"
import { buildView } from "@/lib/view/engine"
import { DEFAULT_SPEC, type ViewSpec } from "@/lib/view/spec"
import { buildFrontPage } from "./front-page"

const fp = (brief: Brief, patch: Partial<ViewSpec> = {}) => buildFrontPage(buildView(brief, { ...DEFAULT_SPEC, ...patch }))

// Runs everywhere, on the invented briefs in tests/fixtures.
describe("buildFrontPage on synthetic briefs", () => {
  for (const name of ["orbital", "fintech"] as const) {
    it(`${name}: every item is reachable, at most two takeaways, at most one figure`, () => {
      const brief = loadSynthetic(name)
      const f = fp(brief)
      const threadLabels = new Set(f.threads.map((t) => t.label))
      const reachable = new Set([
        ...f.takeaways.map((t) => t.item.key),
        ...f.order.filter((i) => i.current && threadLabels.has(i.current)).map((i) => i.key),
        ...f.also.map((i) => i.key),
      ])
      expect(reachable.size).toBe(brief.items.length)
      expect(f.takeaways.length).toBeLessThanOrEqual(2)
      if (f.hook) expect(f.order.some((i) => i.key === f.hook!.item.key)).toBe(true)
    })
  }
})

const space = HAS_REAL_BRIEFS ? loadReal("space-launch") : (undefined as unknown as Brief)
const ea = HAS_REAL_BRIEFS ? loadReal("enterprise-ai") : (undefined as unknown as Brief)
const czsk = HAS_REAL_BRIEFS ? loadReal("cz-sk-ai") : (undefined as unknown as Brief)

describe.skipIf(!HAS_REAL_BRIEFS)(`buildFrontPage, ${REAL_BRIEFS_SKIP}`, () => {
  it("takes the two 'what it means' lines from the two detail stories", () => {
    for (const brief of [space, ea, czsk]) {
      const f = fp(brief)
      const details = brief.items.filter((i) => i.tier === "detail")
      expect(f.takeaways.map((t) => t.item.key)).toEqual(details.slice(0, 2).map((i) => i.key))
      expect(f.takeaways.every((t) => t.text === t.item.means)).toBe(true)
    }
  })

  it("uses the top story's figure as the one visual hook", () => {
    expect(fp(space).hook?.figure.type).toBe("timeline")
    expect(fp(ea).hook?.figure.type).toBe("timeline")
    expect(fp(czsk).hook?.figure.type).toBe("comparison")
    for (const brief of [space, ea, czsk]) expect(fp(brief).hook?.fromTopStory).toBe(true)
  })

  it("leaves nothing unreachable: every item is a takeaway, in a thread card or in 'Also this week'", () => {
    for (const brief of [space, ea, czsk]) {
      const f = fp(brief)
      const threadLabels = new Set(f.threads.map((t) => t.label))
      const reachable = new Set([
        ...f.takeaways.map((t) => t.item.key),
        ...f.order.filter((i) => i.current && threadLabels.has(i.current)).map((i) => i.key),
        ...f.also.map((i) => i.key),
      ])
      expect(reachable.size).toBe(brief.items.length)
      expect(f.also.every((i) => !(i.current && threadLabels.has(i.current)))).toBe(true)
      expect(f.oneLiners.length).toBe(7)
      expect(new Set(f.order.map((i) => i.key)).size).toBe(brief.items.length)
    }
  })

  it("lists every story in 'Also this week' when the reader hides the threads", () => {
    const f = fp(space, { sections: { currents: false, updates: true } })
    expect(f.threads).toEqual([])
    expect(f.also.length + f.takeaways.length).toBe(space.items.length)
  })

  it("follows the saved view: numbers first changes the top story and the hook", () => {
    const f = fp(ea, { pins: [{ id: "p1", where: { op: "has_number" }, to: "top", label: null, expires: null }] })
    expect(f.topStory?.hasNumber).toBe(true)
    expect(f.order[0].key).toBe(f.topStory?.key)
  })

  it("follows filters: only new leaves no takeaways in the CZ and SK brief and keeps the page honest", () => {
    const f = fp(czsk, { filters: [{ id: "f1", mode: "keep", where: { op: "eq", field: "status", value: "new" }, expires: null }] })
    expect(f.order.every((i) => i.status === "new")).toBe(true)
    expect(f.takeaways.length).toBe(0)
  })

  it("drops the takeaways when the reader hides 'what it means', and the hook when figures are hidden", () => {
    expect(fp(space, { parts: { ...DEFAULT_SPEC.parts, means: false } }).takeaways).toEqual([])
    expect(fp(space, { parts: { ...DEFAULT_SPEC.parts, figures: "hide" } }).hook).toBeNull()
  })

  it("falls back to the first story with a figure when the top story has none", () => {
    const f = fp(space, { pins: [{ id: "p1", where: { op: "eq", field: "tier", value: "brief" }, to: "top", label: null, expires: null }] })
    expect(f.topStory?.figure).toBeNull()
    expect(f.hook?.fromTopStory).toBe(false)
    expect(f.hook?.item.figure).not.toBeNull()
  })

  it("marks grouped views and keeps the reader's order", () => {
    const view = buildView(ea, { ...DEFAULT_SPEC, group: "company" })
    const f = buildFrontPage(view)
    expect(f.grouped).toBe(true)
    expect(f.order.map((i) => i.key)).toEqual([...new Set(view.sections.flatMap((s) => s.items.map((i) => i.key)))])
  })
})
