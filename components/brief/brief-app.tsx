"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { TagsFile } from "@/lib/brief/schema"
import type { Brief } from "@/lib/brief/types"
import { normalizeBrief } from "@/lib/brief/normalize"
import { buildView } from "@/lib/view/engine"
import type { PageView } from "@/lib/view/model"
import { DEFAULT_SPEC, parseStoredSpec, specStorageKey, type ViewSpec } from "@/lib/view/spec"
import { applyOps } from "@/lib/view/apply"
import { composeReply, type Offer } from "@/lib/view/reply"
import { toAgentMarkdown } from "@/lib/export/agent-markdown"
import { buildFrontPage } from "@/lib/front/front-page"
import { ChatDock, ChatPanel, type ChatStep, type ChatTurn, type Suggestion } from "@/components/chat/chat-panel"
import { FrontPage } from "@/components/front/front-page"
import { TopBar } from "@/components/front/top-bar"
import { ViewControls } from "@/components/front/view-controls"
import { CHAT_OPEN_KEY, usePersistedFlag } from "@/components/front/use-persisted-flag"
import { ReadingPanel, type Reading } from "@/components/reader/reading-panel"
import { clearSetting, settingChips } from "./setting-chips"
import { useMedia } from "./ui-state"

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; brief: Brief }

const CHAT_TIMEOUT_MS = 15_000

// Plain-language examples, the brief's own four requests. Each also works with the model down.
const EXAMPLES = ["Only what's new this week", "Numbers first", "Hide the one-liners", "Group it by company"]

// The engine is pure and tested. If a stored spec ever trips it, show the default design.
function safeView(brief: Brief, spec: ViewSpec): PageView {
  try {
    return buildView(brief, spec)
  } catch {
    return buildView(brief, DEFAULT_SPEC)
  }
}

