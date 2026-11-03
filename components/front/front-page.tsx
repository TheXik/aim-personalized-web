"use client"

import { useEffect, useRef, useState } from "react"
import type { HTMLAttributes, ReactNode } from "react"
import type { Current, Item } from "@/lib/brief/types"
import type { PageView } from "@/lib/view/model"
import type { FrontPage as FrontModel, Hook } from "@/lib/front/front-page"
import { Figure } from "@/components/figures/figure"
import { Sources, type Reading } from "@/components/reader/reading-panel"
import { StatusMark } from "@/components/brief/kicker"
import { formatDay } from "@/components/brief/format"

// The one-screen front page. Five sections, each its own component, so any one
// can be removed by deleting one line in <FrontPage>. The layout closes the gap.
// Calm by default: no source counts, ids or dates here. They live in the reading panel.

type Open = (r: Reading) => void

// Three rows, so headlines can wrap to a second line instead of being cut, and the page still fits.
export const ALSO_ROWS = 3

export function FrontPage({
  view,
  fp,
  also,
  onOpen,
  inert,
}: {
  view: PageView
  fp: FrontModel
  also: Item[]
  onOpen: Open
  // While the reading panel is open the page behind it is out of reach for keyboard and screen readers.
  inert: boolean
}) {
  return (
    <div className="fp" data-front data-fit="front page" inert={inert || undefined}>
      <div className="fp__row fp__row--hero">
        <Lead view={view} fp={fp} onOpen={onOpen} />
        <Takeaways fp={fp} onOpen={onOpen} />
      </div>
      <Threads
        threads={fp.threads}
        order={fp.order}
        title={view.titles.currents.source === "reader" ? view.titles.currents.title : "This week's currents"}
        onOpen={onOpen}
      />
      <div className="fp__row fp__row--base">
        <AlsoThisWeek
          items={also}
          groupOf={fp.groupOf}
          title={fp.alsoTitle ?? (fp.grouped && groupsShown(also, fp.groupOf) >= 2 ? `Also this week, by ${groupWord(view)}` : "Also this week")}
          foldOneLiners={view.parts.oneLiners === "collapsed"}
          threads={fp.threads}
          onOpen={onOpen}
        />
        <FigureOfTheWeek hook={fp.hook} onOpen={onOpen} />
      </div>
    </div>
  )
}

/** The verdict as the headline, and one way in. */
/** The verdict is an h1 only when it is also the title (empty subject), else a paragraph under the title. */
function VerdictTag({ asTitle, children, ...rest }: { asTitle: boolean; children: ReactNode } & HTMLAttributes<HTMLElement> & { "data-more"?: string }) {
  return asTitle ? <h1 {...rest}>{children}</h1> : <p {...rest}>{children}</p>
}

