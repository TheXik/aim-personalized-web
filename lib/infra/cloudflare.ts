// Server only. Where we run, and the Cloudflare bindings when on Workers.

export const onWorkers = () => typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers"

export type D1Stmt = { bind(...v: unknown[]): D1Stmt; run(): Promise<{ meta: { changes: number } }>; first<T>(): Promise<T | null> }
export type D1 = { prepare(sql: string): D1Stmt; batch(stmts: D1Stmt[]): Promise<unknown> }

// The D1 database bound as MODEL_SPEND_DB (spend ledger and decline log), or
// null outside Workers or without the binding.
export async function spendDb(): Promise<D1 | null> {
  if (!onWorkers()) return null
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare")
    const env = (await getCloudflareContext({ async: true })).env as unknown as Record<string, unknown>
    return (env.MODEL_SPEND_DB as D1 | undefined) ?? null
  } catch {
    return null
  }
}
