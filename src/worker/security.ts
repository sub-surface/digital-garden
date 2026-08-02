export function addSecurityHeaders(headers: Headers) {
  // CSP: allow own origin, Google Fonts, Turnstile, Supabase, external images
  headers.set("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    // wss: — Supabase Realtime connects over WebSocket; https: alone blocks it
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
  ].join("; "))
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  headers.set("Cross-Origin-Opener-Policy", "same-origin")
  headers.set("X-Frame-Options", "DENY")
  headers.set("X-Content-Type-Options", "nosniff")
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
}
