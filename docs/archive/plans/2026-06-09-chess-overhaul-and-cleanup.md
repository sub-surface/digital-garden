# Chess Overhaul + Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken Stockfish chess engine with a homemade three-flavour bot, fix GIF export via a Worker proxy, add a Lichess-analysis button and a check/mate flourish; then eliminate silent error-swallowing and sync docs + add three client-side terminal commands.

**Architecture:** Chess AI moves from an unreliable CDN-loaded WASM worker to a pure synchronous in-repo module (`src/lib/chessBot.ts`) built on the existing `chess.js` dep. GIF export routes through the existing CF Worker (`src/worker.ts`) to dodge browser CORS. Terminal commands follow the established `if (cmd === "/x")` + `appendLocalLine` dispatch pattern in `TerminalChatView.tsx`.

**Tech Stack:** React 19, TypeScript, Vite, chess.js, react-chessboard, Zustand, Cloudflare Workers, SCSS modules.

**Verification note:** This project has **no test runner** (no `test` script, no test files). Verification = `npx tsc --noEmit` (must stay clean) plus targeted manual checks via `npm run dev`. Each task ends with a typecheck + commit. Do not introduce a test framework.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/lib/chessBot.ts` | Pure synchronous bot move selection (drunk/casual/sharp) | Create |
| `src/hooks/useStockfish.ts` | Old CDN engine hook | Delete |
| `src/store/index.ts` | Swap `chessDifficulty` → `chessBot` flavour | Modify |
| `src/components/ui/ChessPage.tsx` | Wire bot, GIF proxy, Lichess button, check/mate flourish, softened copy | Modify |
| `src/components/ui/ChessPage.module.scss` | Flavour selector + check/mate keyframes | Modify |
| `src/worker.ts` | `POST /api/chess/gif` proxy route | Modify |
| Various chat/layout files | Replace empty `.catch(()=>{})` | Modify |
| `src/components/ui/TerminalChatView.tsx` | `/log` `/grep` `/watch` commands | Modify |
| `CLAUDE.md`, `docs/future.md` | Doc sync | Modify |

---

## Task 1: Create the homemade bot module

**Files:**
- Create: `src/lib/chessBot.ts`

- [ ] **Step 1: Write the bot module**

Create `src/lib/chessBot.ts` with the full content below. It depends only on `chess.js`.

```ts
import { Chess, type Move } from "chess.js"

export type BotFlavour = "drunk" | "casual" | "sharp"

// Centipawn piece values, keyed by chess.js piece letter.
const PIECE_VALUE: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 0,
}

// A single piece-square table (white's perspective, a8=index 0 → h1=index 63),
// applied to all non-king pieces for light positional sense. Encourages centre
// control and development without per-piece tables.
const PST = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10,   0,   5,   5,   5,   5,   0, -10,
  -10,   5,  10,  15,  15,  10,   5, -10,
  -10,   5,  15,  20,  20,  15,   5, -10,
  -10,   5,  15,  20,  20,  15,   5, -10,
  -10,   5,  10,  15,  15,  10,   5, -10,
  -10,   0,   5,   5,   5,   5,   0, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
]

function squareToIndex(square: string): number {
  const file = square.charCodeAt(0) - 97 // a..h → 0..7
  const rank = 8 - parseInt(square[1], 10) // 8..1 → 0..7
  return rank * 8 + file
}

/** Static evaluation from the side-to-move's perspective (negamax convention). */
function evaluate(game: Chess): number {
  if (game.isCheckmate()) return -100000 // side to move is mated
  if (game.isDraw() || game.isStalemate()) return 0

  let score = 0
  for (const row of game.board()) {
    for (const piece of row) {
      if (!piece) continue
      const val = PIECE_VALUE[piece.type]
      const idx = squareToIndex(piece.square)
      const pst = piece.type === "k" ? 0 : PST[piece.color === "w" ? idx : 63 - idx]
      const signed = (val + pst) * (piece.color === "w" ? 1 : -1)
      score += signed
    }
  }
  // Return from the perspective of the side to move.
  return game.turn() === "w" ? score : -score
}

