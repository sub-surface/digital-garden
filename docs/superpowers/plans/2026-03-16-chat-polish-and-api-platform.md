# Chat Polish and API Platform — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox syntax for tracking.

**Goal:** Add footnote sidenotes, ephemeral glow reactions, message density/scaling settings, a terminal skin toggle, and an API key auth layer to the chat platform.

**Architecture:** Four UI features are entirely frontend (parseMessageBody + MessageRow + ChatSettings + QuickControls). API platform extends verifyAuth in the Worker to accept Authorization: Bearer api_key from a new api_keys Supabase table alongside Supabase JWTs. No existing UI is removed — terminal view is additive via a CSS data-attribute on the chat layout.

**Tech Stack:** React 19, SCSS Modules, Zustand, Supabase, Cloudflare Worker (TypeScript)

---

## Parallel Execution Guide

- **Agent A:** Task 1 then Task 2 (footnotes — sequential dependency)
- **Agent B:** Task 3 then Task 4 (density + terminal skin — Task 4 reads store from Task 3)
- **Agent C:** Task 5 (API keys — fully independent of all UI tasks)
- **All complete then:** Task 6 (final verification)

---

## Chunk 1: Footnote Sidenotes

### Task 1: Add footnote token type to parseMessageBody

**Files:**
- Modify: `src/lib/parseMessageBody.ts`

Footnote syntax: `[^1]` inline reference + `[^1]: content` definition line anywhere in message body. Parser extracts definitions first, strips them from body, then replaces inline refs with footnote-ref tokens. Definitions returned as a Map alongside tokens.

- [ ] **Step 1: Add footnote-ref to MessageToken union**

At the top of `parseMessageBody.ts`, add to the MessageToken union:

```
| { type: "footnote-ref"; index: number }
```

Add exported interface and function after the existing parseMessageBody export:

```ts
export interface ParsedMessage {
  tokens: MessageToken[]
  footnotes: Map<number, string>
}
export function parseMessageBodyWithFootnotes(text: string): ParsedMessage { ... }
```

- [ ] **Step 2: Add regex constants**

Near the top with other regex constants:

```ts
const FOOTNOTE_DEF_RE = /^\[\^(\d+)\]:\s*(.+)$/
const FOOTNOTE_REF_RE = /^\[\^(\d+)\]$/
```

- [ ] **Step 3: Implement parseMessageBodyWithFootnotes**

```ts
export function parseMessageBodyWithFootnotes(text: string): ParsedMessage {
  const footnotes = new Map<number, string>()
  const bodyLines: string[] = []
  for (const line of text.split("\n")) {
    const defMatch = FOOTNOTE_DEF_RE.exec(line.trim())
    if (defMatch) {
      footnotes.set(Number(defMatch[1]), defMatch[2])
    } else {
      bodyLines.push(line)
    }
  }
  const tokens = parseMessageBody(bodyLines.join("\n"))
  return { tokens, footnotes }
}
```

- [ ] **Step 4: Inject footnote-ref in the word loop**

Inside parseMessageBody, in the main word loop, before the emote check:

```ts
if (FOOTNOTE_REF_RE.test(part)) {
  flushText()
  tokens.push({ type: "footnote-ref", index: Number(part.slice(2, -1)) })
  continue
}
```

- [ ] **Step 5: Verify TypeScript compiles**

`npm run build 2>&1 | head -40` — expected: no errors.

- [ ] **Step 6: Commit**

`git add src/lib/parseMessageBody.ts && git commit -m "feat(chat): footnote token type in parseMessageBody"`

---

### Task 2: Render footnote sidenotes in MessageBodyRenderer

**Files:**
- Modify: `src/components/ui/MessageRow.tsx`
- Modify: `src/components/ui/Chat.module.scss`

Desktop (>900px): aside positioned left: calc(100% + 1rem), width 180px, absolute. Mobile (<=900px): details inline. Both rendered in DOM; CSS controls which is visible.

