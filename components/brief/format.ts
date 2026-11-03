// Small display helpers. Dates in the brief are ISO days (yyyy-mm-dd) with no
// time zone, so they are parsed by hand and never shifted by the browser.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

type Day = { y: number; m: number; d: number }

function parseDay(iso: string | null | undefined): Day | null {
  if (!iso) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return null
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return { y, m, d }
}

/** "Sep 16". Falls back to the raw string when it is not an ISO day. */
export function formatDay(iso: string | null | undefined): string {
  const day = parseDay(iso)
  if (!day) return iso ?? ""
  return `${MONTHS[day.m - 1]} ${day.d}`
}

/** Aim's email format: "Sep 21 to Sep 28, 2026", "Dec 28, 2026 to Jan 4, 2027". */
export function formatRange(start: string, end: string): string {
  const a = parseDay(start)
  const b = parseDay(end)
  if (!a || !b) return [start, end].filter(Boolean).join(" to ")
  if (a.y !== b.y) return `${MONTHS[a.m - 1]} ${a.d}, ${a.y} to ${MONTHS[b.m - 1]} ${b.d}, ${b.y}`
  return `${MONTHS[a.m - 1]} ${a.d} to ${MONTHS[b.m - 1]} ${b.d}, ${b.y}`
}

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 })

export function formatNumber(n: number): string {
  return numberFormat.format(n)
}

/** Two digit thread number, as in the email: 01, 02. */
export function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

export function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
