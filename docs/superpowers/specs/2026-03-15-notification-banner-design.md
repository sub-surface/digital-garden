# Notification Banner — Design Spec
*2026-03-15*

## Overview

Replace `EmailConfirmBanner` with a generalised `NotificationBanner` system. A fixed top bar shared by WikiShell and ChatShell that displays a prioritised queue of notifications as a scrolling ticker (same CSS mechanic as `MusicBar`). Multiple notifications are indicated by dot pips; each is individually dismissible with localStorage persistence. Colour is semantic per notification type.

---

## Notification types & colours

| type | colour | border | bg | use cases |
|------|--------|--------|----|-----------|
| `warn` | amber `#d4a820` | `#b48c14` | `#1a1400` | email unverified |
| `info` | blue `#5ca8e8` | `#1e5fa0` | `#0a1520` | general notices |
| `error` | accent `#d45060` | `var(--color-accent)` | `#1a0a0a` | account action required |
| `success` | green `#4ab870` | `#2a7a4a` | `#0a1a0f` | email confirmed, password reset |
| `neutral` | muted `#888` | `#333` | `var(--color-bg-surface)` | GDPR/legal, low-priority |

---

## Layout shift handling

The banner is 28px tall and sits at `top: 0`. Both shells have fixed `padding-top` values that clear `TerminalTitle`:

| shell | current padding-top | with banner |
|---|---|---|
| WikiShell `.mainContent` | `4rem` | `4rem + 1.75rem` |
| ChatShell `.mainPane` | `3.5rem` | `3.5rem + 1.75rem` |

Implementation: when any notification is active, `NotificationBanner` sets `data-banner="true"` on `document.body`. Both shell SCSS files add a rule: `body[data-banner] & { padding-top: calc(existing + 1.75rem) }`. This avoids passing state down through props and keeps the shells unaware of notification content.

---

## Architecture

### `useNotifications` hook
Central registry. Returns `{ notifications, dismiss }`.

Notifications are defined as a static array inside the hook, each conditioned on runtime state:

```ts
interface Notification {
  id: string              // stable key used for localStorage dismiss tracking
  type: "warn" | "info" | "error" | "success" | "neutral"
  message: string
  action?: { label: string; onClick: () => void }
  persistent?: boolean    // if false/absent: session-only dismiss (not saved to localStorage)
}
```

Active notifications = all defined notifications whose condition is currently true AND whose id is not in the dismissed set.

**Dismiss logic:**
- `persistent: true` → id written to `localStorage` key `notif_dismissed`, survives page reload
- `persistent: false` (default) → id stored in React state only, resets on page reload
- `dismiss(id)` handles both cases

**Initial notification definitions (v1):**

| id | condition | type | persistent | action |
|----|-----------|------|-----------|--------|
| `email-unverified` | session exists && `email_confirmed_at` is null | warn | false | "Resend" → `supabase.auth.resend({ type: "signup", email })` |
| `gdpr-cookies` | always (until dismissed) | neutral | true | none |

**Future use (noted for implementation, not built now):**
- `stonks-ticker` — chatter stonks price feed. This banner element is the intended home for a scrolling stonks ticker when the stonks system (Phase 2) is built. The `useNotifications` hook can be extended with a data-driven notification type that renders dynamic content rather than a static string.

### `NotificationBanner` component
Renders the fixed top bar. Stateless — driven entirely by `useNotifications`.

**Layout (left → right):**
```
[ ticker text (flex:1, masked edges) ] [ action button? ] [ dot pips ] [ × ]
```

- Ticker: dual-span CSS marquee identical to `MusicBar` — `animation: marquee Xs linear infinite` on a `width: max-content` flex row with duplicated text
- Dot pips: one dot per active notification; filled = current, hollow = others. Clicking a dot jumps to that notification
- Active notification index cycles automatically every N seconds OR on dot/dismiss interaction
- `×` dismisses the **current** notification only; banner remains if others are active; disappears entirely when queue is empty
- Banner colour (bg + border) transitions with the active notification type

**Auto-cycle:** 8 seconds per notification when multiple are active. Pauses on hover.

**Success state:** success-type notifications auto-dismiss after 5 seconds (no manual dismiss needed). The auto-dismiss timer fires regardless of whether the success notification is the currently-displayed index — it removes the notification from the queue; if another notification is active at that moment the banner transitions to it seamlessly.

**Positioning:** `position: fixed; top: 0; left: 0; right: 0; z-index: 500; height: 28px`

---

## Forgot password

### `WikiProfilePage` recovery session handling

`WikiProfilePage` currently detects a fresh magic-link session by checking `amr` for `method === "otp"` and auto-opens the change-password form. Password reset links produce `method === "recovery"` instead. The component must be updated to also check for `recovery` AMR:

```ts
const isOtpOnly = Array.isArray(amr)
  ? (amr.some(a => a.method === "otp") || amr.some(a => a.method === "recovery"))
    && !amr.some(a => a.method === "password")
  : false
```

This ensures users arriving via a password reset link are automatically shown the change-password form. The localStorage key `notif_dismissed` is namespaced as `dg_notif_dismissed` to avoid collisions.

### `WikiAuthModal` changes
- Add "Forgot password?" text link below the password field on the **login** tab only
- Clicking it replaces the form body with an inline reset panel (no tab change, no new modal):
  - Single email input (pre-filled if user has typed one)
  - "Send reset link" button → calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + "/profile" })`
  - On success: show "Check your email for a reset link." confirmation text
  - "Back to login" link to return to normal login form
- Fully automatic — no admin approval. Supabase sends the reset email directly.

### `useAuth` changes
- Add `resetPassword(email: string): Promise<{ error: string | null }>` method
- Calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: \`\${window.location.origin}/profile\` })`

---

## Dismissal persistence summary

| notification | dismiss scope | storage |
|---|---|---|
| `email-unverified` | session only | React state |
| `gdpr-cookies` | permanent | `localStorage["notif_dismissed"]` (JSON array of ids) |
| future stonks ticker | n/a — data driven, not dismissible | — |

---

## What is NOT in scope

- Push notifications or server-sent notification payloads (all notifications are client-side conditioned)
- A notification count badge elsewhere in the UI
- Stonks ticker implementation (Phase 2 — noted above as intended future home)
- Admin-authored broadcast notifications

---

## Files to create / modify

| file | action |
|------|--------|
| `src/hooks/useNotifications.ts` | create |
| `src/components/ui/NotificationBanner.tsx` | create (replaces EmailConfirmBanner) |
| `src/components/ui/NotificationBanner.module.scss` | create (replaces EmailConfirmBanner.module.scss) |
| `src/components/ui/EmailConfirmBanner.tsx` | delete |
| `src/components/ui/EmailConfirmBanner.module.scss` | delete |
| `src/components/layout/WikiShell.tsx` | swap import |
| `src/components/layout/WikiShell.module.scss` | add `body[data-banner] &` padding-top rule |
| `src/components/layout/ChatShell.tsx` | swap import |
| `src/components/layout/ChatShell.module.scss` | add `body[data-banner] &` padding-top rule |
| `src/hooks/useAuth.ts` | add `resetPassword` method |
| `src/components/ui/WikiAuthModal.tsx` | add forgot-password inline panel |
| `src/components/ui/WikiProfilePage.tsx` | handle `recovery` AMR alongside `otp` |
