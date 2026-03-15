# Chat Unification & Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify SideChat and full ChatRoom into a single responsive component with frosted glass styling, name colours, combined emoji/GIF picker, image lightbox, emote popups, chat settings, and BgCanvas restored for chat shell.

**Architecture:** Replace the 278-line SideChat with a thin wrapper around ChatRoom. Use CSS container queries so the same ChatRoom adapts its layout (avatars, density) based on container width. Add `name_color` to profiles table, merge GIF picker into EmotePicker as tabs, add ImageLightbox and EmotePopup overlays.

**Tech Stack:** React 19, SCSS modules, CSS container queries, Supabase (profiles table migration), Cloudflare Worker API updates.

---

## File Structure

### New files
- `src/components/ui/ImageLightbox.tsx` — click-to-expand image overlay
- `src/components/ui/ImageLightbox.module.scss`
- `src/components/ui/EmotePopup.tsx` — Discord-style enlarged emote popup on click
- `src/components/ui/EmotePopup.module.scss`
- `src/components/ui/ChatSettings.tsx` — name colour picker popup
- `src/components/ui/ChatSettings.module.scss`

### Modified files
- `src/worker.ts` — add `name_color` to profile endpoints + message queries
- `src/hooks/useAuth.ts` — add `name_color` to ProfileFields + state
- `src/types/chat.ts` — add `name_color` to ChatMessage profiles
- `src/components/ui/SideChat.tsx` — gutted to thin wrapper around ChatRoom
- `src/components/ui/SideChat.module.scss` — frosted glass panel styles only
- `src/components/ui/ChatRoom.tsx` — accept optional containerClass, pass name_color
- `src/components/ui/MessageRow.tsx` — render name_color on username, clickable images, clickable emotes
- `src/components/ui/MessageInput.tsx` — replace text buttons with icons, merge GIF into emote picker
- `src/components/ui/EmotePicker.tsx` — add Emotes/GIFs tab system
- `src/components/ui/EmotePicker.module.scss` — tab styles
- `src/components/ui/Chat.module.scss` — container query responsive styles, frosted glass
- `src/components/layout/ChatShell.tsx` — add BgCanvas, change QuickControls variant
- `src/components/layout/ChatShell.module.scss` — transparent bg for BgCanvas
- `src/components/layout/QuickControls.tsx` — remove chat variant suppression of BgModeToggle
- `src/components/ui/ChatPage.tsx` — pass name_color through

### Deleted files
- `src/components/ui/GifPicker.tsx` — merged into EmotePicker
- `src/components/ui/GifPicker.module.scss` — merged into EmotePicker styles

---

## Chunk 1: Database + API Layer

### Task 1: Add name_color to Supabase profiles

**Files:**
- Modify: Supabase `profiles` table (via migration)

- [ ] **Step 1: Run Supabase migration to add name_color column**

```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name_color text DEFAULT NULL;
```

Execute via Supabase MCP `apply_migration` tool.

- [ ] **Step 2: Verify column exists**

Run a SELECT to confirm the column is present.

---

### Task 2: Update worker API to handle name_color

**Files:**
- Modify: `src/worker.ts:374-410` (handleUpdateProfile)
- Modify: `src/worker.ts` (handleGetProfile/me endpoint)
- Modify: `src/worker.ts` (chat messages query — include name_color in profiles select)

- [ ] **Step 1: Add name_color to handleUpdateProfile**

In `handleUpdateProfile`, after the `avatar_url` line (402), add:
```typescript
if (typeof body.name_color === "string") {
  const color = body.name_color.trim()
  if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return jsonResponse({ error: "name_color must be a valid hex color (#RRGGBB)" }, 400)
  }
  updates.name_color = color || null
}
```

Also handle clearing: if `body.name_color === null`, set `updates.name_color = null`.

- [ ] **Step 2: Add name_color to /api/auth/me response**

Find the handleMe function. Add `name_color` to the select query and response object.

- [ ] **Step 3: Add name_color to chat messages profile select**

In the chat messages endpoint, the Supabase query selects `profiles(username,avatar_url)`. Change to `profiles(username,avatar_url,name_color)`.

