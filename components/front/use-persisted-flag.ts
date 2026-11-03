"use client"

import { useCallback, useSyncExternalStore } from "react"

// A boolean kept in localStorage, shared by every component that reads it and
// safe on the server (where it is always the fallback). Used for "is the chat open".

const listeners = new Set<() => void>()
const memory = new Map<string, boolean>()

function read(key: string, fallback: boolean): boolean {
  if (memory.has(key)) return memory.get(key) as boolean
  try {
    const v = window.localStorage.getItem(key)
    return v === null ? fallback : v === "1"
  } catch {
    return fallback
  }
}

export function usePersistedFlag(key: string, fallback = false): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      window.addEventListener("storage", cb)
      return () => {
        listeners.delete(cb)
        window.removeEventListener("storage", cb)
      }
    },
    () => read(key, fallback),
    () => fallback,
  )
  const set = useCallback(
    (next: boolean) => {
      memory.set(key, next)
      try {
        window.localStorage.setItem(key, next ? "1" : "0")
      } catch {
        // Private mode: the in-memory value still holds for this visit.
      }
      listeners.forEach((l) => l())
    },
    [key],
  )
  return [value, set]
}

export const CHAT_OPEN_KEY = "aim.chat.open.v1"
