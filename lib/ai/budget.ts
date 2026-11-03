// Hard daily spend cap for live model calls. Server only.
// Before a call we reserve its worst case (full input plus maxOutputTokens).
// A call that would cross the cap is never sent. After the call the
// reservation is corrected by the difference to the measured cost.
//
// Every write is atomic, so concurrent calls cannot overshoot the cap or
// erase each other's reservations:
// - Cloudflare Workers: D1 bound as MODEL_SPEND_DB. One conditional UPDATE
//   both checks the cap and reserves. Corrections are atomic deltas.
//   No binding there means no model calls at all (fail closed).
// - Local dev and tests: a git-ignored .model-spend.json, with every
//   read-modify-write serialised by an in-process lock.

// USD per token, gpt-5-mini Azure Global list price (research 05), times 1.2
// in case the deployment is Data Zone, which is priced about 20% higher.
const SAFETY = 1.2
const PRICE = { input: (0.25 / 1e6) * SAFETY, cached: (0.025 / 1e6) * SAFETY, output: (2.0 / 1e6) * SAFETY }

// Default 10 cents per UTC day. MODEL_BUDGET_USD can change it, never above 20 cents.
const HARD_CEILING_USD = 0.2
export const capUsd = () => Math.min(Number(process.env.MODEL_BUDGET_USD ?? 0.1) || 0.1, HARD_CEILING_USD)

export type Ledger = { usd: number; calls: number; day: string }

interface Store {
  // Adds `usd` and one call only if the total stays within `cap`. Atomic.
  reserve(day: string, usd: number, cap: number): Promise<boolean>
  // Adds a (usually negative) correction, never below zero. Atomic.
  adjust(day: string, delta: number): Promise<void>
  read(day: string): Promise<Ledger>
}

// ---------- D1 (Cloudflare) ----------

type D1Stmt = { bind(...v: unknown[]): D1Stmt; run(): Promise<{ meta: { changes: number } }>; first<T>(): Promise<T | null> }
type D1 = { prepare(sql: string): D1Stmt; batch(stmts: D1Stmt[]): Promise<unknown> }

function d1Store(db: D1): Store {
  const ensure = (day: string) =>
    db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS spend (day TEXT PRIMARY KEY, usd REAL NOT NULL DEFAULT 0, calls INTEGER NOT NULL DEFAULT 0)"),
      db.prepare("INSERT OR IGNORE INTO spend (day) VALUES (?1)").bind(day),
    ])
  return {
    async reserve(day, usd, cap) {
      await ensure(day)
      const r = await db.prepare("UPDATE spend SET usd = usd + ?1, calls = calls + 1 WHERE day = ?2 AND usd + ?1 <= ?3").bind(usd, day, cap).run()
      return r.meta.changes === 1
    },
    async adjust(day, delta) {
      await db.prepare("UPDATE spend SET usd = MAX(0, usd + ?1) WHERE day = ?2").bind(delta, day).run()
    },
    async read(day) {
      await ensure(day)
      const row = await db.prepare("SELECT usd, calls FROM spend WHERE day = ?1").bind(day).first<{ usd: number; calls: number }>()
      return { usd: row?.usd ?? 0, calls: row?.calls ?? 0, day }
    },
  }
}

const onWorkers = () => typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers"

async function cloudflareStore(): Promise<Store | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare")
    const env = (await getCloudflareContext({ async: true })).env as unknown as Record<string, unknown>
    return env.MODEL_SPEND_DB ? d1Store(env.MODEL_SPEND_DB as D1) : null
  } catch {
    return null
  }
}

// ---------- Local file (dev and tests) ----------

let lock: Promise<unknown> = Promise.resolve()
function serialised<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn)
  lock = run.catch(() => {})
  return run
}

function fileStore(): Store {
  const file = async () => (await import("node:path")).join(process.cwd(), ".model-spend.json")
  const load = async (): Promise<Record<string, Ledger>> => {
    try {
      const { readFile } = await import("node:fs/promises")
      return JSON.parse(await readFile(await file(), "utf8"))
    } catch {
      return {}
    }
  }
  const save = async (all: Record<string, Ledger>) => (await import("node:fs/promises")).writeFile(await file(), JSON.stringify(all, null, 2))
  const get = (all: Record<string, Ledger>, day: string): Ledger => {
    const l = all[day]
    return l && typeof l.usd === "number" && typeof l.calls === "number" ? l : { usd: 0, calls: 0, day }
  }
  return {
    reserve: (day, usd, cap) =>
      serialised(async () => {
        const all = await load()
        const l = get(all, day)
        if (l.usd + usd > cap) return false
        await save({ ...all, [day]: { ...l, usd: l.usd + usd, calls: l.calls + 1 } })
        return true
      }),
    adjust: (day, delta) =>
      serialised(async () => {
        const all = await load()
        const l = get(all, day)
        await save({ ...all, [day]: { ...l, usd: Math.max(0, l.usd + delta) } })
      }),
    read: (day) => serialised(async () => get(await load(), day)),
  }
}

// null means "no safe place to count spend", and then no call is allowed.
const store = async (): Promise<Store | null> => (onWorkers() ? cloudflareStore() : fileStore())
const today = () => new Date().toISOString().slice(0, 10)

// About 3.5 characters per token for English JSON, rounded up.
export function worstCaseUsd(promptChars: number, maxOutputTokens: number): number {
  return Math.ceil(promptChars / 3.5) * PRICE.input + maxOutputTokens * PRICE.output
}

export function costUsd(u: { input: number; cachedInput: number; output: number }): number {
  return (u.input - u.cachedInput) * PRICE.input + u.cachedInput * PRICE.cached + u.output * PRICE.output
}

// A reservation remembers its day, so a call that runs past midnight UTC is
// corrected on the day it was charged to.
export type Reservation = { day: string; usd: number }

// Reserve a call. null means nothing may be sent: it could cross today's cap,
// or there is no ledger to count it in.
export async function reserve(worstCase: number): Promise<Reservation | null> {
  const s = await store()
  if (!s) return null
  const day = today()
  return (await s.reserve(day, worstCase, capUsd())) ? { day, usd: worstCase } : null
}

// Correct the reservation to the measured cost. Unknown usage keeps the worst case.
export async function settle(r: Reservation, actual: number | null): Promise<void> {
  if (actual === null || actual >= r.usd) return
  const s = await store()
  if (s) await s.adjust(r.day, actual - r.usd)
}

export async function spent(): Promise<Ledger & { capUsd: number }> {
  const s = await store()
  const day = today()
  return { ...(s ? await s.read(day) : { usd: 0, calls: 0, day }), capUsd: capUsd() }
}
