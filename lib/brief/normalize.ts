import { RawBriefFile, type RawCitation, type RawItem, type TagsFile } from "./schema"
import type { Brief, Citation, Current, Figure, Item, Link, StatusKind, Tier } from "./types"
import { TIERS } from "./types"
import { fold, hasNumberText, headlineHash, wordCount } from "./text"

export const AIM_APP = "https://app.startaiming.com/o/"
const ID_RE = /^(sig|upd)_[A-Za-z0-9]+$/

// Links are built in code and only for ids of the expected shape.
export function linkFor(id: string): Link | null {
  return ID_RE.test(id) ? { id, href: AIM_APP + id } : null
}

function statusKind(raw: string): StatusKind {
  const s = fold(raw)
  if (s === "new") return "new"
  if (s === "updated") return "updated"
  if (s.includes("carr")) return "carried"
  return "other"
}

function tierOf(raw: string): Tier {
  return (TIERS as readonly string[]).includes(raw) ? (raw as Tier) : "one_liner"
}

function figureOf(raw: RawItem["figure"]): Figure | null {
  if (!raw) return null
  const scope = raw.scope === "current" ? "current" : "item"
  const b = raw.block
  switch (b.t) {
    case "timeline":
    case "chart":
    case "table":
    case "comparison":
      return { type: b.t, scope, block: b } as Figure
    default:
      return { type: "unknown", scope, block: b } as Figure
  }
}

// Human-readable figure text only. Never ids, keys or JSON, so an id such as
// "upd_x4M" cannot look like "4M" to the number test.
export function figureText(f: Figure | null): string {
  if (!f) return ""
  const parts: (string | null | undefined)[] = [f.block.head]
  switch (f.type) {
    case "timeline":
      parts.push(f.block.lead, ...f.block.points.map((p) => p.text))
      break
    case "chart":
      parts.push(f.block.title, f.block.lead, f.block.foot)
      for (const d of f.block.data) parts.push(`${d.label} ${d.value} ${f.block.unit ?? ""}`, d.note)
      break
    case "table":
      parts.push(f.block.title, f.block.lead, ...f.block.cols, ...f.block.rows.flatMap((r) => r.cells.map((c) => c.text)))
      break
    case "comparison":
      parts.push(f.block.lead, f.block.them.name, f.block.us.name, ...f.block.them.points.map((p) => p.text), ...f.block.us.points.map((p) => p.text))
      break
  }
  return parts.filter(Boolean).join(" ")
}

function citationOf(c: RawCitation): Citation | null {
  const link = linkFor(c.id)
  if (!link) return null
  const sev = c.severityLevel
  return {
    id: c.id,
    href: link.href,
    title: c.title,
    subtitle: c.subtitle ?? null,
    date: c.date ?? null,
    sourceCount: c.sourceCount,
    severity: sev === "green" || sev === "orange" || sev === "red" ? sev : "other",
  }
}

const dedupeLinks = (ids: string[]): Link[] => {
  const seen = new Set<string>()
  const out: Link[] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    const l = linkFor(id)
    if (l) out.push(l)
  }
  return out
}

// First company in headline order, then in body order.
function primaryCompanyOf(companies: string[], headline: string, body: string): string | null {
  if (companies.length === 0) return null
  const pos = (c: string) => {
    const h = fold(headline).indexOf(fold(c))
    if (h >= 0) return h
    const b = fold(body).indexOf(fold(c))
    return b >= 0 ? 100_000 + b : 1_000_000
  }
  return [...companies].sort((a, b) => pos(a) - pos(b))[0]
}

export function normalizeBrief(input: unknown, tagsInput?: TagsFile | null): Brief {
  const raw = RawBriefFile.parse(input)
  const { recap } = raw
  const doc = recap.doc

  const tags = tagsInput && tagsInput.recap_hash === headlineHash(recap.id) ? tagsInput : null
  const tagsByIndex = new Map<number, string[]>()
  if (tags) {
    for (const t of tags.items) {
      const item = doc.items[t.index]
      if (item && headlineHash(item.headline) === t.headline_hash) tagsByIndex.set(t.index, t.companies)
    }
  }

  const scopeName = new Map(raw.scopes.map((s) => [s.id, s.name]))
  const citations = raw.citations.map(citationOf).filter((c): c is Citation => c !== null)
  const citationById = new Map(citations.map((c) => [c.id, c]))

  const items: Item[] = doc.items.map((it, index) => {
    const tier = tierOf(it.tier)
    const paragraphs = tier === "one_liner" && it.paragraphs.length > 0 && fold(it.paragraphs[0]) === fold(it.headline)
      ? it.paragraphs.slice(1)
      : it.paragraphs
    const figure = figureOf(it.figure)
    const companies = tagsByIndex.get(index) ?? []
    const body = paragraphs.join(" ")
    return {
      key: `${recap.id}:${index}`,
      index,
      tier,
      status: statusKind(it.status),
      statusRaw: it.status,
      headline: it.headline,
      paragraphs,
      means: it.means ?? null,
      date: it.date ?? null,
      current: it.current ?? null,
      scope: (it.scope_id && scopeName.get(it.scope_id)) || "Other",
      scopeId: it.scope_id ?? null,
      companies,
      primaryCompany: primaryCompanyOf(companies, it.headline, body),
      // A bar chart is numeric data by definition. Otherwise the strict text test.
      hasNumber: figure?.type === "chart" || hasNumberText([it.headline, body, figureText(figure)].join(" ")),
      figure,
      sources: dedupeLinks([...it.cited_update_ids, ...it.cited_signal_ids]),
      updates: it.read_update_ids.map((id) => citationById.get(id)).filter((c): c is Citation => !!c),
    }
  })

  // Display order: detail, brief, one_liner. JSON order inside a tier.
  items.sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a.index - b.index)

  const currents: Current[] = doc.currents.map((c, index) => {
    const own = items.filter((i) => i.current === c.label)
    const fig = own.find((i) => i.figure?.scope === "current")?.figure ?? null
    return {
      index,
      label: c.label,
      line: c.line,
      status: statusKind(c.status),
      statusRaw: c.status,
      since: c.since ?? null,
      sinceLabel: c.since_label ?? null,
      sources: dedupeLinks(c.cited_signal_ids),
      itemKeys: own.map((i) => i.key),
      figure: fig,
    }
  })

  const words =
    wordCount(doc.verdict) +
    doc.currents.reduce((n, c) => n + wordCount(c.label) + wordCount(c.line), 0) +
    items.reduce((n, i) => n + wordCount(i.headline) + wordCount(i.paragraphs.join(" ")) + wordCount(i.means ?? ""), 0)

  const subject = doc.subject.trim()
  return {
    recapId: recap.id,
    periodStart: recap.period_start,
    periodEnd: recap.period_end,
    title: subject || doc.verdict,
    titleIsVerdict: !subject,
    verdict: doc.verdict,
    currents,
    items,
    citations,
    scopes: raw.scopes,
    readingMinutes: Math.max(1, Math.round(words / 230)),
    hasTags: tags !== null,
  }
}
