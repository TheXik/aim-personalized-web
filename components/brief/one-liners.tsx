"use client"

import type { Item } from "@/lib/brief/types"
import { formatDay, pad2 } from "./format"
import { StatusMark } from "./kicker"
import { domIdForItem, useReading } from "./ui-state"

/** "Also this week": one dated line each, never hidden behind a tap. */
export function OneLiners({ items, showScope }: { items: Item[]; showScope: boolean }) {
  const { thread, threadNumber, setThread } = useReading()
  return (
    <ul className="ones">
      {items.map((it) => {
        const n = threadNumber(it.current)
        const href = it.sources[0]?.href
        return (
          <li
            key={it.key}
            id={domIdForItem(it.index)}
            className={thread !== null && it.current === thread ? "one is-marked" : "one"}
          >
            <time className="one__date" dateTime={it.date ?? undefined}>
              {formatDay(it.date)}
            </time>
            <div>
              <p className="one__text">
                {href ? (
                  <a href={href} target="_blank" rel="noreferrer">
                    {it.headline}
                  </a>
                ) : (
                  it.headline
                )}
              </p>
              <div className="kicker one__meta">
                {n ? (
                  <button
                    type="button"
                    className="kicker__thread"
                    aria-pressed={thread === it.current}
                    title={`Thread ${pad2(n)}: ${it.current}`}
                    onClick={() => setThread(thread === it.current ? null : it.current)}
                  >
                    {pad2(n)}
                  </button>
                ) : null}
                <StatusMark status={it.status} raw={it.statusRaw} />
                {showScope && it.scope ? (
                  <>
                    <span className="kicker__sep" aria-hidden="true" />
                    <span className="kicker__scope">{it.scope}</span>
                  </>
                ) : null}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
