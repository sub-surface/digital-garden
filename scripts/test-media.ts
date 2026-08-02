import assert from "node:assert/strict"
import { musicAssetUrl } from "../src/lib/musicAsset"
import { handleMusicAsset } from "../src/worker/media"
import { addSecurityHeaders } from "../src/worker/security"
import type { RouteCtx } from "../src/worker/types"

const r2 = "https://pub-1c8f47f651264c60ac3e99705b46795e.r2.dev"
assert.equal(musicAssetUrl(`${r2}/audio/sunaku.mp3`), "/api/music/audio/sunaku.mp3")
assert.equal(musicAssetUrl(`${r2}/covers/sunaku.webp`), "/api/music/covers/sunaku.webp")
assert.equal(musicAssetUrl("https://example.com/elsewhere.mp3"), "https://example.com/elsewhere.mp3")

const security = new Headers()
addSecurityHeaders(security)
assert.match(
  security.get("Content-Security-Policy") ?? "",
  /font-src 'self' data: https:\/\/fonts\.gstatic\.com/,
  "embedded rendered fonts must remain CSP-compatible",
)

const originalFetch = globalThis.fetch
let upstreamUrl = ""
let upstreamRange = ""
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  upstreamUrl = String(input)
  upstreamRange = new Headers(init?.headers).get("Range") ?? ""
  return new Response("audio", {
    status: 206,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Range": "bytes 0-4/5",
      "Accept-Ranges": "bytes",
    },
  })
}) as typeof fetch

try {
  const request = new Request("https://os.subsurfaces.net/api/music/audio/sunaku.mp3", {
    headers: { Range: "bytes=0-4" },
  })
  const response = await handleMusicAsset({
    request,
    match: ["/api/music/audio/sunaku.mp3", "audio", "sunaku.mp3"],
  } as RouteCtx)

  assert.equal(upstreamUrl, `${r2}/audio/sunaku.mp3`)
  assert.equal(upstreamRange, "bytes=0-4")
  assert.equal(response.status, 206)
  assert.equal(response.headers.get("Content-Range"), "bytes 0-4/5")
  assert.match(response.headers.get("Cache-Control") ?? "", /stale-while-revalidate/)
} finally {
  globalThis.fetch = originalFetch
}

console.log("Music assets stay same-origin, range-aware, and CSP-compatible.")
