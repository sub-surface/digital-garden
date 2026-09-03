import { Env, RouteCtx } from "./types"
import { corsHeaders, applyApiHeaders, jsonResponse, verifyAuth } from "./lib"
import { getContentIndex, slugFromPathname, resolveSlugCaseInsensitive, injectMetaTags } from "./meta"
import { handleAuthMe, handleUpdateProfile, handleAvatarUpload, handleRegister } from "./auth"
import { handleSubmit, handleEdit, handleNew, handleBookmarks, handleLockStatus, handleUserProfile } from "./wiki"
import {
  handleChatRooms, handleChatMessages, handleChatMessageById, handleChatPins, handleChatPin,
  handleChatReactions, handleChatSearch, handleChatUserMini, handleChatClaim, handleChatBan,
  handleGifSearch, handleChessGif, handleUserClaim, handleClaimBySlug,
} from "./chat"
import { handleChatCommand } from "./chatBot"
import { handleApiKeys } from "./keys"
import { handleAdmin } from "./admin"
import { addSecurityHeaders } from "./security"
import { handleMusicAsset } from "./media"
import { handleRestores } from "./restores"
import { handleWidgetNews, handleWidgetWeather } from "./widgets"

/**
 * Route table with declarative middleware:
 *  - auth: "user" resolves + requires a logged-in user; "admin" additionally
 *    requires role === "admin". Handlers receive the resolved user via ctx.auth
 *    and never call verifyAuth themselves.
 *  - Write methods (POST/PUT/PATCH/DELETE) are rate-limited per user/IP when
 *    the WRITE_LIMITER binding is configured (no-op otherwise).
 *  - The dispatcher owns CORS, security headers, and the error boundary: a
 *    thrown handler becomes a logged, correlatable JSON 500 instead of a bare
 *    exception with no CORS headers.
 */
interface Route {
  method?: string
  pattern: RegExp
  auth?: "user" | "admin"
  handler: (ctx: RouteCtx) => Promise<Response>
}

