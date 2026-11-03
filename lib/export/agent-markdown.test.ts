import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { HAS_REAL_BRIEFS, REAL_BRIEFS_SKIP } from "@/tests/briefs"
import { normalizeBrief } from "@/lib/brief/normalize"
import { TagsFile } from "@/lib/brief/schema"
import type { Brief } from "@/lib/brief/types"
import { buildView } from "@/lib/view/engine"
import { DEFAULT_SPEC, type ViewSpec } from "@/lib/view/spec"
import { toAgentMarkdown } from "./agent-markdown"

const load = (slug: string): Brief =>
  normalizeBrief(
    JSON.parse(readFileSync(`data/briefs/brief-${slug}.json`, "utf8")),
    TagsFile.parse(JSON.parse(readFileSync(`data/briefs/${slug}.tags.json`, "utf8"))),
  )
const space = HAS_REAL_BRIEFS ? load("space-launch") : (undefined as unknown as Brief)
const ea = HAS_REAL_BRIEFS ? load("enterprise-ai") : (undefined as unknown as Brief)
const czsk = HAS_REAL_BRIEFS ? load("cz-sk-ai") : (undefined as unknown as Brief)
const md = (brief: Brief, spec: ViewSpec = DEFAULT_SPEC, settings: string[] = []) =>
  toAgentMarkdown({ view: buildView(brief, spec), settings })
const withSpec = (patch: Partial<ViewSpec>): ViewSpec => ({ ...DEFAULT_SPEC, ...patch })

describe.skipIf(!HAS_REAL_BRIEFS)(REAL_BRIEFS_SKIP, () => {
  describe("toAgentMarkdown", () => {
    it("opens with the fixed instruction line and the brief's dates", () => {
      const first = md(space).split("\n")[0]
      expect(first).toBe(
        "This is my weekly market brief from Aim for Sep 21 to 28, 2026. Use only the facts below and cite the links when you answer.",
      )
    })

    it("carries the verdict, every current with status and age, and every item in view order", () => {
      for (const brief of [space, ea, czsk]) {
        const out = md(brief)
        expect(out).toContain(brief.verdict)
        for (const c of brief.currents) expect(out).toContain(`**${c.label}**`)
        expect(out).toMatch(/\((New|Updated), [a-z ]+\)/)
        const view = buildView(brief, DEFAULT_SPEC)
        const headlines = view.sections.flatMap((s) => s.items.map((i) => i.headline))
        const positions = headlines.map((h) => out.indexOf(h))
        expect(positions.every((p) => p >= 0)).toBe(true)
        expect([...positions].sort((a, b) => a - b)).toEqual(positions)
      }
    })

    it("keeps the what-it-means line and links sources to Aim", () => {
      const out = md(space)
      const detail = space.items.find((i) => i.means)!
      expect(out).toContain(`**What it means:** ${detail.means}`)
      expect(out).toMatch(/\]\(https:\/\/app\.startaiming\.com\/o\/(upd|sig)_[A-Za-z0-9]+\)/)
      expect(out).toContain("Read the updates:")
    })

    it("renders all four figure types", () => {
      const sp = md(space)
      expect(sp).toContain("| Item | Value (days) | Note |")
      expect(sp).toContain("| **Current drought** | 630 |")
      const e = md(ea)
      // Header row built from the brief itself, so no brief text is copied into this file.
      const table = ea.items.map((i) => i.figure).find((f) => f?.type === "table")
      expect(table?.type).toBe("table")
      if (table?.type === "table") expect(e).toContain(`| ${table.block.cols.join(" | ")} |`)
      expect(e).toContain("| Microsoft | Yes | Yes | Yes | Yes |")
      expect(e).toContain("| Dataiku | No | Yes | No | No |")
      expect(e).toMatch(/- Sep 27: /)
      const c = md(czsk)
      expect(c).toContain("Claude-based agents (before):")
      expect(c).toContain("Jev decision model (now):")
    })

    it("leaves out what the reader's filters hide and says how much is hidden", () => {
      const spec = withSpec({
        filters: [{ id: "f1", mode: "keep", where: { op: "eq", field: "status", value: "new" }, expires: null }],
      })
      const view = buildView(czsk, spec)
      const out = toAgentMarkdown({ view })
      const hidden = czsk.items.filter((i) => i.status !== "new")
      expect(hidden.length).toBeGreaterThan(0)
      for (const h of hidden) expect(out).not.toContain(`### ${h.headline}`)
      expect(out).toContain(`Hidden by my settings: ${view.hiddenTotal} items`)
      expect(out).toContain(view.directives[0].summary)
    })

    it("follows the parts settings: no paragraphs, no sources, no figures", () => {
      const spec = withSpec({ parts: { paragraphs: "none", means: true, figures: "hide", sources: false, oneLiners: "show" } })
      const out = md(ea, spec, ["Headlines only", "No figures", "No sources"])
      for (const i of ea.items) for (const p of i.paragraphs) if (i.tier !== "one_liner") expect(out).not.toContain(p)
      expect(out).not.toContain("| Player |")
      expect(out).not.toContain("Sources: [1]")
      expect(out).toContain("My view settings: Headlines only, No figures, No sources.")
    })

    it("states the default view when nothing is changed, and never prints null or undefined", () => {
      for (const brief of [space, ea, czsk]) {
        const out = md(brief)
        expect(out).toContain("My view settings: Aim's default view. Nothing is hidden.")
        expect(out).not.toMatch(/\b(null|undefined)\b/)
        expect(out).not.toContain("\n\n\n")
      }
    })
  })
})
