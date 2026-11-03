"use client"

import { useSyncExternalStore } from "react"

/** A media query as React state, safe on the server (returns the fallback there). */
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
