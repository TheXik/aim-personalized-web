import type { TimelineBlock } from "@/lib/brief/schema"
import { formatDay } from "@/components/brief/format"
import { linkFor } from "@/lib/brief/normalize"

/**
 * Vertical rail on narrow containers, four columns on a wide one (CSS container query).
 * The latest point is filled, the earlier ones are rings.
 */
export function Timeline({ block }: { block: TimelineBlock }) {
  const last = block.points.length - 1
  return (
    <ol className="tl" style={{ ["--tl-n" as string]: Math.max(block.points.length, 1) }}>
      {block.points.map((p, i) => (
        <li key={`${p.date}-${i}`} className={i === last ? "tl__pt is-latest" : "tl__pt"}>
          <span className="tl__dot" aria-hidden="true" />
          <time className="tl__date" dateTime={p.date}>
            {formatDay(p.date)}
          </time>
          <p className="tl__text">
            {p.update_id && linkFor(p.update_id) ? (
              <a className="tl__link" href={linkFor(p.update_id)!.href} target="_blank" rel="noreferrer">
                {p.text}
              </a>
            ) : (
              p.text
            )}
          </p>
        </li>
      ))}
    </ol>
  )
}
