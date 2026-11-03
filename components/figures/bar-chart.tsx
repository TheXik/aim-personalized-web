import type { ChartBlock } from "@/lib/brief/schema"
import { formatNumber } from "@/components/brief/format"

/**
 * Horizontal bars, Aim's blog style: the bar that matters in blue, the rest warm grey,
 * the value in bold at the end of the bar. On a narrow container the label sits on its
 * own line above the bar, so the bar gets the full width.
 * The highlight is never colour alone: its label and value are bold as well.
 */
export function BarChart({ block }: { block: ChartBlock }) {
  const values = block.data.map((d) => d.value)
  const max = Math.max(block.max_value ?? 0, ...values, 0)
  const unit = block.unit ?? ""

  return (
    <ul className="bars" aria-label={block.title ?? block.head}>
      {block.data.map((d, i) => {
        const pct = max > 0 ? Math.max((d.value / max) * 100, 0.5) : 0
        return (
          <li
            key={d.key ?? `${d.label}-${i}`}
            className={d.highlight ? "bars__row is-hi" : "bars__row"}
            style={{ ["--w" as string]: `${pct}%`, ["--i" as string]: i }}
          >
            <span className="bars__label">
              {d.label}
              {d.note ? <span className="bars__note"> · {d.note}</span> : null}
            </span>
            <span className="bars__track" aria-hidden="true">
              <span className="bars__bar" />
            </span>
            <span className="bars__value">
              {formatNumber(d.value)}
              {unit ? <span className="bars__unit"> {unit}</span> : null}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
