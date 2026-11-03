// Chat eval: runs the research 06 requests through handleChat, the same function
// the /api/chat route uses, and scores the returned spec with the real engine.
//
// Two modes:
//   pnpm eval                          offline: the model is never called, the chat
//                                      falls back to its built-in shortcuts. Free.
//   EVAL_APPROVED=1 pnpm eval -- --live
//                                      live: calls gpt-5-mini-hiring once per request.
//                                      Needs Lukáš's yes. Without EVAL_APPROVED=1 it
//                                      prints the plan and exits.
// Options: --only=SL01,EA09  --reps=2
//
// In-process instead of HTTP, so the eval sees the model's ops (not_supported
// reasons can be scored), needs no dev server and does not fight the route's rate limit.
import { readFile } from "node:fs/promises"
import { mkdirSync, writeFileSync } from "node:fs"
import { isDeepStrictEqual } from "node:util"
import { handleChat, type ModelResult } from "@/lib/chat/handle"
import { buildView } from "@/lib/view/engine"
import { Edit, type Op } from "@/lib/view/ops"
import { DEFAULT_SPEC, type ViewSpec } from "@/lib/view/spec"
import { fixtures, flatOrder, loadBrief, type Fixture } from "../helpers"

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1]
const live = process.argv.includes("--live")
const only = arg("only")?.split(",")
const reps = Number(arg("reps") ?? 1)

// Undo (CZ12) is app history, not a chat turn.
const cases = fixtures.filter((f) => !f.appOnly && (!only || only.includes(f.id)))
const calls = live ? cases.length * reps : 0

// Live estimate per call, from research/05-benchmark.md (edit ops, gpt-5-mini-hiring,
// reasoning low): about 3,966 input tokens and 204 output, $0.00061 with the prompt
// cache, about $0.0014 without. The route sends a field catalog, not the brief, so
// input should be lower. Estimate, replaced by measured usage after a live run.
const plan = { calls, inputTokens: calls * 4_000, outputTokens: calls * 250, usdCached: +(calls * 0.00061).toFixed(3), usdUncached: +(calls * 0.0014).toFixed(3) }

if (live && process.env.EVAL_APPROVED !== "1") {
  console.log("Live eval plan, nothing was sent:")
  console.log(`  ${calls} calls to gpt-5-mini-hiring (${cases.length} requests x ${reps} reps)`)
  console.log(`  about ${plan.inputTokens.toLocaleString()} input and ${plan.outputTokens.toLocaleString()} output tokens`)
  console.log(`  about $${plan.usdCached} with the prompt cache, $${plan.usdUncached} without`)
  console.log("Needs Lukáš's yes. Then run: EVAL_APPROVED=1 pnpm eval -- --live")
  process.exit(0)
}

// ---------- The model, or no model ----------
type Usage = { input: number; cachedInput: number; output: number; reasoning: number }
const usageTotal: Usage = { input: 0, cachedInput: 0, output: 0, reasoning: 0 }
let lastOps: Op[] | null = null

async function makeCallModel(): Promise<(prompt: string) => Promise<ModelResult>> {
  // Offline: fail every call, so handleChat uses its shortcuts. lib/ai/azure is
  // never imported, so no request can reach Azure in this mode.
  if (!live) return async () => ({ ok: false, reason: "error" })

  process.loadEnvFile(".env.local") // sets AZURE_OPENAI_API_KEY, never printed
  const { callStructured } = await import("@/lib/ai/azure")
  const system = await readFile("prompts/view-editor.md", "utf8")
  return async (prompt) => {
    const r = await callStructured({ label: "eval", system, prompt, schema: Edit })
    if (r.usage) for (const k of Object.keys(usageTotal) as (keyof Usage)[]) usageTotal[k] += r.usage[k]
    if (!r.ok) return { ok: false, reason: r.reason }
    lastOps = r.output.ops
    return { ok: true, output: r.output }
  }
}

// ---------- Scoring ----------
type Verdict = "pass" | "partial" | "fail" | "error"
type Answer = { spec: ViewSpec; source: "model" | "offline" | "none"; ops: Op[] | null }

