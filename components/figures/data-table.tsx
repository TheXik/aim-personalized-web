import type { TableBlock } from "@/lib/brief/schema"

const CHECK = /^[✓✔︎✅]+$/u
const CROSS = /^[✗✘×✕]+$/u

type CellKind = "check" | "cross" | "empty" | "text"

function kindOf(text: string): CellKind {
  const t = text.trim()
  if (!t) return "empty"
  if (CHECK.test(t)) return "check"
  if (CROSS.test(t)) return "cross"
  return "text"
}

/**
 * Always a real <table>, so screen readers keep rows and columns.
 * A column where every filled cell is a check mark becomes a check column:
 * centred dots with "Yes" and "No" for screen readers. If a table is ever wider
 * than its container it scrolls sideways inside its own region, first column pinned.
 */
export function DataTable({ block }: { block: TableBlock }) {
  const cols = block.cols
  const kinds = block.rows.map((r) => cols.map((_, j) => kindOf(r.cells[j]?.text ?? "")))
  const isMarkCol = cols.map(
    (_, j) =>
      j > 0 &&
      kinds.some((row) => row[j] === "check" || row[j] === "cross") &&
      kinds.every((row) => row[j] !== "text"),
  )
  const matrix = isMarkCol.filter(Boolean).length >= 2
  const numeric = cols.map(
    (_, j) => j > 0 && !isMarkCol[j] && block.rows.every((r) => /^[\s$€£~≈<>+\-−\d.,%×xBMKk]*$/.test(r.cells[j]?.text ?? "")),
  )

  return (
    <div className="tbl-wrap" role="region" aria-label={block.title ?? block.head} tabIndex={0}>
      <table className={matrix ? "tbl tbl--matrix" : "tbl"}>
        <thead>
          <tr>
            {cols.map((c, j) => (
              <th key={j} scope="col" className={isMarkCol[j] ? "is-mark" : numeric[j] ? "is-num" : undefined}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i}>
              {cols.map((_, j) => {
                const text = row.cells[j]?.text ?? ""
                if (j === 0)
                  return (
                    <th key={j} scope="row">
                      {text}
                    </th>
                  )
                if (isMarkCol[j]) {
                  const k = kinds[i][j]
                  return (
                    <td key={j} className="is-mark">
                      <span className={k === "check" ? "tbl__yes" : "tbl__no"} aria-hidden="true" />
                      <span className="sr-only">{k === "check" ? "Yes" : "No"}</span>
                    </td>
                  )
                }
                return (
                  <td key={j} className={numeric[j] ? "is-num" : undefined}>
                    {text || <span className="tbl__empty">–</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