- [ ] **Step 4: Add name_color to mini profile endpoint**

In `handleMiniProfile`, add `name_color` to the select and response.

- [ ] **Step 5: Add name_color to /api/user/:username endpoint**

Add `name_color` to the select query in `handleUserProfile`.

---

### Task 3: Update frontend types and auth hook

**Files:**
- Modify: `src/types/chat.ts`
- Modify: `src/hooks/useAuth.ts`

- [ ] **Step 1: Add name_color to ChatMessage profiles type**

In `src/types/chat.ts`, change the profiles field:
```typescript
profiles: { username: string; avatar_url: string | null; name_color?: string | null } | null
```

- [ ] **Step 2: Add name_color to useAuth hook**

Add `name_color` to `ProfileFields` interface, add state, wire into fetchProfile and updateProfile, expose in return.

---

## Chunk 2: Frosted Glass + BgCanvas for Chat

### Task 4: Restore BgCanvas to ChatShell

**Files:**
- Modify: `src/components/layout/ChatShell.tsx`
- Modify: `src/components/layout/ChatShell.module.scss`
- Modify: `src/components/layout/QuickControls.tsx`

- [ ] **Step 1: Add BgCanvas import and render in ChatShell**

```tsx
import { BgCanvas } from "./BgCanvas"
// In render, add before ThemePanel:
<BgCanvas />
```

- [ ] **Step 2: Update QuickControls to show BgModeToggle for chat variant**

In QuickControls.tsx, change `{variant === "full" && <BgModeToggle />}` to `{(variant === "full" || variant === "chat") && <BgModeToggle />}` — or simply remove the condition since it should always show.

- [ ] **Step 3: Ensure ChatShell background is transparent**

The `.shell` already has `background: transparent` — verify `.chatLayout` and `.chatMain` also don't set opaque backgrounds.

---

### Task 5: Frosted glass styling for chat containers

**Files:**
- Modify: `src/components/ui/Chat.module.scss`
- Modify: `src/components/ui/SideChat.module.scss`

- [ ] **Step 1: Add frosted glass to chat layout containers**

Update `.chatLayout`, `.sidebar`, `.chatMain`, `.inputAreaOuter`, `.chatRoomHeader` with:
```scss
background: color-mix(in srgb, var(--color-bg) 75%, transparent);
backdrop-filter: blur(12px);
-webkit-backdrop-filter: blur(12px);
```

- [ ] **Step 2: Update SideChat panel to frosted glass**

Replace `.panel` background:
```scss
background: color-mix(in srgb, var(--color-bg) 80%, transparent);
backdrop-filter: blur(16px);
-webkit-backdrop-filter: blur(16px);
```

- [ ] **Step 3: Make message list and inner containers transparent**

Ensure `.messageList`, `.messageListInner`, `.messageRow` backgrounds are transparent or use very subtle color-mix for hover states.

---

## Chunk 3: Unified SideChat

### Task 6: Add container query support to Chat.module.scss

**Files:**
- Modify: `src/components/ui/Chat.module.scss`

- [ ] **Step 1: Add container-type to chatMain**

```scss
.chatMain {
  container-type: inline-size;
  container-name: chat;
}
```

- [ ] **Step 2: Add container query responsive rules**

```scss
@container chat (max-width: 420px) {
  .avatar,
  .avatarPlaceholder {
    display: none;
  }

  .messageRow {
    gap: 0;
  }

  .messageListInner {
    padding: 0 0.5rem;
    max-width: 100%;
  }

  .inputArea {
    padding: 0.4rem 0.5rem;
    max-width: 100%;
  }

  .chatContentWrapper {
    padding: 0 0.5rem;
    max-width: 100%;
  }

  .chatRoomHeader {
    padding: 0.35rem 0;
  }

  .username {
    font-size: 0.75rem;
  }

  .messageBody {
    font-size: 0.82rem;
  }

  .sendBtn {
    display: none; // Enter to send in narrow mode
  }

  .embedImg {
    max-width: 100%;
    max-height: 160px;
  }
}
```

---

### Task 7: Rewrite SideChat as thin ChatRoom wrapper

