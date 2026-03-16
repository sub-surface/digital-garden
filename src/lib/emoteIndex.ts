// Shared emote index — fetched once, cached across all consumers.
// Use emoteExt(name) to get the correct file extension for an emote.

export interface EmoteEntry { name: string; ext: string }

let cache: EmoteEntry[] | null = null
let fetchPromise: Promise<void> | null = null

export function getEmoteCache(): EmoteEntry[] | null {
  return cache
}

export function fetchEmoteIndex(): Promise<void> {
  if (cache) return Promise.resolve()
  if (fetchPromise) return fetchPromise
  fetchPromise = fetch("/emotes/index.json")
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((data: unknown) => {
      if (!Array.isArray(data) || data.length === 0) return
      cache = typeof data[0] === "string"
        ? (data as string[]).map((name) => ({ name, ext: "gif" }))
        : (data as EmoteEntry[])
    })
    .catch(() => {
      cache = []
    })
  return fetchPromise
}

/** Returns the correct file extension for an emote name, or "gif" as fallback. */
export function emoteExt(name: string): string {
  return cache?.find((e) => e.name === name)?.ext ?? "gif"
}

/** Returns the full src path for an emote. */
export function emoteSrc(name: string): string {
  return `/emotes/${name}.${emoteExt(name)}`
}
