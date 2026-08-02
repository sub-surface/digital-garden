import assert from "node:assert/strict"
import { musicAssetUrl } from "../src/lib/musicAsset"
import { handleMusicAsset } from "../src/worker/media"
import { addSecurityHeaders } from "../src/worker/security"
import type { RouteCtx } from "../src/worker/types"
import {
  DEFAULT_MUSIC_EFFECTS,
  equalPowerCurves,
  normalizeMusicEffects,
} from "../src/components/ui/music/musicEffects"

const r2 = "https://pub-1c8f47f651264c60ac3e99705b46795e.r2.dev"
assert.equal(musicAssetUrl(`${r2}/audio/sunaku.mp3`), "/api/music/audio/sunaku.mp3")
assert.equal(musicAssetUrl(`${r2}/covers/sunaku.webp`), "/api/music/covers/sunaku.webp")
assert.equal(musicAssetUrl("https://example.com/elsewhere.mp3"), "https://example.com/elsewhere.mp3")

assert.deepEqual(normalizeMusicEffects(null), DEFAULT_MUSIC_EFFECTS)
assert.deepEqual(normalizeMusicEffects({
  eqEnabled: true,
  eqGains: [99, -99, 2, Number.NaN, 4],
  highpassHz: 5_000,
  lowpassHz: 100,
  crossfadeSeconds: 99,
}), {
  eqEnabled: true,
  eqGains: [12, -12, 2, 0, 4],
  highpassHz: 2_000,
  lowpassHz: 2_000,
  crossfadeSeconds: 8,
})
const curves = equalPowerCurves(5)
assert.equal(curves.fadeIn[0], 0)
assert(Math.abs(curves.fadeIn[4] - 1) < 1e-6)
assert(Math.abs(curves.fadeOut[0] - 1) < 1e-6)
assert(Math.abs(curves.fadeOut[4]) < 1e-6)
for (let index = 0; index < curves.fadeIn.length; index++) {
  const combinedPower = curves.fadeIn[index] ** 2 + curves.fadeOut[index] ** 2
  assert(Math.abs(combinedPower - 1) < 1e-6, "crossfade must preserve equal power")
}

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