function Lead({ view, fp, onOpen }: { view: PageView; fp: FrontModel; onOpen: Open }) {
  const first = fp.order[0]
  const threads = fp.threads.length
  const items = fp.order.length
  // On a phone only the first sentence shows, the rest is one tap away (CSS hides it on wide screens never).
  const [more, setMore] = useState(false)
  const [lead, rest] = splitFirstSentence(view.verdict)
  return (
    <section className="fp__lead" aria-labelledby={view.titleIsVerdict ? "fp-verdict" : "fp-title"}>
      {/* The brief's subject is the title. When it is empty, the verdict is the title. */}
      {view.titleIsVerdict ? null : (
        <h1 className="fp__title" id="fp-title">
          {view.title}
        </h1>
      )}
      <VerdictTag asTitle={view.titleIsVerdict} className="fp__verdict" id="fp-verdict" data-more={more ? "open" : undefined}>
        {lead}
        {rest ? <span className="fp__verdict-rest"> {rest}</span> : null}
      </VerdictTag>
      {rest && !more ? (
        <button type="button" className="fp__verdict-more" onClick={() => setMore(true)}>
          Read the full summary
        </button>
      ) : null}
      <div className="fp__start">
        {first ? (
          <button type="button" className="fp__btn" onClick={() => onOpen({ kind: "story", key: first.key })}>
            Start reading
          </button>
        ) : null}
        {/* When the reader's filters leave nothing, the notice takes the count's place (no extra height). */}
        {view.emptyFallback ? (
          <p className="fp__notice" role="status">
            {view.emptyFallback.notice}
          </p>
        ) : (
          <span className="fp__count">
            {threads > 0 ? `${threads} ${threads === 1 ? "current" : "currents"} · ` : ""}
            {items} {items === 1 ? "story" : "stories"}
          </span>
        )}
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
function Threads({ threads, order, title, onOpen }: { threads: Current[]; order: Item[]; title: string; onOpen: Open }) {
  if (threads.length === 0) return null
  const visible = new Set(order.map((i) => i.key))
  return (
    <section className="fp__threads" aria-labelledby="fp-threads-t">
      <div className="fp__head">
        <h2 className="eyebrow fp__label" id="fp-threads-t">
          {title}
        </h2>
        <span className="fp__hint">Open a current to read it</span>
      </div>
      <ul className="cards" style={{ ["--n" as string]: threads.length }}>
        {threads.map((c) => {
          // A thread with one story opens that story straight away, no empty in-between panel.
          const stories = c.itemKeys.filter((k) => visible.has(k))
          const target: Reading = stories.length === 1 ? { kind: "story", key: stories[0] } : { kind: "thread", label: c.label }
          return (
          <li key={c.label}>
            <button type="button" className="card" onClick={() => onOpen(target)}>
              <span className="card__meta">
                <span className={`card__status card__status--${c.status}`}>
                  <span className="card__dot" aria-hidden="true" />
                  {threadStatus(c)}
                </span>
                {threadAge(c) ? (
                  <span className="card__age" title={`Running ${threadAge(c)}`}>
                    {threadAge(c)}
                  </span>
                ) : null}
              </span>
              <span className="card__label">{c.label}</span>
              <span className="card__line">{c.line}</span>
            </button>
          </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * Everything the takeaways and the thread cards do not lead to. A one-liner is the whole
 * story in one sentence, so it opens in place like a dropdown with its date, area and
 * sources. Longer stories open in the reading panel. "N more" opens in place too, and the
 * list scrolls inside itself, so the page never grows.
 */
function AlsoThisWeek({
  items,
  groupOf,
  title,
  foldOneLiners,
  threads,
  onOpen,
}: {
  items: Item[]
  groupOf: Record<string, string>
  title: string
  foldOneLiners: boolean
  threads: Current[]
  onOpen: Open
}) {
  const [all, setAll] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const list = useRef<HTMLUListElement>(null)
  // A soft fade at the bottom while the list has more below (no visible scrollbar on the front page).
  useEffect(() => {
    const el = list.current
    if (!el) return
    const update = () => el.toggleAttribute("data-more", el.scrollTop + el.clientHeight < el.scrollHeight - 2)
    update()
    el.addEventListener("scroll", update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", update)
      ro.disconnect()
    }
  }, [open, all, items.length])
  if (items.length === 0) return null
  // Folded one-liners (a saved setting) stay behind the count until the reader asks for them.
  const rows = foldOneLiners && !all ? items.filter((i) => i.tier !== "one_liner") : items
  // Collapsing a single row saves nothing, so show it instead.
  const shown = all || rows.length <= ALSO_ROWS + 1 ? rows : rows.slice(0, ALSO_ROWS)
  const rest = items.length - shown.length
  const restLabel = foldOneLiners && !all && rest === items.length - rows.length ? `${rest} one-liners this week` : `${rest} more this week`
  const threadLabels = new Set(threads.map((t) => t.label))
  return (
    <section className="fp__also" aria-labelledby="fp-also-t">
      <h2 className="eyebrow fp__label" id="fp-also-t">
        {title}
      </h2>
      <ul className="also" data-fit="also list" ref={list}>
        {shown.map((i) => {
          // Grouped views show the group (company, area). Otherwise a short area name helps,
          // long question-style areas add noise.
          const tag = groupOf[i.key] ?? (i.scope && i.scope !== "Other" && i.scope.length <= 24 ? i.scope : null)
          const inline = i.tier === "one_liner"
          const expanded = open === i.key
          const detailId = `also-${i.index}`
          return (
            <li key={i.key} className={expanded ? "is-open" : undefined}>
              <button
                type="button"
                className="also__row"
                aria-expanded={inline ? expanded : undefined}
                aria-controls={inline ? detailId : undefined}
                onClick={() => (inline ? setOpen(expanded ? null : i.key) : onOpen({ kind: "story", key: i.key }))}
              >
                <span className="also__text">{i.headline}</span>
                {tag ? <span className={groupOf[i.key] ? "also__scope also__group" : "also__scope"}>{tag}</span> : null}
                {inline ? <Chevron /> : <Arrow />}
              </button>
              {inline && expanded ? (
                <div className="also__detail" id={detailId}>
                  <span className="also__meta">
                    <StatusMark status={i.status} raw={i.statusRaw} />
                    {i.date ? <span>{formatDay(i.date)}</span> : null}
                    {i.scope && i.scope !== "Other" ? <span className="also__area">{i.scope}</span> : null}
                  </span>
                  {i.current && threadLabels.has(i.current) ? (
                    <button type="button" className="linkbtn also__thread" onClick={() => onOpen({ kind: "thread", label: i.current as string })}>
                      Part of “{i.current}”
                    </button>
                  ) : null}
                  {i.sources.length > 0 ? <Sources links={i.sources} /> : null}
                </div>
              ) : null}
            </li>
          )
        })}
        {rest > 0 ? (
          <li>
            <button type="button" className="also__row also__more" aria-expanded={false} onClick={() => setAll(true)}>
              <span className="also__text">{restLabel}</span>
              <Chevron />
            </button>
          </li>
        ) : all && items.length > ALSO_ROWS + 1 ? (
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

function Chevron() {
  return (
    <svg className="also__chev" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function groupsShown(items: Item[], groupOf: Record<string, string>): number {
  return new Set(items.map((i) => groupOf[i.key]).filter(Boolean)).size
}

/** "New", "Updated this week", "Carried over": what changed this week, in words. */
function threadStatus(c: Current): string {
  if (c.status === "new") return c.sinceLabel === "this week" ? "New this week" : "New"
  if (c.status === "updated") return "Updated this week"
  if (c.status === "carried") return "Carried over"
  return c.statusRaw.replace(/_/g, " ")
}

/** The thread's age as Aim's email writes it ("two weeks"). Hidden when it only says "this week". */
function threadAge(c: Current): string | null {
  if (!c.sinceLabel || c.sinceLabel === "this week") return null
  return c.sinceLabel
}

/** Splits the verdict after its first sentence. The words stay exactly as the brief wrote them. */
export function splitFirstSentence(text: string): [string, string] {
  const m = /^(.+?[.!?])\s+(?=[A-Z“"‘'0-9])/.exec(text)
  if (!m) return [text, ""]
  return [m[1], text.slice(m[0].length)]
}

function groupWord(view: PageView): string {
  const source = view.sections.find((s) => s.kind === "group")?.titleSource
  return source === "company" ? "company" : "area"
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
          {hook.figure.scope === "current" && hook.item.current
            ? "The top story's current"
            : hook.fromTopStory
              ? "From the top story"
              : "Figure of the week"}
        </h2>
        <button type="button" className="hook__open" onClick={() => onOpen({ kind: "story", key: hook.item.key })} title={hook.item.headline}>
          Open the story ›
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
