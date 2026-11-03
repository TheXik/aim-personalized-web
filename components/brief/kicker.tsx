import type { StatusKind } from "@/lib/brief/types"

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
