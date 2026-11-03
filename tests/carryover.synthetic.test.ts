import { describe, expect, it } from "vitest"
import { normalizeBrief } from "@/lib/brief/normalize"
import { buildView } from "@/lib/view/engine"
import { DEFAULT_SPEC, type ViewSpec } from "@/lib/view/spec"
import { flatOrder, HAS_BRIEFS, loadBrief, nextWeekSynthetic, rawBrief } from "./helpers"

// Carry-over on a synthetic next-week brief, built in memory by nextWeekSynthetic()
// in ./helpers.ts from the real space brief, so no copy of Aim's text is committed.
// Needs data/briefs. Skipped without it, for example in CI.

if (!HAS_BRIEFS) {
  it.skip("carry-over needs the real briefs in data/briefs")
} else {
  const raw = rawBrief("space-launch")
  const thisWeek = loadBrief("space-launch")
  const nextWeek = normalizeBrief(nextWeekSynthetic(raw), null) // no tags file exists for a synthetic recap

  // Thread labels come from the brief, never typed out here.
  const STARSHIP = thisWeek.currents[0].label // kept word for word next week
  const PSLV_OLD = thisWeek.currents[3].label // renamed next week

  // One saved spec, written this week, opened again next week without the model.
  const saved: ViewSpec = {
    ...DEFAULT_SPEC,
    pins: [{ id: "p1", where: { op: "contains", field: "text", values: ["Rocket Factory Augsburg", "Sirius"] }, to: "top", label: null, expires: null }],
    filters: [
      { id: "f1", mode: "hide", where: { op: "eq", field: "current", value: STARSHIP }, expires: null },
      { id: "f2", mode: "hide", where: { op: "eq", field: "current", value: PSLV_OLD }, expires: null },
      { id: "f3", mode: "hide", where: { op: "contains", field: "text", values: ["Isar"] }, expires: thisWeek.recapId },
    ],
  }

  const headline = (b: typeof nextWeek, index: number) => b.items.find((i) => i.index === index)!.headline

  describe("synthetic next-week brief", () => {
    it("is marked synthetic in its subject and its one new item", () => {
      expect(nextWeek.title).toMatch(/^\[SYNTHETIC\]/)
      expect(nextWeek.items.filter((i) => i.headline.startsWith("[SYNTHETIC]"))).toHaveLength(1)
    })

    it("differs from this week the way the header says", () => {
      expect(nextWeek.recapId).not.toBe(thisWeek.recapId)
      expect(nextWeek.items).toHaveLength(thisWeek.items.length)
      expect(nextWeek.items.some((i) => i.headline.includes("Crew-13"))).toBe(false)
      expect(nextWeek.items.find((i) => i.headline.includes("Rocket Factory Augsburg"))?.tier).toBe("brief")
      expect(nextWeek.currents.map((c) => c.label)).toContain(STARSHIP)
      expect(nextWeek.currents.map((c) => c.label)).not.toContain(PSLV_OLD)
    })
  })

  describe("one saved spec across two weeks", () => {
    it("this week: every directive applies", () => {
      const v = buildView(thisWeek, saved)
      expect(flatOrder(v)).toEqual([7, 12, 3, 4, 6, 9, 10, 11])
      expect(v.directives.map((d) => [d.id, d.state])).toEqual([
        ["f1", "active"],
        ["f2", "active"],
        ["f3", "active"],
        ["p1", "active"],
      ])
    })

    it("next week: field and kept-thread rules still apply, renamed-thread and item rules stop", () => {
      const v = buildView(nextWeek, saved)
      const state = Object.fromEntries(v.directives.map((d) => [d.id, d.state]))
      expect(state).toEqual({ f1: "active", f2: "inactive", f3: "expired", p1: "active" })
      expect(v.directives.find((d) => d.id === "f1")?.hidden).toBe(3)
    })

    it("next week: the field pin catches the promoted item and the new one", () => {
      const v = buildView(nextWeek, saved)
      const top = v.sections[0]
      expect(top.kind).toBe("pinned_top")
      expect(top.items.map((i) => i.index)).toEqual([4, 11, 12])
      expect(headline(nextWeek, 4)).toMatch(/Rocket Factory Augsburg/)
      expect(headline(nextWeek, 12)).toMatch(/^\[SYNTHETIC\]/)
    })

    it("next week: PSLV and Isar come back, Starship stays hidden", () => {
      const v = buildView(nextWeek, saved)
      expect(flatOrder(v)).toEqual([4, 11, 12, 5, 3, 6, 7, 8, 9, 10])
      const shown = v.sections.flatMap((s) => s.items.map((i) => i.headline))
      expect(shown.some((h) => h.includes("PSLV"))).toBe(true)
      expect(shown.some((h) => h.includes("Isar"))).toBe(true)
      expect(shown.some((h) => h.includes("Starship"))).toBe(false)
    })

    it("company rules fall back to the name in the item text when next week has no tags file", () => {
      const byCompany: ViewSpec = {
        ...DEFAULT_SPEC,
        pins: [{ id: "p1", where: { op: "eq", field: "company", value: "Rocket Factory Augsburg" }, to: "top", label: null, expires: null }],
      }
      expect(buildView(thisWeek, byCompany).directives[0].matched).toBe(1)
      const next = buildView(nextWeek, byCompany).directives[0]
      expect(next.state).toBe("active")
      // Matched word for word in the item text, decision 7 (lead change, 3 Nov).
      expect(next.matched).toBe(nextWeek.items.filter((i) => /Rocket Factory Augsburg/.test([i.headline, ...i.paragraphs].join(" "))).length)
    })
  })
}