function score(f: Fixture, start: ViewSpec, a: Answer): { verdict: Verdict; detail: string } {
  const unchanged = isDeepStrictEqual(a.spec, start)

  if (f.expected === "refuse") return unchanged ? { verdict: "pass", detail: "spec unchanged" } : { verdict: "fail", detail: "hostile request changed the spec" }

  if (f.expected === "not_supported") {
    if (!unchanged) return { verdict: "fail", detail: "spec changed on an unsupported request" }
    const ns = a.ops?.find((o) => o.op === "not_supported")
    if (!a.ops) return { verdict: "pass", detail: "spec unchanged (no ops to check the reason)" }
    if (!ns) return { verdict: "partial", detail: "spec unchanged but no not_supported op" }
    return ns.reason === f.expect?.reason
      ? { verdict: "pass", detail: `not_supported ${ns.reason}` }
      : { verdict: "partial", detail: `not_supported ${ns.reason}, expected ${f.expect?.reason}` }
  }

  // apply
  if (a.source === "none") return { verdict: "error", detail: "no change: the model failed and no shortcut matched" }
  if (!f.expect?.items && !f.expect?.groups) return unchanged ? { verdict: "fail", detail: "nothing changed" } : { verdict: "partial", detail: f.gap ?? "nothing to compare" }
  const view = buildView(loadBrief(f.brief), a.spec)
  const ok = f.expect.items
    ? isDeepStrictEqual(flatOrder(view), f.expect.items)
    : isDeepStrictEqual(Object.fromEntries(view.sections.map((s) => [s.title, s.items.map((i) => i.index)])), f.expect.groups)
  if (!ok) return { verdict: "fail", detail: `got ${JSON.stringify(flatOrder(view))}` }
  return f.gap ? { verdict: "partial", detail: `closest match: ${f.gap}` } : { verdict: "pass", detail: "items match" }
}

// ---------- Run ----------
type Result = { id: string; rep: number; expected: Fixture["expected"]; source: Answer["source"]; verdict: Verdict; detail: string; ms: number; ops: Op[] | null; spec: ViewSpec }

async function main() {
  const callModel = await makeCallModel()
  const results: Result[] = []
  for (let rep = 1; rep <= reps; rep++) {
    const after = new Map<string, ViewSpec>() // the spec each request left behind, for follow-ups
    for (const f of cases) {
      const parent = f.follows ? fixtures.find((x) => x.id === f.follows) : undefined
      const start = (parent && (after.get(parent.id) ?? parent.spec)) || DEFAULT_SPEC
      lastOps = null
      const t0 = Date.now()
      const res = await handleChat({ request: f.text, spec: start }, { brief: loadBrief(f.brief), callModel })
      const answer: Answer = { spec: res.spec, source: res.source, ops: live && res.source === "model" ? lastOps : null }
      const s = score(f, start, answer)
      after.set(f.id, res.spec)
      results.push({ id: f.id, rep, expected: f.expected, source: res.source, ...s, ms: Date.now() - t0, ops: answer.ops, spec: res.spec })
      console.log(`${s.verdict.padEnd(7)} ${res.source.padEnd(7)} ${f.id}  ${s.detail}`)
    }
  }

  const tally = (exp: Fixture["expected"]) => {
    const r = results.filter((x) => x.expected === exp)
    const n = (v: Verdict) => r.filter((x) => x.verdict === v).length
    return `${exp.padEnd(14)} pass ${n("pass")}  partial ${n("partial")}  fail ${n("fail")}  error ${n("error")}  of ${r.length}`
  }
  console.log(`\nmode ${live ? "live" : "offline"}`)
  console.log((["apply", "not_supported", "refuse"] as const).map(tally).join("\n"))
  const src = (s: Answer["source"]) => results.filter((r) => r.source === s).length
  console.log(`source: model ${src("model")}, offline ${src("offline")}, none ${src("none")}`)
  if (!live) console.log("Offline passes on not_supported and refuse are trivial: an unmatched request leaves the spec unchanged.")
  if (live) {
    const ms = results.map((r) => r.ms).sort((a, b) => a - b)
    console.log(`p50 ${ms[Math.floor(ms.length / 2)]} ms, p95 ${ms[Math.floor(ms.length * 0.95)]} ms`)
    console.log(`tokens: input ${usageTotal.input} (cached ${usageTotal.cachedInput}), output ${usageTotal.output} (reasoning ${usageTotal.reasoning})`)
  }

  mkdirSync("tests/eval/out", { recursive: true })
  const file = `tests/eval/out/eval-${live ? "live" : "offline"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  writeFileSync(file, JSON.stringify({ mode: live ? "live" : "offline", reps, plan, usage: live ? usageTotal : null, results }, null, 2))
  console.log(`wrote ${file}`)
}

main()
