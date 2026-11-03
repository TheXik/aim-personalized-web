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
import { contactMailto, type ContactOffer } from "@/lib/chat/contact"
import { buildFrontPage } from "@/lib/front/front-page"
import { ChatDock, ChatPanel, type ChatStep, type ChatTurn, type Suggestion } from "@/components/chat/chat-panel"
import { FrontPage } from "@/components/front/front-page"
import { TopBar } from "@/components/front/top-bar"
import { ViewControls } from "@/components/front/view-controls"
import { CHAT_OPEN_KEY, usePersistedFlag } from "@/components/front/use-persisted-flag"
import { ReadingPanel, type Reading } from "@/components/reader/reading-panel"
import { clearSetting, settingChips } from "./setting-chips"
import { useMedia } from "./ui-state"

type Load = { state: "loading" } | { state: "error" } | { state: "missing"; message: string } | { state: "ready"; brief: Brief }

// Above the server's 20 s model timeout, so the server answers first.
const CHAT_TIMEOUT_MS = 25_000

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
  const [sheet, setSheet] = useState<"peek" | "half" | "full">("half")
  const [chatOpen, setChatOpen] = usePersistedFlag(CHAT_OPEN_KEY, false)
  const offerRequest = useRef("")
  const declines = useRef(0)
  // Focus moves into the chat only when the reader opens it, not when a remembered panel reappears on load.
  const [focusChat, setFocusChat] = useState(false)
  // Where the panel lands: "Your view" opens it at the top, on the list of changes,
  // "Change what you see" on the latest message and the input.
  const [jump, setJump] = useState<{ to: "view" | "latest"; n: number }>({ to: "latest", n: 0 })
  // One-screen layout from 1024px wide (laptops, tablets in landscape). Below it the page stacks.
  const desk = useMedia("(min-width: 1024px)", true)

  // The brief, as if from Aim's API, and the reader's saved view (per reader, survives a reload).
  useEffect(() => {
    let alive = true
    fetch(`/api/briefs/${reader}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.ok) return r.json()
        // Aim's brief files are not in the repository. Say how to add them.
        const body = await r.json().catch(() => null)
        if (body?.error === "missing_brief") return { missing: String(body.message) }
        throw new Error(String(r.status))
      })
      .then((raw) => {
        if (!alive) return
        if (raw && typeof raw === "object" && "missing" in raw) {
          setLoad({ state: "missing", message: String(raw.missing) })
          return
        }
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
  // The tab title is the brief's own title: its subject, or the verdict when the subject is empty.
  useEffect(() => {
    if (view) document.title = `${view.title} · Aim`
  }, [view])
  const changes = spec.filters.length + spec.pins.length + settings.length

  // The reading panel is part of the browser history, so Back closes it (phones especially).
  // Where focus goes back to when the panel closes: the card or row that opened it.
  const returnTo = useRef<HTMLElement | null>(null)
  const restoreFocus = () => requestAnimationFrame(() => returnTo.current?.focus())
  // One step back inside the panel: story, then current, then back. A step pushes, Back pops,
  // a fresh open from the front page starts a new trail. So the reader can never loop.
  const [trail, setTrail] = useState<Reading[]>([])
  const openReading = useCallback(
    (r: Reading, step = false) => {
      if (!reading && document.activeElement instanceof HTMLElement) returnTo.current = document.activeElement
      const hash = `#${r.kind === "story" ? `story-${r.key.split(":").pop()}` : r.kind === "thread" ? "thread" : "more"}`
      if (reading) window.history.replaceState({ aimReading: true }, "", hash)
      else window.history.pushState({ aimReading: true }, "", hash)
      setTrail((t) => (!reading ? [] : step ? [...t, reading] : t))
      setReading(r)
    },
    [reading],
  )
  const backReading = useCallback(() => {
    setTrail((t) => {
      const prev = t[t.length - 1]
      if (prev) setReading(prev)
      return t.slice(0, -1)
    })
  }, [])
  const closeReading = useCallback(() => {
    if (window.history.state?.aimReading) window.history.back()
    else {
      setReading(null)
      restoreFocus()
    }
  }, [])
  useEffect(() => {
    const onPop = () => {
      if (!window.history.state?.aimReading) {
        setReading(null)
        restoreFocus()
      }
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  // After a change the reader sees it without scrolling: the brief goes back to its top.
  // On a phone the sheet shrinks to a peek with the latest reply, so it no longer covers the page.
  const showChange = useCallback(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const behavior = reduce ? "auto" : "smooth"
    if (window.matchMedia("(min-width: 1024px)").matches) {
      document.querySelector(".fp")?.scrollTo({ top: 0, behavior })
      return
    }
    setSheet("peek")
    window.scrollTo({ top: 0, behavior })
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
          body: JSON.stringify({ reader, request: text, spec, declinesInARow: declines.current }),
          signal: ctrl.signal,
        })
        const data = (await res.json().catch(() => ({}))) as {
          spec?: unknown
          reply?: unknown
          changed?: unknown
          offer?: Offer | null
          declined?: unknown
          contact?: ContactOffer | null
          source?: unknown
        }
        if (!res.ok && typeof data.reply !== "string") throw new Error(String(res.status))
        if (res.ok && data.changed === true && data.spec) {
          saveSpec(parseStoredSpec(data.spec))
          showChange()
        }
        reply = {
          id: `${id}a`,
          role: "assistant",
          state: res.ok ? "done" : "error",
          ...splitReply(typeof data.reply === "string" ? data.reply : ""),
          offer: res.ok && data.offer && Array.isArray(data.offer.ops) ? { label: String(data.offer.label), ops: data.offer.ops } : null,
          request: text,
          // The page could not do it: the turn then offers the closest view, the examples and the direct line.
          couldNot: !(res.ok && data.changed === true) && (!res.ok || data.declined === true || data.source === "none"),
          contact: res.ok && data.contact && (data.contact.when === "now" || data.contact.when === "after") ? data.contact : null,
        }
        // Consecutive turns the chat could not do. The server uses it to spot frustration.
        declines.current = reply.state === "done" && reply.couldNot ? declines.current + 1 : 0
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
          request: text,
          couldNot: true,
          contact: null,
        }
      } finally {
        clearTimeout(timer)
        setBusy(false)
      }
      setTurns((t) => t.map((x) => (x.id === reply.id ? reply : x)))
    },
    [busy, reader, spec, saveSpec, showChange],
  )

  // An offer ("did you mean...") applies in code, with no model call.
  const takeOffer = (turnId: string, offer: Offer) => {
    if (!brief) return
    const result = applyOps(spec, offer.ops, { brief, request: offerRequest.current })
    const r = composeReply(brief, spec, result, offerRequest.current)
    if (r.changed) {
      saveSpec(result.spec)
      showChange()
    }
    setTurns((t) => [
      ...t.map((x) => (x.id === turnId && x.role === "assistant" && x.state !== "pending" ? { ...x, offer: null } : x)),
      { id: `${Date.now()}u`, role: "user", text: offer.label },
      {
        id: `${Date.now()}a`,
        role: "assistant",
        state: "done",
        ...splitReply(r.text),
        offer: r.offer,
        request: offerRequest.current,
        couldNot: false,
        contact: null,
      },
    ])
  }

  // "Tell Lukáš": a prefilled mail the reader sees in full before sending. No server call.
  const contactHref = (request?: string) =>
    contactMailto({ request, page: window.location.href, settings: settings.map((c) => c.label), time: new Date().toISOString() })

  const suggestions: Suggestion[] = EXAMPLES.map((label) => ({ label, run: () => send(label) }))
  const reset = () => saveSpec(DEFAULT_SPEC)
  const removeRule = (id: string) =>
    saveSpec({ ...spec, filters: spec.filters.filter((f) => f.id !== id), pins: spec.pins.filter((p) => p.id !== id) })
  const closeChat = useCallback(() => {
    setChatOpen(false)
    setFocusChat(false)
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".tb__chat, .dock__field")?.focus())
  }, [setChatOpen])

  if (load.state !== "ready" || !view || !brief || !fp) {
    return (
      <BriefLoading
        missing={load.state === "missing" ? load.message : null}
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

  // On a laptop the reading panel and the chat do not stack. Opening the chat closes the panel.
  const chatShown = chatOpen && !(reading && desk)
  const openChat = (to: "view" | "latest" = "latest") => {
    if (reading && desk) closeReading()
    setSheet("half")
    setFocusChat(desk && to === "latest")
    setJump((j) => ({ to, n: j.n + 1 }))
    setChatOpen(true)
  }

  return (
    <div className="app" data-chat={chatShown ? "open" : "closed"} data-sheet={!desk && chatOpen ? sheet : undefined}>
      <TopBar
        periodStart={view.periodStart}
        periodEnd={view.periodEnd}
        minutes={fp.readingMinutes}
        changes={changes}
        hidden={view.hiddenTotal}
        chatOpen={chatShown}
        onChat={() => (chatShown ? closeChat() : openChat("latest"))}
        onOpenChat={() => openChat("view")}
        getMarkdown={() => toAgentMarkdown({ view, settings: settings.map((c) => c.label) })}
        showChatButton={desk}
      />
      <main className="app__main" data-front-ready>
        <FrontPage view={view} fp={fp} also={fp.also} onOpen={openReading} inert={Boolean(reading)} />
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
              backTo={trail[trail.length - 1] ?? null}
              onBack={backReading}
              modal={desk}
            />
          </div>
        ) : null}
      </main>
      {chatShown ? (
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
          contactHref={contactHref}
          onClose={closeChat}
          autoFocus={focusChat && desk}
          jump={jump}
        />
      ) : null}
      {!desk && !chatOpen ? (
        <ChatDock
          changes={changes}
          onOpen={() => openChat("latest")}
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
export function BriefLoading({
  failed = false,
  missing = null,
  onRetry,
}: {
  failed?: boolean
  missing?: string | null
  onRetry?: () => void
  readerName?: string
}) {
  return (
    <div className="app" data-chat="closed">
      <header className="tb">
        <span className="tb__brand">Aim</span>
      </header>
      <main className="app__main">
        <div className="fp" aria-busy={!failed && !missing}>
          {missing ? (
            <div className="fp__lead">
              <p className="eyebrow fp__kicker">Your market brief</p>
              <h1 className="fp__verdict">No brief installed yet.</h1>
              <p className="fp__count">{missing}</p>
            </div>
          ) : failed ? (
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
