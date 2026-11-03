"use client"

import type { StatusKind } from "@/lib/brief/types"
import { formatDay, pad2 } from "./format"
import { useReading } from "./ui-state"

const STATUS_TEXT: Record<StatusKind, string> = {
  new: "New",
  updated: "Updated",
  carried: "Carried over",
  other: "",
}

/** New is the only blue on the page. Updated is a half dot, carried over a ring. */
export function StatusMark({ status, raw }: { status: StatusKind; raw?: string }) {
  const text = STATUS_TEXT[status] || raw?.replace(/_/g, " ") || ""
  return (
    <span className={`status status--${status}`}>
      <span className="status__dot" aria-hidden="true" />
      {text}
    </span>
  )
}

/**
 * The mono line above every item: thread number, status, date, monitoring area, source count.
 * The thread number is a button that marks every item of that thread.
 */
export function Kicker({
  current,
  status,
  statusRaw,
  date,
  scope,
  sources,
  showScope = true,
}: {
  current: string | null
  status: StatusKind
  statusRaw: string
  date: string | null
  scope: string | null
  sources: number
  showScope?: boolean
}) {
  const { threadNumber, thread, setThread } = useReading()
  const n = threadNumber(current)
  return (
    <div className="kicker">
      {n ? (
        <button
          type="button"
          className="kicker__thread"
          aria-pressed={thread === current}
          title={`Thread ${pad2(n)}: ${current}`}
          onClick={() => setThread(thread === current ? null : current)}
        >
          {pad2(n)}
        </button>
      ) : null}
      <StatusMark status={status} raw={statusRaw} />
      {date ? (
        <>
          <span className="kicker__sep" aria-hidden="true" />
          <time dateTime={date}>{formatDay(date)}</time>
        </>
      ) : null}
      {sources > 0 ? (
        <>
          <span className="kicker__sep" aria-hidden="true" />
          <span>{sources === 1 ? "1 source" : `${sources} sources`}</span>
        </>
      ) : null}
      {showScope && scope ? (
        <>
          <span className="kicker__sep" aria-hidden="true" />
          <span className="kicker__scope">{scope}</span>
        </>
      ) : null}
    </div>
  )
}
