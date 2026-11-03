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
}

export const MAX_TAKEAWAYS = 2

export function buildFrontPage(view: PageView): FrontPage {
  const sections: SectionView[] = view.emptyFallback ? view.emptyFallback.sections : view.sections
  const grouped = sections.some((s) => s.kind !== "tier")

  const order: Item[] = []
  const seen = new Set<string>()
  for (const s of sections) {
    for (const item of s.items) {
      if (seen.has(item.key)) continue
      seen.add(item.key)
      order.push(item)
    }
  }

  const stories = order.filter((i) => i.tier !== "one_liner")
  const oneLiners = order.filter((i) => i.tier === "one_liner")
  const topStory = stories[0] ?? order[0] ?? null

  const takeaways: Takeaway[] = view.parts.means
    ? stories
        .filter((i) => i.means && i.means.trim())
        .slice(0, MAX_TAKEAWAYS)
        .map((item) => ({ item, text: item.means as string }))
    : []

  let hook: Hook | null = null
  if (view.parts.figures !== "hide") {
    if (topStory?.figure) hook = { item: topStory, figure: topStory.figure, fromTopStory: true }
    else {
      const withFigure = stories.find((i) => i.figure)
      if (withFigure?.figure) hook = { item: withFigure, figure: withFigure.figure, fromTopStory: false }
    }
  }

  const threads = view.currents ?? []
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
  }
}