export function BriefApp({ reader, tags }: { reader: string; readerName: string; tags: TagsFile | null }) {
  const [load, setLoad] = useState<Load>({ state: "loading" })
  const [attempt, setAttempt] = useState(0)
  const [spec, setSpec] = useState<ViewSpec>(DEFAULT_SPEC)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState<Reading | null>(null)
  const [sheet, setSheet] = useState<"half" | "full">("half")
  const [chatOpen, setChatOpen] = usePersistedFlag(CHAT_OPEN_KEY, false)
  const offerRequest = useRef("")
  // Focus moves into the chat only when the reader opens it, not when a remembered panel reappears on load.
  const [focusChat, setFocusChat] = useState(false)
  // One-screen layout from 1024px wide (laptops, tablets in landscape). Below it the page stacks.
  const desk = useMedia("(min-width: 1024px)", true)

  // The brief, as if from Aim's API, and the reader's saved view (per reader, survives a reload).
  useEffect(() => {
    let alive = true
    fetch(`/api/briefs/${reader}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((raw) => {
        if (!alive) return
        setSpec(readStoredSpec(reader))
        setLoad({ state: "ready", brief: normalizeBrief(raw, tags) })
      })
      .catch(() => alive && setLoad({ state: "error" }))
    return () => {
      alive = false
    }
  }, [reader, tags, attempt])

  const saveSpec = useCallback(
    (next: ViewSpec) => {
      setSpec(next)
      try {
        window.localStorage.setItem(specStorageKey(reader), JSON.stringify(next))
      } catch {
        // Private mode or full storage: the change still applies for this visit.
      }
    },
    [reader],
  )

  const brief = load.state === "ready" ? load.brief : null
  const view = useMemo(() => (brief ? safeView(brief, spec) : null), [brief, spec])
  const fp = useMemo(() => (view ? buildFrontPage(view) : null), [view])
  const settings = useMemo(() => settingChips(spec), [spec])
  const changes = spec.filters.length + spec.pins.length + settings.length

  // The reading panel is part of the browser history, so Back closes it (phones especially).
  const openReading = useCallback(
    (r: Reading) => {
      const hash = `#${r.kind === "story" ? `story-${r.key.split(":").pop()}` : r.kind === "thread" ? "thread" : "more"}`
      if (reading) window.history.replaceState({ aimReading: true }, "", hash)
      else window.history.pushState({ aimReading: true }, "", hash)
      setReading(r)
    },
    [reading],
  )
  const closeReading = useCallback(() => {
    if (window.history.state?.aimReading) window.history.back()
    else setReading(null)
  }, [])
  useEffect(() => {
    const onPop = () => {
      if (!window.history.state?.aimReading) setReading(null)
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  const send = useCallback(
    async (text: string) => {
      if (busy) return
      const id = String(Date.now())
      setTurns((t) => [...t, { id: `${id}u`, role: "user", text }, { id: `${id}a`, role: "assistant", state: "pending" }])
      setBusy(true)
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), CHAT_TIMEOUT_MS)
      let reply: ChatTurn
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reader, request: text, spec }),
          signal: ctrl.signal,
        })
        const data = (await res.json().catch(() => ({}))) as { spec?: unknown; reply?: unknown; changed?: unknown; offer?: Offer | null }
        if (!res.ok && typeof data.reply !== "string") throw new Error(String(res.status))
        if (res.ok && data.changed === true && data.spec) saveSpec(parseStoredSpec(data.spec))
        reply = {
          id: `${id}a`,
          role: "assistant",
          state: res.ok ? "done" : "error",
          ...splitReply(typeof data.reply === "string" ? data.reply : ""),
          offer: res.ok && data.offer && Array.isArray(data.offer.ops) ? { label: String(data.offer.label), ops: data.offer.ops } : null,
        }
        offerRequest.current = text
      } catch (e) {
        const timedOut = e instanceof DOMException && e.name === "AbortError"
        reply = {
          id: `${id}a`,
          role: "assistant",
          state: "error",
          text: timedOut
            ? "That took too long, so I left your page as it was. Try again, or pick one of the examples."
            : "I could not reach the model, so your page is unchanged. Your saved view still works.",
          steps: [],
          offer: null,
        }
      } finally {
        clearTimeout(timer)
        setBusy(false)
      }
      setTurns((t) => t.map((x) => (x.id === reply.id ? reply : x)))
    },
    [busy, reader, spec, saveSpec],
  )

  // An offer ("did you mean...") applies in code, with no model call.
  const takeOffer = (turnId: string, offer: Offer) => {
    if (!brief) return
    const result = applyOps(spec, offer.ops, { brief, request: offerRequest.current })
    const r = composeReply(brief, spec, result)
    if (r.changed) saveSpec(result.spec)
    setTurns((t) => [
      ...t.map((x) => (x.id === turnId && x.role === "assistant" && x.state !== "pending" ? { ...x, offer: null } : x)),
      { id: `${Date.now()}u`, role: "user", text: offer.label },
      { id: `${Date.now()}a`, role: "assistant", state: "done", ...splitReply(r.text), offer: r.offer },
    ])
  }

  const suggestions: Suggestion[] = EXAMPLES.map((label) => ({ label, run: () => send(label) }))
  const reset = () => saveSpec(DEFAULT_SPEC)
  const removeRule = (id: string) =>
    saveSpec({ ...spec, filters: spec.filters.filter((f) => f.id !== id), pins: spec.pins.filter((p) => p.id !== id) })
  const closeChat = useCallback(() => setChatOpen(false), [setChatOpen])

  if (load.state !== "ready" || !view || !brief || !fp) {
    return (
      <BriefLoading
        failed={load.state === "error"}
        onRetry={() => {
          setLoad({ state: "loading" })
          setAttempt((a) => a + 1)
        }}
      />
    )
  }

  const viewControls = (
    <ViewControls
      view={view}
      settings={settings}
      onRemoveRule={removeRule}
      onClearSetting={(id) => saveSpec(clearSetting(spec, id))}
      onReset={reset}
    />
  )

  return (
    <div className="app" data-chat={chatOpen ? "open" : "closed"} data-sheet={!desk && chatOpen ? sheet : undefined}>
      <TopBar
        periodStart={view.periodStart}
        periodEnd={view.periodEnd}
        changes={changes}
        hidden={view.hiddenTotal}
        chatOpen={chatOpen}
        onChat={() => {
          setFocusChat(!chatOpen)
          setChatOpen(!chatOpen)
        }}
        onOpenChat={() => {
          setFocusChat(true)
          setChatOpen(true)
        }}
        getMarkdown={() => toAgentMarkdown({ view, settings: settings.map((c) => c.label) })}
        showChatButton={desk}
      />
      <main className="app__main" data-front-ready>
        <FrontPage view={view} fp={fp} also={fp.also} onOpen={openReading} stacked={!desk} />
        {reading ? (
          <div className="rp-layer">
            <div className="rp-scrim" onClick={closeReading} aria-hidden="true" />
            <ReadingPanel
              reading={reading}
              order={fp.order}
              threads={fp.threads}
              moreItems={fp.also}
              parts={view.parts}
              showUpdates={view.updates !== null}
              onOpen={openReading}
              onClose={closeReading}
            />
          </div>
        ) : null}
      </main>
      {chatOpen && !(reading && desk) ? (
        <ChatPanel
          variant={desk ? "card" : "sheet"}
          sheet={sheet}
          onSheet={setSheet}
          turns={turns}
          busy={busy}
          suggestions={suggestions}
          viewControls={viewControls}
          onSend={send}
          onOffer={takeOffer}
          onClose={closeChat}
          autoFocus={focusChat}
        />
      ) : null}
      {!desk && !chatOpen ? (
        <ChatDock
          changes={changes}
          onOpen={() => {
            setFocusChat(true)
            setChatOpen(true)
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * The reply is plain text written by our code. Its first line is the answer,
 * any further lines are the changes, shown as numbered steps like Aim's own chat.
 */
function splitReply(reply: string): { text: string; steps: ChatStep[] } {
  const lines = reply
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
  if (lines.length === 0) return { text: "Done.", steps: [] }
  return { text: lines[0], steps: lines.slice(1).map((title) => ({ title })) }
}

function readStoredSpec(reader: string): ViewSpec {
  try {
    const stored = window.localStorage.getItem(specStorageKey(reader))
    return stored ? parseStoredSpec(JSON.parse(stored)) : DEFAULT_SPEC
  } catch {
    return DEFAULT_SPEC
  }
}

/** The page while the brief loads, also the route's Suspense fallback. */
export function BriefLoading({ failed = false, onRetry }: { failed?: boolean; onRetry?: () => void; readerName?: string }) {
  return (
    <div className="app" data-chat="closed">
      <header className="tb">
        <span className="tb__brand">Aim</span>
      </header>
      <main className="app__main">
        <div className="fp" aria-busy={!failed}>
          {failed ? (
            <div className="fp__lead">
              <p className="eyebrow fp__kicker">Your market brief</p>
              <h1 className="fp__verdict">This week&apos;s brief did not load.</h1>
              <div className="fp__start">
                <button type="button" className="fp__btn" onClick={onRetry}>
                  Try again
                </button>
              </div>
            </div>
          ) : (
            <div className="fp__lead" aria-label="Loading this week's brief">
              <div className="skel" style={{ width: 160, height: 12, marginBottom: 20 }} />
              <div className="skel" style={{ width: "92%", height: 30, marginBottom: 12 }} />
              <div className="skel" style={{ width: "84%", height: 30, marginBottom: 12 }} />
              <div className="skel" style={{ width: "58%", height: 30 }} />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
