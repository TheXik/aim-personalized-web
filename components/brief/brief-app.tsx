"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { TagsFile } from "@/lib/brief/schema"
import type { Brief, Item } from "@/lib/brief/types"
import { normalizeBrief } from "@/lib/brief/normalize"
import { buildView } from "@/lib/view/engine"
import type { PageView } from "@/lib/view/model"
import { DEFAULT_SPEC, parseStoredSpec, specStorageKey, type ViewSpec } from "@/lib/view/spec"
import { applyOps } from "@/lib/view/apply"
import { toAgentMarkdown } from "@/lib/export/agent-markdown"
import { composeReply, type Offer } from "@/lib/view/reply"
import { ChatPanel, type ChatStep, type ChatTurn, type Suggestion } from "@/components/chat/chat-panel"
import { BriefView, Rail, TopBar } from "./brief-view"
import { sectionDomId } from "./section"
import { clearSetting, settingChips } from "./setting-chips"
import { ReadingProvider, useMedia } from "./ui-state"

type Sheet = "dock" | "half" | "full"
type Load = { state: "loading" } | { state: "error" } | { state: "missing"; message: string } | { state: "ready"; brief: Brief }

const CHAT_TIMEOUT_MS = 15_000

// The brief's own example requests, shown before the first message.
const EXAMPLES = ["Only what is new this week", "Numbers first", "Hide the one-liners", "Group it by company"]

// The engine is pure and tested. If a stored spec ever trips it, show the default design.
function safeView(brief: Brief, spec: ViewSpec): PageView {
  try {
    return buildView(brief, spec)
  } catch {
    return buildView(brief, DEFAULT_SPEC)
  }
}