const routes: Route[] = [
  { method: "GET", pattern: /^\/api\/music\/(audio|covers)\/([a-z0-9][a-z0-9._-]*)$/i, handler: handleMusicAsset },
  { method: "HEAD", pattern: /^\/api\/music\/(audio|covers)\/([a-z0-9][a-z0-9._-]*)$/i, handler: handleMusicAsset },
  { method: "GET", pattern: /^\/api\/widgets\/news$/, handler: handleWidgetNews },
  { method: "GET", pattern: /^\/api\/widgets\/weather$/, handler: handleWidgetWeather },
  { method: "GET", pattern: /^\/api\/chat\/rooms$/, auth: "user", handler: handleChatRooms },
  { method: "POST", pattern: /^\/api\/chat\/rooms$/, auth: "admin", handler: handleChatRooms },
  { method: "PATCH", pattern: /^\/api\/chat\/rooms\/[^/]+$/, auth: "admin", handler: handleChatRooms },
  { pattern: /^\/api\/chat\/messages$/, auth: "user", handler: handleChatMessages },
  { pattern: /^\/api\/chat\/messages\/[^/]+\/pin$/, auth: "admin", handler: handleChatPin },
  { method: "GET", pattern: /^\/api\/chat\/messages\/([^/]+)$/, auth: "user", handler: handleChatMessageById },
  { pattern: /^\/api\/chat\/messages\/[^/]+$/, auth: "user", handler: handleChatMessages },
  { method: "GET", pattern: /^\/api\/chat\/pins$/, auth: "user", handler: handleChatPins },
  { pattern: /^\/api\/chat\/reactions$/, auth: "user", handler: handleChatReactions },
  { method: "GET", pattern: /^\/api\/chat\/search$/, auth: "user", handler: handleChatSearch },
  { method: "GET", pattern: /^\/api\/chat\/users\/([^/]+)\/mini$/, handler: handleChatUserMini },
  { method: "POST", pattern: /^\/api\/chat\/claim$/, auth: "user", handler: handleChatClaim },
  { method: "POST", pattern: /^\/api\/chat\/(ban|unban)$/, auth: "admin", handler: handleChatBan },
  { method: "GET", pattern: /^\/api\/chat\/gif-search$/, auth: "user", handler: handleGifSearch },
  { method: "POST", pattern: /^\/api\/chess\/gif$/, handler: handleChessGif },
  { method: "POST", pattern: /^\/api\/chat\/command$/, auth: "user", handler: handleChatCommand },

  { method: "POST", pattern: /^\/api\/submit$/, handler: handleSubmit },
  { method: "GET", pattern: /^\/api\/auth\/me$/, auth: "user", handler: handleAuthMe },
  { method: "PUT", pattern: /^\/api\/auth\/profile$/, auth: "user", handler: handleUpdateProfile },
  { method: "POST", pattern: /^\/api\/profile\/avatar$/, auth: "user", handler: handleAvatarUpload },
  { method: "POST", pattern: /^\/api\/auth\/register$/, handler: handleRegister },

  { method: "GET", pattern: /^\/api\/users\/([^/]+)\/claim$/, handler: handleUserClaim },
  { method: "GET", pattern: /^\/api\/claims\/by-slug\/(.+)$/, handler: handleClaimBySlug },
  { method: "GET", pattern: /^\/api\/user\/(.+)$/, handler: handleUserProfile },

  { method: "POST", pattern: /^\/api\/edit$/, auth: "user", handler: handleEdit },
  { method: "POST", pattern: /^\/api\/new$/, auth: "user", handler: handleNew },
  { method: "GET", pattern: /^\/api\/lock-status$/, handler: handleLockStatus },

  { pattern: /^\/api\/bookmarks/, auth: "user", handler: handleBookmarks },
  { pattern: /^\/api\/os\/restores$/, auth: "user", handler: handleRestores },

  { pattern: /^\/api\/(keys|admin\/api-keys)(\/[^/]+)?$/, auth: "user", handler: handleApiKeys },

  { pattern: /^\/api\/admin\//, auth: "admin", handler: handleAdmin },
]

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

async function dispatch(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const requestId = crypto.randomUUID().slice(0, 8)

  for (const route of routes) {
    if (route.method && route.method !== request.method) continue
    const match = url.pathname.match(route.pattern)
    if (!match) continue

    const waitUntil = (p: Promise<unknown>) => ctx.waitUntil(p)
    const auth = route.auth ? await verifyAuth(request, env, waitUntil) : null
    if (route.auth && !auth) return jsonResponse({ error: "Unauthorized" }, 401)
    if (route.auth === "admin" && auth!.role !== "admin") {
      return jsonResponse({ error: "Admin access required" }, 403)
    }

    // Rate-limit writes: per user when authed, per IP otherwise.
    if (WRITE_METHODS.has(request.method) && env.WRITE_LIMITER) {
      const key = auth?.id ?? request.headers.get("CF-Connecting-IP") ?? "anon"
      try {
        const { success } = await env.WRITE_LIMITER.limit({ key })
        if (!success) return jsonResponse({ error: "Too many requests — slow down" }, 429)
      } catch (e) {
        console.error(`[${requestId}] rate-limiter error (allowing request):`, e)
      }
    }

    try {
      return await route.handler({ request, env, url, match, auth, waitUntil })
    } catch (err) {
      console.error(`[${requestId}] ${request.method} ${url.pathname} handler threw:`, err)
      return jsonResponse({ error: "Internal error", requestId }, 500)
    }
  }

  return jsonResponse({ error: "Not found" }, 404)
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const origin = request.headers.get("Origin")

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    if (url.pathname.startsWith("/api/")) {
      const response = await dispatch(request, env, ctx, url)
      return applyApiHeaders(response, origin)
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
    const requestSlug = slugFromPathname(url.pathname)
    const index = await getContentIndex(env.ASSETS)
    // Meta tags must be built from the CANONICAL slug, not the casing the visitor
    // happened to use: `/og/<slug>.png` is a static asset and CF serves those
    // case-sensitively, so `/abbas` would emit og:image=/og/abbas.png → 404 while
    // `/Abbas` worked. Same for og:url/canonical, which otherwise varied by inbound
    // link casing and split one page into two canonicals. (ROADMAP §28.16)
    const canonicalSlug = resolveSlugCaseInsensitive(index, requestSlug) ?? requestSlug
    const meta = index[canonicalSlug] ?? null

    const injected = injectMetaTags(html, meta ?? {}, canonicalSlug, url.origin)

    const headers = new Headers(response.headers)
    addSecurityHeaders(headers)

    return new Response(injected, { status: response.status, headers })
  },
} satisfies ExportedHandler<Env>
