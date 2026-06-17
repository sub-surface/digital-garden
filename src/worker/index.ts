import { Env } from "./types"
import { corsHeaders } from "./lib"
import { getContentIndex, slugFromPathname, resolveMetaCaseInsensitive, injectMetaTags } from "./meta"
import { handleAuthMe, handleUpdateProfile, handleAvatarUpload, handleRegister } from "./auth"
import { handleSubmit, handleEdit, handleNew, handleBookmarks, handleLockStatus, handleUserProfile } from "./wiki"
import { handleChatRooms, handleChatMessages, handleChatPins, handleChatPin, handleChatReactions, handleChatSearch, handleChatUserMini, handleChatClaim, handleChatBan, handleGifSearch, handleChessGif, handleUserClaim, handleClaimBySlug } from "./chat"
import { handleStonkHistory } from "./stonks"
import { handleApiKeys } from "./keys"
import { handleAdmin } from "./admin"
import { addSecurityHeaders } from "./security"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    const pathname = url.pathname

    const routes: { method?: string; pattern: RegExp; handler: (req: Request, env: Env, url: URL, match: RegExpMatchArray) => Promise<Response> }[] = [
      { pattern: /^\/api\/chat\/rooms$/, handler: (req, e) => handleChatRooms(req, e) },
      { pattern: /^\/api\/chat\/rooms\/[^/]+$/, handler: (req, e) => handleChatRooms(req, e) },
      { pattern: /^\/api\/chat\/messages$/, handler: (req, e, u) => handleChatMessages(req, e, u) },
      { pattern: /^\/api\/chat\/messages\/[^/]+\/pin$/, handler: (req, e, u) => handleChatPin(req, e, u) },
      { pattern: /^\/api\/chat\/messages\/[^/]+$/, handler: (req, e, u) => handleChatMessages(req, e, u) },
      { pattern: /^\/api\/chat\/pins$/, handler: (req, e, u) => handleChatPins(req, e, u) },
      { pattern: /^\/api\/chat\/reactions$/, handler: (req, e) => handleChatReactions(req, e) },
      { pattern: /^\/api\/chat\/search$/, handler: (req, e, u) => handleChatSearch(req, e, u) },
      { pattern: /^\/api\/chat\/users\/([^/]+)\/stonk-history$/, handler: (req, e, u, m) => handleStonkHistory(req, e, decodeURIComponent(m[1])) },
      { pattern: /^\/api\/chat\/users\/([^/]+)\/mini$/, handler: (req, e, u, m) => handleChatUserMini(req, e, decodeURIComponent(m[1])) },
      { method: "POST", pattern: /^\/api\/chat\/claim$/, handler: (req, e) => handleChatClaim(req, e) },
      { pattern: /^\/api\/chat\/ban$/, handler: (req, e) => handleChatBan(req, e) },
      { pattern: /^\/api\/chat\/unban$/, handler: (req, e) => handleChatBan(req, e) },
      { method: "GET", pattern: /^\/api\/chat\/gif-search$/, handler: (req, e, u) => handleGifSearch(req, e, u) },
      { method: "POST", pattern: /^\/api\/chess\/gif$/, handler: (req) => handleChessGif(req) },

      { method: "POST", pattern: /^\/api\/submit$/, handler: (req, e) => handleSubmit(req, e) },
      { method: "GET", pattern: /^\/api\/auth\/me$/, handler: (req, e) => handleAuthMe(req, e) },
      { method: "PUT", pattern: /^\/api\/auth\/profile$/, handler: (req, e) => handleUpdateProfile(req, e) },
      { method: "POST", pattern: /^\/api\/profile\/avatar$/, handler: (req, e) => handleAvatarUpload(req, e) },
      { method: "POST", pattern: /^\/api\/auth\/register$/, handler: (req, e) => handleRegister(req, e) },
      
      { method: "GET", pattern: /^\/api\/users\/([^/]+)\/claim$/, handler: (req, e, u, m) => handleUserClaim(e, decodeURIComponent(m[1])) },
      { method: "GET", pattern: /^\/api\/claims\/by-slug\/(.+)$/, handler: (req, e, u, m) => handleClaimBySlug(e, decodeURIComponent(m[1])) },
      { method: "GET", pattern: /^\/api\/user\/(.+)$/, handler: (req, e, u, m) => handleUserProfile(e, decodeURIComponent(m[1])) },
      
      { method: "POST", pattern: /^\/api\/edit$/, handler: (req, e) => handleEdit(req, e) },
      { method: "POST", pattern: /^\/api\/new$/, handler: (req, e) => handleNew(req, e) },
      { method: "GET", pattern: /^\/api\/lock-status$/, handler: (req, e) => handleLockStatus(req, e) },
      
      { pattern: /^\/api\/bookmarks/, handler: (req, e, u) => handleBookmarks(req, e, u.pathname) },
      
      { pattern: /^\/api\/keys$/, handler: (req, e, u) => handleApiKeys(req, e, u) },
      { pattern: /^\/api\/keys\/[^/]+$/, handler: (req, e, u) => handleApiKeys(req, e, u) },
      { pattern: /^\/api\/admin\/api-keys$/, handler: (req, e, u) => handleApiKeys(req, e, u) },
      { pattern: /^\/api\/admin\/api-keys\/[^/]+$/, handler: (req, e, u) => handleApiKeys(req, e, u) },
      
      { pattern: /^\/api\/admin\//, handler: (req, e, u) => handleAdmin(req, e, u.pathname) },
    ]

    for (const route of routes) {
      if (route.method && route.method !== request.method) continue
      const match = pathname.match(route.pattern)
      if (match) {
        return route.handler(request, env, url, match)
      }
    }

    if (!env.ASSETS) {
      return new Response("Not found (no ASSETS binding in dev)", { status: 404 })
    }

    const response = await env.ASSETS.fetch(request)

    const contentType = response.headers.get("content-type") ?? ""
    if (request.method !== "GET" || !contentType.includes("text/html")) {
      return response
    }

    const html = await response.text()
    const slug = slugFromPathname(url.pathname)
    const index = await getContentIndex(env.ASSETS)
    const meta = resolveMetaCaseInsensitive(index, slug)

    const injected = meta
      ? injectMetaTags(html, meta, slug, url.origin)
      : injectMetaTags(html, {}, slug, url.origin)

    const headers = new Headers(response.headers)
    addSecurityHeaders(headers)

    return new Response(injected, { status: response.status, headers })
  },
} satisfies ExportedHandler<Env>
