import type { Current, Figure, Item } from "@/lib/brief/types"
import type { PageView, SectionView } from "@/lib/view/model"

// The one-screen front page, derived from the reader's PageView. Pure, no I/O.
// The front page shows the most important things only. Everything else is one
// click away in the reading panel, in the same order the reader's view sets.

export type Takeaway = { item: Item; text: string }
export type Hook = { item: Item; figure: Figure; fromTopStory: boolean }

export type FrontPage = {
  topStory: Item | null
  // Up to two "what it means" lines, in view order. Empty when the reader hid them.
  takeaways: Takeaway[]
  // Exactly one figure: the top story's, else the first story in view order that has one.
  hook: Hook | null
  threads: Current[]
  // "Also this week": everything the takeaways and the thread cards do not already
  // lead to, in view order. Stories inside a shown thread are one click away there.
  also: Item[]
  oneLiners: Item[]
  // Every visible item in view order: the reading panel steps through this.
  order: Item[]
  grouped: boolean
  // When the reader groups the page (by company, thread or area): each item's group name.
  groupOf: Record<string, string>
  // The reader's own name for the one-liners section ("Also this week" by default), if they renamed it.
  alsoTitle: string | null
}

export const MAX_TAKEAWAYS = 2

export function buildFrontPage(view: PageView): FrontPage {
  const sections: SectionView[] = view.emptyFallback ? view.emptyFallback.sections : view.sections
  // Grouped by company or area: those names are worth showing as tags. Grouping by thread is
  // already visible as the thread cards, and pins are not a grouping.
  const grouped = sections.some((s) => s.kind === "group" && (s.titleSource === "company" || s.titleSource === "scope"))

  const order: Item[] = []
  const seen = new Set<string>()
  const groupOf: Record<string, string> = {}
  for (const s of sections) {
    for (const item of s.items) {
      if (seen.has(item.key)) continue
      seen.add(item.key)
      order.push(item)
      if (grouped && s.kind === "group") groupOf[item.key] = s.title
    }
  }
  const oneLinerSection = sections.find((s) => s.key === "tier:one_liner")
  const alsoTitle = oneLinerSection && oneLinerSection.titleSource === "reader" ? oneLinerSection.title : null

  // Stories the reader pinned to the bottom never lead the page.
  const bottom = new Set(sections.filter((s) => s.kind === "pinned_bottom").flatMap((s) => s.items.map((i) => i.key)))
  const stories = order.filter((i) => i.tier !== "one_liner" && !bottom.has(i.key))
  const oneLiners = order.filter((i) => i.tier === "one_liner")
  const topStory = stories[0] ?? order[0] ?? null

  const takeaways: Takeaway[] = view.parts.means
    ? stories
        .filter((i) => i.means && i.means.trim())
        .slice(0, MAX_TAKEAWAYS)
        .map((item) => ({ item, text: item.means as string }))
    : []

  let hook: Hook | null = null
  // The one figure is the visual hook, so it shows only when the reader shows figures.
  if (view.parts.figures === "show") {
    if (topStory?.figure) hook = { item: topStory, figure: topStory.figure, fromTopStory: true }
    else {
      const withFigure = stories.find((i) => i.figure)
      if (withFigure?.figure) hook = { item: withFigure, figure: withFigure.figure, fromTopStory: false }
    }
  }

  // A thread card only shows while the reader's view still has a story in it.
  const visible = new Set(order.map((i) => i.key))
  const threads = (view.currents ?? []).filter((c) => c.itemKeys.some((k) => visible.has(k)))
  const threadLabels = new Set(threads.map((c) => c.label))
  const taken = new Set(takeaways.map((t) => t.item.key))
  const also = order.filter((i) => !taken.has(i.key) && !(i.current && threadLabels.has(i.current)))

  return {
    topStory,
    takeaways,
    hook,
    threads,
    also,
    oneLiners,
    order,
    grouped,
    groupOf,
    alsoTitle,
  }
}
