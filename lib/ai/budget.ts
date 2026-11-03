// Hard daily spend cap for live model calls. Server only.
// Before a call we reserve its worst case (full input plus maxOutputTokens).
// A call that would cross the cap is never sent. After the call the
// reservation is replaced by the measured cost.
//
// Where the ledger lives:
// - Cloudflare Workers: the KV namespace bound as MODEL_SPEND. No binding
//   there means no model calls at all (fail closed).
// - Local dev and tests: a git-ignored .model-spend.json in the project folder.
// KV is not atomic, so two calls in the same instant can both pass the check.
// The overshoot is at most one worst case (about half a cent). Fine for a demo.

// USD per token, gpt-5-mini Azure Global list price (research 05), times 1.2
// in case the deployment is Data Zone, which is priced about 20% higher.
const SAFETY = 1.2
const PRICE = { input: (0.25 / 1e6) * SAFETY, cached: (0.025 / 1e6) * SAFETY, output: (2.0 / 1e6) * SAFETY }

// Default 10 cents per UTC day. MODEL_BUDGET_USD can change it, never above 20 cents.
const HARD_CEILING_USD = 0.2
export const capUsd = () => Math.min(Number(process.env.MODEL_BUDGET_USD ?? 0.1) || 0.1, HARD_CEILING_USD)

export type Ledger = { usd: number; calls: number; day: string }

interface Store {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
}

const onWorkers = () => typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers"

async function kvStore(): Promise<Store | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare")
    const env = (await getCloudflareContext({ async: true })).env as unknown as Record<string, unknown>
    const kv = env.MODEL_SPEND as { get(k: string): Promise<string | null>; put(k: string, v: string): Promise<void> } | undefined
    return kv ? { get: (k) => kv.get(k), put: (k, v) => kv.put(k, v) } : null
  } catch {
    return null
  }
}

async function fileStore(): Promise<Store> {
  const { readFile, writeFile } = await import("node:fs/promises")
  const path = await import("node:path")
  const file = path.join(process.cwd(), ".model-spend.json")
  const readAll = async (): Promise<Record<string, string>> => {
    try {
      return JSON.parse(await readFile(file, "utf8"))
    } catch {
      return {}
    }
  }
  return {
    get: async (k) => (await readAll())[k] ?? null,
    put: async (k, v) => writeFile(file, JSON.stringify({ ...(await readAll()), [k]: v }, null, 2)),
  }
}

// null means "no safe place to count spend", and then no call is allowed.
async function store(): Promise<Store | null> {
  return onWorkers() ? kvStore() : fileStore()
}

const today = () => new Date().toISOString().slice(0, 10)
const keyFor = (day: string) => `spend:${day}`

async function read(s: Store): Promise<Ledger> {
  const day = today()
  try {
    const l = JSON.parse((await s.get(keyFor(day))) ?? "null") as Ledger | null
    if (l && typeof l.usd === "number" && typeof l.calls === "number") return l
  } catch {}
  return { usd: 0, calls: 0, day }
}

const write = (s: Store, l: Ledger) => s.put(keyFor(l.day), JSON.stringify(l))

// About 3.5 characters per token for English JSON, rounded up.
export function worstCaseUsd(promptChars: number, maxOutputTokens: number): number {
  return Math.ceil(promptChars / 3.5) * PRICE.input + maxOutputTokens * PRICE.output
}

export function costUsd(u: { input: number; cachedInput: number; output: number }): number {
  return (u.input - u.cachedInput) * PRICE.input + u.cachedInput * PRICE.cached + u.output * PRICE.output
}

// Reserve a call. Returns false, and nothing may be sent, when it could cross
// today's cap or when there is no ledger to count it in.
export async function reserve(worstCase: number): Promise<boolean> {
  const s = await store()
  if (!s) return false
  const l = await read(s)
  if (l.usd + worstCase > capUsd()) return false
  await write(s, { ...l, usd: l.usd + worstCase, calls: l.calls + 1 })
  return true
}

// Swap the reservation for the measured cost. Unknown usage keeps the worst case.
export async function settle(worstCase: number, actual: number | null): Promise<void> {
  if (actual === null) return
  const s = await store()
  if (!s) return
  const l = await read(s)
  await write(s, { ...l, usd: Math.max(0, l.usd - worstCase + actual) })
}

export async function spent(): Promise<Ledger & { capUsd: number }> {
  const s = await store()
  return { ...(s ? await read(s) : { usd: 0, calls: 0, day: today() }), capUsd: capUsd() }
}
