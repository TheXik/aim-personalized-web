"use client"

import type { Item } from "@/lib/brief/types"
import type { SectionView } from "@/lib/view/model"
import type { Layout, Parts } from "@/lib/view/spec"
import { formatDay, pad2 } from "./format"
import { ItemCard } from "./item"
import { StatusMark } from "./kicker"
import { OneLiners } from "./one-liners"
import { domIdForItem, useReading } from "./ui-state"

export const sectionDomId = (key: string) => `sec-${key.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`

/**
 * One section of the page. Items render by their own tier, so a section grouped
 * by thread or company can mix stories and one-liners. Runs of one-liners become one list.
 */
export function Section({
  section,
  number,
  parts,
  layout,
  showUpdates,
}: {
  section: SectionView
  number: number
  parts: Parts
  layout: Layout
  showUpdates: boolean
}) {
  const { isOpen, setMany, setOpen } = useReading()
  const showScope = !section.key.startsWith("group:scope")
  const openable = section.items.filter((i) => i.tier !== "one_liner" && (i.paragraphs.length > 0 || i.figure))
  const allOpen = openable.length > 0 && openable.every((i) => isOpen(i.key, layout.items === "compact" ? "one_liner" : i.tier))
  const collapsedKey = `${section.key}:collapsed`
  const showCollapsed = section.collapsed && !isOpen(collapsedKey, "one_liner")

  return (
    <section className="sec" id={sectionDomId(section.key)} aria-labelledby={`${sectionDomId(section.key)}-t`}>
      <div className="sec__head">
        <h2 className="sec__title" id={`${sectionDomId(section.key)}-t`}>
          {pad2(number)} · <strong>{section.title}</strong>
          {section.items.length > 0 ? ` · ${section.items.length}` : ""}
        </h2>
        {section.hiddenCount > 0 ? <span className="sec__hidden">{section.hiddenCount} hidden</span> : null}
        {openable.length > 1 && layout.items !== "table" ? (
          <button
            type="button"
            className="linkbtn sec__tool"
            onClick={() =>
              setMany(
                openable.map((i) => i.key),
                !allOpen,
              )
            }
          >
            {allOpen ? "Close all" : "Open all"}
          </button>
        ) : null}
      </div>

      {section.items.length === 0 && section.emptyNote ? <p className="sec__empty">{section.emptyNote}</p> : null}

      {showCollapsed ? (
        <button type="button" className="item__more" onClick={() => setOpen(collapsedKey, true)}>
          Show {section.items.length} {section.items.length === 1 ? "line" : "lines"} ↓
        </button>
      ) : layout.items === "table" ? (
        <ItemTable items={section.items} />
      ) : (
        runs(section.items).map((run) =>
          run.tier === "one_liner" ? (
            <OneLiners key={run.items[0].key} items={run.items} showScope={showScope} />
          ) : (
            run.items.map((it) => (
              <ItemCard key={it.key} item={it} parts={parts} layout={layout} showUpdates={showUpdates} showScope={showScope} />
            ))
          ),
        )
      )}
    </section>
  )
}

function runs(items: Item[]): { tier: "one_liner" | "story"; items: Item[] }[] {
  const out: { tier: "one_liner" | "story"; items: Item[] }[] = []
  for (const it of items) {
    const tier = it.tier === "one_liner" ? "one_liner" : "story"
    const last = out[out.length - 1]
    if (last && last.tier === tier) last.items.push(it)
    else out.push({ tier, items: [it] })
  }
  return out
}

/** The "table" layout: every item as one row, for readers who want to scan. */
function ItemTable({ items }: { items: Item[] }) {
  const { threadNumber } = useReading()
  return (
    <div className="tbl-wrap" role="region" aria-label="Items as a table" tabIndex={0}>
      <table className="itbl">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Headline</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const n = threadNumber(it.current)
            return (
              <tr key={it.key} id={domIdForItem(it.index)}>
                <td className="itbl__meta">{formatDay(it.date)}</td>
                <td>
                  {it.headline}
                  {n ? <span className="itbl__meta"> · {pad2(n)}</span> : null}
                </td>
                <td className="itbl__meta">
                  <StatusMark status={it.status} raw={it.statusRaw} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
