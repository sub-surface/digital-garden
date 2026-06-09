# Chess Overhaul + Silent-Failure Cleanup + Docs/Terminal — Design

Date: 2026-06-09

Three independent workstreams from a codebase review. Ordered: chess first (largest),
then silent-failure cleanup, then docs sync + cute terminal commands.

---

## Workstream 1: Chess Overhaul

### Problem

1. **Strength selector is broken.** `useStockfish` loads `stockfish.js@10.0.2` from a CDN
   inside a Blob worker. When that load fails (ancient pinned version, WASM MIME issues),
   the page silently falls back to *random moves at every level* — so all 8 "Stockfish
   Levels" feel identical and broken.
2. **GIF export errors.** `ChessPage.exportGif` does a direct cross-origin
   `POST https://lichess1.org/game/export/gif` with `Content-Type: application/x-chess-pgn`
   (a non-simple content-type) → CORS preflight → Lichess rejects it for arbitrary origins.
   No Worker proxy exists. Failure is swallowed by `console.error`.
3. **No quick path to analysis.** Users want to open the played position/game in Lichess.
4. **Framing is built around Stockfish-as-deity** ("Encounter the machine-god", "Machine is
   thinking") — incongruous once the engine is a small homemade bot.

### Solution

#### 1a. Replace Stockfish with a homemade three-flavour bot

**Delete:** `src/hooks/useStockfish.ts` and all CDN/Blob-worker machinery.

**Add:** `src/lib/chessBot.ts` — pure, synchronous, dependency-free (uses `chess.js`,
already a dep). Exports:

```ts
export type BotFlavour = "drunk" | "casual" | "sharp"
export function pickBotMove(game: Chess, flavour: BotFlavour): Move | null
```

Behaviour:

| Flavour    | Behaviour |
|------------|-----------|
| **Drunk**  | 80% uniformly-random legal move; 20% one-ply greedy material grab. Blunders cheerfully. |
| **Casual** | Greedy one-ply: score each legal move by captured-piece value (+ small bonus for checks), pick the max; ties broken randomly. No lookahead, but takes hanging pieces. |
| **Sharp**  | Negamax depth 3 with alpha-beta pruning. Eval = material (centipawn values) + a single shared piece-square table for positional sense + small mobility term. Light move-ordering (captures first) for prune efficiency. |

Determinism: `Math.random()` is used for Drunk/Casual tie-breaking and Drunk's coin flip.
This is client-only runtime code (not a build script), so `Math.random()` is fine here.

Performance: depth-3 negamax over ~30 legal moves is well under 100ms in practice; runs
synchronously on the main thread. No worker, no async, no loading state.

#### 1b. Store changes

In `src/store/index.ts`:
- Remove `chessDifficulty: number` / `setChessDifficulty`.
- Add `chessBot: BotFlavour` (default `"casual"`) + `setChessBot`. Persist to
  `localStorage` under key `chessBot` (matches existing chat-pref persistence pattern).

#### 1c. ChessPage changes

- Drop `useStockfish`; import `pickBotMove`.
- The "Stockfish Level" 8-button grid → a 3-button flavour selector ("Drunk" / "Casual" /
  "Sharp") reusing existing `.difficultyGrid` (3-col) + `.diffBtn` styles. Remove
  `.levelGrid` and `DIFFICULTY_LABELS`.
- Bot move: on the bot's turn, `setTimeout(() => makeBotMove(), 350ms)` for a "thinking"
  beat. `makeBotMove` calls `pickBotMove(game, flavour)` and applies it via existing
  `makeAMove`. Remove `makeRandomMove`/`makeEngineMove`/`engineState` coupling.
- Remove engine-state tags (`(loading...)`, `(fallback)`) and `.engineTag` usage.
- Status text: keep "{Colour}'s Turn (You)" for the player; opponent turn shows a softened
  "Thinking…" (see 1e).

#### 1d. Fix GIF export via Worker proxy

Add to `src/worker.ts`:
- Route: `POST /api/chess/gif` → `handleChessGif(request, env)`.
- Handler reads the PGN text body, server-side `fetch`es
  `https://lichess1.org/game/export/gif` with `Content-Type: application/x-chess-pgn`
  (Worker→server, no browser CORS), and returns the GIF bytes with `corsHeaders()` +
  `Content-Type: image/gif`. On upstream non-2xx, return `jsonResponse({error}, 502)`.
- Dispatch entry placed with the other `/api/chess` / chat routes near the top of `fetch`.

`ChessPage.exportGif` POSTs to same-origin `/api/chess/gif` instead of cross-origin Lichess.
On failure, set a transient `exportError` state so the button shows "Export failed" for
~2.5s instead of only `console.error` (visible-failure, per project sensibility).

Local-dev note: in `wrangler.dev.toml` the Worker may not run; the same-origin
`/api/chess/gif` request returns 404 there. Acceptable — GIF export is verified against the
deployed Worker. (PGN export and Lichess-open both work locally.)

#### 1e. Soften framing + check/mate flourish

- Header copy: soften "Encounter the machine-god." to something lighter (e.g. "A small
  machine that plays chess." — final wording is the user's voice; placeholder used unless
  user supplies one).
- **Check/mate animation:** derive `game.isCheck()` and `game.isCheckmate()` from the game
  state. On a state transition into check, add a transient CSS class to `.boardWrapper`
  (`data-check="true"`) that runs a short pulse/glow keyframe using `--color-accent-base`
  (respects the user's accent). On checkmate, a slightly longer celebratory shake/glow
  (`data-mate="true"`). Both implemented as CSS keyframes in `ChessPage.module.scss`,
  toggled via a `useEffect` watching `game`. Honour `prefers-reduced-motion` by disabling
  the keyframes in that media query.

#### 1f. "Open in Lichess" button

Third export button, "Analyse on Lichess". Lichess `/import` accepts a POST. To handle
long PGNs and land on the analysis board, build a transient `<form method="POST"
action="https://lichess.org/import" target="_blank">` with a hidden `pgn` field,
`document.body.appendChild`, `submit()`, then remove. Disabled when no move history.

### Files touched (Workstream 1)
- Delete `src/hooks/useStockfish.ts`
- Add `src/lib/chessBot.ts`
- Edit `src/store/index.ts`
- Edit `src/components/ui/ChessPage.tsx`
- Edit `src/components/ui/ChessPage.module.scss`
- Edit `src/worker.ts`

---

## Workstream 2: Silent-Failure Cleanup

### Problem

~10 empty `.catch(() => {})` blocks swallow errors, contradicting the documented
sensibility "make failure visible and explicit, not silent." Locations (from grep):
`BgCanvas.tsx`, `ChatPage.tsx`, `ChatRoom.tsx`, `ChatSettings.tsx` (×4), `EmotePicker.tsx`,
`SideChat.tsx`, `WikiAdminPage.tsx`.

### Solution

Triage each — not all are equal:
- **User-facing actions** (ChatSettings saves, admin actions): surface a visible signal
  (existing toast system where available, else a transient inline error). These are the
  real UX gaps.
- **Best-effort background loads** (BgCanvas asset prefetch, EmotePicker index warm,
  ChatPage/SideChat non-critical fetches): replace bare `() => {}` with
  `(e) => console.warn("<context>:", e)` so failures are at least observable in devtools,
  not invisible. Keep them non-fatal.

Each site is evaluated individually; the deliverable is "no silently-swallowed error" —
either a user-visible signal or at minimum a contextual `console.warn`. No behavioural
change to the success path.

### Files touched (Workstream 2)
- `src/components/layout/BgCanvas.tsx`, `src/components/ui/ChatPage.tsx`,
  `ChatRoom.tsx`, `ChatSettings.tsx`, `EmotePicker.tsx`, `SideChat.tsx`,
  `WikiAdminPage.tsx` (catch handlers only).

---

## Workstream 3: Docs Sync + Cute Terminal Commands

### 3a. Docs sync (small, factual)

- `CLAUDE.md`: the "Three Shells" section is correct, but a stray "Two shells" reference
  exists elsewhere — reconcile to three (AppShell / WikiShell / ChatShell). (Memory file
  already flags this.)
- `docs/future.md`: update "37 broken wikilinks" → current count (41 at review time);
  leave the cluster-breakdown pointer to `garden.md` intact.
- `docs/future.md` Terminal Mode backlog: tick whichever `/log`, `/grep`, `/watch`
  commands get implemented in 3b.
- Add the chess overhaul to the appropriate completed-items list (Garden section) and
  remove now-stale Stockfish-latency items, since the engine is gone.

### 3b. Cute terminal commands

From the existing `docs/future.md` Terminal Mode backlog, implement the ones whose data is
already client-side (no new backend):
- `/log <n>` — dump last N messages as plain text into the terminal output.
- `/grep <pattern>` — local case-insensitive search across currently-loaded messages.
- `/watch <username>` — toggle highlight for lines from a given user (client-side filter
  state).

Implementation: these live in the terminal command dispatcher (in `TerminalChatView.tsx`
or its command module — to be confirmed by reading the existing `/options`, `/reply`
command handlers). Each follows the established command pattern; output rendered as terminal
lines. No Worker or Supabase changes.

`/ping`, `/emotes off`, screensaver, and WebSocket access are explicitly OUT of scope
(need latency plumbing, render-mode flags, or new endpoints).

### Files touched (Workstream 3)
- `CLAUDE.md`, `docs/future.md`
- Terminal command handler (`src/components/ui/TerminalChatView.tsx` or its command module)

---

## Out of Scope (explicitly)

- `src/worker.ts` decomposition (1888-line file) — not selected this session.
- Broken-wikilink content fixes — not selected this session (count synced in docs only).
- Terminal `/ping`, `/emotes off`, screensaver, WebSocket — deferred.

## Verification

- `npx tsc --noEmit` clean after each workstream.
- `npm run dev` — play a game against each flavour; confirm Drunk blunders, Casual grabs
  hanging pieces, Sharp plays sensibly; confirm check/mate flourish fires; PGN export and
  Lichess-open work locally.
- GIF export verified against deployed Worker (proxy route) post-merge.
- Terminal: `/log 5`, `/grep foo`, `/watch <user>` produce expected output.