**Files:**
- Modify: `src/components/ui/SideChat.tsx` (rewrite)
- Modify: `src/components/ui/SideChat.module.scss` (simplify to panel-only styles)
- Modify: `src/components/ui/ChatRoom.tsx` (accept optional className/containerRef)

- [ ] **Step 1: Update ChatRoom to accept containerClass prop**

Add `containerClass?: string` to ChatRoom Props. Apply it to the wrapping element so SideChat can style the container.

- [ ] **Step 2: Rewrite SideChat**

Replace the entire SideChat with:
```tsx
import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useStore } from "@/store"
import { ChatRoom } from "./ChatRoom"
import { WikiAuthModal } from "./WikiAuthModal"
import type { ChatRoom as ChatRoomType } from "@/types/chat"
import styles from "./SideChat.module.scss"

export function SideChat() {
  const isOpen = useStore((s) => s.isSideChatOpen)
  const setSideChatOpen = useStore((s) => s.setSideChatOpen)
  const { session, username, avatar_url } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [room, setRoom] = useState<ChatRoomType | null>(null)
  const [rooms, setRooms] = useState<ChatRoomType[]>([])

  useEffect(() => {
    if (!isOpen || !session) return
    fetch("/api/chat/rooms", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data: { rooms: ChatRoomType[] }) => {
        const active = (data.rooms ?? []).filter(r => !r.archived)
        setRooms(active)
        if (!room && active.length > 0) {
          setRoom(active.find(r => r.name === "general") ?? active[0])
        }
      })
      .catch(() => {})
  }, [isOpen, session])

  function handlePopout() {
    window.open("https://chat.subsurfaces.net", "philchat", "width=400,height=700")
  }

  if (!isOpen) return null

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <select
            className={styles.roomSelect}
            value={room?.id ?? ""}
            onChange={(e) => {
              const r = rooms.find(r => r.id === e.target.value)
              if (r) setRoom(r)
            }}
          >
            {rooms.map(r => (
              <option key={r.id} value={r.id}>#{r.name}</option>
            ))}
          </select>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.headerBtn} onClick={handlePopout} title="Pop out">&#x2197;</button>
          <button className={styles.headerBtn} onClick={() => setSideChatOpen(false)} title="Close">&times;</button>
        </div>
      </div>

      <div className={styles.chatContainer}>
        {!session ? (
          <div className={styles.loginArea}>
            <button className={styles.loginBtn} onClick={() => setShowAuth(true)}>
              Log in to chat
            </button>
          </div>
        ) : room ? (
          <ChatRoom
            key={room.id}
            roomId={room.id}
            roomName={room.name}
            accessToken={session.access_token}
            currentUserId={session.user.id}
            currentUsername={username}
            currentAvatarUrl={avatar_url}
          />
        ) : (
          <div className={styles.empty}>loading...</div>
        )}
      </div>

      {showAuth && <WikiAuthModal onClose={() => setShowAuth(false)} />}
    </div>
  )
}
```

- [ ] **Step 3: Simplify SideChat.module.scss**

Strip to panel-only styles: `.panel` (frosted glass, fixed position), `.header`, `.headerBtn`, `.roomSelect`, `.chatContainer` (flex:1, overflow hidden, container-type), `.loginArea`, `.loginBtn`, `.empty`.

The `.chatContainer` must set `container-type: inline-size; container-name: chat;` so the container queries from Chat.module.scss kick in.

- [ ] **Step 4: Verify sidechat now has all features**

The sidechat now automatically gets: replies, reactions, typing indicator, message actions, mini profile popup, day separators, unread markers, message grouping, embeds (YouTube/Twitter/images), scroll-to-bottom FAB, toast notifications, emote picker, GIF picker.

---

## Chunk 4: Merged Emote+GIF Picker & Icon Buttons

### Task 8: Merge GifPicker into EmotePicker as tabs

**Files:**
- Modify: `src/components/ui/EmotePicker.tsx` (add GIF tab)
- Modify: `src/components/ui/EmotePicker.module.scss` (tab styles + GIF grid)
- Delete: `src/components/ui/GifPicker.tsx`
- Delete: `src/components/ui/GifPicker.module.scss`
- Modify: `src/components/ui/MessageInput.tsx` (remove GIF button, single picker toggle)