/** Order moves captures-first to improve alpha-beta pruning. */
function orderMoves(moves: Move[]): Move[] {
  return [...moves].sort((a, b) => {
    const av = a.captured ? PIECE_VALUE[a.captured] : 0
    const bv = b.captured ? PIECE_VALUE[b.captured] : 0
    return bv - av
  })
}

function negamax(game: Chess, depth: number, alpha: number, beta: number): number {
  if (depth === 0 || game.isGameOver()) return evaluate(game)
  let best = -Infinity
  for (const move of orderMoves(game.moves({ verbose: true }) as Move[])) {
    game.move(move)
    const score = -negamax(game, depth - 1, -beta, -alpha)
    game.undo()
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

function randomOf<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** One-ply greedy: prefer best immediate capture (+ small bonus for checks). */
function greedyMove(moves: Move[]): Move {
  let best = moves[0]
  let bestScore = -Infinity
  for (const m of moves) {
    let s = m.captured ? PIECE_VALUE[m.captured] : 0
    if (m.san.includes("+")) s += 30
    if (m.san.includes("#")) s += 100000
    // jitter so equal-value moves vary between games
    s += Math.random() * 5
    if (s > bestScore) { bestScore = s; best = m }
  }
  return best
}

/**
 * Pick a move for the given flavour. Returns null only if no legal moves
 * (caller should already guard game-over). Operates on a clone, so the passed
 * game is never mutated.
 */
export function pickBotMove(game: Chess, flavour: BotFlavour): Move | null {
  const clone = new Chess()
  clone.loadPgn(game.pgn())
  const moves = clone.moves({ verbose: true }) as Move[]
  if (moves.length === 0) return null

  if (flavour === "drunk") {
    return Math.random() < 0.8 ? randomOf(moves) : greedyMove(moves)
  }
  if (flavour === "casual") {
    return greedyMove(moves)
  }

  // sharp: negamax depth 3 with alpha-beta
  let best = moves[0]
  let bestScore = -Infinity
  for (const move of orderMoves(moves)) {
    clone.move(move)
    const score = -negamax(clone, 2, -Infinity, Infinity)
    clone.undo()
    if (score > bestScore) { bestScore = score; best = move }
  }
  return best
}

export const BOT_FLAVOURS: { value: BotFlavour; label: string }[] = [
  { value: "drunk", label: "Drunk" },
  { value: "casual", label: "Casual" },
  { value: "sharp", label: "Sharp" },
]
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (exit 0). If `Move` is not exported from `chess.js`, change the import to `import { Chess } from "chess.js"; type Move = ReturnType<Chess["moves"]>[number]` is wrong — instead use `import { Chess } from "chess.js"; import type { Move } from "chess.js"`. (chess.js v1 exports `Move`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/chessBot.ts
git commit -m "feat(chess): homemade three-flavour bot (drunk/casual/sharp)"
```

---

## Task 2: Swap store field `chessDifficulty` → `chessBot`

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: Add the import and replace the chess slice**

In `src/store/index.ts`, add near the top imports:

```ts
import type { BotFlavour } from "@/lib/chessBot"
```

Replace the interface lines:

```ts
  // Chess
  chessDifficulty: number
  setChessDifficulty: (level: number) => void
```

with:

```ts
  // Chess
  chessBot: BotFlavour
  setChessBot: (flavour: BotFlavour) => void
```

Replace the implementation lines:

```ts
  // Chess
  chessDifficulty: 1,
  setChessDifficulty: (chessDifficulty) => set({ chessDifficulty }),
```

with:

```ts
  // Chess
  chessBot: (typeof localStorage !== "undefined"
    ? (localStorage.getItem("chessBot") as BotFlavour | null) ?? "casual"
    : "casual"),
  setChessBot: (chessBot) => {
    localStorage.setItem("chessBot", chessBot)
    set({ chessBot })
  },
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: FAILS in `ChessPage.tsx` (still references `chessDifficulty`). That's expected — Task 3 fixes it. Confirm the only errors are in `ChessPage.tsx`/`useStockfish.ts`, nothing in `store/index.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/store/index.ts
git commit -m "feat(chess): store chessBot flavour, drop chessDifficulty"
```

---

## Task 3: Rewire ChessPage to the bot; remove Stockfish

**Files:**
- Modify: `src/components/ui/ChessPage.tsx`
- Delete: `src/hooks/useStockfish.ts`

- [ ] **Step 1: Delete the Stockfish hook**

```bash
git rm src/hooks/useStockfish.ts
```

- [ ] **Step 2: Replace imports and engine wiring in ChessPage.tsx**

Replace the import block at the top:

```ts
import { useStockfish } from "@/hooks/useStockfish"
```

with:

```ts
import { pickBotMove, BOT_FLAVOURS } from "@/lib/chessBot"
```

Delete the `DIFFICULTY_LABELS` constant (line 8).

Replace these lines:

```ts
  const difficulty = useStore((s) => s.chessDifficulty)
  const setDifficulty = useStore((s) => s.setChessDifficulty)

  const { getBestMove, state: engineState } = useStockfish(difficulty)
```

with:

```ts
  const botFlavour = useStore((s) => s.chessBot)
  const setBotFlavour = useStore((s) => s.setChessBot)
```

- [ ] **Step 3: Replace the move-generation callbacks**

Delete `makeRandomMove` (lines ~53-59) and `makeEngineMove` (lines ~62-76). Add a single bot mover after `makeAMove`:

```ts
  // Homemade bot move (synchronous)
  const makeBotMove = useCallback(() => {
    if (game.isGameOver() || game.isDraw()) return
    const move = pickBotMove(game, botFlavour)
    if (move) makeAMove({ from: move.from, to: move.to, promotion: move.promotion })
  }, [game, botFlavour, makeAMove])
```

- [ ] **Step 4: Replace the AI-turn effect**

Replace the whole `useEffect` that triggers the AI move (lines ~79-92) with:

```ts
  // Trigger bot move when it's not the player's turn
  useEffect(() => {
    const turn = game.turn() === "w" ? "white" : "black"
    if (turn !== playerColor && !game.isGameOver()) {
      const timer = setTimeout(() => makeBotMove(), 350)
      return () => clearTimeout(timer)
    }
  }, [game, playerColor, makeBotMove])
```

- [ ] **Step 5: Fix the status memo**

Replace the `status` memo body's engine references. Change:

```ts
    return engineState === "thinking" ? "Machine is thinking..." : "Machine's turn"
  }, [game, playerColor, engineState])
```

to:

```ts
    return "Thinking…"
  }, [game, playerColor])