- [ ] **Step 1: Import parseMessageBodyWithFootnotes**

```ts
import { parseMessageBody, parseMessageBodyWithFootnotes } from "@/lib/parseMessageBody"
```

- [ ] **Step 2: Update MessageBodyRenderer**

Replace `parseMessageBody(body)` with:

```ts
const { tokens, footnotes } = parseMessageBodyWithFootnotes(body)
```

Add footnote-ref case to renderInlineTokens:

```tsx
if (tok.type === "footnote-ref") return (
  <sup key={key} className={styles.footnoteRef}>{tok.index}</sup>
)
```

- [ ] **Step 3: Render sidenotes alongside body**

After main body tokens:

```tsx
{footnotes.size > 0 && (
  <>
    <aside className={styles.sidenotes}>
      {Array.from(footnotes.entries()).map(([idx, content]) => (
        <div key={idx} className={styles.sidenote}>
          <sup className={styles.sidenoteNum}>{idx}</sup>
          <span className={styles.sidenoteText}>{content}</span>
        </div>
      ))}
    </aside>
    <div className={styles.sidenotesMobile}>
      {Array.from(footnotes.entries()).map(([idx, content]) => (
        <details key={idx}>
          <summary>note {idx}</summary>
          {content}
        </details>
      ))}
    </div>
  </>
)}
```

Ensure the message body wrapper div has `position: relative`.

- [ ] **Step 4: Add SCSS to Chat.module.scss**

```scss
.footnoteRef {
  font-size: 0.7em;
  color: var(--color-accent-base);
  vertical-align: super;
  line-height: 1;
}
.sidenotes {
  position: absolute;
  left: calc(100% + 1rem);
  top: 0;
  width: 180px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  @media (max-width: 900px) { display: none; }
}
.sidenote {
  display: flex;
  gap: 0.4rem;
  font-size: 0.75rem;
  color: var(--color-text);
  opacity: 0.7;
  line-height: 1.4;
}
.sidenoteNum { flex-shrink: 0; color: var(--color-accent-base); font-size: 0.7em; }
.sidenoteText { flex: 1; }
.sidenotesMobile {
  margin-top: 0.4rem;
  details {
    font-size: 0.75rem; color: var(--color-text); opacity: 0.7;
    summary {
      cursor: pointer; color: var(--color-accent-base); list-style: none;
      &::-webkit-details-marker { display: none; }
    }
  }
  @media (min-width: 901px) { display: none; }
}
```

- [ ] **Step 5: Verify build and commit**

`npm run build 2>&1 | head -40`

`git add src/components/ui/MessageRow.tsx src/components/ui/Chat.module.scss && git commit -m "feat(chat): Tufte-style footnote sidenotes in message body"`

---

## Chunk 2: Ephemeral Glow on Reactions

### Task 3: Animate reaction glow on MessageRow

**Files:**
- Create: `src/lib/emoteColor.ts`
- Modify: `src/components/ui/MessageRow.tsx`
- Modify: `src/components/ui/Chat.module.scss`

Browser-only — never import from worker.ts. Emote dominant colour sampled via canvas, cached per name. Animation is ephemeral — CSS keyframe via data-glow attribute, no persistent tint.

- [ ] **Step 1: Create src/lib/emoteColor.ts**

```ts
// Browser-only utility — do not import from worker.ts
const cache = new Map<string, string>()

export async function getEmoteColor(name: string): Promise<string> {
  if (cache.has(name)) return cache.get(name)!
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = "/emotes/" + name + ".gif"
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas")
        canvas.width = img.naturalWidth || 32
        canvas.height = img.naturalHeight || 32
        const ctx = canvas.getContext("2d")
        if (!ctx) { resolve("#b4424c"); return }
        ctx.drawImage(img, 0, 0)
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        let r = 0, g = 0, b = 0, count = 0
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 128) { r += data[i]; g += data[i + 1]; b += data[i + 2]; count++ }
        }
        if (count === 0) { resolve("#b4424c"); return }
        const toHex = (v: number) => Math.round(v / count).toString(16).padStart(2, "0")
        const color = "#" + toHex(r) + toHex(g) + toHex(b)
        cache.set(name, color)
        resolve(color)
      } catch { resolve("#b4424c") }
    }
    img.onerror = () => resolve("#b4424c")
  })
}
```

