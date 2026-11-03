import type { ComparisonBlock } from "@/lib/brief/schema"

/**
 * Before and after. In the samples `them` is the old setup and `us` the new one,
 * so `them` comes first. The names are shown exactly as the brief writes them.
 * Stacked on a narrow container, side by side on a wide one, never a toggle.
 */
export function Comparison({ block }: { block: ComparisonBlock }) {
  return (
    <div className="cmp">
      <section className="cmp__side cmp__side--them" aria-label={block.them.name}>
        <h5 className="cmp__name">{block.them.name}</h5>
        <ul className="cmp__list">
          {block.them.points.map((p, i) => (
            <li key={i}>{p.text}</li>
          ))}
        </ul>
      </section>
      <span className="cmp__arrow" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <section className="cmp__side cmp__side--us" aria-label={block.us.name}>
        <h5 className="cmp__name">{block.us.name}</h5>
        <ul className="cmp__list">
          {block.us.points.map((p, i) => (
            <li key={i}>{p.text}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