- [ ] **Step 1: Rewrite EmotePicker with tabs**

Add a `tab` state (`"emotes" | "gifs"`). Render tab bar at top, then either emote grid or GIF search grid below. Move GifPicker logic inline (fetch, search, results grid). Accept `onSelectGif` prop alongside `onSelect`.

```tsx
interface Props {
  onSelect: (emoteCode: string) => void
  onSelectGif?: (markdownImage: string) => void
  onClose: () => void
}
```

Tab bar: two buttons "Emotes" and "GIFs", active tab gets accent underline.

- [ ] **Step 2: Update EmotePicker.module.scss**

Add `.tabBar`, `.tab`, `.tabActive` styles. Move GIF grid styles from GifPicker.module.scss into this file. Increase picker height to accommodate GIF grid (`max-height: 320px`).

- [ ] **Step 3: Update MessageInput — single icon button**

Replace the two text buttons ("emote" and "gif") with a single smiley icon button that toggles the combined picker:

```tsx
<button
  className={`${styles.pickerBtn} ${showPicker ? styles.pickerBtnActive : ""}`}
  onClick={() => setShowPicker((v) => !v)}
  type="button"
  aria-label="Emote & GIF picker"
>
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
    <line x1="9" y1="9" x2="9.01" y2="9"/>
    <line x1="15" y1="9" x2="15.01" y2="9"/>
  </svg>
</button>
```

Remove `showGifPicker` state, `GifPicker` import. Single `showPicker` state.

- [ ] **Step 4: Delete GifPicker files**

Remove `src/components/ui/GifPicker.tsx` and `src/components/ui/GifPicker.module.scss`.

---

## Chunk 5: Name Colours

### Task 9: ChatSettings component (name colour picker)

**Files:**
- Create: `src/components/ui/ChatSettings.tsx`
- Create: `src/components/ui/ChatSettings.module.scss`

- [ ] **Step 1: Create ChatSettings component**

A small popup with a grid of colour swatches + a hex input. Preset colours: the ROYGBIV set plus some extras (white, pink, cyan, lime). Selecting a colour calls `updateProfile({ name_color: hex })`. A "reset" button clears to null (default accent colour).

```tsx
interface Props {
  currentColor: string | null
  onSave: (color: string | null) => void
  onClose: () => void
}
```

Outside click and Escape to dismiss. Position: anchored above the settings button.

- [ ] **Step 2: Style ChatSettings**

Frosted glass popup, colour swatch grid (5 columns), hex input at bottom, small save/reset buttons.

---

### Task 10: Wire name colours into ChatRoom header + MessageRow

**Files:**
- Modify: `src/components/ui/ChatRoom.tsx` (add settings button to header)
- Modify: `src/components/ui/MessageRow.tsx` (render name_color on username)
- Modify: `src/components/ui/Chat.module.scss` (settings button style)

- [ ] **Step 1: Add settings gear to ChatRoom header**

Next to the room name, add a small gear icon button that opens `ChatSettings`. Pass the current user's `name_color` from useAuth.

- [ ] **Step 2: Render name_color on MessageRow username**

If `msg.profiles?.name_color` exists, apply it as `style={{ color: msg.profiles.name_color }}` on the username button. Otherwise fall back to the default CSS colour.

- [ ] **Step 3: Apply name_color in MiniProfilePopup**

Show the username in their chosen colour in the mini profile popup too.

---

## Chunk 6: Image Lightbox + Emote Popup

### Task 11: Image lightbox (click-to-expand)

**Files:**
- Create: `src/components/ui/ImageLightbox.tsx`
- Create: `src/components/ui/ImageLightbox.module.scss`
- Modify: `src/components/ui/MessageRow.tsx` (wrap images with click handler)

- [ ] **Step 1: Create ImageLightbox component**

Full-screen overlay with the image centered and scaled to fit viewport. Click backdrop or press Escape to close. Subtle frosted dark backdrop.

```tsx
interface Props {
  src: string
  alt?: string
  onClose: () => void
}
```

- [ ] **Step 2: Style ImageLightbox**

