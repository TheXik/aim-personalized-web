import { describe, expect, it } from "vitest"
import { handleChat, type ModelResult } from "@/lib/chat/handle"
import { toAgentMarkdown } from "@/lib/export/agent-markdown"
import { normalizeBrief } from "@/lib/brief/normalize"
import type { Brief } from "@/lib/brief/types"
import { loadSynthetic, rawSynthetic } from "@/tests/briefs"
import { buildView } from "./engine"
import type { Op } from "./ops"
import { DEFAULT_SPEC, type Rule, type ViewSpec } from "./spec"

// Runs everywhere, including CI, on the synthetic briefs in tests/fixtures.
// They cover all four figure types and the cases Aim's samples lack: an empty
// subject, a "carried over" current and items with no scope.

const orbital = loadSynthetic("orbital")
const fintech = loadSynthetic("fintech")

const order = (b: Brief, spec: ViewSpec) => buildView(b, spec).sections.flatMap((s) => s.items.map((i) => i.index))
const withSpec = (patch: Partial<ViewSpec>): ViewSpec => ({ ...DEFAULT_SPEC, ...patch })
const keep = (where: Rule, expires: string | null = null) => ({ id: "f1", mode: "keep" as const, where, expires })
const hide = (where: Rule, expires: string | null = null) => ({ id: "f1", mode: "hide" as const, where, expires })
const pin = (where: Rule, to: "top" | "bottom" = "top") => ({ id: "p1", where, to, label: null, expires: null })

describe("synthetic briefs: normalisation", () => {
  it("sorts detail, brief, one-liner and keeps JSON order inside a tier", () => {
    expect(orbital.items.map((i) => i.index)).toEqual([0, 2, 1, 3, 4, 5, 6])
  })

  it("parses all four figure types", () => {
    expect(new Set(orbital.items.flatMap((i) => (i.figure ? [i.figure.type] : [])))).toEqual(new Set(["timeline", "chart", "table", "comparison"]))
  })

  it("uses the verdict as title when the subject is empty", () => {
    expect(fintech.titleIsVerdict).toBe(true)
    expect(fintech.title).toBe(fintech.verdict)
    expect(orbital.titleIsVerdict).toBe(false)
  })

  it("maps a carried over current and keeps the raw status", () => {
    const c = orbital.currents[2]
    expect(c).toMatchObject({ status: "carried", statusRaw: "carried over" })
  })

  it("shows items with no scope as Other", () => {
    expect(orbital.items.find((i) => i.index === 1)!.scope).toBe("Other")
    expect(fintech.items.find((i) => i.index === 2)!.scope).toBe("Other")
  })

  it("shows a one-liner's text once", () => {
    for (const i of orbital.items.filter((x) => x.tier === "one_liner")) expect(i.paragraphs).toEqual([])
  })

  it("has_number: amounts, percentages, 100+ and charts count, Pad 7 does not", () => {
    const n = (b: Brief) => b.items.filter((i) => i.hasNumber).map((i) => i.index).sort((a, z) => a - z)
    expect(n(orbital)).toEqual([0, 1, 2, 4])
    expect(n(fintech)).toEqual([1, 3])
  })

  it("loads tags by index and hash, primary company in headline order", () => {
    expect(orbital.hasTags).toBe(true)
    expect(orbital.items.find((i) => i.index === 0)!.primaryCompany).toBe("Vela Freight")
    expect(orbital.items.find((i) => i.index === 6)!.primaryCompany).toBe("Quorn Dynamics")
  })

  it("links a current to its items and its thread-wide figure", () => {
    expect(orbital.currents[1].itemKeys).toHaveLength(2)
    expect(orbital.currents[0].figure?.type).toBe("timeline")
  })
})

