/**
 * One home for turning a YouTube/Vimeo URL into an embeddable player URL.
 * Used by remark-wikilinks (`![[https://youtu.be/…]]`) and rehype-image-paths
 * (`![](https://www.youtube.com/watch?v=…)`, the syntax content/ actually uses).
 *
 * YouTube embeds go through youtube-nocookie.com (privacy-enhanced mode). The
 * Worker CSP's frame-src must list every host returned here — see
 * src/worker/security.ts and scripts/test-media.ts.
 */

const VIDEO_ID_RE = /^[\w-]{6,20}$/

export const VIDEO_FRAME_HOSTS = [
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
] as const

export interface VideoEmbed {
  provider: "youtube" | "vimeo"
  id: string
  src: string
}

export function videoEmbedFromUrl(raw: string): VideoEmbed | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(www\.|m\.)/, "")

  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "youtu.be") {
    let id: string | null = null
    if (host === "youtu.be") {
      id = url.pathname.slice(1).split("/")[0] ?? null
    } else if (url.searchParams.has("v")) {
      id = url.searchParams.get("v")
    } else {
      const m = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/)
      id = m?.[1] ?? null
    }
    if (!id || !VIDEO_ID_RE.test(id)) return null
    return { provider: "youtube", id, src: `https://www.youtube-nocookie.com/embed/${id}` }
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean).pop() ?? ""
    if (!/^\d+$/.test(id)) return null
    return { provider: "vimeo", id, src: `https://player.vimeo.com/video/${id}` }
  }

  return null
}

/** Attributes shared by every embedded player iframe. */
export const VIDEO_IFRAME_ALLOW =
  "accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