```scss
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  cursor: zoom-out;
}
.image {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 4px;
}
```

- [ ] **Step 3: Wire into MessageRow**

In `renderInlineTokens`, wrap `embedImg` images with an onClick that sets lightbox state. Add `cursor: zoom-in` to `.embedImg` in CSS. Render `<ImageLightbox>` when state is set.

Need to lift lightbox state. Options: (a) use a simple context/zustand slice, or (b) render lightbox at MessageRow level. Option (b) is simpler — each image click opens its own lightbox.

---

### Task 12: Emote popup (Discord-style enlarged view on click)

**Files:**
- Create: `src/components/ui/EmotePopup.tsx`
- Create: `src/components/ui/EmotePopup.module.scss`
- Modify: `src/components/ui/MessageRow.tsx` (wrap emotes with click handler)

- [ ] **Step 1: Create EmotePopup component**

Shows enlarged emote image (128px) with emote name below. Positioned near the click point. Outside click or Escape dismisses.

```tsx
interface Props {
  name: string
  src: string
  anchor: { x: number; y: number }
  onClose: () => void
}
```

- [ ] **Step 2: Style EmotePopup**

```scss
.popup {
  position: fixed;
  z-index: 600;
  background: color-mix(in srgb, var(--color-bg-surface) 95%, transparent);
  backdrop-filter: blur(12px);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}
.emoteImg { width: 96px; height: 96px; object-fit: contain; }
.emoteName {
  font-family: var(--font-code);
  font-size: 0.68rem;
  color: var(--color-text-muted);
}
```

- [ ] **Step 3: Wire into MessageRow inline emotes**

Make emote `<img>` elements clickable (wrap in button or add onClick). On click, show EmotePopup at click position. Track popup state in MessageRow (or lift to MessageList level if needed to avoid multiple popups).

---

## Chunk 7: Final Polish

### Task 13: Clean up and verify

**Files:**
- Modify: `src/components/ui/ChatPage.tsx` (ensure name_color flows through)

- [ ] **Step 1: Verify ChatPage passes all needed props**

ChatPage already passes `accessToken`, `currentUserId`, etc. to ChatRoom. Confirm name_color flows through the message data (it comes from the API response in profiles, so MessageRow gets it automatically via `msg.profiles.name_color`).

- [ ] **Step 2: Test full chat with BgCanvas**

Run `npm run dev`, verify:
- BgCanvas renders behind chat on `chat.subsurfaces.net` (or `VITE_CHAT_MODE=true`)
- BgModeToggle appears in QuickControls for chat
- Frosted glass effect visible on chat containers

- [ ] **Step 3: Test sidechat unification**

On wiki, open sidechat:
- Room selector works
- All ChatRoom features present (replies, reactions, typing, message actions, embeds)
- Avatars hidden at 320px width (container query)
- Frosted glass panel

- [ ] **Step 4: Test emoji/GIF picker**

- Single smiley icon button
- Emotes tab shows grid
- GIFs tab shows search + grid
- Selecting emote inserts `:name:` code
- Selecting GIF inserts `![](url)`

- [ ] **Step 5: Test name colours**

- Settings gear in room header opens colour picker
- Selecting colour saves to profile
- Username renders in chosen colour in messages
- Other users see the colour

- [ ] **Step 6: Test image lightbox**

- Click embedded image in message
- Full-screen overlay with enlarged image
- Click backdrop or Escape to close

- [ ] **Step 7: Test emote popup**

- Click emote in message
- Enlarged popup with emote name
- Click away to dismiss

- [ ] **Step 8: Build check**

Run `npm run build` to verify no TypeScript errors and clean production build.

---

## Execution Notes

- **Migration first:** Task 1 must run before anything else — the API and frontend depend on `name_color` existing.
- **Tasks 2-3** can run in parallel (API + types).
- **Tasks 4-5** (BgCanvas + frosted glass) are independent of Tasks 6-7 (SideChat unification).
- **Task 8** (picker merge) is independent of other chunks.
- **Tasks 9-10** (name colours) depend on Tasks 2-3 being complete.
- **Tasks 11-12** (lightbox + emote popup) are independent of everything else.
- **Task 13** is the final integration test.
