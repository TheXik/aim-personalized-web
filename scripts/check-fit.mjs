// Checks that the laptop front page fits one screen: no page scroll and no
// region that overflows, for every reader, at 1280x800 and 1440x900.
// No dependencies: drives a local Chrome over the DevTools protocol.
//
//   pnpm dev                     (in another terminal)
//   pnpm check:fit               BASE_URL=http://localhost:3001 pnpm check:fit
//
// CHROME can point at a Chrome or Chromium binary if it is not in the usual place.

import { spawn } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const BASE = process.env.BASE_URL ?? "http://localhost:3000"
const READERS = ["space-launch", "enterprise-ai", "cz-sk-ai"]
const SPEC_KEY = (r) => `aim.view.v1.${r}`
const CHAT_KEY = "aim.chat.open.v1"

const DEFAULT = {
  version: 1,
  filters: [],
  pins: [],
  parts: { paragraphs: "all", means: true, figures: "show", sources: true, oneLiners: "show" },
  group: "tier",
  order: "default",
  layout: { items: "standard", figures: "inline" },
  sections: { currents: true, updates: true },
  renames: [],
}
const VIEWS = {
  default: null,
  "numbers-first": { ...DEFAULT, pins: [{ id: "p1", where: { op: "has_number" }, to: "top", label: null, expires: null }] },
  "by-company": { ...DEFAULT, group: "company" },
  "only-new": { ...DEFAULT, filters: [{ id: "f1", mode: "keep", where: { op: "eq", field: "status", value: "new" }, expires: null }] },
}

const CASES = []
for (const reader of READERS) {
  for (const [w, h] of [[1280, 800], [1440, 900]]) CASES.push({ reader, w, h, chat: false, view: "default" })
  CASES.push({ reader, w: 1440, h: 900, chat: true, view: "default" })
  for (const view of ["numbers-first", "by-company", "only-new"]) CASES.push({ reader, w: 1280, h: 800, chat: false, view })
}

function chromePath() {
  if (process.env.CHROME) return process.env.CHROME
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ]
  const found = candidates.find((p) => existsSync(p))
  if (!found) throw new Error("No Chrome found. Set CHROME=/path/to/chrome")
  return found
}

async function launch() {
  const dir = mkdtempSync(path.join(tmpdir(), "aim-fit-"))
  const proc = spawn(chromePath(), ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${dir}`, "--no-first-run", "--hide-scrollbars", "about:blank"], {
    stdio: "ignore",
  })
  const portFile = path.join(dir, "DevToolsActivePort")
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100)
  const [port, wsPath] = readFileSync(portFile, "utf8").trim().split("\n")
  const ws = new WebSocket(`ws://127.0.0.1:${port}${wsPath}`)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })
  let id = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) rej(new Error(msg.error.message))
      else res(msg.result)
    }
  }
  const send = (method, params = {}, sessionId) =>
    new Promise((res, rej) => {
      const msgId = ++id
      pending.set(msgId, { res, rej })
      ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  const close = async () => {
    ws.close()
    const exited = new Promise((r) => proc.once("exit", r))
    proc.kill()
    await Promise.race([exited, sleep(3000)])
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    } catch {
      // A leftover temp folder is harmless.
    }
  }
  return { send, close }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function evaluate(send, sessionId, expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId)
  return r.result.value
}

async function waitFor(send, sessionId, expression, timeout = 20000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await evaluate(send, sessionId, expression)) return true
    await sleep(150)
  }
  return false
}

const MEASURE = `(() => {
  const doc = document.scrollingElement
  const pageOverflow = doc.scrollHeight - window.innerHeight
  const regions = [...document.querySelectorAll("[data-fit]")].map((el) => ({
    name: el.getAttribute("data-fit"),
    overflow: el.scrollHeight - el.clientHeight,
    overflowX: el.scrollWidth - el.clientWidth,
  }))
  // Spare room: how far the last section ends above the bottom of the front page.
  const front = document.querySelector("[data-front]")
  let spare = null
  if (front) {
    const pad = parseFloat(getComputedStyle(front).paddingBottom) || 0
    const bottom = Math.max(...[...front.children].map((c) => c.getBoundingClientRect().bottom))
    spare = Math.round(front.getBoundingClientRect().bottom - pad - bottom)
  }
  return { pageOverflow, regions, spare, innerHeight: window.innerHeight }
})()`

async function main() {
  const { send, close } = await launch()
  let failed = 0
  try {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" })
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
    await send("Page.enable", {}, sessionId)
    await send("Runtime.enable", {}, sessionId)
    for (const c of CASES) {
      await send("Emulation.setDeviceMetricsOverride", { width: c.w, height: c.h, deviceScaleFactor: 1, mobile: false }, sessionId)
      const url = `${BASE}/r/${c.reader}`
      await send("Page.navigate", { url }, sessionId)
      await waitFor(send, sessionId, `document.readyState === "complete"`)
      const spec = VIEWS[c.view]
      await evaluate(
        send,
        sessionId,
        `(() => { localStorage.setItem(${JSON.stringify(CHAT_KEY)}, ${JSON.stringify(c.chat ? "1" : "0")});
          ${spec ? `localStorage.setItem(${JSON.stringify(SPEC_KEY(c.reader))}, ${JSON.stringify(JSON.stringify(spec))})` : `localStorage.removeItem(${JSON.stringify(SPEC_KEY(c.reader))})`}; return true })()`,
      )
      await send("Page.reload", {}, sessionId)
      const ready = await waitFor(send, sessionId, `!!document.querySelector("[data-front-ready]")`)
      await sleep(400)
      const m = ready ? await evaluate(send, sessionId, MEASURE) : null
      const label = `${c.reader.padEnd(14)} ${String(c.w).padStart(4)}x${c.h} ${c.chat ? "chat open " : "chat shut "} ${c.view.padEnd(13)}`
      if (!m) {
        failed++
        console.log(`FAIL ${label} page did not render`)
        continue
      }
      const bad = m.regions.filter((r) => r.overflow > 1 || r.overflowX > 1)
      const ok = m.pageOverflow <= 1 && bad.length === 0
      if (!ok) failed++
      const detail = ok
        ? `fits, ${m.spare}px to spare`
        : `page overflow ${m.pageOverflow}px${bad.map((r) => `, ${r.name} overflows ${Math.max(r.overflow, r.overflowX)}px`).join("")}`
      console.log(`${ok ? "ok  " : "FAIL"} ${label} ${detail}`)
    }
    await evaluate(send, sessionId, `localStorage.clear(), true`)
  } finally {
    await close()
  }
  console.log(failed ? `\n${failed} of ${CASES.length} cases do not fit` : `\nAll ${CASES.length} cases fit one screen`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
