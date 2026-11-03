import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { loadSynthetic } from "@/tests/briefs"
import type { Op } from "@/lib/view/ops"
import { DEFAULT_SPEC } from "@/lib/view/spec"
import { contactLine, contactMailto } from "./contact"
import { frustrationSignal } from "./frustration"
import { handleChat, type ChatInput } from "./handle"

// The direct line to Lukáš. Runs on the synthetic brief, no model calls.

const orbital = loadSynthetic("orbital")

async function chat(input: Partial<ChatInput> & { request: string }, ops: Op[] = []) {
  const declines: { reason: string; request: string; frustrated: boolean }[] = []
  const r = await handleChat(
    { spec: DEFAULT_SPEC, ...input },
    { brief: orbital, callModel: async () => ({ ok: true, output: { ops } }), logDecline: (d) => void declines.push(d) },
  )
  return { ...r, declines }
}

const hideOneLiners: Op[] = [{ op: "filter", mode: "hide", where: { op: "eq", field: "tier", value: "one_liner" }, duration: "standing" }]
const cannot: Op[] = [{ op: "not_supported", reason: "new_text", nearest: null }]

describe("frustration detection, no model", () => {
  it.each([
    ["this is useless", "words"],
    ["It doesn’t work", "words"],
    ["wtf", "words"],
    ["To je k ničemu", "words"],
    ["nefunguje to", "words"],
    ["Toto je nanič", "words"],
    ["WHY CAN'T YOU DO THIS", "shouting"],
    ["seriously???", "punctuation"],
  ])("%s", (text, kind) => expect(frustrationSignal(text)).toBe(kind))

  it("leaves normal requests alone", () => {
    for (const t of ["hide the one-liners", "Only ESA and RFA please", "numbers first", "Is Korsa Launch still delayed?", "what is broken down by company"]) {
      expect(frustrationSignal(t), t).not.toBe("shouting")
    }
    expect(frustrationSignal("Only ESA and RFA please")).toBeNull()
    expect(frustrationSignal("group it by company")).toBeNull()
    expect(frustrationSignal("what is broken down by company")).toBeNull()
  })
})

describe("when the chat offers the direct line", () => {
  it("not when the change worked", async () => {
    const r = await chat({ request: "hide the one-liners" }, hideOneLiners)
    expect(r.contact).toBeNull()
    expect(r.declines).toEqual([])
  })

  it("after the other offers when the chat could not do it, and logs the decline", async () => {
    const r = await chat({ request: "summarise it in three bullets" }, cannot)
    expect(r.contact).toEqual({ when: "after", reason: "declined" })
    expect(r.declines).toEqual([{ reason: "not_supported:new_text", request: "summarise it in three bullets", frustrated: false }])
  })

  it("logs questions as declines too", async () => {
    const r = await chat({ request: "Who did Vela Freight sign with?" })
    expect(r.declines[0]).toMatchObject({ reason: "question", frustrated: false })
    expect(r.contact?.when).toBe("after")
  })

  it("right away on the second decline in a row", async () => {
    const r = await chat({ request: "summarise it in three bullets", declinesInARow: 1 }, cannot)
    expect(r.contact).toEqual({ when: "now", reason: "frustrated" })
    expect(r.declines[0].frustrated).toBe(true)
  })

  it("right away on frustrated words, even when the change worked", async () => {
    const r = await chat({ request: "ugh this is useless, hide the one-liners" }, hideOneLiners)
    expect(r.changed).toBe(true)
    expect(r.contact).toEqual({ when: "now", reason: "frustrated" })
  })

  it("ignores a forged streak value", async () => {
    const r = await chat({ request: "hide the one-liners", declinesInARow: "9999" }, hideOneLiners)
    expect(r.contact).toBeNull()
  })
})

describe("the mailto link", () => {
  it("prefills everything needed to reproduce the problem", () => {
    const href = contactMailto({
      request: "summarise it in three bullets",
      page: "https://aim.lukashellesch.com/r/space-launch",
      settings: ["Hiding one-liners", "Grouped by company"],
      time: "2026-11-03T12:00:00.000Z",
    })!
    expect(href.startsWith("mailto:lukas.hellesch@gmail.com?subject=")).toBe(true)
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1))
    expect(params.get("subject")).toBe('Aim brief: "summarise it in three bullets"')
    const body = params.get("body")!
    expect(body).toContain("What I asked: summarise it in three bullets")
    expect(body).toContain("Page: https://aim.lukashellesch.com/r/space-launch")
    expect(body).toContain("My settings: Hiding one-liners; Grouped by company")
    expect(body).toContain("Time: 2026-11-03T12:00:00.000Z")
  })

  it("works without a request for the always-visible link, and hides without an address", () => {
    const href = contactMailto({ page: "/r/cz-sk-ai", settings: [], time: "t" })!
    expect(new URLSearchParams(href.slice(href.indexOf("?") + 1)).get("subject")).toBe("Aim brief feedback")
    expect(contactMailto({ page: "/", settings: [], time: "t" }, "")).toBeNull()
    expect(contactLine()).toBe("Not what you needed? Tell Lukáš directly. He reads every message and fixes it fast.")
  })
})

describe("the decline log in dev", () => {
  it("appends one JSON line per decline, without IP", async () => {
    const cwd = process.cwd()
    process.chdir(mkdtempSync(path.join(tmpdir(), "declines-")))
    try {
      const { logDecline } = await import("@/lib/infra/declines")
      await logDecline({ reader: "space-launch", reason: "question", request: "who?", frustrated: false, time: "2026-11-03T12:00:00.000Z" })
      const line = JSON.parse(readFileSync(".declines.jsonl", "utf8").trim())
      expect(line).toEqual({ ts: "2026-11-03T12:00:00.000Z", reader: "space-launch", reason: "question", request: "who?", frustrated: 0 })
    } finally {
      process.chdir(cwd)
    }
  })
})
