"use client"

import { useEffect, useRef, useState } from "react"
import type { KeyboardEvent, ReactNode } from "react"
import { AimMark } from "@/components/brief/aim-mark"
import type { Offer } from "@/lib/view/reply"
import { contactLine, type ContactOffer } from "@/lib/chat/contact"

// "Change what you see": the chat that reshapes the page. It only changes the view,
// it never answers questions or writes text. Its look follows Aim's own "Ask Aim"
// panel: the reader's words on the right, Aim's reply on the left as numbered steps.
// Every reply line is written by our code from the change that was applied.

export type ChatStep = { title: string; detail?: string | null; meta?: string | null }

export type ChatTurn =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; state: "pending" }
  | {
      id: string
      role: "assistant"
      state: "done" | "error"
      text: string
      steps: ChatStep[]
      offer: Offer | null
      // What the reader asked, for the direct line.
      request: string
      // The page could not do it (a question, or a change it cannot make): the turn offers next steps.
      couldNot: boolean
      contact: ContactOffer | null
    }

export type Suggestion = { label: string; run: () => void }

export const MAX_MESSAGE = 500

export function ChatPanel({
  variant,
  turns,
  busy,
  suggestions,
  viewControls,
  onSend,
  onOffer,
  contactHref,
  onClose,
  sheet,
  onSheet,
  autoFocus = false,
}: {
  // card: floating panel on a laptop. sheet: bottom sheet on a phone or tablet.
  variant: "card" | "sheet"
  turns: ChatTurn[]
  busy: boolean
  suggestions: Suggestion[]
  // The reader's saved changes as removable chips, with Reset. Null in the default view.
  viewControls: ReactNode
  onSend: (text: string) => void
  onOffer: (turnId: string, offer: Offer) => void
  // The "Tell Lukáš" mailto for a request (or for no request), null when there is no address.
  contactHref: (request?: string) => string | null
  onClose: () => void
  sheet?: "peek" | "half" | "full"
  onSheet?: (s: "peek" | "half" | "full") => void
  autoFocus?: boolean
}) {
  const [text, setText] = useState("")
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const lastId = turns[turns.length - 1]?.id

  // Opening the panel lands on the latest message and the input at once. New replies scroll in smoothly.
  const opened = useRef(false)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    if (!opened.current) {
      opened.current = true
      el.scrollTop = el.scrollHeight
      return
    }
    if (turns.length === 0) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" })
  }, [turns, sheet])
  const last = turns[turns.length - 1]
  const status = !last || last.role === "user" ? "" : last.state === "pending" ? "Changing your view" : last.text

  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true })
  }, [autoFocus])

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const send = () => {
    const t = text.trim()
    if (!t || busy) return
    onSend(t.slice(0, MAX_MESSAGE))
    setText("")
    input.current?.focus({ preventScroll: true })
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  return (
    <section className={`chat chat--${variant}`} id="change-panel" aria-label="Change what you see" data-sheet={sheet}>
      {variant === "sheet" ? (
        <button
          type="button"
          className="chat__grabber"
          aria-label={sheet === "full" ? "Make the panel smaller" : "Make the panel bigger"}
          onClick={() => onSheet?.(sheet === "full" ? "half" : sheet === "half" ? "full" : "half")}
        >
          <span />
        </button>
      ) : null}
      <header className="chat__head">
        <span className="chat__mark" aria-hidden="true">
          <AimMark size={16} spin={false} />
        </span>
        <h2 className="chat__title">Change what you see</h2>
        <button type="button" className="chat__close" aria-label="Close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 3l8 8M11 3 3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      <div className="chat__scroll" ref={scroller}>
        <p className="chat__sub">Say it in plain words. Saved on this device, so next week&apos;s brief opens the same way here.</p>
        {viewControls}
        {turns.length === 0 ? (
          <div className="chat__intro">
            <p>
              Filter, reorder, group or hide parts of this brief. It changes only what you see. It never adds words to
              your brief or answers questions about the news.
            </p>
            <span className="eyebrow">Try</span>
            <div className="chat__suggest chat__suggest--list">
              {suggestions.map((s) => (
                <button key={s.label} type="button" className="chat__try" onClick={s.run} disabled={busy}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="chat__turns">
            {turns.map((t) => (
              <li key={t.id} className={`turn turn--${t.role}`}>
                {t.role === "user" ? (
                  <p className="turn__bubble">{t.text}</p>
                ) : t.state === "pending" ? (
                  <div className="turn__aim">
                    <span className="turn__avatar" aria-hidden="true">
                      <AimMark size={16} />
                    </span>
                    <p className="turn__text turn__text--pending">Changing your view</p>
                  </div>
                ) : (
                  <AssistantTurn
                    turn={t}
                    isLast={t.id === lastId}
                    busy={busy}
                    onOffer={onOffer}
                    suggestions={suggestions}
                    contactHref={contactHref}
                  />
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      <form
        className="chat__form"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <label className="sr-only" htmlFor="chat-input">
          What do you want to change?
        </label>
        <textarea
          id="chat-input"
          ref={input}
          className="chat__input"
          rows={1}
          maxLength={MAX_MESSAGE}
          placeholder="For example: only what's new"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="chat__send" aria-label="Apply" disabled={busy || !text.trim()}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M7 11.5V2.5M3 6.5l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </button>
      </form>
      <p className="chat__foot">
        {contactHref() ? (
          <>
            <a className="chat__tell" href={contactHref() ?? undefined}>
              Tell Lukáš
            </a>
            {" · "}
          </>
        ) : null}
        {/* Readers are told that requests the chat cannot do are kept (lib/infra/declines.ts). */}
        <span>Unmet requests are logged without IP.</span>
      </p>
    </section>
  )
}

/**
 * One reply from Aim. When the page could not do what the reader asked, the next steps
 * come one at a time and every one of them changes the view: the closest view as one
 * click, else the example requests, and as the last step the direct line to Lukáš.
 */
function AssistantTurn({
  turn,
  isLast,
  busy,
  onOffer,
  suggestions,
  contactHref,
}: {
  turn: Extract<ChatTurn, { role: "assistant"; state: "done" | "error" }>
  isLast: boolean
  busy: boolean
  onOffer: (turnId: string, offer: Offer) => void
  suggestions: Suggestion[]
  contactHref: (request?: string) => string | null
}) {
  const [declined, setDeclined] = useState(false)
  const offer = isLast && !declined ? turn.offer : null
  const pastOffer = !turn.offer || declined
  // Nothing changed and nothing to offer: the requests this page can do, one click each.
  const showExamples = isLast && turn.couldNot && pastOffer
  const href = turn.contact ? contactHref(turn.request) : null
  // The direct line: right away when the reader sounds frustrated, else as the last step.
  const showContact = isLast && !!href && (turn.contact?.when === "now" || pastOffer)
  return (
    <div className="turn__aim">
      <span className={turn.state === "error" ? "turn__avatar is-error" : "turn__avatar"} aria-hidden="true">
        <AimMark size={16} spin={false} />
      </span>
      <div className="turn__body">
        <p className="turn__text">{turn.text}</p>
        {turn.steps.length > 0 ? (
          <ol className="steps">
            {turn.steps.map((s, i) => (
              <li key={i} className="step">
                <span className="step__n">{String(i + 1).padStart(2, "0")}</span>
                <span className="step__title">{s.title}</span>
                {s.meta ? <span className="step__meta">{s.meta}</span> : null}
                {s.detail ? <span className="step__detail">{s.detail}</span> : null}
              </li>
            ))}
          </ol>
        ) : null}
        {offer ? (
          <div className="next">
            <button type="button" className="next__primary" disabled={busy} onClick={() => onOffer(turn.id, offer)}>
              {offer.label}
            </button>
            <button type="button" className="linkbtn next__no" onClick={() => setDeclined(true)}>
              Not what I meant
            </button>
          </div>
        ) : null}
        {showExamples ? (
          <div className="next next--ask">
            <p className="next__text">This page can do these:</p>
            <div className="chat__suggest">
              {suggestions.map((sug) => (
                <button key={sug.label} type="button" className="chip chip--plain" disabled={busy} onClick={sug.run}>
                  {sug.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {showContact && href ? (
          <p className="next next--contact">
            {contactLine()}{" "}
            <a className="chat__tell" href={href}>
              Write to Lukáš
            </a>
          </p>
        ) : null}
      </div>
    </div>
  )
}

/** Phone: the one line the panel takes when closed. */
export function ChatDock({ changes, onOpen }: { changes: number; onOpen: () => void }) {
  return (
    <div className="dock">
      <button type="button" className="dock__field" onClick={onOpen} aria-controls="change-panel" aria-expanded={false}>
        <AimMark size={16} spin={false} />
        <span>Change what you see</span>
        {changes > 0 ? <span className="dock__count">{changes === 1 ? "1 change" : `${changes} changes`}</span> : null}
      </button>
    </div>
  )
}
