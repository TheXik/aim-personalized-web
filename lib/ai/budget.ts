import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

// Hard spend cap for live model calls. Server only.
// Before a call we reserve its worst case (full input plus maxOutputTokens).
// A call that would cross the cap is never sent. After the call the
// reservation is replaced by the measured cost. Spend is kept in a local,
// git-ignored file so a dev server restart does not reset it.

// USD per token, gpt-5-mini Azure Global list price (research 05), times 1.2
// in case the deployment is Data Zone, which is priced about 20% higher.
const SAFETY = 1.2
const PRICE = { input: (0.25 / 1e6) * SAFETY, cached: (0.025 / 1e6) * SAFETY, output: (2.0 / 1e6) * SAFETY }

// Default cap 10 cents. MODEL_BUDGET_USD can lower or raise it, never above 20 cents.
const HARD_CEILING_USD = 0.2
export const capUsd = () => Math.min(Number(process.env.MODEL_BUDGET_USD ?? 0.1) || 0.1, HARD_CEILING_USD)

const FILE = path.join(process.cwd(), ".model-spend.json")
type Ledger = { usd: number; calls: number; since: string }

function read(): Ledger {
  try {
    const l = JSON.parse(readFileSync(FILE, "utf8")) as Ledger
    if (typeof l.usd === "number" && typeof l.calls === "number") return l
  } catch {}
  return { usd: 0, calls: 0, since: new Date().toISOString() }
}

const write = (l: Ledger) => writeFileSync(FILE, JSON.stringify(l, null, 2))

// About 4 characters per token for English JSON. Rounded up.
export function worstCaseUsd(promptChars: number, maxOutputTokens: number): number {
  return Math.ceil(promptChars / 3.5) * PRICE.input + maxOutputTokens * PRICE.output
}

export function costUsd(u: { input: number; cachedInput: number; output: number }): number {
  return (u.input - u.cachedInput) * PRICE.input + u.cachedInput * PRICE.cached + u.output * PRICE.output
}

// Reserve a call. Returns false, and sends nothing, when it could cross the cap.
export function reserve(worstCase: number): boolean {
  const l = read()
  if (l.usd + worstCase > capUsd()) return false
  write({ ...l, usd: l.usd + worstCase, calls: l.calls + 1 })
  return true
}

// Swap the reservation for the measured cost. Unknown usage keeps the worst case.
export function settle(worstCase: number, actual: number | null) {
  if (actual === null) return
  const l = read()
  write({ ...l, usd: Math.max(0, l.usd - worstCase + actual) })
}

export function spent(): Ledger & { capUsd: number } {
  return { ...read(), capUsd: capUsd() }
}