export function BriefApp({ reader, readerName, tags }: { reader: string; readerName: string; tags: TagsFile | null }) {
  const [load, setLoad] = useState<Load>({ state: "loading" })
  const [attempt, setAttempt] = useState(0)
  const [spec, setSpec] = useState<ViewSpec>(DEFAULT_SPEC)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState<Sheet>("dock")
  const [chatOpen, setChatOpen] = useState(true)
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const reading = useRef<HTMLDivElement>(null)
  const offerRequest = useRef("")

  const wide = useMedia("(min-width: 840px)", true)
  const laptop = useMedia("(min-width: 1200px)", true)

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
  const itemsByKey = useMemo(() => new Map<string, Item>((brief?.items ?? []).map((i) => [i.key, i])), [brief])
  const currentLabels = useMemo(() => (brief?.currents ?? []).map((c) => c.label), [brief])
  const settings = useMemo(() => settingChips(spec), [spec])
  const ruleCount = spec.filters.length + spec.pins.length + settings.length

  // Which section is on screen, for the laptop index.
  useEffect(() => {
    const root = reading.current
    if (!root || !view) return
    const els = Array.from(root.querySelectorAll<HTMLElement>("section.sec"))
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActiveSection(top.target.id)
      },
      { root, rootMargin: "0px 0px -70% 0px" },
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [view])

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
            ? "That took too long, so I left your page as it was. Try again, or pick one of the suggestions."
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
    const r = composeReply(brief, spec, result, offerRequest.current)
    if (r.changed) saveSpec(result.spec)
    setTurns((t) => [
      ...t.map((x) => (x.id === turnId && x.role === "assistant" && x.state !== "pending" ? { ...x, offer: null } : x)),
      { id: `${Date.now()}u`, role: "user", text: offer.label },
      { id: `${Date.now()}a`, role: "assistant", state: "done", ...splitReply(r.text), offer: r.offer },
    ])
  }

  const suggestions: Suggestion[] = EXAMPLES.map((label) => ({ label, run: () => send(label) }))
  const reset = () => saveSpec(DEFAULT_SPEC)
  const removeDirective = (id: string) =>
    saveSpec({ ...spec, filters: spec.filters.filter((f) => f.id !== id), pins: spec.pins.filter((p) => p.id !== id) })

  if (load.state !== "ready" || !view || !brief) {
    return (
      <Frame wide={wide} chatOpen={false} sheet="dock" readerName={readerName}>
        {load.state === "missing" ? (
          <div className="reading__inner">
            <p className="mast__week">Your market</p>
            <p className="mast__verdict">No brief installed yet.</p>
            <p className="item__p">{load.message}</p>
          </div>
        ) : load.state === "error" ? (
          <div className="reading__inner">
            <p className="mast__week">Your market</p>
            <p className="mast__verdict">This week&apos;s brief did not load.</p>
            <p className="item__p">
              <button
                type="button"
                className="linkbtn"
                onClick={() => {
                  setLoad({ state: "loading" })
                  setAttempt((a) => a + 1)
                }}
              >
                Try again
              </button>
            </p>
          </div>
        ) : (
          <Skeleton />
        )}
      </Frame>
    )
  }

  return (
    <ReadingProvider currents={currentLabels}>
      <div className="shell" data-sheet={wide ? undefined : sheet} data-chat={chatOpen ? "open" : "closed"}>
        <div className="shell__top">
          <TopBar
            readerName={readerName}
            chatOpen={chatOpen}
            onToggleChat={() => setChatOpen((o) => !o)}
            showChatToggle={wide}
            getMarkdown={() => toAgentMarkdown({ view, settings: settings.map((c) => c.label) })}
          />
        </div>
        {laptop ? (
          <div className="shell__rail">
            <Rail view={view} itemsByKey={itemsByKey} activeSection={activeSection?.replace(/^sec-/, "") ? keyFor(view, activeSection) : null} />
          </div>
        ) : null}
        <main className="shell__main">
          <div className="reading" ref={reading}>
            <BriefView
              brief={brief}
              view={view}
              itemsByKey={itemsByKey}
              currentsInline={!laptop}
              settings={settings}
              onRemoveDirective={removeDirective}
              onClearSetting={(id) => saveSpec(clearSetting(spec, id))}
              onReset={reset}
            />
          </div>
        </main>
        <div className="shell__chat">
          {wide ? (
            chatOpen ? (
              <ChatPanel
                variant="pane"
                turns={turns}
                busy={busy}
                suggestions={suggestions}
                ruleCount={ruleCount}
                onSend={send}
                onOffer={takeOffer}
                onReset={reset}
                onClose={() => setChatOpen(false)}
              />
            ) : null
          ) : (
            <ChatPanel
              variant="sheet"
              sheet={sheet}
              onSheet={setSheet}
              turns={turns}
              busy={busy}
              suggestions={suggestions}
              ruleCount={ruleCount}
              onSend={send}
              onOffer={takeOffer}
              onReset={reset}
              onClose={() => setSheet("dock")}
            />
          )}
        </div>
      </div>
    </ReadingProvider>
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

function keyFor(view: PageView, domId: string | null): string | null {
  if (!domId) return null
  const all = view.emptyFallback ? view.emptyFallback.sections : view.sections
  return all.find((s) => sectionDomId(s.key) === domId)?.key ?? null
}

function readStoredSpec(reader: string): ViewSpec {
  try {
    const stored = window.localStorage.getItem(specStorageKey(reader))
    return stored ? parseStoredSpec(JSON.parse(stored)) : DEFAULT_SPEC
  } catch {
    return DEFAULT_SPEC
  }
}

function Frame({
  children,
  wide,
  chatOpen,
  sheet,
  readerName,
}: {
  children: React.ReactNode
  wide: boolean
  chatOpen: boolean
  sheet: Sheet
  readerName: string
}) {
  return (
    <div className="shell" data-sheet={wide ? undefined : sheet} data-chat={chatOpen ? "open" : "closed"}>
      <div className="shell__top">
        <TopBar readerName={readerName} chatOpen={chatOpen} onToggleChat={() => {}} showChatToggle={false} />
      </div>
      <main className="shell__main">
        <div className="reading">{children}</div>
      </main>
    </div>
  )
}

/** The shell while the brief loads, also the route's Suspense fallback. */
export function BriefLoading({ readerName = "" }: { readerName?: string }) {
  return (
    <Frame wide chatOpen={false} sheet="dock" readerName={readerName}>
      <Skeleton />
    </Frame>
  )
}

function Skeleton() {
  return (
    <div className="reading__inner" aria-busy="true" aria-label="Loading this week's brief">
      <div className="skel" style={{ width: 220, height: 12, marginBottom: 24 }} />
      <div className="skel" style={{ width: "92%", height: 28, marginBottom: 10 }} />
      <div className="skel" style={{ width: "86%", height: 28, marginBottom: 10 }} />
      <div className="skel" style={{ width: "54%", height: 28, marginBottom: 40 }} />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skel" style={{ width: `${80 - i * 7}%`, height: 16, marginBottom: 22 }} />
      ))}
    </div>
  )
}
