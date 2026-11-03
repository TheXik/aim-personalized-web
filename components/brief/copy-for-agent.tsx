"use client"

import { useEffect, useRef, useState } from "react"

/**
 * "Copy for your agent": copies the reader's current view as Markdown.
 * The Markdown is built in code (lib/export/agent-markdown.ts), never by the model.
 */
export function CopyForAgent({ getMarkdown }: { getMarkdown: () => string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const copy = async () => {
    const ok = await writeClipboard(getMarkdown())
    setState(ok ? "copied" : "failed")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState("idle"), 2200)
  }

  return (
    <>
      <button
        type="button"
        className={state === "copied" ? "top__btn is-done" : "top__btn"}
        onClick={copy}
        title="Copy this view as Markdown for your own AI agent"
      >
        {state === "copied" ? <CheckIcon /> : <CopyIcon />}
        <span className="top__btnlong">{state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy for your agent"}</span>
        <span className="top__btnshort">{state === "copied" ? "Copied" : state === "failed" ? "Failed" : "Copy for agent"}</span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === "copied" ? "Copied this view as Markdown" : state === "failed" ? "Copy failed" : ""}
      </span>
    </>
  )
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older browsers or a page without clipboard permission.
    try {
      const ta = document.createElement("textarea")
      ta.value = text
      ta.setAttribute("readonly", "")
      ta.style.position = "fixed"
      ta.style.opacity = "0"
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand("copy")
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="4.5" y="4.5" width="7" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.5 9V3.5A1.5 1.5 0 0 1 4 2h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 7.5 5.75 10 11 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