Emotes served from same origin (/emotes/) — crossOrigin anonymous will not be blocked by CORS.

- [ ] **Step 2: Add glow state to MessageRow**

```ts
import { getEmoteColor } from "@/lib/emoteColor"

const [glowColor, setGlowColor] = useState<string | null>(null)
const glowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

async function triggerGlow(emote: string) {
  const color = await getEmoteColor(emote)
  setGlowColor(color)
  if (glowTimerRef.current) clearTimeout(glowTimerRef.current)
  glowTimerRef.current = setTimeout(() => setGlowColor(null), 900)
}

useEffect(() => () => {
  if (glowTimerRef.current) clearTimeout(glowTimerRef.current)
}, [])
```

Call triggerGlow(emote) inside the existing reaction button click handler. Apply to row wrapper div:

```tsx
style={glowColor ? { "--glow-color": glowColor } as React.CSSProperties : undefined}
data-glow={glowColor ? "1" : undefined}
```

- [ ] **Step 3: Add CSS keyframe in Chat.module.scss**

```scss
@keyframes reactionGlow {
  0%   { box-shadow: 0 0 0px transparent; }
  30%  { box-shadow: 0 0 18px 4px var(--glow-color, var(--color-accent-base)); }
  100% { box-shadow: 0 0 0px transparent; }
}
.msgRow[data-glow="1"] {
  animation: reactionGlow 0.9s ease-out forwards;
}
```

- [ ] **Step 4: Verify emoteColor not in Worker and build passes**

`grep -r "emoteColor" src/worker.ts` — expected: no output.
`npm run build 2>&1 | head -40` — expected: zero errors.

- [ ] **Step 5: Commit**

`git add src/lib/emoteColor.ts src/components/ui/MessageRow.tsx src/components/ui/Chat.module.scss && git commit -m "feat(chat): ephemeral emote-colour glow on reactions"`

---

## Chunk 3: Message Density and Text Scaling

### Task 4: Density and font-scale settings

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/components/layout/ChatShell.tsx`
- Modify: `src/components/ui/ChatSettings.tsx`
- Modify: `src/components/ui/ChatSettings.module.scss`
- Modify: `src/components/ui/Chat.module.scss`

Three density presets: compact / comfortable (default) / spacious. Three font scale steps: 0.85 / 1.0 / 1.15. Persisted to localStorage via Zustand. Applied as data-density attribute and --chat-font-scale CSS variable on ChatShell root.

- [ ] **Step 1: Add chatDensity and chatFontScale to GardenStore interface**

```ts
chatDensity: "compact" | "comfortable" | "spacious"
setChatDensity: (d: GardenStore["chatDensity"]) => void
chatFontScale: number
setChatFontScale: (s: number) => void
```

- [ ] **Step 2: Initialise in create() — follow existing localStorage pattern**

```ts
chatDensity: (typeof localStorage !== "undefined"
  ? (localStorage.getItem("chatDensity") as "compact" | "comfortable" | "spacious" | null) ?? "comfortable"
  : "comfortable"),
setChatDensity: (d) => { localStorage.setItem("chatDensity", d); set({ chatDensity: d }) },
chatFontScale: (typeof localStorage !== "undefined"
  ? Number(localStorage.getItem("chatFontScale") || "1")
  : 1),