describe("synthetic briefs: view engine", () => {
  it("default design: three tier sections, nothing hidden", () => {
    const v = buildView(orbital, DEFAULT_SPEC)
    expect(v.sections.map((s) => s.items.length)).toEqual([2, 2, 3])
    expect(v).toMatchObject({ hiddenTotal: 0, isDefault: true, emptyFallback: null, settingsNote: null })
  })

  it("only what is new", () => {
    const v = buildView(orbital, withSpec({ filters: [keep({ op: "eq", field: "status", value: "new" })] }))
    expect(v.shownTotal).toBe(5)
    expect(v.directives[0].summary).toBe("Only new this week")
  })

  it("hide the one-liners", () => {
    const v = buildView(orbital, withSpec({ filters: [hide({ op: "eq", field: "tier", value: "one_liner" })] }))
    expect(v.sections.find((s) => s.key === "tier:one_liner")).toMatchObject({ hiddenCount: 3 })
  })

  it("numbers first", () => {
    const v = buildView(orbital, withSpec({ pins: [pin({ op: "has_number" })] }))
    expect(v.sections[0].items.map((i) => i.index)).toEqual([0, 2, 1, 4])
  })

  it("group by company, scope with Other last", () => {
    expect(buildView(orbital, withSpec({ group: "company" })).sections[0].title).toBe("Vela Freight")
    expect(buildView(orbital, withSpec({ group: "scope" })).sections.map((s) => s.title)).toEqual(["Launch market", "Insurance", "Who moved where?", "Other"])
  })

  it("demote a scope to the bottom", () => {
    expect(order(orbital, withSpec({ pins: [pin({ op: "eq", field: "scope", value: "Launch market" }, "bottom")] }))).toEqual([2, 1, 5, 6, 0, 3, 4])
  })

  it("never shows a blank page", () => {
    const v = buildView(orbital, withSpec({ filters: [keep({ op: "contains", field: "text", values: ["Zeppelin"] })] }))
    expect(v.emptyFallback?.sections.flatMap((s) => s.items)).toHaveLength(7)
  })

  it("carries settings to next week, expires one-offs and pauses rules on a vanished thread", () => {
    const raw = rawSynthetic("orbital") as { recap: { id: string; doc: { currents: { label: string }[] } } }
    raw.recap.id = "rcp_synthNextWeek"
    raw.recap.doc.currents[1].label = "A renamed thread"
    const next = normalizeBrief(raw, null)
    const standing = withSpec({ filters: [hide({ op: "eq", field: "tier", value: "one_liner" })] })
    expect(buildView(next, standing).hiddenTotal).toBe(3)
    const oneOff = withSpec({ filters: [hide({ op: "eq", field: "tier", value: "one_liner" }, orbital.recapId)] })
    expect(buildView(next, oneOff).directives[0].state).toBe("expired")
    const thread = withSpec({ filters: [hide({ op: "eq", field: "current", value: "Korsa Launch keeps slipping" })] })
    expect(buildView(orbital, thread).hiddenTotal).toBe(2)
    expect(buildView(next, thread).directives[0].state).toBe("inactive")
    // No tags file next week: company rules match the name in the text.
    const company = withSpec({ filters: [keep({ op: "eq", field: "company", value: "Korsa Launch" })] })
    expect(buildView(next, company).shownTotal).toBe(2)
  })
})

describe("synthetic briefs: chat turn with a fake model", () => {
  const turn = async (request: string, ops: Op[] | ModelResult, brief = orbital) => {
    const seen: string[] = []
    const r = await handleChat(
      { request, spec: DEFAULT_SPEC },
      { brief, callModel: async (p) => (seen.push(p), Array.isArray(ops) ? { ok: true, output: { ops } } : ops) },
    )
    return { ...r, prompt: seen[0] }
  }

  it("the model sees names and counts, never brief prose", async () => {
    const r = await turn("numbers first", [])
    expect(r.prompt).toContain("Vela Freight")
    for (const i of orbital.items) expect(r.prompt).not.toContain(i.headline)
    expect(r.prompt).not.toContain(orbital.verdict)
  })

  it("applies an edit and writes the reply in code", async () => {
    const r = await turn("hide the one-liners", [{ op: "filter", mode: "hide", where: { op: "eq", field: "tier", value: "one_liner" }, duration: "standing" }])
    expect(r.reply).toBe("Hiding one-liners, 3 hidden.")
  })

  it("rejects an invented label and an invented phrase", async () => {
    const label = await turn("put a band on top", [
      { op: "pin", where: { op: "has_number" }, to: "top", label: { source: "current", text: "Vela Freight raised $1B" }, duration: "standing" },
    ])
    expect(label.changed).toBe(false)
    const phrase = await turn("only the moon stuff", [{ op: "filter", mode: "keep", where: { op: "contains", field: "text", values: ["lunar lander"] }, duration: "standing" }])
    expect(phrase.changed).toBe(false)
  })

  it("falls back to a whole-request shortcut when the model is down", async () => {
    const r = await turn("group it by company", { ok: false, reason: "error" })
    expect(r).toMatchObject({ source: "offline", changed: true })
  })
})

