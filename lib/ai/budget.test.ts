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
    expect(sent).toBeGreaterThan(0)
    expect(sent).toBe(Math.floor(0.1 / worst))
    expect((await b.spent()).usd).toBeLessThanOrEqual(0.1)
  })

  it("settles to the measured cost so cheap calls leave room", async () => {
    const b = await import("./budget")
    const worst = b.worstCaseUsd(8_000, 2_000)
    const r = await b.reserve(worst)
    expect(r).not.toBeNull()
    await b.settle(r!, b.costUsd({ input: 2_000, cachedInput: 0, output: 300 }))
    expect((await b.spent()).usd).toBeCloseTo((2_000 * 0.25 + 300 * 2) * 1.2 / 1e6, 8)
  })

  it("concurrent calls can't overshoot the cap or erase each other's reservations", async () => {
    const b = await import("./budget")
    const worst = b.worstCaseUsd(8_000, 2_000)
    const results = await Promise.all(Array.from({ length: 50 }, () => b.reserve(worst)))
    const granted = results.filter(Boolean)
    expect(granted).toHaveLength(Math.floor(0.1 / worst))
    // Settle half in parallel: the total must equal the sum of what is left.
    const half = granted.slice(0, 5)
    await Promise.all(half.map((r) => b.settle(r!, 0.001)))
    expect((await b.spent()).usd).toBeCloseTo(worst * (granted.length - 5) + 0.001 * 5, 10)
  })

  it("fails closed on Workers without a D1 binding", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" })
    const b = await import("./budget")
    expect(await b.reserve(0.001)).toBeNull()
    vi.unstubAllGlobals()
  })

  it("records a call that cost more than its reservation", async () => {
    const b = await import("./budget")
    const r = await b.reserve(0.002)
    await b.settle(r!, 0.003)
    expect((await b.spent()).usd).toBeCloseTo(0.003, 10)
  })

  it("lets production on Workers go up to 10 dollars, never more", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" })
    process.env.MODEL_BUDGET_USD = "10"
    const b = await import("./budget")
    expect(b.capUsd()).toBe(10)
    process.env.MODEL_BUDGET_USD = "50"
    expect(b.capUsd()).toBe(10)
    vi.unstubAllGlobals()
  })

  it("can never be raised above 20 cents", async () => {
    process.env.MODEL_BUDGET_USD = "5"
    const b = await import("./budget")
    expect(b.capUsd()).toBe(0.2)
  })
})
