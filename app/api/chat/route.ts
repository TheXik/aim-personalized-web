import { callStructured } from "@/lib/ai/azure"
import { MISSING_BRIEF_MESSAGE } from "@/lib/brief/data"
import { loadBrief } from "@/lib/brief/load"
import { isReaderSlug } from "@/lib/brief/schema"
import { handleChat, type ModelResult } from "@/lib/chat/handle"
import { Edit } from "@/lib/view/ops"
import VIEW_EDITOR_PROMPT from "@/prompts/view-editor.md"

// POST /api/chat  { reader, request, spec }  =>  { spec, reply, changed, offer, source }
// The page is never touched by the model directly: the model returns edit ops,
// code applies and checks them and writes the reply.

const MAX_BODY_BYTES = 16_000
const WINDOW_MS = 60_000
const MAX_PER_CLIENT = 8
// Model calls across all clients. Counted only right before a real call, so
// offline turns never use it up. Over the cap the turn falls back to the
// built-in shortcuts instead of failing.
const MAX_MODEL_CALLS = 30
const MAX_KEYS = 1_000
const hits = new Map<string, number[]>()
let modelCalls: number[] = []

// In-memory limits, enough for a demo on one server. The client key uses the
// first x-forwarded-for entry, which a caller can spoof, so the model budget
// is protected by the global model-call cap, not by this key.
function allowClient(key: string): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_PER_CLIENT) return false
  recent.push(now)
  hits.delete(key)
  hits.set(key, recent)
  while (hits.size > MAX_KEYS) hits.delete(hits.keys().next().value!)
  return true
}

function takeModelCall(): boolean {
  const now = Date.now()
  modelCalls = modelCalls.filter((t) => now - t < WINDOW_MS)
  if (modelCalls.length >= MAX_MODEL_CALLS) return false
  modelCalls.push(now)
  return true
}

// Live model calls are opt-in with CHAT_LIVE=1, so no dev server spends the
// model budget by accident. Without it the chat runs on the built-in shortcuts.
const offlineMode = () => process.env.CHAT_LIVE !== "1" || !process.env.AZURE_OPENAI_API_KEY

export async function POST(req: Request) {
  const text = await req.text()
  if (text.length > MAX_BODY_BYTES) return Response.json({ error: "too_large" }, { status: 413 })
  let body: { reader?: unknown; request?: unknown; spec?: unknown }
  try {
    body = JSON.parse(text)
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 })
  }

  if (typeof body.reader !== "string" || !isReaderSlug(body.reader)) return Response.json({ error: "unknown_reader" }, { status: 404 })
  const brief = await loadBrief(body.reader)
  if (!brief) return Response.json({ error: "missing_brief", reply: MISSING_BRIEF_MESSAGE }, { status: 404 })

  const client = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"
  if (!allowClient(`${body.reader}:${client}`)) {
    return Response.json({ error: "rate_limited", reply: "That's a lot of changes at once. Give it a minute." }, { status: 429 })
  }

  const res = await handleChat(
    { request: body.request, spec: body.spec },
    {
      brief,
      callModel: async (userPrompt): Promise<ModelResult> => {
        if (offlineMode()) return { ok: false, reason: "error" }
        if (!takeModelCall()) return { ok: false, reason: "rate_limited" }
        const r = await callStructured({ label: "chat", system: VIEW_EDITOR_PROMPT, prompt: userPrompt, schema: Edit })
        return r.ok ? { ok: true, output: r.output } : { ok: false, reason: r.reason }
      },
      log: (entry) => console.info(JSON.stringify({ reader: body.reader, ...entry })),
    },
  )
  return Response.json(res)
}
