"use client"

import { useState } from "react"
import type { Current, Item } from "@/lib/brief/types"
import { pad2 } from "./format"
import { StatusMark } from "./kicker"
import { useReading } from "./ui-state"

/**
 * The currents are the index of the page. Selecting one marks every item of that
 * thread and lists its stories, so the reader can jump straight to them.
 * Rail: the laptop index column. Inline: under the verdict on phone and tablet.
 */
export function Currents({
  title,
  currents,
  itemsByKey,
  variant,
}: {
  title: string
  currents: Current[]
  itemsByKey: Map<string, Item>
  variant: "rail" | "inline"
}) {
  const { wide, thread, setThread, jumpTo } = useReading()
  const [open, setOpen] = useState<string | null>(null)
  const showLine = variant === "rail" || wide

  return (
    <nav className={`currents currents--${variant}`} aria-label="This week's currents">
      <span className="eyebrow">{title}</span>
      <ol className="currents__list">
        {currents.map((c, i) => {
          const active = thread === c.label
          const expanded = open === c.label || active
          const stories = c.itemKeys.map((k) => itemsByKey.get(k)).filter((x): x is Item => !!x)
          return (
            <li key={c.label} className={active ? "cur is-active" : "cur"}>
              <button
                type="button"
                className="cur__btn"
                aria-expanded={expanded}
                onClick={() => {
                  const next = active ? null : c.label
                  setThread(next)
                  setOpen(next)
                }}
              >
                <span className="cur__idx">{pad2(i + 1)}</span>
                <span className="cur__label">{c.label}</span>
                <span className="cur__age">{c.sinceLabel ?? ""}</span>
                <span className="cur__meta kicker">
                  <StatusMark status={c.status} raw={c.statusRaw} />
                  {variant === "rail" && c.sinceLabel ? (
                    <>
                      <span className="kicker__sep" aria-hidden="true" />
                      <span>{c.sinceLabel}</span>
                    </>
                  ) : null}
                  {variant === "inline" ? (
                    <>
                      <span className="kicker__sep" aria-hidden="true" />
                      <span>{stories.length === 1 ? "1 story" : `${stories.length} stories`}</span>
                    </>
                  ) : null}
                </span>
                {showLine || expanded ? <span className="cur__line">{c.line}</span> : null}
              </button>
              {expanded && stories.length > 0 ? (
                <ul className="cur__stories" aria-label={`Stories in ${c.label}`}>
                  {stories.map((s) => (
                    <li key={s.key}>
                      <button type="button" className="cur__story" onClick={() => jumpTo(s.index, s.key)}>
                        {s.headline}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