setChatFontScale: (s) => { localStorage.setItem("chatFontScale", String(s)); set({ chatFontScale: s }) },
```

- [ ] **Step 3: Apply to ChatShell root div**

```tsx
const chatDensity = useStore((s) => s.chatDensity)
const chatFontScale = useStore((s) => s.chatFontScale)
// add to root div:
data-density={chatDensity}
style={{ "--chat-font-scale": chatFontScale } as React.CSSProperties}
```

- [ ] **Step 4: Add density overrides to Chat.module.scss**

```scss
:global([data-density="compact"]) .messageListInner { gap: 0; }
:global([data-density="compact"]) .msgRow {
  padding-block: 0.1rem;
  font-size: calc(0.875rem * var(--chat-font-scale, 1));
}
:global([data-density="spacious"]) .messageListInner { gap: 0.5rem; }
:global([data-density="spacious"]) .msgRow {
  padding-block: 0.45rem;
  font-size: calc(1rem * var(--chat-font-scale, 1));
}
```

- [ ] **Step 5: Add density and scale UI to ChatSettings.tsx**

```tsx
const DENSITY_OPTIONS = ["compact", "comfortable", "spacious"] as const
const SCALE_OPTIONS = [
  { label: "S", value: 0.85 },
  { label: "M", value: 1.0 },
  { label: "L", value: 1.15 },
]
// Add below reset button:
<div className={styles.divider} />
<div className={styles.header}>density</div>
<div className={styles.densityRow}>
  {DENSITY_OPTIONS.map(d => (
    <button key={d} type="button"
      className={chatDensity === d ? styles.densityBtn + " " + styles.active : styles.densityBtn}
      onClick={() => setChatDensity(d)}
    >{d}</button>
  ))}
</div>
<div className={styles.header}>text size</div>
<div className={styles.scaleRow}>
  {SCALE_OPTIONS.map(o => (
    <button key={o.value} type="button"
      className={chatFontScale === o.value ? styles.scaleBtn + " " + styles.active : styles.scaleBtn}
      onClick={() => setChatFontScale(o.value)}
    >{o.label}</button>
  ))}
</div>
```

- [ ] **Step 6: Add SCSS to ChatSettings.module.scss**

```scss
.densityRow, .scaleRow {
  display: flex; gap: 0.4rem; margin-bottom: 0.75rem;
}
.densityBtn, .scaleBtn {
  flex: 1; padding: 0.3rem 0.5rem; background: transparent;
  border: 1px solid rgba(255,255,255,0.12); color: var(--color-text);
  border-radius: 3px; font-size: 0.75rem; cursor: pointer;
  transition: border-color 0.15s;
  &:hover { border-color: var(--color-accent-base); }
  &.active { border-color: var(--color-accent-base); color: var(--color-accent-base); }
}
```

- [ ] **Step 7: Verify build and commit**

`npm run build 2>&1 | head -40`

`git add src/store/index.ts src/components/layout/ChatShell.tsx src/components/ui/ChatSettings.tsx src/components/ui/ChatSettings.module.scss src/components/ui/Chat.module.scss && git commit -m "feat(chat): message density and font scale settings"`

---

## Chunk 4: Terminal Skin Toggle

### Task 5: Terminal view via QuickControls button

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/components/layout/QuickControls.tsx`
- Modify: `src/components/layout/QuickControls.module.scss`
- Modify: `src/components/layout/ChatShell.tsx`
- Modify: `src/components/ui/Chat.module.scss`

All changes are CSS-only via data-terminal="1" on shell root. No component structure changes, no functionality removed. Toggling off fully restores original appearance.

- [ ] **Step 1: Add chatTerminal to Zustand store**

Interface:
```ts
chatTerminal: boolean
setChatTerminal: (v: boolean) => void
```

Init:
```ts
chatTerminal: (typeof localStorage !== "undefined"
  ? localStorage.getItem("chatTerminal") === "1"
  : false),
setChatTerminal: (v) => {
  localStorage.setItem("chatTerminal", v ? "1" : "0")
  set({ chatTerminal: v })
},
```

- [ ] **Step 2: Apply data-terminal to ChatShell root div**

