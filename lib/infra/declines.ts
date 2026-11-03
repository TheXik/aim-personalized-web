import { onWorkers, spendDb } from "./cloudflare"

// Server only. Every request the chat could not do, so Lukáš sees what readers
// want that does not exist yet. Request text, reader slug, reason, time. No IP,
// no cookie, no spec. D1 (MODEL_SPEND_DB, table "declines") on Workers, a
// git-ignored .declines.jsonl locally. A logging failure never breaks the chat.
//
// Read it in production:
//   pnpm exec wrangler d1 execute aim-model-spend --remote --command "SELECT * FROM declines ORDER BY ts DESC LIMIT 50"

export type Decline = { reader: string; reason: string; request: string; frustrated: boolean; time?: string }

export async function logDecline(d: Decline): Promise<void> {
  const row = { ts: d.time ?? new Date().toISOString(), reader: d.reader, reason: d.reason, request: d.request.slice(0, 500), frustrated: d.frustrated ? 1 : 0 }
  try {
    if (onWorkers()) {
      const db = await spendDb()
      if (!db) return
      await db.batch([
        db.prepare(
          "CREATE TABLE IF NOT EXISTS declines (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, reader TEXT NOT NULL, reason TEXT NOT NULL, request TEXT NOT NULL, frustrated INTEGER NOT NULL DEFAULT 0)",
        ),
        db.prepare("INSERT INTO declines (ts, reader, reason, request, frustrated) VALUES (?1, ?2, ?3, ?4, ?5)").bind(row.ts, row.reader, row.reason, row.request, row.frustrated),
      ])
      return
    }
    const { appendFile } = await import("node:fs/promises")
    const path = await import("node:path")
    await appendFile(path.join(process.cwd(), ".declines.jsonl"), JSON.stringify(row) + "\n")
  } catch {
    // The log is a nice-to-have. The reader's answer matters more.
  }
}
