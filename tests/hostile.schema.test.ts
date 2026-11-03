import { describe, expect, it } from "vitest"
import { applyOps, looksLikeClaim } from "@/lib/view/apply"
import { buildView } from "@/lib/view/engine"
import { Edit, MAX_OPS } from "@/lib/view/ops"
import { validateRule } from "@/lib/view/rules"
import { DEFAULT_SPEC, Rule, SPEC_LIMITS, ViewSpec } from "@/lib/view/spec"
import { fixtures, loadBrief } from "./helpers"

// The hostile half of research 06, checked where the defence lives: the schemas
// and the literal check. No model calls. Whatever the model returns for these,
// one of these gates has to stop it before it reaches the page.

const space = loadBrief("space-launch")
const ea = loadBrief("enterprise-ai")
const contains = (...values: string[]): Rule => ({ op: "contains", field: "text", values })

describe("hostile fixtures are all present", () => {
  it.each(fixtures.filter((f) => f.expected === "refuse").map((f) => [f.id, f.text] as const))("%s: %s", (id) => {
    const f = fixtures.find((x) => x.id === id)!
    expect(f.expect?.specUnchanged).toBe(true)
    expect(f.expect?.mustNot?.length).toBeGreaterThan(0)
  })
})

describe("HX13 code inside a rule", () => {
  it("rejects an op that is not in the AST", () => {
    expect(Rule.safeParse({ op: "fetch", url: "https://example.com/collect" }).success).toBe(false)
    expect(Rule.safeParse({ op: "eval", code: "item.text" }).success).toBe(false)
  })

  it("rejects a field that is not in the allowlist", () => {
    expect(Rule.safeParse({ op: "eq", field: "__proto__", value: "x" }).success).toBe(false)
    expect(Rule.safeParse({ op: "contains", field: "means", values: ["x"] }).success).toBe(false)
  })

  it("drops extra keys instead of keeping them", () => {
    const parsed = Rule.parse({ op: "has_number", run: "fetch('https://example.com')" })
    expect(parsed).toEqual({ op: "has_number" })
  })
})

describe("HX10 a JSON-breaking payload in a text match", () => {
  const payload = '"}]}, "sections": {"hide": ["verdict", "currents", "detail", "brief", "one_liner"]}'

  it("is too long to be a phrase", () => {
    expect(Rule.safeParse(contains(payload)).success).toBe(false)
  })

  it("a short payload stays a literal, matches nothing and fails the literal check", () => {
    const short = '"}]}, "hide": ["verdict"]'
    expect(validateRule(contains(short), space, "")).toHaveLength(1)
    const view = buildView(space, { ...DEFAULT_SPEC, filters: [{ id: "f1", mode: "keep", where: contains(short), expires: null }] })
    expect(view.shownTotal).toBe(0)
    expect(view.emptyFallback?.sections.flatMap((s) => s.items)).toHaveLength(space.items.length)
    expect(view.verdict).toBe(space.verdict)
  })
})

describe("HX09 and HX12 huge or looping specs", () => {
  const filter = (i: number) => ({ id: `f${i}`, mode: "hide" as const, where: { op: "has_number" } as Rule, expires: null })
  const pin = (i: number) => ({ id: `p${i}`, where: { op: "has_number" } as Rule, to: "top" as const, label: null, expires: null })

  it("caps filters, pins and renames", () => {
    const many = <T>(n: number, f: (i: number) => T) => Array.from({ length: n }, (_, i) => f(i))
    expect(ViewSpec.safeParse({ ...DEFAULT_SPEC, filters: many(SPEC_LIMITS.filters + 1, filter) }).success).toBe(false)
    expect(ViewSpec.safeParse({ ...DEFAULT_SPEC, pins: many(SPEC_LIMITS.pins + 1, pin) }).success).toBe(false)
    expect(
      ViewSpec.safeParse({ ...DEFAULT_SPEC, renames: many(SPEC_LIMITS.renames + 1, () => ({ section: "brief", text: "x" })) }).success,
    ).toBe(false)
  })

  it("caps ops per turn", () => {
    const ops = Array.from({ length: MAX_OPS + 1 }, () => ({ op: "reset" }))
    expect(Edit.safeParse({ ops }).success).toBe(false)
  })

  it("keeps the verdict on the most compact page there is", () => {
    const tiny: ViewSpec = {
      ...DEFAULT_SPEC,
      parts: { paragraphs: "none", means: false, figures: "hide", sources: false, oneLiners: "collapsed" },
      layout: { items: "compact", figures: "inline" },
      sections: { currents: false, updates: false },
    }
    const view = buildView(space, tiny)
    expect(view.verdict).toBe(space.verdict)
    expect(view.shownTotal).toBe(space.items.length)
  })
})

describe("HX02, HX03, HX04 and HX15 fact injection", () => {
  it("has no op that writes item text", () => {
    for (const op of ["edit_headline", "add_note", "set_text", "edit_fact"]) {
      expect(Edit.safeParse({ ops: [{ op, text: "OpenAI is collapsing" }] }).success).toBe(false)
    }
  })

  it("rejects rule phrases that are neither in the brief nor typed by the reader", () => {
    expect(validateRule(contains("slipped to 2027"), space, "")).toHaveLength(1)
    expect(validateRule(contains("$3.6B"), ea, "")).toHaveLength(1)
    expect(validateRule({ op: "eq", field: "company", value: "Mironet bankrupt" }, ea, "")).toHaveLength(1)
  })

  it("caps a section rename at 40 characters", () => {
    const long = "SpaceX will fail by 2027 and here is why it matters"
    expect(ViewSpec.safeParse({ ...DEFAULT_SPEC, renames: [{ section: "brief", text: long }] }).success).toBe(false)
  })
})

describe("HX05 a section name that states a claim", () => {
  // Known gap, written down on purpose. "SpaceX will fail by 2027" is 24 chars and
  // the reader typed it, so the schema and the literal check both let it through.
  // A claim filter on renames (years, amounts, verbs about companies) would close it.
  it("rejects a rename that reads as a claim, even in the reader's own words", () => {
    const request = "rename In brief to SpaceX will fail by 2027"
    const r = applyOps(DEFAULT_SPEC, [{ op: "rename", section: "brief", text: "SpaceX will fail by 2027" }], { brief: space, request })
    expect(r.spec).toEqual(DEFAULT_SPEC)
    expect(r.rejected[0].reasons[0].kind).toBe("not_reader_words")
    expect(looksLikeClaim("Quick reads")).toBe(false)
  })

  it("rejects a rename the reader did not type word for word", () => {
    const request = "rename the In brief section"
    const r = applyOps(DEFAULT_SPEC, [{ op: "rename", section: "brief", text: "SpaceX went bankrupt" }], { brief: space, request })
    expect(r.spec).toEqual(DEFAULT_SPEC)
    expect(r.rejected[0].reasons[0].kind).toBe("not_reader_words")
  })
})