```tsx
const chatTerminal = useStore((s) => s.chatTerminal)
// add to root div alongside data-density:
data-terminal={chatTerminal ? "1" : undefined}
```

- [ ] **Step 3: Add TerminalToggle sub-component to QuickControls.tsx**

```tsx
function TerminalToggle() {
  const shell = useShell()
  const chatTerminal = useStore((s) => s.chatTerminal)
  const setChatTerminal = useStore((s) => s.setChatTerminal)
  if (shell !== "chat") return null
  return (
    <button
      className={chatTerminal ? styles.iconBtn + " " + styles.iconBtnActive : styles.iconBtn}
      onClick={() => setChatTerminal(!chatTerminal)}
      title={chatTerminal ? "Exit terminal view" : "Terminal view"}
      aria-label="Toggle terminal view"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5"/>
        <line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
    </button>
  )
}
```

Add `<TerminalToggle />` before `<ProfileButton />` in the QuickControls return.

- [ ] **Step 4: Add iconBtnActive to QuickControls.module.scss**

```scss
.iconBtnActive {
  color: var(--color-accent-base);
  opacity: 1;
}
```

- [ ] **Step 5: Add terminal skin CSS to Chat.module.scss**

All rules scoped under data-terminal="1" — additive only, nothing overriding other shells:

```scss
:global([data-terminal="1"]) {
  .chatMain { font-family: var(--font-code), monospace; }
  .msgRow { border-bottom: 1px solid #1a3a1a; }
  .avatarCircle { display: none; }
  .msgUsername::before { content: "> "; opacity: 0.5; }
  .msgUsername { color: #33ff33 !important; font-family: var(--font-code), monospace; }
  .msgBody { color: #ccffcc; font-family: var(--font-code), monospace; }
  .msgTime { color: #1a6b1a; }
}
```

Fallback if :global scoping does not apply: pass a `terminal` boolean prop to MessageRow and apply a `styles.terminalRow` local class directly — avoids :global entirely. Only use this if the data-attribute CSS approach fails.

- [ ] **Step 6: Smoke test**

`npm run dev` with `VITE_CHAT_MODE=true` in .env.local. Toggle terminal mode. Verify: monospace font, avatars hidden, `> ` prefix on usernames, toggle-off restores appearance, no console errors.

- [ ] **Step 7: Commit**

`git add src/store/index.ts src/components/layout/QuickControls.tsx src/components/layout/QuickControls.module.scss src/components/layout/ChatShell.tsx src/components/ui/Chat.module.scss && git commit -m "feat(chat): terminal view skin toggle in QuickControls"`

---

## Chunk 5: API Key Auth Platform

### Task 6: api_keys table, verifyAuth extension, CRUD endpoints

**Files:**
- Modify: `src/worker.ts`
- SQL migration (run manually in Supabase SQL Editor — not via the Worker)

**Security properties:**
- Raw keys SHA-256 hashed before DB insert — plaintext never persisted
- `sk_` prefix makes keys identifiable if accidentally leaked to logs or config
- Soft-revoke: revoked_at set, never hard-deleted — preserves audit trail
- Lookup filters `revoked_at IS NULL` — revoked keys are dead immediately
- `user_id` scoping on GET/DELETE — users cannot list or revoke other users' keys
- `last_used_at` update is fire-and-forget — its failure never blocks the request
- `crypto.subtle.digest` and `crypto.getRandomValues` are native CF Workers APIs

- [ ] **Step 1: Run SQL in Supabase SQL Editor**

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT 'API Key',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX ON api_keys (key_hash) WHERE revoked_at IS NULL;
CREATE INDEX ON api_keys (user_id);
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Add hashApiKey helper to worker.ts**

```ts
async function hashApiKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
}
```

- [ ] **Step 3: Extract buildAuthUser helper**

Extract the existing profile-fetch block from verifyAuth into:
```ts
async function buildAuthUser(env: Env, userId: string, email: string | null): Promise<AuthUser | null>
```
This avoids duplicating profile fetching in both JWT and API key paths.

