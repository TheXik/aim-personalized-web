// Model-path eval: sends the research 06 requests through the chat route and
// scores what comes back with the real engine.
//
// It calls the Azure model through the app. It never runs without Lukáš's yes:
// without EVAL_APPROVED=1 it prints the plan (calls, token and cost estimate) and exits.
//
//   pnpm eval                      plan only, no calls
//   EVAL_APPROVED=1 pnpm eval      run against http://localhost:3000 (pnpm dev must be up)
//   options: --only=SL01,EA09  --reps=2  --base=http://localhost:3000
import { mkdirSync, writeFileSync } from "node:fs"
import { isDeepStrictEqual } from "node:util"
import { buildView } from "@/lib/view/engine"
import { DEFAULT_SPEC, ViewSpec } from "@/lib/view/spec"
import { fixtures, flatOrder, loadBrief, type Fixture } from "../helpers"

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1]
const only = arg("only")?.split(",")
const reps = Number(arg("reps") ?? 1)
const base = arg("base") ?? process.env.EVAL_BASE_URL ?? "http://localhost:3000"

// Undo (CZ12) is app history, not a model call.
const cases = fixtures.filter((f) => !f.appOnly && (!only || only.includes(f.id)))
const calls = cases.length * reps

// Per call, from research/05-benchmark.md (edit ops, gpt-5-mini-hiring, reasoning low):
// about 3,966 input tokens (3,518 cached) and 204 output tokens, $0.00061 with the cache
// and about $0.0014 without it. The final prompt sends a field catalog instead of the
// brief, so input should be lower. Estimate, not measured on this route.
const plan = {
  calls,
  inputTokens: calls * 4_000,
  outputTokens: calls * 250,
  costUsd: { withCache: +(calls * 0.00061).toFixed(3), withoutCache: +(calls * 0.0014).toFixed(3) },
}

if (process.env.EVAL_APPROVED !== "1") {
  console.log("Eval plan, nothing was sent:")
  console.log(`  ${calls} calls to gpt-5-mini-hiring through ${base}/api/chat (${cases.length} requests x ${reps} reps)`)
  console.log(`  about ${plan.inputTokens.toLocaleString()} input and ${plan.outputTokens.toLocaleString()} output tokens`)
  console.log(`  about $${plan.costUsd.withCache} with the prompt cache, $${plan.costUsd.withoutCache} without`)
  console.log("Needs Lukáš's yes. Then run: EVAL_APPROVED=1 pnpm eval")
  process.exit(0)
}

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
  console.error(`Refusing to run against ${base}. The eval only talks to a local dev server.`)
  process.exit(1)
}

// ---------- Adapter: the only place that knows the chat route's shape ----------
// Align this with app/api/chat once the lead commits it. Expected today:
// POST { reader, message, spec } -> { spec, ops }.
type Answer = { spec: unknown; ops: { op: string; reason?: string }[] }
async function ask(f: Fixture, spec: ViewSpec): Promise<Answer> {
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reader: f.brief, message: f.text, spec }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as Answer
}

// ---------- Scoring ----------
type Verdict = "pass" | "fail" | "partial" | "error"
type Result = { id: string; rep: number; expected: Fixture["expected"]; verdict: Verdict; detail: string; ms: number; spec: unknown }

function score(f: Fixture, start: ViewSpec, answer: Answer): { verdict: Verdict; detail: string; spec: ViewSpec | null } {
  const parsed = ViewSpec.safeParse(answer.spec)
  if (!parsed.success) return { verdict: "fail", detail: "returned spec fails the schema", spec: null }
  const spec = parsed.data
  const unchanged = isDeepStrictEqual(spec, start)

  if (f.expected === "refuse") return { verdict: unchanged ? "pass" : "fail", detail: unchanged ? "spec unchanged" : "hostile request changed the spec", spec }

  if (f.expected === "not_supported") {
    if (!unchanged) return { verdict: "fail", detail: "spec changed on an unsupported request", spec }
    const ns = answer.ops?.find((o) => o.op === "not_supported")
    if (!ns) return { verdict: "partial", detail: "spec unchanged but no not_supported op", spec }
    return ns.reason === f.expect?.reason
      ? { verdict: "pass", detail: `not_supported ${ns.reason}`, spec }
      : { verdict: "partial", detail: `not_supported ${ns.reason}, expected ${f.expect?.reason}`, spec }
  }

  // apply
  if (!f.expect?.items && !f.expect?.groups) return { verdict: unchanged ? "fail" : "partial", detail: f.gap ?? "nothing to compare", spec }
  const view = buildView(loadBrief(f.brief), spec)
  let ok: boolean
  if (f.expect.items) ok = isDeepStrictEqual(flatOrder(view), f.expect.items)
  else ok = isDeepStrictEqual(Object.fromEntries(view.sections.map((s) => [s.title, s.items.map((i) => i.index)])), f.expect.groups)
  if (ok) return { verdict: f.gap ? "partial" : "pass", detail: f.gap ? `closest match: ${f.gap}` : "items match", spec }
  return { verdict: "fail", detail: `got ${JSON.stringify(flatOrder(view))}`, spec }
}

// ---------- Run ----------
async function main() {
  const results: Result[] = []
  for (let rep = 1; rep <= reps; rep++) {
    const after = new Map<string, ViewSpec>() // spec each request left behind, for follow-ups
    for (const f of cases) {
      const parent = f.follows ? fixtures.find((x) => x.id === f.follows) : undefined
      const start = (parent && (after.get(parent.id) ?? parent.spec)) || DEFAULT_SPEC
      const t0 = Date.now()
      try {
        const answer = await ask(f, start)
        const s = score(f, start, answer)
        if (s.spec) after.set(f.id, s.spec)
        results.push({ id: f.id, rep, expected: f.expected, verdict: s.verdict, detail: s.detail, ms: Date.now() - t0, spec: answer.spec })
      } catch (e) {
        results.push({ id: f.id, rep, expected: f.expected, verdict: "error", detail: String(e), ms: Date.now() - t0, spec: null })
      }
      console.log(`${results.at(-1)!.verdict.padEnd(7)} ${f.id}  ${results.at(-1)!.detail}`)
    }
  }

  const tally = (exp: string) => {
    const r = results.filter((x) => x.expected === exp)
    const n = (v: Verdict) => r.filter((x) => x.verdict === v).length
    return `${exp.padEnd(14)} pass ${n("pass")}  partial ${n("partial")}  fail ${n("fail")}  error ${n("error")}  of ${r.length}`
  }
  console.log("\n" + ["apply", "not_supported", "refuse"].map(tally).join("\n"))
  const ms = results.map((r) => r.ms).sort((a, b) => a - b)
  console.log(`p50 ${ms[Math.floor(ms.length / 2)]} ms, p95 ${ms[Math.floor(ms.length * 0.95)]} ms`)

  mkdirSync("tests/eval/out", { recursive: true })
  const file = `tests/eval/out/eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  writeFileSync(file, JSON.stringify({ base, reps, plan, results }, null, 2))
  console.log(`wrote ${file}`)
}

main()
