# Omnibus Fixes & Remaining Work — Design Spec

## Overview

This spec covers all remaining bugs, polish items, and feature gaps identified across the three shells. Items are grouped by dependency order. Where items are independent, they should be parallelised.

---

## Group A: Critical Bugs (fix first, no dependencies)

### A1. Chat input clipped on mobile

**Problem:** `.mainPane` in ChatShell uses `height: 100vh` + `overflow: hidden` with `padding-top: 3.5rem`. The `.chatLayout` inside is `display: flex` with `flex: 1; min-height: 0`, but `.chatMain` doesn't enforce that the input stays in view — on mobile browsers where the URL bar eats viewport height, the input is pushed below the fold.

**Fix:**
- Change `.mainPane` to use `height: 100dvh` (dynamic viewport height) instead of `100vh` — this accounts for mobile browser chrome.
- Same change on `.shell` — `100dvh` instead of `100vh`.
- Ensure `.chatMain` has `overflow: hidden` and the message list takes `flex: 1; min-height: 0; overflow-y: auto` while the input stays `flex-shrink: 0`.

### A2. No mobile menu in ChatShell

**Problem:** `QuickControls` has `display: none` at `max-width: 800px`. ChatShell doesn't render `CornerMenu`. On mobile chat, users cannot access theme controls, profile/logout, or settings.

**Fix:**
- Add a mobile header bar to ChatShell that appears at `max-width: 800px` — contains: hamburger/menu button opening a slide-down panel with profile link, theme toggle, accent cycle, logout.
- Simplest approach: render `QuickControls` inline in the chat header on mobile instead of fixed-positioned, OR add a minimal mobile menu button in `TerminalTitle` that opens a dropdown with the essential actions.
- Recommended: add a compact mobile menu button (three dots or hamburger) in the `chatRoomHeader` right side (via `headerExtra` or directly in ChatRoom) that opens a dropdown with: profile link, day/night toggle, accent cycle, logout. This reuses the existing header actions pattern.

### A3. Emote reactions not rendering

**Problem:** Reaction images load from `/emotes/{name}.gif` but many emotes are `.png` (27 of 55). The `onError` fallback on the reaction emote image only hides the broken image — it doesn't try `.png`.

**Fix:**
- Add PNG fallback on `.reactionEmote` images in the reaction strip, same pattern as everywhere else:
  ```tsx
  onError={(e) => {
    const img = e.currentTarget as HTMLImageElement
    if (!img.dataset.pngFallback) {
      img.dataset.pngFallback = "1"
      img.src = `/emotes/${r.emote}.png`
    }
  }}
  ```
- Currently the reaction img `onError` just does `style.display = "none"` — replace with the fallback pattern.

### A4. Stonk balance/sparkline not showing on profiles

**Problem:** WikiProfilePage only renders the stonk section when `stonkDays.length > 0`. Since the system is new, no ledger entries exist, so the section never appears. MiniProfilePopup shows balance but only when `stonk_balance !== null` — the worker returns `null` when balance is 0 (no rows in `stonk_balance` view).

**Fix:**
- WikiProfilePage: show the stonk section whenever stonks are enabled, even with 0 history. Display current balance (fetch from mini endpoint or new prop) + sparkline (flat line if no data). Change condition from `stonkDays.length > 0` to always show when the balance is available.
- Add `stonk_balance` to `useStonkHistory` return (fetch from mini endpoint alongside history), or pass balance as a prop.
- MiniProfilePopup: the worker currently only returns balance for users who have ledger entries. Fix: `stonk_balance` view returns no rows for users with no entries. Worker should default to `0` instead of `null` when stonks are enabled but user has no entries.
- Simplest fix: in `handleChatUserMini`, when `stonks_enabled` and `balRows.length === 0`, return `stonk_balance: 0` instead of relying on the view.

---

## Group B: Chat Polish (independent of each other)

### B1. Admin Room Management UI

- Add "+" button in chat header (admin only) — inline form: room name + slug.
- `POST /api/chat/rooms` already exists (admin only).
- Add archive button on each room in channel dropdown (admin only) — `PATCH /api/chat/rooms/:id` to set `archived = true`.
- Archived rooms disappear from dropdown, history preserved.

### B2. Admin permanent ban — hard delete + anonymise

- When `ban_type === "permanent"`: delete all `messages` rows for that `user_id`, set `profiles.username` to `"[deleted]"`, `avatar_url` to `null`, `bio` to `null`.
- Add to existing `handleChatBan` in worker: after setting ban fields, if type is permanent, run the deletion/anonymisation.

### B3. React picker — use emote index with correct extensions

- The reaction strip already has PNG fallback (after fix A3).
- The react picker in MessageRow already uses the full emote index from `/emotes/index.json`.
- No additional work needed beyond A3.

---

## Group C: Mobile UX (depends on A1, A2)

### C1. Mobile chat header actions

Once A2 is resolved, ensure the mobile menu includes:
- Day/night toggle
- Accent colour cycle
- Profile link (to wiki profile page)
- Logout button

### C2. Safe area handling

