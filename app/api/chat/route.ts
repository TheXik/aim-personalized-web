import { readFile } from "node:fs/promises"
import path from "node:path"
import { callStructured } from "@/lib/ai/azure"
import { loadBrief } from "@/lib/brief/load"
import { handleChat, type ModelResult } from "@/lib/chat/handle"
import { Edit } from "@/lib/view/ops"

// POST /api/chat  { reader, request, spec }  =>  { spec, reply, changed, offer, source }
// The page is never touched by the model directly: the model returns edit ops,
// code applies and checks them and writes the reply.

const MAX_BODY_BYTES = 16_000
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 8
const hits = new Map<string, number[]>()

// Simple in-memory limit per reader and client. Enough for a demo on one server.
function allow(key: string): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) return false
  recent.push(now)
  hits.set(key, recent)
  return true
}

let systemPrompt: string | null = null
async function system() {
  systemPrompt ??= await readFile(path.join(process.cwd(), "prompts", "view-editor.md"), "utf8")
  return systemPrompt
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

  const brief = typeof body.reader === "string" ? await loadBrief(body.reader) : null
  if (!brief) return Response.json({ error: "unknown_reader" }, { status: 404 })

  const client = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"
  if (!allow(`${body.reader}:${client}`)) {
    return Response.json({ error: "rate_limited", reply: "That's a lot of changes at once. Give it a minute." }, { status: 429 })
  }

  const prompt = await system()
  const res = await handleChat(
    { request: body.request, spec: body.spec },
    {
      brief,
      callModel: async (userPrompt): Promise<ModelResult> => {
        if (offlineMode()) return { ok: false, reason: "error" }
        const r = await callStructured({ label: "chat", system: prompt, prompt: userPrompt, schema: Edit })
        return r.ok ? { ok: true, output: r.output } : { ok: false, reason: r.reason }
      },
      log: (entry) => console.info(JSON.stringify({ reader: body.reader, ...entry })),
    },
  )
  return Response.json(res)
}
