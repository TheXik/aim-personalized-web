"use client"

import Link from "next/link"
import { AimMark } from "@/components/brief/aim-mark"
import { CopyForAgent } from "@/components/brief/copy-for-agent"
import { formatRange } from "@/components/brief/format"

/**
 * Brand, the week, and the two actions. The chat control says what it does:
 * it changes what you see, it does not answer questions.
 * When the reader's view differs from the default, a quiet pill says so and opens the chat.
 */
export function TopBar({
  periodStart,
  periodEnd,
  changes,
  hidden,
  chatOpen,
  onChat,
  onOpenChat,
  getMarkdown,
  showChatButton,
}: {
  periodStart: string
  periodEnd: string
  changes: number
  hidden: number
  chatOpen: boolean
  onChat: () => void
  onOpenChat: () => void
  getMarkdown: (() => string) | null
  showChatButton: boolean
}) {
  return (
    <header className="tb">
      <Link className="tb__brand" href="/" aria-label="Aim, all readers">
        <AimMark size={22} />
        Aim
      </Link>
      <span className="tb__date">{formatRange(periodStart, periodEnd)}</span>
      <span className="tb__spacer" />
      {changes > 0 ? (
        <button type="button" className="tb__view" onClick={onOpenChat} title="Your saved view. Open to change or reset it.">
          <span className="tb__viewdot" aria-hidden="true" />
          Your view
          <span className="tb__viewmeta">
            {changes} {changes === 1 ? "change" : "changes"}
            {hidden > 0 ? ` · ${hidden} hidden` : ""}
          </span>
        </button>
      ) : null}
      {getMarkdown ? <CopyForAgent getMarkdown={getMarkdown} /> : null}
      {showChatButton ? (
        <button type="button" className="tb__chat" aria-expanded={chatOpen} aria-controls="change-panel" onClick={onChat}>
          <AimMark size={16} spin={false} />
          Change what you see
        </button>
      ) : null}
    </header>
  )
}
