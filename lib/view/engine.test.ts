import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { normalizeBrief } from "@/lib/brief/normalize"
import { TagsFile } from "@/lib/brief/schema"
import type { Brief } from "@/lib/brief/types"
import { buildView } from "./engine"
import { validateRule } from "./rules"
import { DEFAULT_SPEC, parseStoredSpec, type Rule, type ViewSpec } from "./spec"

const raw = (slug: string) => JSON.parse(readFileSync(`data/briefs/brief-${slug}.json`, "utf8"))
const tags = (slug: string) => TagsFile.parse(JSON.parse(readFileSync(`data/briefs/${slug}.tags.json`, "utf8")))
const load = (slug: string): Brief => normalizeBrief(raw(slug), tags(slug))

const space = load("space-launch")
const ea = load("enterprise-ai")
const czsk = load("cz-sk-ai")

const order = (brief: Brief, spec: ViewSpec) =>
  buildView(brief, spec).sections.flatMap((s) => s.items.map((i) => i.index))

const withSpec = (patch: Partial<ViewSpec>): ViewSpec => ({ ...DEFAULT_SPEC, ...patch })
const keep = (where: Rule, expires: string | null = null) => ({ id: "f1", mode: "keep" as const, where, expires })
const hide = (where: Rule, expires: string | null = null) => ({ id: "f1", mode: "hide" as const, where, expires })
const pin = (where: Rule, to: "top" | "bottom" = "top") => ({ id: "p1", where, to, label: null, expires: null })

describe("normalizeBrief", () => {
  it("sorts by tier and keeps JSON order inside a tier", () => {
    expect(space.items.map((i) => i.index)).toEqual([0, 5, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12])
  })

  it("shows a one-liner's text once", () => {
    for (const b of [space, ea, czsk]) for (const i of b.items.filter((x) => x.tier === "one_liner")) expect(i.paragraphs).toEqual([])
  })

  it("has_number is strict: no ids like Pad 40, LC-39A or Crew-13", () => {
    const byIndex = (b: Brief, n: number) => b.items.find((i) => i.index === n)!
    expect(byIndex(space, 1).hasNumber).toBe(false) // LC-39A
    expect(byIndex(space, 4).hasNumber).toBe(false) // Crew-13, Pad 40
    expect(byIndex(space, 7).hasNumber).toBe(true) // €2.7 million
    expect(ea.items.filter((i) => i.hasNumber).map((i) => i.index).sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 6, 8, 9, 10, 11])
  })

  it("loads company tags and builds app links", () => {
    expect(space.hasTags && ea.hasTags && czsk.hasTags).toBe(true)
    expect(ea.items.find((i) => i.index === 4)!.primaryCompany).toBe("Nscale")
    for (const l of space.items.flatMap((i) => i.sources)) expect(l.href).toMatch(/^https:\/\/app\.startaiming\.com\/o\/(sig|upd)_/)
  })

  it("ignores a tags file from another week", () => {
    const t = { ...tags("space-launch"), recap_id: "rcp_other" }
    expect(normalizeBrief(raw("space-launch"), t).hasTags).toBe(false)
  })

  it("uses the verdict as title when the subject is empty", () => {
    const r = raw("cz-sk-ai")
    r.recap.doc.subject = ""
    const b = normalizeBrief(r, null)
    expect(b.titleIsVerdict).toBe(true)
    expect(b.title).toBe(b.verdict)
  })
})

describe("buildView with the default spec", () => {
  it.each([
    ["space", space, [2, 4, 7]],
    ["enterprise AI", ea, [2, 3, 7]],
    ["CZ and SK", czsk, [2, 2, 7]],
  ])("%s renders every item in tier sections", (_, brief, counts) => {
    const v = buildView(brief, DEFAULT_SPEC)
    expect(v.sections.map((s) => s.key)).toEqual(["tier:detail", "tier:brief", "tier:one_liner"])
    expect(v.sections.map((s) => s.items.length)).toEqual(counts)
    expect(v.hiddenTotal).toBe(0)
    expect(v.isDefault).toBe(true)
    expect(v.emptyFallback).toBeNull()
    expect(v.currents?.length).toBe(brief.currents.length)
  })
})

