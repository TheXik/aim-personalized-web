"use client"

import { useEffect, useRef, useState } from "react"
import type { Citation, Current, Item, Link } from "@/lib/brief/types"
import type { Parts } from "@/lib/view/spec"
import { Figure } from "@/components/figures/figure"
import { formatDay } from "@/components/brief/format"
import { StatusMark } from "@/components/brief/kicker"

// The reading panel: everything the calm front page leaves out. It slides in over
// the front page on a laptop and is a full-screen sheet on a phone. The front page
// never grows. All metadata (sources, dates, areas) lives here.

// The brief's own tier names, as in Aim's email.
const TIER_NAME = { detail: "In detail", brief: "In brief", one_liner: "Also this week" } as const

export type Reading = { kind: "story"; key: string } | { kind: "thread"; label: string } | { kind: "more" }

export function ReadingPanel({
  reading,
  order,
  threads,
  moreItems,
  parts,
  showUpdates,
  onOpen,
  onClose,
  modal,
}: {
  modal: boolean
  reading: Reading
  order: Item[]
  threads: Current[]
  moreItems: Item[]
  parts: Parts
  showUpdates: boolean
  onOpen: (r: Reading) => void
  onClose: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const storyIndex = reading.kind === "story" ? order.findIndex((i) => i.key === reading.key) : -1
  const story = storyIndex >= 0 ? order[storyIndex] : null
  const thread = reading.kind === "thread" ? (threads.find((t) => t.label === reading.label) ?? null) : null
  const prev = storyIndex > 0 ? order[storyIndex - 1] : null
  const next = storyIndex >= 0 && storyIndex < order.length - 1 ? order[storyIndex + 1] : null
  const viewKey = reading.kind === "story" ? reading.key : reading.kind === "thread" ? `t:${reading.label}` : "more"

  // New content: start at the top and move focus to its heading.
  // Reading progress: a thin line under the header fills as the reader scrolls, and a soft
  // shadow appears only once the content moves under the header. Set as CSS variables, no re-render.
  const onScroll = () => {
    const el = scroller.current
    const p = panel.current
    if (!el || !p) return
    const max = el.scrollHeight - el.clientHeight
    p.style.setProperty("--rp-progress", String(max > 0 ? Math.min(el.scrollTop / max, 1) : 0))
    p.toggleAttribute("data-scrolled", el.scrollTop > 4)
    p.toggleAttribute("data-scrollable", max > 4)
  }

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
    requestAnimationFrame(onScroll)
    heading.current?.focus({ preventScroll: true })
  }, [viewKey])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]")
      if (e.key === "Escape") onClose()
      else if (!typing && e.key === "ArrowRight" && next) onOpen({ kind: "story", key: next.key })
      else if (!typing && e.key === "ArrowLeft" && prev) onOpen({ kind: "story", key: prev.key })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [next, prev, onOpen, onClose])

  const position =
    reading.kind === "story" && storyIndex >= 0
      ? `Story ${storyIndex + 1} of ${order.length}`
      : reading.kind === "thread"
        ? "Current"
        : "More this week"

  return (
    <div className="rp" ref={panel} role="dialog" aria-modal={modal} aria-labelledby="rp-h">
      <div className="rp__bar">
        <span className="rp__pos">{position}</span>
        <span className="rp__spacer" />
        {reading.kind === "story" ? (
          <>
            <button
              type="button"
              className="rp__nav"
              aria-label="Previous story"
              disabled={!prev}
              onClick={() => prev && onOpen({ kind: "story", key: prev.key })}
            >
              <Arrow dir="left" />
            </button>
            <button
              type="button"
              className="rp__nav"
              aria-label="Next story"
              disabled={!next}
              onClick={() => next && onOpen({ kind: "story", key: next.key })}
            >
              <Arrow dir="right" />
            </button>
          </>
        ) : null}
        <button type="button" className="rp__close" aria-label="Close and go back to the front page" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 3l8 8M11 3 3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="rp__scroll" ref={scroller} onScroll={onScroll}>
        {story ? (
          <StoryBody
            story={story}
            parts={parts}
            showUpdates={showUpdates}
            heading={heading}
            threads={threads}
            order={order}
            onOpen={onOpen}
          />
        ) : thread ? (
          <ThreadBody thread={thread} order={order} parts={parts} heading={heading} onOpen={onOpen} index={threads.indexOf(thread)} />
        ) : reading.kind === "more" ? (
          <MoreBody items={moreItems} heading={heading} onOpen={onOpen} />
        ) : (
          <h2 className="rp__headline rp__empty" id="rp-h" ref={heading} tabIndex={-1}>
            This is no longer in your view.
          </h2>
        )}
        {story && next ? (
          <button type="button" className="rp__next" onClick={() => onOpen({ kind: "story", key: next.key })}>
            <span className="rp__nextlabel">Next in this brief</span>
            <span className="rp__nexthl">{next.headline}</span>
            <Arrow dir="right" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function StoryBody({
  story,
  parts,
  showUpdates,
  heading,
  threads,
  order,
  onOpen,
}: {
  story: Item
  parts: Parts
  showUpdates: boolean
  heading: React.RefObject<HTMLHeadingElement | null>
  threads: Current[]
  order: Item[]
  onOpen: (r: Reading) => void
}) {
  const visible = new Set(order.map((i) => i.key))
  const thread = story.current ? threads.find((t) => t.label === story.current) : undefined
  const onlyStory = !!thread && thread.itemKeys.filter((k) => visible.has(k)).length === 1
  const paragraphs = parts.paragraphs === "none" ? [] : parts.paragraphs === "first" ? story.paragraphs.slice(0, 1) : story.paragraphs
  const threadIndex = story.current ? threads.findIndex((t) => t.label === story.current) : -1
  return (
    <article className="rp__story" aria-labelledby="rp-h">
      <p className="eyebrow rp__tier">{TIER_NAME[story.tier]}</p>
      <div className="rp__meta">
        <StatusMark status={story.status} raw={story.statusRaw} />
        {story.date ? <span>{formatDay(story.date)}</span> : null}
        {/* Short area names (SpaceX) work as a kicker. Question-style areas move under the story. */}
        {story.scope && story.scope !== "Other" && story.scope.length <= 24 ? <span className="rp__scope">{story.scope}</span> : null}
      </div>
      <h2 className="rp__headline" id="rp-h" ref={heading} tabIndex={-1}>
        {story.headline}
      </h2>
      {parts.means && story.means ? (
        <p className="means">
          <strong>What it means for you.</strong> {story.means}
        </p>
      ) : null}
      {paragraphs.slice(0, 1).map((p, i) => (
        <p key={i} className="rp__p">
          {p}
        </p>
      ))}
      {story.figure && parts.figures !== "hide" ? <Figure figure={story.figure} threadLabel={story.current} /> : null}
      {paragraphs.slice(1).map((p, i) => (
        <p key={i + 1} className="rp__p">
          {p}
        </p>
      ))}
      {story.current && threadIndex >= 0 ? (
        <button type="button" className="rp__thread" onClick={() => onOpen({ kind: "thread", label: story.current as string })}>
          <span className="eyebrow">Part of current {String(threadIndex + 1).padStart(2, "0")}</span>
          <span className="rp__threadlabel">{story.current}</span>
        </button>
      ) : null}
      {onlyStory ? <p className="rp__note">This current has one story this week.</p> : null}
      {story.scope && story.scope !== "Other" && story.scope.length > 24 ? (
        <p className="rp__area">
          <span className="eyebrow">Your monitoring area</span> {story.scope}
        </p>
      ) : null}
      {parts.sources && story.sources.length > 0 ? <Sources links={story.sources} /> : null}
      {showUpdates && story.updates.length > 0 ? <ReadTheUpdates updates={story.updates} /> : null}
    </article>
  )
}

function ThreadBody({
  thread,
  order,
  parts,
  heading,
  onOpen,
  index,
}: {
  thread: Current
  order: Item[]
  parts: Parts
  heading: React.RefObject<HTMLHeadingElement | null>
  onOpen: (r: Reading) => void
  index: number
}) {
  // A current reads as a timeline: newest first, Aim's order kept on equal dates (the sort is stable).
  const stories = thread.itemKeys
    .map((k) => order.find((i) => i.key === k))
    .filter((x): x is Item => !!x)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
  const hidden = thread.itemKeys.length - stories.length
  return (
    <article className="rp__story" aria-labelledby="rp-h">
      <div className="rp__meta">
        <span className="rp__idx">{String(index + 1).padStart(2, "0")}</span>
        <StatusMark status={thread.status} raw={thread.statusRaw} />
        {thread.sinceLabel ? <span>{thread.sinceLabel}</span> : null}
        {parts.sources && thread.sources.length > 0 ? (
          <span>{thread.sources.length === 1 ? "1 signal" : `${thread.sources.length} signals`}</span>
        ) : null}
      </div>
      <h2 className="rp__headline" id="rp-h" ref={heading} tabIndex={-1}>
        {thread.label}
      </h2>
      <p className="rp__lede">{thread.line}</p>
      {thread.figure && parts.figures !== "hide" ? <Figure figure={thread.figure} threadLabel={thread.label} /> : null}
      <div className="rp__list">
        <span className="eyebrow">{stories.length === 1 ? "1 story in this current" : `${stories.length} stories in this current`}</span>
        <ul>
          {stories.map((s) => (
            <li key={s.key}>
              <button type="button" className="rp__row" onClick={() => onOpen({ kind: "story", key: s.key })}>
                <span className="rp__rowdate">{formatDay(s.date)}</span>
                <span className="rp__rowtext">
                  {s.headline}
                  {s.tier === "detail" ? <span className="rp__rowtag">In detail</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {hidden > 0 ? <p className="rp__note">{hidden === 1 ? "1 more story is hidden by your view." : `${hidden} more stories are hidden by your view.`}</p> : null}
      </div>
      {parts.sources && thread.sources.length > 0 ? <Sources links={thread.sources} /> : null}
    </article>
  )
}

function MoreBody({
  items,
  heading,
  onOpen,
}: {
  items: Item[]
  heading: React.RefObject<HTMLHeadingElement | null>
  onOpen: (r: Reading) => void
}) {
  return (
    <article className="rp__story" aria-labelledby="rp-h">
      <h2 className="rp__headline" id="rp-h" ref={heading} tabIndex={-1}>
        Also this week
      </h2>
      <div className="rp__list">
        <ul>
          {items.map((s) => (
            <li key={s.key}>
              <button type="button" className="rp__row" onClick={() => onOpen({ kind: "story", key: s.key })}>
                <span className="rp__rowdate">{formatDay(s.date)}</span>
                <span className="rp__rowtext">
                  {s.status === "new" ? <span className="rp__new" aria-label="New">●</span> : null}
                  {s.headline}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}

/**
 * Links into Aim on one calm line, worded as in Aim's email: "Open the signal ›" for the
 * first signal (or "Open the source ›" when there is no signal), and "N more sources" that
 * opens a compact numbered list, signals first, then updates. Every link opens the item in Aim.
 */
export function Sources({ links }: { links: Link[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const signals = links.filter((l) => l.id.startsWith("sig_"))
  const updates = links.filter((l) => !l.id.startsWith("sig_"))
  const ordered = [...signals, ...updates]
  if (ordered.length === 0) return null
  const [first, ...rest] = ordered
  const kind = (l: Link) => (l.id.startsWith("sig_") ? "Signal" : "Update")
  return (
    <div className="src">
      <div className="src__line">
        <a className="src__signal" href={first.href} target="_blank" rel="noreferrer">
          {first.id.startsWith("sig_") ? "Open the signal ›" : "Open the source ›"}
        </a>
        {rest.length > 0 ? (
          <button type="button" className="src__more" aria-expanded={open} onClick={() => setOpen(!open)}>
            {rest.length} more {rest.length === 1 ? "source" : "sources"}
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true" className={open ? "is-open" : undefined}>
              <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
      </div>
      {open ? (
        <ol className="src__list">
          {rest.map((l, i) => (
            <li key={l.id}>
              <a href={l.href} target="_blank" rel="noreferrer">
                <span className="src__n">{i + 2}</span>
                {kind(l)} in Aim ›
              </a>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}

export function ReadTheUpdates({ updates }: { updates: Citation[] }) {
  return (
    <div className="updates">
      <span className="eyebrow">Read the updates</span>
      <ul className="updates__list">
        {[...updates].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).map((u) => (
          <li key={u.id}>
            <a className="upd" href={u.href} target="_blank" rel="noreferrer">
              <span className={`upd__sev upd__sev--${u.severity}`} title={`Aim severity: ${u.severity}`} aria-hidden="true" />
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

function Arrow({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={dir === "left" ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M3 7h8M7.5 3.5 11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