```

- [ ] **Step 6: Replace the difficulty selector UI with the flavour selector**

Replace the whole `<div className={styles.difficultySection}>` that contains "Stockfish Level" and the `levelGrid` (lines ~223-242) with:

```tsx
          <div className={styles.difficultySection}>
            <span className={styles.label}>Opponent</span>
            <div className={styles.difficultyGrid}>
              {BOT_FLAVOURS.map((f) => (
                <button
                  key={f.value}
                  className={styles.diffBtn}
                  data-active={botFlavour === f.value}
                  onClick={() => setBotFlavour(f.value)}
                  title={f.label}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
```

- [ ] **Step 7: Soften the header copy**

Replace:

```tsx
        <p>Encounter the machine-god.</p>
```

with:

```tsx
        <p>A small handmade machine that plays chess.</p>
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (exit 0). If `engineState` still referenced anywhere, remove it.

- [ ] **Step 9: Manual check**

Run: `npm run dev`, open `/chess`. Play several moves against each flavour:
- Drunk: makes obviously loose moves, sometimes hangs pieces.
- Casual: captures your hanging pieces immediately.
- Sharp: declines obvious blunders, recaptures sensibly.

- [ ] **Step 10: Commit**

```bash
git add src/components/ui/ChessPage.tsx
git commit -m "feat(chess): wire homemade bot, drop Stockfish, soften framing"
```

---

## Task 4: Check/mate flourish (CSS + state)

**Files:**
- Modify: `src/components/ui/ChessPage.tsx`
- Modify: `src/components/ui/ChessPage.module.scss`

- [ ] **Step 1: Add flourish state derivation in ChessPage.tsx**

After the `status` memo, add:

```ts
  // Check / checkmate flourish flags (transient pulse on the board wrapper)
  const [flourish, setFlourish] = useState<"check" | "mate" | null>(null)
  useEffect(() => {
    if (game.isCheckmate()) {
      setFlourish("mate")
      return
    }
    if (game.isCheck()) {
      setFlourish("check")
      const t = setTimeout(() => setFlourish(null), 600)
      return () => clearTimeout(t)
    }
    setFlourish(null)
  }, [game])
```

- [ ] **Step 2: Apply the flag to the board wrapper**

Change:

```tsx
        <div className={styles.boardWrapper} ref={boardRef}>
```

to:

```tsx
        <div className={styles.boardWrapper} ref={boardRef} data-flourish={flourish ?? undefined}>
```

- [ ] **Step 3: Add keyframes to ChessPage.module.scss**

Append to `ChessPage.module.scss`:

```scss
@keyframes chessCheckPulse {
  0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-accent-base) 60%, transparent); }
  100% { box-shadow: 0 0 0 14px color-mix(in srgb, var(--color-accent-base) 0%, transparent); }
}

@keyframes chessMateGlow {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-4px); }
  40% { transform: translateX(4px); }
  60% { transform: translateX(-3px); }
  80% { transform: translateX(3px); }
}

.boardWrapper {
  border-radius: 6px;

  &[data-flourish="check"] {
    animation: chessCheckPulse 0.6s ease-out;
  }
  &[data-flourish="mate"] {
    animation: chessMateGlow 0.5s ease-in-out;
    box-shadow: 0 0 24px 4px color-mix(in srgb, var(--color-accent-base) 50%, transparent);
  }
}

@media (prefers-reduced-motion: reduce) {
  .boardWrapper[data-flourish="check"],
  .boardWrapper[data-flourish="mate"] {
    animation: none;
  }
}
```

Note: `.boardWrapper` already exists in the file — merge the `&[data-flourish=...]` rules into the existing `.boardWrapper` block rather than declaring it twice. (Append the keyframes and the media query as new top-level rules; add the two `&[data-flourish]` selectors inside the existing `.boardWrapper {}`.)

- [ ] **Step 4: Typecheck + manual check**

Run: `npx tsc --noEmit` → clean.
Run: `npm run dev`, `/chess` — deliver a check (board pulses) and a checkmate (board shakes + glows). Toggle OS reduced-motion and confirm the animation is suppressed.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/ChessPage.tsx src/components/ui/ChessPage.module.scss
git commit -m "feat(chess): check/mate board flourish (accent-aware, reduced-motion safe)"
```

---

## Task 5: GIF export via Worker proxy

**Files:**
- Modify: `src/worker.ts`
- Modify: `src/components/ui/ChessPage.tsx`

- [ ] **Step 1: Add the handler in worker.ts**

Add this function near the other handlers (e.g. just above `handleGifSearch`):

```ts
// ── POST /api/chess/gif — proxy Lichess GIF export (avoids browser CORS) ──

async function handleChessGif(request: Request): Promise<Response> {
  const pgn = await request.text()
  if (!pgn.trim()) return jsonResponse({ error: "Empty PGN" }, 400)

  const upstream = await fetch("https://lichess1.org/game/export/gif", {
    method: "POST",
    headers: { "Content-Type": "application/x-chess-pgn" },
    body: pgn,
  })

  if (!upstream.ok) {
    return jsonResponse({ error: `Lichess GIF export failed: ${upstream.status}` }, 502)
  }

  const headers = new Headers(corsHeaders())
  headers.set("Content-Type", "image/gif")
  return new Response(upstream.body, { status: 200, headers })
}
```

- [ ] **Step 2: Add the dispatch route**

In the `fetch` handler, near the chat-api block (after the `/api/chat/gif-search` route is fine), add:

```ts
    if (url.pathname === "/api/chess/gif" && request.method === "POST") {
      return handleChessGif(request)
    }
```

- [ ] **Step 3: Point ChessPage at the proxy + visible failure**

In `ChessPage.tsx`, add an `exportError` state next to `exporting`:

```ts
  const [exportError, setExportError] = useState(false)
```

Replace the `exportGif` callback body's fetch URL and catch:

```ts
  const exportGif = useCallback(async () => {
    const pgn = game.pgn()
    if (!pgn.trim()) return

    setExporting("gif")
    setExportError(false)
    try {
      const res = await fetch("/api/chess/gif", {
        method: "POST",
        headers: { "Content-Type": "application/x-chess-pgn" },
        body: pgn,
      })
      if (!res.ok) throw new Error(`GIF export error: ${res.status}`)
      const blob = await res.blob()
      downloadBlob(blob, `game-${Date.now()}.gif`)
    } catch (err) {
      console.error("GIF export failed:", err)
      setExportError(true)
      setTimeout(() => setExportError(false), 2500)
    } finally {
      setExporting(null)
    }
  }, [game])
```

Update the GIF button label to surface the error:

```tsx
            <button
              className={styles.exportBtn}
              onClick={exportGif}
              disabled={!hasHistory || exporting === "gif"}
            >
              {exportError ? "Export failed" : exporting === "gif" ? "Generating..." : "Export GIF"}
            </button>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit` → clean. (Worker is excluded from the app tsconfig; if VS Code shows worker errors, ignore per project memory.)

- [ ] **Step 5: Commit**

```bash
git add src/worker.ts src/components/ui/ChessPage.tsx
git commit -m "fix(chess): GIF export via Worker proxy, visible failure state"
```

Note: GIF export is only fully exercisable against the deployed Worker; local `npm run dev` returns 404 for `/api/chess/gif` (acceptable, documented in spec).

---

## Task 6: "Analyse on Lichess" button

**Files:**
- Modify: `src/components/ui/ChessPage.tsx`

- [ ] **Step 1: Add the handler**

After `exportGif`, add:

```ts
  // Open the current game in Lichess analysis (POST form handles long PGNs)
  const openInLichess = useCallback(() => {
    const pgn = game.pgn()
    if (!pgn.trim()) return
    const form = document.createElement("form")
    form.method = "POST"
    form.action = "https://lichess.org/import"
    form.target = "_blank"
    const field = document.createElement("input")
    field.type = "hidden"
    field.name = "pgn"
    field.value = pgn
    form.appendChild(field)
    document.body.appendChild(form)
    form.submit()
    form.remove()
  }, [game])
```

- [ ] **Step 2: Add the button**

Inside `<div className={styles.exportSection}>`, after the GIF button, add:

```tsx
            <button className={styles.exportBtn} onClick={openInLichess} disabled={!hasHistory}>
              Analyse on Lichess
            </button>
```

- [ ] **Step 3: Typecheck + manual check**

Run: `npx tsc --noEmit` → clean.
`npm run dev` → play a few moves, click "Analyse on Lichess" → opens a new tab on the imported game's analysis board.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/ChessPage.tsx
git commit -m "feat(chess): Analyse on Lichess button (POST import for long PGNs)"
```

---

## Task 7: Silent-failure cleanup

**Files (catch handlers only):**
- `src/components/layout/BgCanvas.tsx:198`
- `src/components/ui/ChatPage.tsx:27`
- `src/components/ui/ChatRoom.tsx:177`
- `src/components/ui/ChatSettings.tsx:95,106,135,327`
- `src/components/ui/EmotePicker.tsx:52`
- `src/components/ui/SideChat.tsx:39`
- `src/components/ui/WikiAdminPage.tsx:108`

- [ ] **Step 1: Triage and replace each empty catch**

For each location, read the surrounding code first to classify it, then:

- **Background/best-effort loads** (asset prefetch, index warm, non-critical fetch — `BgCanvas`, `EmotePicker`, `ChatPage`, `SideChat`, and the read-only loads in `ChatRoom`/`ChatSettings`): replace `.catch(() => {})` with a contextual warn:

```ts
.catch((e) => console.warn("<short context, e.g. emote index prefetch failed>:", e))
```

- **User-initiated actions** (ChatSettings save at `:327`, WikiAdminPage action at `:108`): surface a visible signal. If a toast/setError mechanism exists in that component, use it; otherwise add a transient inline error state. Example for `WikiAdminPage.tsx:108` (`} catch {}`):

```ts
} catch (e) {
  console.error("admin action failed:", e)
  // if the component has a setError/toast, call it here
}
```

Replace each bare handler individually; do not batch-replace blindly — the context string must be specific to each call site. Success-path behaviour must not change.

- [ ] **Step 2: Verify none remain**

Run: `npx tsc --noEmit` → clean.
Run (PowerShell): confirm no empty catches remain — use the Grep tool for `catch.*\{\s*\}` and `\.catch\(\(\)\s*=>\s*\{\}\)` across `src/`. Expected: zero matches in the files above.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/BgCanvas.tsx src/components/ui/ChatPage.tsx src/components/ui/ChatRoom.tsx src/components/ui/ChatSettings.tsx src/components/ui/EmotePicker.tsx src/components/ui/SideChat.tsx src/components/ui/WikiAdminPage.tsx
git commit -m "refactor: make swallowed errors visible (warn/surface instead of empty catch)"
```

---

## Task 8: Terminal commands `/log`, `/grep`, `/watch`

**Files:**
- Modify: `src/components/ui/TerminalChatView.tsx`

The dispatch is a chain of `if (cmd === "/x") { ...; return }` blocks inside the `raw.startsWith("/")` branch. Output uses `appendLocalLine(text, kind)`. The full message array is `messages` (each item: `m.profiles?.username`, `m.body`, `m.created_at`, `m.deleted_at`). `cleared` marks the local clear epoch; `visibleMessages = messages.slice(cleared)`.

- [ ] **Step 1: Add a `watched` highlight state**

Near the other `useState` declarations (~line 220), add:

```ts
  const [watched, setWatched] = useState<Set<string>>(new Set())
```

- [ ] **Step 2: Add the three command blocks**

Add inside the command dispatch chain (e.g. after the `/users` block):

```ts
      if (cmd === "/log") {
        const n = parseInt(parts[1] ?? "20", 10)
        const count = isNaN(n) ? 20 : Math.max(1, Math.min(n, 200))
        const recent = messages.slice(cleared).slice(-count)
        if (recent.length === 0) { appendLocalLine("-- no messages in view --"); return }
        appendLocalLine(`-- last ${recent.length} message(s) --`, "help")
        for (const m of recent) {
          const u = m.profiles?.username ?? "unknown"
          appendLocalLine(`[${u}] ${m.deleted_at ? "[deleted]" : m.body}`, "help")
        }
        return
      }

      if (cmd === "/grep") {
        const pattern = parts.slice(1).join(" ").toLowerCase()
        if (!pattern) { appendLocalLine("Usage: /grep <pattern>"); return }
        const hits = messages.slice(cleared).filter(
          (m) => !m.deleted_at && m.body.toLowerCase().includes(pattern),
        )
        if (hits.length === 0) { appendLocalLine(`-- no matches for "${pattern}" --`); return }
        appendLocalLine(`-- ${hits.length} match(es) for "${pattern}" --`, "help")
        for (const m of hits) {
          const u = m.profiles?.username ?? "unknown"
          appendLocalLine(`[${u}] ${m.body}`, "help")
        }
        return
      }

      if (cmd === "/watch") {
        const username = (parts[1] ?? "").toLowerCase().replace(/^@/, "")
        if (!username) {
          appendLocalLine(
            watched.size ? `Watching: ${[...watched].join(", ")}` : "Usage: /watch <username>  (repeat to unwatch)",
          )
          return
        }
        setWatched((prev) => {
          const next = new Set(prev)
          if (next.has(username)) { next.delete(username); appendLocalLine(`-- no longer watching ${username} --`) }
          else { next.add(username); appendLocalLine(`-- watching ${username} --`) }
          return next
        })
        return
      }
```

- [ ] **Step 3: Apply the watch highlight in the message render**

Find the message line render (~line 855, `<div key={line.id} className={styles.terminalMsg}>`). Add a watched class:

```tsx
            <div
              key={line.id}
              className={`${styles.terminalMsg} ${line.username && watched.has(line.username.toLowerCase()) ? styles.terminalWatched : ""}`}
            >
```

- [ ] **Step 4: Add the highlight style**

In the terminal SCSS module (the one providing `styles.terminalMsg` — locate via the `styles` import at the top of `TerminalChatView.tsx`), add:

```scss
.terminalWatched {
  background: color-mix(in srgb, var(--color-accent-base) 12%, transparent);
  border-left: 2px solid var(--color-accent-base);
  padding-left: 4px;
}
```

- [ ] **Step 5: Register in help + autocomplete**

Add to `COMMAND_DEFS`:

```ts
  "/log":   "/log <n> — dump last N messages as plain text (default 20)",
  "/grep":  "/grep <pattern> — search messages in view",
  "/watch": "/watch <username> — highlight a user's lines (repeat to unwatch)",
```

(The autocomplete list is derived from `COMMAND_DEFS` keys — verify by checking where the autocomplete suggestions are built; if there's a separate command-name array, add the three names there too.)

- [ ] **Step 6: Typecheck + manual check**

Run: `npx tsc --noEmit` → clean.
`npm run dev` → open terminal chat mode (`/options`-style overlay), run `/log 5`, `/grep <word>`, `/watch <someuser>` (lines highlight; repeat to clear).

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/TerminalChatView.tsx src/styles
git commit -m "feat(terminal): /log, /grep, /watch commands"
```

---

## Task 9: Docs sync

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/future.md`

- [ ] **Step 1: Fix the shell-count nit in CLAUDE.md**

Search `CLAUDE.md` for any "Two shells" / "two shells" wording that contradicts the documented three (AppShell / WikiShell / ChatShell). Reconcile to three. (The "Three Shells" table is already correct — find the stray reference and fix it.)

- [ ] **Step 2: Update broken-link count in docs/future.md**

Change:

```
- [ ] **37 broken wikilinks**: see [garden.md](garden.md) for cluster breakdown
```

to:

```
- [ ] **41 broken wikilinks** (as of 2026-06-09): see [garden.md](garden.md) for cluster breakdown
```

- [ ] **Step 3: Record chess overhaul + retire Stockfish items in docs/future.md**

In the Garden section, remove or strike the now-obsolete Stockfish items:

```
- [ ] Improve chess UI to match site themes, optimise WASM performance, public leaderboard
- [ ] **Chess performance**: investigate Stockfish WASM latency on local builds
```

Replace with a completed entry:

```
- [x] **Chess: homemade three-flavour bot** (drunk/casual/sharp) replaces unreliable CDN Stockfish; GIF export via Worker proxy; "Analyse on Lichess" button; check/mate board flourish. (2026-06-09)
- [ ] Chess: public leaderboard (deferred)
```

- [ ] **Step 4: Tick the terminal backlog items in docs/future.md**

In the "Terminal Mode — Remaining / Future" list, mark the three implemented:

```
- [x] `/log <n>` — dump last N messages as plain text (exportable)
- [x] `/grep <pattern>` — local search across visible messages
- [x] `/watch <username>` — highlight lines from a specific user
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/future.md
git commit -m "docs: sync shell count, broken-link count, chess + terminal status"
```

---

## Self-Review (completed)

- **Spec coverage:** three-flavour bot (T1-3), store swap (T2), check/mate flourish (T4), GIF proxy (T5), Lichess button (T6), silent-failure cleanup (T7), terminal `/log`/`/grep`/`/watch` (T8), docs sync incl. shell count + link count (T9). All spec sections mapped.
- **Type consistency:** `BotFlavour`, `pickBotMove`, `BOT_FLAVOURS` defined in T1 and used identically in T2/T3. `chessBot`/`setChessBot` consistent T2↔T3. `flourish` state names consistent T4. `exportError` consistent T5.
- **Placeholders:** softened header copy is now concrete ("A small handmade machine that plays chess."). No TBD/TODO remain. Catch-cleanup context strings are intentionally per-site (engineer fills the specific phrase) — acceptable since the pattern and rule are explicit.
- **Out of scope:** worker.ts decomposition, wikilink content fixes, `/ping`/`/emotes off`/screensaver.
