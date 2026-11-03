import type { ReactNode } from "react"
import type { Figure as FigureData } from "@/lib/brief/types"
import { BarChart } from "./bar-chart"
import { Comparison } from "./comparison"
import { DataTable } from "./data-table"
import { Timeline } from "./timeline"

const KIND_LABEL: Record<FigureData["type"], string> = {
  timeline: "Timeline",
  chart: "Chart",
  table: "Table",
  comparison: "Before and after",
  unknown: "Figure",
}

/**
 * One figure from the brief. `head` is the takeaway and becomes the title.
 * The formal `title` ("as stated") sits under it as a small label.
 * `threadLabel` is set when the figure covers a whole current (scope "current").
 */
export function Figure({ figure, threadLabel }: { figure: FigureData; threadLabel?: string | null }) {
  const eyebrow = figure.scope === "current" && threadLabel ? `${KIND_LABEL[figure.type]} · whole thread` : KIND_LABEL[figure.type]

  switch (figure.type) {
    case "timeline":
      return (
        <FigureFrame eyebrow={eyebrow} head={figure.block.head} lead={figure.block.lead}>
          <Timeline block={figure.block} />
        </FigureFrame>
      )
    case "chart":
      return (
        <FigureFrame
          eyebrow={eyebrow}
          head={figure.block.head}
          title={[figure.block.title, figure.block.unit ? `in ${figure.block.unit}` : null].filter(Boolean).join(", ")}
          lead={figure.block.lead}
          foot={figure.block.foot}
        >
          <BarChart block={figure.block} />
        </FigureFrame>
      )
    case "table":
      return (
        <FigureFrame eyebrow={eyebrow} head={figure.block.head} title={figure.block.title} lead={figure.block.lead}>
          <DataTable block={figure.block} />
        </FigureFrame>
      )
    case "comparison":
      return (
        <FigureFrame eyebrow={eyebrow} head={figure.block.head} lead={figure.block.lead}>
          <Comparison block={figure.block} />
        </FigureFrame>
      )
    default:
      // A figure type this page does not know yet. Show its takeaway, never guess the body.
      return figure.block.head ? <FigureFrame eyebrow={eyebrow} head={figure.block.head} /> : null
  }
}

export function FigureFrame({
  eyebrow,
  head,
  title,
  lead,
  foot,
  children,
}: {
  eyebrow?: string
  head: string
  title?: string | null
  lead?: string | null
  foot?: string | null
  children?: ReactNode
}) {
  return (
    <figure className="fig">
      <figcaption className="fig__caption">
        {eyebrow ? <span className="fig__eyebrow">{eyebrow}</span> : null}
        <span className="fig__head">{head}</span>
        {title ? <span className="fig__title">{title}</span> : null}
        {lead ? <span className="fig__lead">{lead}</span> : null}
      </figcaption>
      {children ? <div className="fig__body">{children}</div> : null}
      {foot ? <p className="fig__foot">{foot}</p> : null}
    </figure>
  )
}
