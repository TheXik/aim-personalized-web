import type { Citation, Figure, Item, Link } from "@/lib/brief/types"
import type { PageView, SectionView } from "@/lib/view/model"
import { formatDay, formatRange } from "@/components/brief/format"

// "Copy for your agent": the reader's current view as clean Markdown for their own AI agent.
// Pure function of the view model. Every word comes from the brief, an allowlisted
// label or fixed copy below. No model call, so it works when the model is down.

export type AgentMarkdownInput = {
  view: PageView
  // Code-written labels of saved settings that are not filters or pins
  // (see components/brief/setting-chips.ts), e.g. "Grouped by company".
  settings?: string[]
}

const STATUS: Record<string, string> = { new: "New", updated: "Updated", carried: "Carried over" }

export function toAgentMarkdown({ view, settings = [] }: AgentMarkdownInput): string {
  const out: string[] = []
  const range = formatRange(view.periodStart, view.periodEnd)
  out.push(`This is my weekly market brief from Aim for ${range}. Use only the facts below and cite the links when you answer.`)

  out.push(`# ${inline(view.title)}`)
  if (!view.titleIsVerdict) out.push(inline(view.verdict))

  if (view.currents && view.currents.length > 0) {
    out.push(`## ${inline(view.titles.currents.title)}`)
    out.push(
      view.currents
        .map((c, i) => {
          const meta = [statusText(c.status, c.statusRaw), c.sinceLabel].filter(Boolean).join(", ")
          return `${i + 1}. **${inline(c.label)}**${meta ? ` (${meta})` : ""}: ${inline(c.line)}`
        })
        .join("\n"),
    )
  }

  if (view.emptyFallback) out.push(`> ${inline(view.emptyFallback.notice)}`)
  const sections = view.emptyFallback ? view.emptyFallback.sections : view.sections
  for (const s of sections) out.push(...section(s, view))

  out.push("---")
  out.push(settingsLine(view, settings))
  return out.filter((block) => block.trim() !== "").join("\n\n") + "\n"
}

function section(s: SectionView, view: PageView): string[] {
  const blocks: string[] = [`## ${inline(s.title)}`]
  if (s.items.length === 0) {
    if (s.emptyNote) blocks.push(`_${inline(s.emptyNote)}_`)
    return blocks
  }
  const oneLiners: string[] = []
  const flush = () => {
    if (oneLiners.length) blocks.push(oneLiners.splice(0).join("\n"))
  }
  for (const item of s.items) {
    if (item.tier === "one_liner") {
      oneLiners.push(oneLiner(item, view))
      continue
    }
    flush()
    blocks.push(story(item, view))
  }
  flush()
  return blocks
}

function story(item: Item, view: PageView): string {
  const { parts } = view
  const lines: string[] = [`### ${inline(item.headline)}`, meta(item)]
  const paragraphs =
    parts.paragraphs === "none" ? [] : parts.paragraphs === "first" ? item.paragraphs.slice(0, 1) : item.paragraphs
  const body: string[] = [lines.join("\n")]
  if (parts.means && item.means) body.push(`**What it means:** ${inline(item.means)}`)
  for (const p of paragraphs) body.push(inline(p))
  if (item.figure && parts.figures !== "hide") body.push(figure(item.figure))
  if (parts.sources && item.sources.length > 0) body.push(`Sources: ${sourceLinks(item.sources)}`)
  if (view.updates !== null && item.updates.length > 0) body.push(updates(item.updates))
  return body.join("\n\n")
}

function oneLiner(item: Item, view: PageView): string {
  const date = item.date ? `${formatDay(item.date)}: ` : ""
  const status = statusText(item.status, item.statusRaw)
  const src = view.parts.sources && item.sources.length > 0 ? ` (${sourceLinks(item.sources)})` : ""
  return `- ${date}${inline(item.headline)}${status ? ` _${status}_` : ""}${src}`
}

function meta(item: Item): string {
  const bits = [
    statusText(item.status, item.statusRaw),
    item.date ? formatDay(item.date) : null,
    item.scope ? `Area: ${inline(item.scope)}` : null,
    item.current ? `Thread: ${inline(item.current)}` : null,
  ].filter(Boolean)
  return `_${bits.join(" · ")}_`
}

function statusText(status: string, raw: string): string {
  return STATUS[status] ?? (raw ? raw.replace(/_/g, " ") : "")
}

function sourceLinks(links: Link[]): string {
  return links.map((l, i) => `[${i + 1}](${l.href})`).join(", ")
}

function updates(list: Citation[]): string {
  const rows = list.map((u) => {
    const sub = u.subtitle ? `, ${inline(u.subtitle)}` : ""
    const date = u.date ? ` (${formatDay(u.date)})` : ""
    return `- [${linkText(u.title)}](${u.href})${sub}${date}`
  })
  return ["Read the updates:", ...rows].join("\n")
}