- [ ] **Step 4: Extend verifyAuth — add API key fallthrough after JWT check**

After the `if (userRes.ok)` JWT block, add:

```ts
// 2. Try as API key
const keyHash = await hashApiKey(token)
const keyRes = await fetch(
  env.SUPABASE_URL + "/rest/v1/api_keys?key_hash=eq." + encodeURIComponent(keyHash) + "&revoked_at=is.null&select=user_id",
  { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_KEY } }
)
if (!keyRes.ok) return null
const keyRows = await keyRes.json<{ user_id: string }[]>()
if (!keyRows[0]) return null

// Update last_used_at — fire and forget
fetch(env.SUPABASE_URL + "/rest/v1/api_keys?key_hash=eq." + encodeURIComponent(keyHash), {
  method: "PATCH",
  headers: {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: "Bearer " + env.SUPABASE_SERVICE_KEY,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  },
  body: JSON.stringify({ last_used_at: new Date().toISOString() }),
}).catch(() => {})

return buildAuthUser(env, keyRows[0].user_id, null)
```

- [ ] **Step 5: Add handleAdminApiKeys function**

Three endpoints:

**POST /api/admin/api-keys** — generate key:
- Verify auth
- `crypto.getRandomValues(new Uint8Array(32))` — encode as hex
- Hash with hashApiKey
- Insert `{ user_id, key_hash, name }` — key_hash only in DB
- Return `{ key: "sk_" + rawKey, name }` — raw key shown once, never stored again

**GET /api/admin/api-keys** — list own keys:
- Verify auth
- Query `api_keys?user_id=eq.{id}&select=id,name,created_at,last_used_at,revoked_at&order=created_at.desc`
- key_hash never included in response

**DELETE /api/admin/api-keys/:id** — soft revoke:
- Verify auth
- PATCH `api_keys?id=eq.{keyId}&user_id=eq.{authUser.id}` with `{ revoked_at: now }`
- user_id filter prevents revoking others' keys

- [ ] **Step 6: Add route dispatch in main fetch handler**

```ts
if (url.pathname === "/api/admin/api-keys" ||
    url.pathname.match(/^\/api\/admin\/api-keys\/[^/]+$/)) {
  return handleAdminApiKeys(request, env, url)
}
```

- [ ] **Step 7: Verify CORS includes Authorization header**

`grep -n "Access-Control-Allow-Headers" src/worker.ts`

Confirm Authorization is included. If not, add it to the preflight CORS handler — external API clients need it.

- [ ] **Step 8: Verify build**

`npm run build 2>&1 | head -40` — expected: zero TypeScript errors.

- [ ] **Step 9: Commit**

`git add src/worker.ts && git commit -m "feat(chat): API key auth — SHA-256 hashed keys, verifyAuth fallthrough, CRUD endpoints"`

---

## Chunk 6: Final Verification

### Task 7: Build and safety checks

- [ ] **Step 1: Full clean build**

`npm run build 2>&1`

Expected: zero TypeScript errors, zero Vite errors, dist/ populated.

CF build risk checklist:
- emoteColor.ts uses document.createElement("canvas") — browser-only, not imported by worker.ts, tree-shaken
- crypto.subtle in Worker — native CF Workers API, no polyfill needed
- localStorage access in store — guarded by typeof localStorage !== "undefined" (existing pattern)
- CSS :global([data-terminal]) and :global([data-density]) — plain CSS, no CF issue

- [ ] **Step 2: Confirm emoteColor not in Worker bundle**

`grep -r "emoteColor" src/worker.ts` — expected: no output.

- [ ] **Step 3: Confirm no plaintext key exposure**

`grep -n "rawKey" src/worker.ts`

Verify raw key only: (a) generated in memory, (b) returned in HTTP response body once, (c) hashed before DB insert. Must not appear in any log statement.

- [ ] **Step 4: Push to master**

`git push origin master` — triggers CF auto-deploy.
