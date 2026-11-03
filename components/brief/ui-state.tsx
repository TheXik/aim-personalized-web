"use client"

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore } from "react"
import type { ReactNode } from "react"

// Page-local reading state: which items are open and which thread is marked.
// Not part of the saved view spec. A reload starts from the default again.

export function useMedia(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query)
      m.addEventListener("change", cb)
      return () => m.removeEventListener("change", cb)
    },
    () => window.matchMedia(query).matches,
    () => fallback,
  )
}

const EMPTY = new Map<string, boolean>()

export const domIdForItem = (index: number) => `it-${index}`

type ReadingState = {
  wide: boolean
  isOpen: (key: string, tier: string) => boolean
  setOpen: (key: string, open: boolean) => void
  setMany: (keys: string[], open: boolean) => void
  thread: string | null
  setThread: (label: string | null) => void
  threadNumber: (label: string | null) => number | null
  jumpTo: (index: number, key: string) => void
}

const Ctx = createContext<ReadingState | null>(null)

export function ReadingProvider({ currents, children }: { currents: string[]; children: ReactNode }) {
  // Wide screens open every item, narrow screens start with headlines and the "what it means" lines.
  const wide = useMedia("(min-width: 840px)", true)
  // Overrides belong to one screen class. Crossing 840px starts from that class's default again.
  const [store, setStore] = useState<{ wide: boolean; map: Map<string, boolean> }>({ wide, map: new Map() })
  const overrides = store.wide === wide ? store.map : EMPTY
  const setOverrides = useCallback(
    (fn: (prev: Map<string, boolean>) => Map<string, boolean>) =>
      setStore((prev) => ({ wide, map: fn(prev.wide === wide ? prev.map : new Map()) })),
    [wide],
  )
  const [thread, setThread] = useState<string | null>(null)

  const isOpen = useCallback(
    (key: string, tier: string) => {
      const o = overrides.get(key)
      if (o !== undefined) return o
      return wide && tier !== "one_liner"
    },
    [overrides, wide],
  )
  const setOpen = useCallback(
    (key: string, open: boolean) => setOverrides((prev) => new Map(prev).set(key, open)),
    [setOverrides],
  )
  const setMany = useCallback(
    (keys: string[], open: boolean) =>
      setOverrides((prev) => {
        const next = new Map(prev)
        for (const k of keys) next.set(k, open)
        return next
      }),
    [setOverrides],
  )
  const threadNumber = useCallback(
    (label: string | null) => {
      if (!label) return null
      const i = currents.indexOf(label)
      return i >= 0 ? i + 1 : null
    },
    [currents],
  )
  const jumpTo = useCallback(
    (index: number, key: string) => {
      setOverrides((prev) => new Map(prev).set(key, true))
      requestAnimationFrame(() => {
        document.getElementById(domIdForItem(index))?.scrollIntoView({ block: "start" })
      })
    },
    [setOverrides],
  )

  const value = useMemo(
    () => ({ wide, isOpen, setOpen, setMany, thread, setThread, threadNumber, jumpTo }),
    [wide, isOpen, setOpen, setMany, thread, threadNumber, jumpTo],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useReading(): ReadingState {
  const v = useContext(Ctx)
  if (!v) throw new Error("useReading needs ReadingProvider")
  return v
}