describe("synthetic briefs: copy for agent", () => {
  it("renders all four figure types as text", () => {
    const out = toAgentMarkdown({ view: buildView(orbital, DEFAULT_SPEC), settings: [] })
    expect(out).toContain(orbital.verdict)
    expect(out).toContain("Vela Freight flew its first test capsule.") // timeline point
    expect(out).toContain("Quorn Mutual") // table cell
    expect(out).toContain("Own dishes (before)") // comparison side
    expect(out).toContain("Third delay") // chart label
  })
})

describe("no model-written text reaches the reader (decision 5)", () => {
  const M = "ZZMODELTEXT"
  const outputs: Op[][] = [
    [{ op: "filter", mode: "keep", where: { op: "contains", field: "text", values: [M] }, duration: "standing" }],
    [{ op: "filter", mode: "keep", where: { op: "eq", field: "scope", value: M }, duration: "standing" }],
    [{ op: "pin", where: { op: "has_number" }, to: "top", label: { source: "scope", text: M }, duration: "standing" }],
    [{ op: "pin", where: { op: "has_number" }, to: "top", label: { source: "reader", text: M }, duration: "standing" }],
    [{ op: "rename", section: "brief", text: M }],
    [{ op: "not_supported", reason: "other", nearest: { op: "rename", section: "brief", text: M } }],
    [{ op: "not_supported", reason: "other", nearest: { op: "filter", mode: "keep", where: { op: "contains", field: "text", values: [M] }, duration: "standing" } }],
    [{ op: "not_supported", reason: "other", nearest: { op: "pin", where: { op: "eq", field: "company", value: M }, to: "top", label: null, duration: "standing" } }],
  ]
  it.each(outputs.map((ops, i) => [i, ops] as const))("case %i", async (_, ops) => {
    const r = await handleChat({ request: "numbers first", spec: DEFAULT_SPEC }, { brief: orbital, callModel: async () => ({ ok: true, output: { ops } }) })
    expect(`${r.reply} ${r.offer?.label ?? ""} ${JSON.stringify(r.spec)}`).not.toContain(M)
  })

  it("still offers a nearest op that passes the checks", async () => {
    const nearest: Op = { op: "filter", mode: "hide", where: { op: "eq", field: "tier", value: "one_liner" }, duration: "standing" }
    const r = await handleChat(
      { request: "summarise it", spec: DEFAULT_SPEC },
      { brief: orbital, callModel: async () => ({ ok: true, output: { ops: [{ op: "not_supported", reason: "new_text", nearest }] } }) },
    )
    expect(r.offer?.label).toBe("Hiding one-liners")
  })
})

describe("the browser-sent spec is cleaned before use", () => {
  it("drops forged labels, claim renames and oversized rules", async () => {
    let deep: Rule = { op: "has_number" }
    for (let i = 0; i < 40; i++) deep = { op: "not", arg: deep }
    const forged = {
      ...DEFAULT_SPEC,
      filters: [{ id: "f1", mode: "keep", where: deep, expires: null }],
      pins: [{ id: "p1", where: { op: "has_number" }, to: "top", label: { source: "scope", text: "Vela Freight went bankrupt" }, expires: null }],
      renames: [{ section: "brief", text: "Korsa folds in 2031" }, { section: "detail", text: "Big ‮slle" }],
    }
    const r = await handleChat({ request: "  ", spec: forged }, { brief: orbital, callModel: async () => ({ ok: true, output: { ops: [] } }) })
    expect(r.spec.filters).toEqual([])
    expect(r.spec.pins[0].label).toBeNull()
    expect(r.spec.renames).toEqual([])
  })

  it("refuses claims written with other digits or currency signs", async () => {
    const { looksLikeClaim } = await import("./apply")
    expect(looksLikeClaim("Exit by ２０３１")).toBe(true)
    expect(looksLikeClaim("Worth ¥ billions")).toBe(true)
    expect(looksLikeClaim("Quick reads")).toBe(false)
  })
})
