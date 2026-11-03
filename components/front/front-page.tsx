"use client"

import { useState } from "react"
import type { Current, Item } from "@/lib/brief/types"
import type { PageView } from "@/lib/view/model"
import type { FrontPage as FrontModel, Hook } from "@/lib/front/front-page"
import { Figure } from "@/components/figures/figure"
import type { Reading } from "@/components/reader/reading-panel"

// The one-screen front page. Five sections, each its own component, so any one
// can be removed by deleting one line in <FrontPage>. The layout closes the gap.
// Calm by default: no source counts, ids or dates here. They live in the reading panel.

type Open = (r: Reading) => void

export const ALSO_ROWS = 4

export function FrontPage({
  view,
  fp,
  also,
  onOpen,
  stacked,
}: {
  view: PageView
  fp: FrontModel
  also: Item[]
  onOpen: Open
  // Phone and tablet portrait: sections open in place instead of in the reading panel.
  stacked: boolean
}) {
  return (
    <div className="fp" data-front data-fit="front page">
      {view.emptyFallback ? (
        <p className="notice" role="status">
          {view.emptyFallback.notice}
        </p>
      ) : null}
      <div className="fp__row fp__row--hero">
        <Lead view={view} fp={fp} onOpen={onOpen} />
        <Takeaways fp={fp} onOpen={onOpen} />
      </div>
      <Threads threads={fp.threads} onOpen={onOpen} />
      <div className="fp__row fp__row--base">
        <AlsoThisWeek items={also} onOpen={onOpen} inPlace={stacked} />
        <FigureOfTheWeek hook={fp.hook} onOpen={onOpen} />
      </div>
    </div>
  )
}

/** The verdict as the headline, and one way in. */
function Lead({ view, fp, onOpen }: { view: PageView; fp: FrontModel; onOpen: Open }) {
  const first = fp.order[0]
  const threads = fp.threads.length
  return (
    <section className="fp__lead" aria-labelledby="fp-verdict">
      <p className="eyebrow fp__kicker">Your market brief</p>
      <h1 className="fp__verdict" id="fp-verdict">
        {view.verdict}
      </h1>
      <div className="fp__start">
        {first ? (
          <button type="button" className="fp__btn" onClick={() => onOpen({ kind: "story", key: first.key })}>
            Start reading
          </button>
        ) : null}
        <span className="fp__count">
          {threads > 0 ? `${threads} ${threads === 1 ? "thread" : "threads"} · ` : ""}
          {view.readingMinutes} min
        </span>
      </div>
    </section>
  )
}

/** The two "what it means" lines. Each opens the story it comes from. */
function Takeaways({ fp, onOpen }: { fp: FrontModel; onOpen: Open }) {
  if (fp.takeaways.length === 0) return null
  return (
    <section className="fp__means" aria-labelledby="fp-means-t">
      <h2 className="eyebrow fp__label" id="fp-means-t">
        What it means for you
      </h2>
      <ol className="tk">
        {fp.takeaways.map((t) => (
          <li key={t.item.key} className="tk__item">
            <p className="tk__text">{t.text}</p>
            <button type="button" className="tk__why" onClick={() => onOpen({ kind: "story", key: t.item.key })}>
              Read why: <span>{t.item.headline}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** The currents as compact cards: status, age, one line. */
function Threads({ threads, onOpen }: { threads: Current[]; onOpen: Open }) {
  if (threads.length === 0) return null
  return (
    <section className="fp__threads" aria-labelledby="fp-threads-t">
      <div className="fp__head">
        <h2 className="eyebrow fp__label" id="fp-threads-t">
          Threads you follow
        </h2>
        <span className="fp__hint">Open a thread to read it</span>
      </div>
      <ul className="cards" style={{ ["--n" as string]: threads.length }}>
        {threads.map((c) => (
          <li key={c.label}>
            <button type="button" className="card" onClick={() => onOpen({ kind: "thread", label: c.label })}>
              <span className="card__meta">
                <span className={`card__status card__status--${c.status}`}>
                  <span className="card__dot" aria-hidden="true" />
                  {c.status === "other" ? c.statusRaw.replace(/_/g, " ") : c.status === "carried" ? "carried over" : c.status}
                </span>
                {c.sinceLabel ? <span className="card__age">{c.sinceLabel}</span> : null}
              </span>
              <span className="card__label">{c.label}</span>
              <span className="card__line">{c.line}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Stories outside the threads, a few rows, then the rest as one line. */
function AlsoThisWeek({ items, onOpen, inPlace }: { items: Item[]; onOpen: Open; inPlace: boolean }) {
  const [all, setAll] = useState(false)
  if (items.length === 0) return null
  const shown = all ? items : items.slice(0, ALSO_ROWS)
  const rest = items.length - shown.length
  return (
    <section className="fp__also" aria-labelledby="fp-also-t">
      <h2 className="eyebrow fp__label" id="fp-also-t">
        Also this week
      </h2>
      <ul className="also">
        {shown.map((i) => (
          <li key={i.key}>
            <button type="button" className="also__row" onClick={() => onOpen({ kind: "story", key: i.key })} title={i.headline}>
              <span className="also__text">{i.headline}</span>
              {/* Short area names (SpaceX, NewSpace) help, long question-style areas add noise. */}
              {i.scope && i.scope !== "Other" && i.scope.length <= 24 ? <span className="also__scope">{i.scope}</span> : null}
            </button>
          </li>
        ))}
        {rest > 0 ? (
          <li>
            <button
              type="button"
              className="also__row also__more"
              aria-expanded={inPlace ? false : undefined}
              onClick={() => (inPlace ? setAll(true) : onOpen({ kind: "more" }))}
            >
              <span className="also__text">{rest} more this week</span>
              <Arrow />
            </button>
          </li>
        ) : all && items.length > ALSO_ROWS ? (
          <li>
            <button type="button" className="also__row also__more also__less" aria-expanded onClick={() => setAll(false)}>
              <span className="also__text">Show fewer</span>
            </button>
          </li>
        ) : null}
      </ul>
    </section>
  )
}

/**
 * Exactly one figure: the top story's (else the first story with one).
 * "Read the story" is the link, stretched over the whole section, so the figure
 * stays plain readable content and the panel is one click target.
 */
function FigureOfTheWeek({ hook, onOpen }: { hook: Hook | null; onOpen: Open }) {
  if (!hook) return null
  return (
    <section className="fp__figure" aria-labelledby="fp-fig-t">
      <div className="fp__head">
        <h2 className="eyebrow fp__label" id="fp-fig-t">
          {hook.fromTopStory ? "From the top story" : "Figure of the week"}
        </h2>
        <button type="button" className="hook__open" onClick={() => onOpen({ kind: "story", key: hook.item.key })} title={hook.item.headline}>
          Read the story <Arrow />
        </button>
      </div>
      <div className="hook">
        <Figure figure={hook.figure} variant="hook" />
      </div>
    </section>
  )
}

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 7h8M7.5 3.5 11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