- Ensure `env(safe-area-inset-bottom)` is applied on the input area for notched devices.
- Already present on `.inputAreaOuter` — verify it works with `100dvh`.

---

## Group D: Stonks Completion (depends on A4)

### D1. Update docs — mark completed stonks items

The following Phase 2 items are now implemented but docs still show them as TODO:
- `stonk_ledger` table, `stonk_balance` view, `stonk_config` table
- Stonk balance on `MiniProfilePopup`
- Admin stonk config UI (`GET/PUT /api/admin/stonk-config`)
- `GET /api/chat/users/:username/stonk-history`
- Sparkline on profile pages
- React picker with full emote pool
- Removed stonk triangle button

Mark all as complete in `docs/chat.md` and `docs/future.md`.

### D2. Stonk balance on `GET /api/auth/me`

The chat.md spec mentions adding `stonk_balance` to `/api/auth/me`. Currently not implemented. Add it — query the `stonk_balance` view for the authenticated user.

---

## Group E: Infrastructure & Legal (independent, parallelisable)

### E1. Supabase RLS audit

Add RLS policies:
- `bookmarks`: `USING (user_id = auth.uid())` on SELECT/INSERT/DELETE
- `edit_log`: INSERT only for authenticated users, SELECT for all authenticated
- `page_locks`: admin-only INSERT/DELETE, authenticated SELECT
- `stonk_ledger`: no client policies (all writes via service key)
- `stonk_config`: no client policies (all writes via service key)

### E2. GDPR cookie consent banner

- Bottom bar component: "This site uses cookies for authentication across subdomains. [Accept] [Reject]"
- On reject: disable cross-domain cookie, fall back to localStorage-only auth (single domain sessions)
- Store consent in `localStorage` key `cookie-consent`
- Only show on first visit (no consent stored)
- Render in all three shells

### E3. Privacy policy page

- Static page at `/privacy` on all three domains
- Document: Supabase auth data, profile info, chat messages, bookmarks, cookies, contact info
- Add link in footer/shell chrome of all three shells

---

## Group F: Garden Housekeeping (independent, parallelisable)

### F1. Fix broken wikilinks (37 links across 14 notes)

- Create stub notes for frequently-referenced missing targets
- Fix slug mismatches (`[[Music]]` → `[[music-library]]`, `[[Tags]]` → `[[tags]]`)
- Remove placeholder `[[Sample-Article]]` links from wiki templates

### F2. CLS fix — image dimensions

- Add `width`/`height` attributes to images in Gallery, sidenote embeds, link preview, lightbox
- Prevents layout shift on load

### F3. OG gen fixes

- SVG image support: detect `.svg` URLs in `og-gen.ts`, skip or rasterise via sharp
- External image fetch failures: catch per-image, fall back to text-only OG card
- OG caching: investigate cache key logic, consider committing generated images or using CF build cache
- Prebuild dedup: separate OG gen from prebuild to prevent 3x runs per deploy

---

## Group G: Phase 3 Identity (depends on D being complete)

### G1. Wiki profile claiming

- `chatter_claims` table: `user_id UUID PK REFERENCES profiles, wiki_slug TEXT UNIQUE, claimed_at TIMESTAMPTZ`
- `POST /api/chat/claim` — verify `username` frontmatter matches authenticated user
- Claim UI on WikiProfilePage and chatter wiki pages
- Link between profile and wiki page in both directions

### G2. Avatar in wiki infobox + WikiShell header

- WikiInfobox: if user has claimed the page, show their avatar
- WikiShell auth header: show avatar thumbnail next to username

---

## Dependency Graph

```
A1 (mobile input) ──┐
A2 (mobile menu)  ──┼── C1 (mobile header actions)
                    └── C2 (safe area)

A3 (reaction fallback) ── standalone
A4 (stonk display)     ── D1 (doc update) + D2 (auth/me balance)

B1, B2 ── standalone (parallel)
E1, E2, E3 ── standalone (parallel)
F1, F2, F3 ── standalone (parallel)
G1, G2 ── after D complete
```

## Implementation Order

1. **Parallel batch 1:** A1 + A2 + A3 + A4 (all critical bugs, independent) — DONE
2. **Parallel batch 2:** B1 + B2 + D1 + D2 + E1 (chat polish + stonks completion + RLS) — DONE
3. **Parallel batch 3:** E2 + E3 (infrastructure) — DONE; F1 + F2 + F3 (garden housekeeping) — deferred
4. **Batch 4:** C1 + C2 (mobile UX, depends on batch 1) — DONE
5. **Batch 5:** G1 + G2 (Phase 3 identity)

## Scope Boundaries

**In scope:** Everything listed above.

**Out of scope (deferred):**
- Secondary stonks market
- Idle game
- Easter egg reaction effects (confetti)
- Pre-render SSG
- Image optimisation (sharp WebP)
- Lighthouse CI
- Contributor dashboard
- Watchlist
- Wiki community features (comments, reactions)
- SideChat docked panel (wiki push-content)
- Chess WASM performance
- Trusted Types evaluation
- Future chat commands (`/whisper`, `/pepo`, `/remind`)