// ---------- Figures ----------

export function figure(f: Figure): string {
  const head = `**${inline(f.block.head ?? "Figure")}**`
  switch (f.type) {
    case "timeline": {
      const lines = [head]
      if (f.block.lead) lines.push(inline(f.block.lead))
      lines.push(
        f.block.points
          .map((p) => {
            const link = p.update_id && /^(sig|upd)_[A-Za-z0-9]+$/.test(p.update_id) ? ` ([source](https://app.startaiming.com/o/${p.update_id}))` : ""
            return `- ${formatDay(p.date)}: ${inline(p.text)}${link}`
          })
          .join("\n"),
      )
      return lines.join("\n\n")
    }
    case "chart": {
      const b = f.block
      const lines = [head]
      const caption = [b.title, b.unit ? `in ${b.unit}` : null].filter(Boolean).join(", ")
      if (caption) lines.push(`_${inline(caption)}_`)
      if (b.lead) lines.push(inline(b.lead))
      const hasNote = b.data.some((d) => d.note)
      const header = ["Item", b.unit ? `Value (${b.unit})` : "Value", ...(hasNote ? ["Note"] : [])]
      const rows = b.data.map((d) => [
        d.highlight ? `**${d.label}**` : d.label,
        String(d.value),
        ...(hasNote ? [d.note ?? ""] : []),
      ])
      lines.push(table(header, rows))
      if (b.foot) lines.push(`_${inline(b.foot)}_`)
      return lines.join("\n\n")
    }
    case "table": {
      const b = f.block
      const lines = [head]
      if (b.title) lines.push(`_${inline(b.title)}_`)
      if (b.lead) lines.push(inline(b.lead))
      const marks = b.cols.map(
        (_, j) => j > 0 && b.rows.some((r) => isCheck(r.cells[j]?.text)) && b.rows.every((r) => isCheck(r.cells[j]?.text) || !r.cells[j]?.text.trim()),
      )
      const rows = b.rows.map((r) =>
        b.cols.map((_, j) => {
          const t = r.cells[j]?.text ?? ""
          return marks[j] ? (isCheck(t) ? "Yes" : "No") : t
        }),
      )
      lines.push(table(b.cols, rows))
      return lines.join("\n\n")
    }
    case "comparison": {
      const b = f.block
      const lines = [head]
      if (b.lead) lines.push(inline(b.lead))
      for (const side of [b.them, b.us]) {
        lines.push(`${inline(side.name)}:\n${side.points.map((p) => `- ${inline(p.text)}`).join("\n")}`)
      }
      return lines.join("\n\n")
    }
    default:
      return head
  }
}

const isCheck = (t: string | undefined) => !!t && /^[✓✔︎✅]+$/u.test(t.trim())

function table(header: string[], rows: string[][]): string {
  const esc = (s: string) => inline(s).replace(/\|/g, "\\|") || " "
  return [
    `| ${header.map(esc).join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${header.map((_, j) => esc(r[j] ?? "")).join(" | ")} |`),
  ].join("\n")
}

// ---------- Settings footer ----------

function settingsLine(view: PageView, settings: string[]): string {
  const sections = view.emptyFallback ? view.emptyFallback.sections : view.sections
  const chips = [
    ...view.directives.map((d) => {
      const note =
        d.state === "expired" ? "last week only" : d.state === "inactive" ? "not in this week's brief" : d.kind === "filter" && d.hidden > 0 ? `hides ${d.hidden}` : null
      return note ? `${d.summary} (${note})` : d.summary
    }),
    ...settings,
  ]
  const lines: string[] = []
  if (view.isDefault && chips.length === 0) {
    lines.push("My view settings: Aim's default view. Nothing is hidden.")
  } else {
    lines.push(`My view settings: ${chips.length ? chips.join(", ") : "changed from the default"}.`)
    const hidden = sections.filter((s) => s.hiddenCount > 0).map((s) => `${s.title} ${s.hiddenCount}`)
    lines.push(
      view.hiddenTotal > 0
        ? `Hidden by my settings: ${view.hiddenTotal} ${view.hiddenTotal === 1 ? "item" : "items"}${hidden.length ? ` (${hidden.join(", ")})` : ""}. They are not in this copy.`
        : "Nothing is hidden by my settings.",
    )
  }
  if (view.settingsNote) lines.push(view.settingsNote)
  return lines.join("\n")
}

// ---------- Text ----------

// Brief text is plain text. Keep it on one line and stop it from starting Markdown blocks.
function inline(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim().replace(/^([#>]|\d+\.\s|[-*+]\s)/, "\\$1")
}

function linkText(s: string): string {
  return inline(s).replace(/([[\]])/g, "\\$1")
}
