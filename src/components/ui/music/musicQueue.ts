interface QueueTrack {
  slug: string
}

/** Restore both the current slug queue and the pre-2026 numeric playlist. */
export function migrateQueue(
  value: unknown,
  tracks: readonly QueueTrack[],
): string[] {
  if (!Array.isArray(value)) return []
  const knownSlugs = new Set(tracks.map((track) => track.slug))
  return value.flatMap((entry) => {
    if (typeof entry === "number" && Number.isInteger(entry)) {
      return tracks[entry]?.slug ?? []
    }
    return typeof entry === "string" && knownSlugs.has(entry) ? [entry] : []
  })
}

export function insertNext(queue: readonly string[], currentIndex: number, slug: string): string[] {
  const insertionIndex = currentIndex >= 0 && currentIndex < queue.length
    ? currentIndex + 1
    : 0
  return [
    ...queue.slice(0, insertionIndex),
    slug,
    ...queue.slice(insertionIndex),
  ]
}

export function moveQueueItem(queue: readonly string[], from: number, to: number): string[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= queue.length ||
    to >= queue.length
  ) return [...queue]
  const moved = [...queue]
  const [entry] = moved.splice(from, 1)
  moved.splice(to, 0, entry)
  return moved
}

export function queueIndexAfterMove(index: number, from: number, to: number): number {
  if (index < 0 || from === to) return index
  if (index === from) return to
  if (from < index && index <= to) return index - 1
  if (to <= index && index < from) return index + 1
  return index
}

export function queueIndexAfterRemoval(index: number, removedIndex: number): number {
  if (index === removedIndex) return -1
  return index > removedIndex ? index - 1 : index
}

/** Fisher-Yates with injectable randomness so queue behavior stays testable. */
export function shuffleQueue(
  queue: readonly string[],
  random: () => number = Math.random,
): string[] {
  const shuffled = [...queue]
  for (let index = shuffled.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]]
  }
  return shuffled
}
