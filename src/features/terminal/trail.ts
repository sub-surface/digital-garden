import { useEffect } from "react"
import { useStore } from "@/store"

/**
 * The trail: the notes you've visited this visit, in order (for the prompt's
 * `trail` and `thread`). Kept in sessionStorage, so it survives reloads but
 * not the end of the visit, and is never sent anywhere.
 */

const KEY = "garden-trail"
const MAX = 200

export interface TrailStep {
  slug: string
  at: number
}

export function readTrail(): TrailStep[] {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as TrailStep[]) : []
  } catch {
    return []
  }
}

function record(slug: string) {
  if (!slug) return
  const trail = readTrail()
  if (trail[trail.length - 1]?.slug === slug) return
  trail.push({ slug, at: Date.now() })
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trail.slice(-MAX)))
  } catch {
    // storage full or blocked: the trail is a nicety
  }
}

/** Mounted once by AppShell: follows the note on screen. */
export function useTrail() {
  useEffect(() => {
    record(useStore.getState().activeGraphSlug)
    return useStore.subscribe((s, prev) => {
      if (s.activeGraphSlug !== prev.activeGraphSlug) record(s.activeGraphSlug)
    })
  }, [])
}
