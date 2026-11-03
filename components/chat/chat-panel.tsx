"use client"

import { useEffect, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import { AimMark } from "@/components/brief/aim-mark"
import type { Offer } from "@/lib/view/reply"

// The chat that reshapes the page. It follows Aim's own "Ask Aim" panel:
// user bubble on the right, Aim's reply on the left as numbered steps in mono.
// Every reply line is written by our code from the change that was applied.

export type ChatStep = { title: string; detail?: string | null; meta?: string | null }

export type ChatTurn =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; state: "pending" }
  | { id: string; role: "assistant"; state: "done" | "error"; text: string; steps: ChatStep[]; offer: Offer | null }

export type Suggestion = { label: string; hint?: string; run: () => void }

export const MAX_MESSAGE = 500

export function ChatPanel({
  variant,
  onOffer,
  turns,
  busy,
  suggestions,
  ruleCount,
  onSend,
  onReset,
  onClose,
  sheet,
  onSheet,
}: {
  variant: "pane" | "sheet"
  turns: ChatTurn[]
  busy: boolean
  suggestions: Suggestion[]
  ruleCount: number
  onSend: (text: string) => void
  onReset: () => void
  onClose: () => void
  sheet?: "dock" | "half" | "full"
  onSheet?: (s: "dock" | "half" | "full") => void
  onOffer: (turnId: string, offer: Offer) => void
}) {
  const [text, setText] = useState("")
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" })
  }, [turns])

  useEffect(() => {
    if (variant !== "sheet" || sheet === "dock") return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onSheet?.("dock")
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [variant, sheet, onSheet])

  const lastId = turns[turns.length - 1]?.id
  const send = () => {
    const t = text.trim()
    if (!t || busy) return
    onSend(t.slice(0, MAX_MESSAGE))
    setText("")
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      send()
    }
  }

  if (variant === "sheet" && sheet === "dock") {
    return (
      <div className="dock">
        <button
          type="button"
          className="dock__field"
          onClick={() => {
            onSheet?.("half")
            requestAnimationFrame(() => input.current?.focus())
          }}
        >
          <AimMark size={16} spin={false} />
          <span>Reshape this brief in your words</span>
        </button>
        {ruleCount > 0 ? (
          <span className="dock__count" aria-label={`${ruleCount} saved changes`}>
            {ruleCount}
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <section className={`chat chat--${variant}`} aria-label="Reshape this brief">
      {variant === "sheet" ? (
        <button
          type="button"
          className="chat__grabber"
          aria-label={sheet === "full" ? "Make the chat smaller" : "Make the chat bigger"}
          onClick={() => onSheet?.(sheet === "full" ? "half" : "full")}
        >
          <span />
        </button>
      ) : null}
      <header className="chat__head">
        <div>
          <h2 className="chat__title">Reshape this brief</h2>
          <p className="chat__sub">Changes are saved and apply to next week too</p>
        </div>
        <button type="button" className="chat__close" aria-label={variant === "sheet" ? "Close the chat" : "Hide the chat"} onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 3l8 8M11 3 3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="chat__scroll" ref={scroller}>
        {turns.length === 0 ? (
          <div className="chat__intro">
            <p>
              Tell Aim how you want to read this brief. It can filter, reorder, group and hide parts of it. It never
              writes new text, so every word on the page stays from your brief.
            </p>
            <span className="eyebrow">Try one</span>
            <div className="chat__suggest">
              {suggestions.map((s) => (
                <button key={s.label} type="button" className="chip chip--plain" title={s.hint} onClick={s.run} disabled={busy}>
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
                    <p className="turn__text turn__text--pending">Reading your request</p>
                  </div>
                ) : (
                  <div className="turn__aim">
                    <span className={t.state === "error" ? "turn__avatar is-error" : "turn__avatar"} aria-hidden="true">
                      <AimMark size={16} spin={false} />
                    </span>
                    <div className="turn__body">
                      <p className="turn__text">{t.text}</p>
                      {t.steps.length > 0 ? (
                        <ol className="steps">
                          {t.steps.map((s, i) => (
                            <li key={i} className="step">
                              <span className="step__n">{String(i + 1).padStart(2, "0")}</span>
                              <span className="step__title">{s.title}</span>
                              {s.meta ? <span className="step__meta">{s.meta}</span> : null}
                              {s.detail ? <span className="step__detail">{s.detail}</span> : null}
                            </li>
                          ))}
                        </ol>
                      ) : null}
                      {t.offer && t.id === lastId ? (
                        <div className="chat__suggest">
                          <button type="button" className="chip chip--plain chip--offer" disabled={busy} onClick={() => onOffer(t.id, t.offer!)}>
                            {t.offer.label}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
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
          placeholder="What do you want to see first?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="chat__send" aria-label="Send" disabled={busy || !text.trim()}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M7 11.5V2.5M3 6.5l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </button>
      </form>
      <div className="chat__foot">
        <span className="eyebrow">{ruleCount === 0 ? "Default view" : `${ruleCount} saved ${ruleCount === 1 ? "change" : "changes"}`}</span>
        {ruleCount > 0 ? (
          <button type="button" className="linkbtn" onClick={onReset}>
            Reset to default
          </button>
        ) : null}
      </div>
    </section>
  )
}
