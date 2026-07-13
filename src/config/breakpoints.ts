/**
 * Shared viewport breakpoints — the JS mirror of the SCSS breakpoint tokens in
 * `src/styles/tokens.scss` (`$bp-phone` / `$bp-panel-narrow`). SCSS can't import
 * TS, so these two files are a deliberate mirrored-constant pair: change a number
 * here, change it there too. New responsive code — CSS *or* JS — should reference
 * these names, never a bare `800`/`560` literal (ROADMAP §18, mobile coherence).
 *
 * OWNERSHIP RULE — which mechanism owns which layout context (ROADMAP §18):
 *   • Container query (`@container ... (max-width: $bp-panel-narrow)`) when a
 *     component reflows based on the width of the *box it's rendered in* — e.g. a
 *     game/shelf page that can appear full-page OR inside the ~750px panel-stack
 *     card. `PANEL_NARROW` (560px) is the canonical "narrow panel" width.
 *   • Viewport check (`@media (max-width: $bp-phone)` or `isPhoneViewport()`)
 *     only for genuinely device-level concerns — phone chrome, disabling a
 *     desktop-only affordance, skipping the ambient canvas. `PHONE_BREAKPOINT`
 *     (800px) is the canonical phone line, already the site's de-facto value.
 *   A component must not use a viewport media query to react to its container
 *   width, nor a container query to gate a device-level behaviour.
 *
 * Note: `$article-narrow` (1300px, tokens.scss) is a *content-fit* breakpoint
 * (where the article margin/sidenote column collapses), a different concept from
 * these device widths — it intentionally stays separate.
 */

/** Phone / mobile viewport line, in px. Mirrors `$bp-phone` in tokens.scss. */
export const PHONE_BREAKPOINT = 800

/** "Narrow panel" container-query width, in px. Mirrors `$bp-panel-narrow`. */
export const PANEL_NARROW = 560

/**
 * True when the current viewport is phone-width (≤ {@link PHONE_BREAKPOINT}).
 * SSR-safe: returns `false` when there is no `window` (so server/prerender paths
 * fall through to the desktop layout rather than the mobile one).
 */
export function isPhoneViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth <= PHONE_BREAKPOINT
}
