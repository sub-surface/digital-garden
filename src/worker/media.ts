import type { RouteCtx } from "./types"

const MUSIC_R2 = "https://pub-1c8f47f651264c60ac3e99705b46795e.r2.dev"
const FORWARD_REQUEST_HEADERS = ["Range", "If-None-Match", "If-Modified-Since"]
const FORWARD_RESPONSE_HEADERS = [
  "Content-Type",
  "Content-Length",
  "Content-Range",
  "Accept-Ranges",
  "ETag",
  "Last-Modified",
]

/** Same-origin, range-aware bridge for the committed R2 music manifest. */
export async function handleMusicAsset({ request, match }: RouteCtx): Promise<Response> {
  const [, kind, filename] = match
  const requestHeaders = new Headers()
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name)
    if (value) requestHeaders.set(name, value)
  }

  const upstream = await fetch(`${MUSIC_R2}/${kind}/${filename}`, {
    method: request.method,
    headers: requestHeaders,
  })
  const headers = new Headers()
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name)
    if (value) headers.set(name, value)
  }
  headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800")

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers,
  })
}
