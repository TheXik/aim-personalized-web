"use client"

import type { Citation, Item, Link } from "@/lib/brief/types"
import type { Layout, Parts } from "@/lib/view/spec"
import { Figure } from "@/components/figures/figure"
import { formatDay } from "./format"
import { Kicker } from "./kicker"
import { domIdForItem, useReading } from "./ui-state"

type Opts = { parts: Parts; layout: Layout; showUpdates: boolean; showScope: boolean }

/**
 * A detail or brief item. The headline and the "what it means" line are always
 * visible. Paragraphs, the figure and the sources open in place (one level only).
 */
export function ItemCard({ item, parts, layout, showUpdates, showScope }: { item: Item } & Opts) {
  const { isOpen, setOpen, thread } = useReading()
  const compact = layout.items === "compact"
  const open = isOpen(item.key, compact ? "one_liner" : item.tier)
  const marked = thread !== null && item.current === thread
  const paragraphs =
    parts.paragraphs === "none" ? [] : parts.paragraphs === "first" ? item.paragraphs.slice(0, 1) : item.paragraphs
  const figure = parts.figures === "hide" ? null : item.figure
  const figureFirst = layout.figures === "prominent"
  const hasBody = paragraphs.length > 0 || !!figure || (parts.sources && item.sources.length > 0)
  const bodyId = `${domIdForItem(item.index)}-body`

  const cls = [
    "item",
    `item--${item.tier}`,
    compact ? "item--compact" : "",
    open ? "is-open" : "",
    marked ? "is-marked" : "",
    figureFirst ? "layout-prominent" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <article id={domIdForItem(item.index)} className={cls} aria-labelledby={`${domIdForItem(item.index)}-h`}>
      <Kicker
        current={item.current}
        status={item.status}
        statusRaw={item.statusRaw}
        date={item.date}
        scope={item.scope}
        sources={item.sources.length}
        showScope={showScope}
      />
      <h3 className="item__headline" id={`${domIdForItem(item.index)}-h`}>
        {hasBody ? (
          <button
            type="button"
            className="item__toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen(item.key, !open)}
          >
            {item.headline}
            <Chevron />
          </button>
        ) : (
          item.headline
        )}
      </h3>

      {figureFirst && figure && open && parts.figures === "show" ? (
        <Figure figure={figure} threadLabel={item.current} />
      ) : null}

      {parts.means && item.means && !compact ? (
        <p className="means">
          <strong>What it means.</strong> {item.means}
        </p>
      ) : null}

      {open && hasBody ? (
        <div className="item__body" id={bodyId}>
          {paragraphs.slice(0, 1).map((p, i) => (
            <p key={i} className="item__p">
              {p}
            </p>
          ))}
          {/* The figure sits after the first paragraph, close to the claim it shows. */}
          {figure && !(figureFirst && parts.figures === "show") ? (
            parts.figures === "collapsed" ? (
              <FigureOnDemand item={item} />
            ) : (
              <Figure figure={figure} threadLabel={item.current} />
            )
          ) : null}
          {paragraphs.slice(1).map((p, i) => (
            <p key={i + 1} className="item__p">
              {p}
            </p>
          ))}
          {parts.sources ? <Sources links={item.sources} /> : null}
          {showUpdates && item.updates.length > 0 ? <ReadTheUpdates updates={item.updates} /> : null}
        </div>
      ) : hasBody ? (
        <button type="button" className="item__more" aria-controls={bodyId} onClick={() => setOpen(item.key, true)}>
          {moreLabel(item, paragraphs.length, !!figure)}
        </button>
      ) : null}
    </article>
  )
}

function moreLabel(item: Item, paragraphs: number, figure: boolean): string {
  const bits: string[] = []
  if (paragraphs > 0) bits.push("Read more")
  if (figure && item.figure) bits.push(FIGURE_WORD[item.figure.type])
  if (bits.length === 0) bits.push("Sources")
  return `${bits.join(" · ")} ↓`
}

const FIGURE_WORD = { timeline: "Timeline", chart: "Chart", table: "Table", comparison: "Before and after", unknown: "Figure" } as const

function FigureOnDemand({ item }: { item: Item }) {
  const { isOpen, setOpen } = useReading()
  const k = `${item.key}:fig`
  if (!item.figure) return null
  return isOpen(k, "one_liner") ? (
    <Figure figure={item.figure} threadLabel={item.current} />
  ) : (
    <button type="button" className="item__more" onClick={() => setOpen(k, true)}>
      Show {FIGURE_WORD[item.figure.type].toLowerCase()} ↓
    </button>
  )
}

export function Sources({ links }: { links: Link[] }) {
  if (links.length === 0) return null
  return (
    <div className="src">
      <span className="eyebrow src__label">Sources</span>
      {links.map((l, i) => (
        <a
          key={l.id}
          className="src__chip"
          href={l.href}
          target="_blank"
          rel="noreferrer"
          title={`${l.id.startsWith("sig_") ? "Signal" : "Update"} ${l.id} in Aim`}
          aria-label={`Source ${i + 1}, opens in Aim`}
        >
          {i + 1}
        </a>
      ))}
    </div>
  )
}

export function ReadTheUpdates({ updates }: { updates: Citation[] }) {
  return (
    <div className="updates">
      <span className="eyebrow">Read the updates</span>
      <ul className="updates__list">
        {updates.map((u) => (
          <li key={u.id}>
            <a className="upd" href={u.href} target="_blank" rel="noreferrer">
              <span className={`upd__sev upd__sev--${u.severity}`} aria-hidden="true" />
              <span className="upd__title">
                {u.title}
                {u.subtitle ? <span className="upd__sub">{u.subtitle}</span> : null}
              </span>
              <span className="upd__meta">
                {formatDay(u.date)}
                {u.sourceCount > 0 ? ` · ${u.sourceCount} src` : ""}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Chevron() {
  return (
    <svg className="item__chev" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
