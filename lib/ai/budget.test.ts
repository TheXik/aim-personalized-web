import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The ledger lives in process.cwd(), so each test runs in a fresh temp dir.
describe("model budget", () => {
  const cwd = process.cwd()
  beforeEach(() => {
    process.chdir(mkdtempSync(path.join(tmpdir(), "budget-")))
    vi.resetModules()
  })
  afterEach(() => {
    process.chdir(cwd)
    delete process.env.MODEL_BUDGET_USD
  })

  it("never sends a call that could cross the 10 cent cap", async () => {
    const b = await import("./budget")
    const worst = b.worstCaseUsd(8_000, 2_000) // about 0.0055 USD
    let sent = 0
    while (await b.reserve(worst)) sent++
    expect(sent).toBe(Math.floor(0.1 / worst))
    expect((await b.spent()).usd).toBeLessThanOrEqual(0.1)
  })

  it("settles to the measured cost so cheap calls leave room", async () => {
    const b = await import("./budget")
    const worst = b.worstCaseUsd(8_000, 2_000)
    expect(await b.reserve(worst)).toBe(true)
    await b.settle(worst, b.costUsd({ input: 2_000, cachedInput: 0, output: 300 }))
    expect((await b.spent()).usd).toBeCloseTo((2_000 * 0.25 + 300 * 2) * 1.2 / 1e6, 8)
  })

  it("fails closed on Workers without a KV binding", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" })
    const b = await import("./budget")
    expect(await b.reserve(0.001)).toBe(false)
    vi.unstubAllGlobals()
  })

  it("can never be raised above 20 cents", async () => {
    process.env.MODEL_BUDGET_USD = "5"
    const b = await import("./budget")
    expect(b.capUsd()).toBe(0.2)
  })
})