describe("the brief's four example requests", () => {
  it("only what is new this week (CZ and SK leaves 5 one-liners)", () => {
    const v = buildView(czsk, withSpec({ filters: [keep({ op: "eq", field: "status", value: "new" })] }))
    expect(v.shownTotal).toBe(5)
    expect(v.hiddenTotal).toBe(6)
    expect(v.directives[0]).toMatchObject({ summary: "Only new this week", hidden: 6, state: "active" })
    expect(v.sections.find((s) => s.key === "tier:detail")?.emptyNote).toMatch(/No in-detail stories/)
  })

  it("hide the one-liners", () => {
    const v = buildView(space, withSpec({ filters: [hide({ op: "eq", field: "tier", value: "one_liner" })] }))
    const ol = v.sections.find((s) => s.key === "tier:one_liner")!
    expect(ol.items).toHaveLength(0)
    expect(ol.hiddenCount).toBe(7)
    expect(v.directives[0].summary).toBe("Hiding one-liners")
  })

  it("numbers first puts every number item in a top band", () => {
    const v = buildView(ea, withSpec({ pins: [pin({ op: "has_number" })] }))
    expect(v.sections[0]).toMatchObject({ kind: "pinned_top", title: "Items with numbers" })
    expect(v.sections[0].items.map((i) => i.index)).toEqual([0, 2, 4, 5, 6, 8, 9, 10, 11])
  })

  it("group it by company uses the first company in the headline", () => {
    const v = buildView(ea, withSpec({ group: "company" }))
    expect(v.sections[0]).toMatchObject({ title: "OpenAI", titleSource: "company" })
    expect(v.sections.flatMap((s) => s.items)).toHaveLength(12)
  })
})

describe("research 06 reference cases", () => {
  it("SL01 only Starship", () => {
    expect(order(space, withSpec({ filters: [keep({ op: "contains", field: "text", values: ["Starship"] })] }))).toEqual([0, 1, 2])
  })

  it("SL02 SpaceX scope to the bottom", () => {
    expect(order(space, withSpec({ pins: [pin({ op: "eq", field: "scope", value: "SpaceX" }, "bottom")] }))).toEqual([
      5, 2, 7, 8, 9, 10, 11, 12, 0, 1, 3, 4, 6,
    ])
  })

  it("SL03 European players on top", () => {
    const where: Rule = { op: "contains", field: "text", values: ["Rocket Factory Augsburg", "RFA", "Isar", "ClearSpace", "ESA"] }
    expect(order(space, withSpec({ pins: [pin(where)] }))).toEqual([7, 8, 9, 0, 5, 1, 2, 3, 4, 6, 10, 11, 12])
  })
})

describe("lifetimes and carry-over", () => {
  const nextWeekRaw = () => {
    const r = raw("space-launch")
    r.recap.id = "rcp_nextweek"
    r.recap.doc.currents[0].label = "A thread with a new name"
    return r
  }
  const nextWeek = normalizeBrief(nextWeekRaw(), null)

  it("a standing filter carries over to next week's brief", () => {
    const spec = withSpec({ filters: [hide({ op: "eq", field: "tier", value: "one_liner" })] })
    expect(buildView(nextWeek, spec).hiddenTotal).toBe(7)
  })

  it("a this-week filter expires with the recap id", () => {
    const spec = withSpec({ filters: [hide({ op: "eq", field: "tier", value: "one_liner" }, space.recapId)] })
    expect(buildView(space, spec).hiddenTotal).toBe(7)
    const v = buildView(nextWeek, spec)
    expect(v.hiddenTotal).toBe(0)
    expect(v.directives[0].state).toBe("expired")
  })

  it("a thread rule goes inactive while its thread is gone", () => {
    const label = space.currents[0].label
    const spec = withSpec({ filters: [hide({ op: "eq", field: "current", value: label })] })
    expect(buildView(space, spec).hiddenTotal).toBeGreaterThan(0)
    const v = buildView(nextWeek, spec)
    expect(v.directives[0].state).toBe("inactive")
    expect(v.hiddenTotal).toBe(0)
  })

  it("never shows a blank page", () => {
    const v = buildView(space, withSpec({ filters: [keep({ op: "contains", field: "text", values: ["Zeppelin"] })] }))
    expect(v.shownTotal).toBe(0)
    expect(v.emptyFallback?.notice).toMatch(/Nothing this week matches/)
    expect(v.emptyFallback?.sections.flatMap((s) => s.items)).toHaveLength(13)
  })
})

describe("validation", () => {
  it("accepts brief phrases and the reader's own words, rejects invented ones", () => {
    expect(validateRule({ op: "contains", field: "text", values: ["Starship"] }, space, "")).toEqual([])
    expect(validateRule({ op: "contains", field: "text", values: ["RFA"] }, space, "put RFA on top")).toEqual([])
    expect(validateRule({ op: "contains", field: "text", values: ["Blue Moon lander"] }, space, "")).toHaveLength(1)
    expect(validateRule({ op: "eq", field: "scope", value: "Made up scope" }, space, "")).toHaveLength(1)
  })

  it("rejects rules that are too deep", () => {
    let r: Rule = { op: "has_number" }
    for (let i = 0; i < 6; i++) r = { op: "not", arg: r }
    expect(validateRule(r, space, "")).toEqual([{ kind: "too_big" }])
  })

  it("a broken stored spec falls back to the default design", () => {
    expect(parseStoredSpec({ version: 2 })).toEqual(DEFAULT_SPEC)
    expect(parseStoredSpec("garbage")).toEqual(DEFAULT_SPEC)
  })
})
