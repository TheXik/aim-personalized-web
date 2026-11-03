"use client"

import Link from "next/link"
import type { Brief, Item } from "@/lib/brief/types"
import type { DirectiveView, PageView } from "@/lib/view/model"
import { AimMark } from "./aim-mark"
import { Currents } from "./currents"
import { formatRange } from "./format"
import { Section, sectionDomId } from "./section"
import type { SettingChip } from "./setting-chips"

/** The reading column: masthead, visible personalisation, currents (when not in the rail), sections. */
export function BriefView({
  brief,
  view,
  itemsByKey,
  currentsInline,
  settings,
  onRemoveDirective,
  onClearSetting,
  onReset,
}: {
  brief: Brief
  view: PageView
  itemsByKey: Map<string, Item>
  currentsInline: boolean
  settings: SettingChip[]
  onRemoveDirective: (id: string) => void
  onClearSetting: (id: string) => void
  onReset: () => void
}) {
  const sections = view.emptyFallback ? view.emptyFallback.sections : view.sections
  const showUpdates = view.updates !== null
  return (
    <article className="reading__inner" aria-label="Your weekly brief">
      <Masthead view={view} />
      <RulesBar view={view} settings={settings} onRemove={onRemoveDirective} onClear={onClearSetting} onReset={onReset} />
      {view.emptyFallback ? <p className="notice">{view.emptyFallback.notice}</p> : null}
      {currentsInline && view.currents && view.currents.length > 0 ? (
        <Currents title={view.titles.currents.title} currents={view.currents} itemsByKey={itemsByKey} variant="inline" />
      ) : null}
      {sections.map((s, i) => (
        <Section key={s.key} section={s} number={i + 1} parts={view.parts} layout={view.layout} showUpdates={showUpdates} />
      ))}
      <footer className="foot">
        <span>
          {brief.scopes.length > 0 ? `Watching ${brief.scopes.length} ${brief.scopes.length === 1 ? "area" : "areas"} · ` : ""}
          {formatRange(view.periodStart, view.periodEnd)}
        </span>
        <a href={`https://app.startaiming.com/`} target="_blank" rel="noreferrer">
          Open this week in Aim ↗
        </a>
      </footer>
    </article>
  )
}

export function Masthead({ view }: { view: PageView }) {
  return (
    <header className="mast">
      <p className="mast__week">
        Your market · {formatRange(view.periodStart, view.periodEnd)} · {view.readingMinutes} min
      </p>
      {view.titleIsVerdict ? (
        <h1 className="mast__verdict">{view.verdict}</h1>
      ) : (
        <>
          <h1 className="mast__subject">{view.title}</h1>
          <p className="mast__verdict">{view.verdict}</p>
        </>
      )}
    </header>
  )
}

/** Personalisation stays visible: one chip per saved rule, what it hid, and a way back. */
export function RulesBar({
  view,
  settings,
  onRemove,
  onClear,
  onReset,
}: {
  view: PageView
  settings: SettingChip[]
  onRemove: (id: string) => void
  onClear: (id: string) => void
  onReset: () => void
}) {
  if (view.isDefault && settings.length === 0) return null
  return (
    <div className="rules" aria-label="Your view">
      <span className="eyebrow rules__label">Your view</span>
      {view.directives.map((d) => (
        <DirectiveChip key={d.id} d={d} onRemove={onRemove} />
      ))}
      {settings.map((c) => (
        <span key={c.id} className="chip">
          {c.label}
          <button type="button" className="chip__x" aria-label={`Remove ${c.label}`} onClick={() => onClear(c.id)}>
            <XIcon />
          </button>
        </span>
      ))}
      {view.hiddenTotal > 0 && view.directives.length > 1 ? <span className="chip__meta">{view.hiddenTotal} hidden in total</span> : null}
      <button type="button" className="linkbtn" onClick={onReset}>
        Reset to default
      </button>
    </div>
  )
}

function DirectiveChip({ d, onRemove }: { d: DirectiveView; onRemove: (id: string) => void }) {
  const off = d.state !== "active"
  const meta = off
    ? d.state === "expired"
      ? "last week"
      : "not this week"
    : d.kind === "filter" && d.hidden > 0
      ? `${d.hidden} hidden`
      : d.matched > 0
        ? `${d.matched}`
        : "0 matches"
  return (
    <span className={off ? "chip is-off" : "chip"} title={d.matchedHeadlines.join("\n") || undefined}>
      {d.summary}
      <span className="chip__meta">{meta}</span>
      <button type="button" className="chip__x" aria-label={`Remove ${d.summary}`} onClick={() => onRemove(d.id)}>
        <XIcon />
      </button>
    </span>
  )
}

function XIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2 2l6 6M8 2 2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/** Laptop index column: the currents, then the sections with counts. */
export function Rail({
  view,
  itemsByKey,
  activeSection,
}: {
  view: PageView
  itemsByKey: Map<string, Item>
  activeSection: string | null
}) {
  const sections = view.emptyFallback ? view.emptyFallback.sections : view.sections
  return (
    <aside className="rail" aria-label="Index">
      {view.currents && view.currents.length > 0 ? (
        <Currents title={view.titles.currents.title} currents={view.currents} itemsByKey={itemsByKey} variant="rail" />
      ) : null}
      <nav className="rail__nav" aria-label="Sections">
        <span className="eyebrow">In this brief</span>
        {sections.map((s) => (
          <a
            key={s.key}
            href={`#${sectionDomId(s.key)}`}
            className={activeSection === s.key ? "rail__navlink is-active" : "rail__navlink"}
            onClick={(e) => {
              e.preventDefault()
              document.getElementById(sectionDomId(s.key))?.scrollIntoView({ block: "start" })
            }}
          >
            {s.title}
            <span className="rail__navcount">{s.items.length}</span>
            {s.hiddenCount > 0 ? <span className="rail__navhidden">{s.hiddenCount} hidden</span> : null}
          </a>
        ))}
      </nav>
      <div className="rail__foot">
        <a href="https://app.startaiming.com/" target="_blank" rel="noreferrer">
          Open this week in Aim ↗
        </a>
      </div>
    </aside>
  )
}

export function TopBar({
  readerName,
  chatOpen,
  onToggleChat,
  showChatToggle,
}: {
  readerName: string
  chatOpen: boolean
  onToggleChat: () => void
  showChatToggle: boolean
}) {
  return (
    <header className="top">
      <Link className="top__brand" href="/" aria-label="Aim, all readers">
        <AimMark size={22} />
        Aim
      </Link>
      <span className="top__sep" aria-hidden="true" />
      <span className="top__label">Weekly brief</span>
      <span className="top__spacer" />
      <span className="top__reader">{readerName}</span>
      <button type="button" className="top__btn" onClick={onToggleChat} hidden={!showChatToggle} aria-pressed={chatOpen}>
        {chatOpen ? "Hide chat" : "Reshape"}
      </button>
    </header>
  )
}
