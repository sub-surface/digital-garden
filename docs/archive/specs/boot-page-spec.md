# Boot Sequence Page Spec

## Overview

Create an immersive, procedurally-generated endless boot sequence page at route `/boot`. The page displays an infinite stream of system initialization messages, ASCII art, and creative pseudo-technical output using smart snippet generators. Similar to the `TerminalTitle` component's idle animations but full-page, loopable, and with seeded procedural generation.

**Goal:** A mesmerizing, endlessly-scrolling TUI boot experience that feels like booting a sci-fi operating system. Each visit can be unique (or seeded for reproducibility).

---

## Important Context from Codebase

### Three Shells Architecture
This repo has three rendering modes:
- **AppShell** (main): Full features, panels, graph, music, BgCanvas
- **WikiShell**: Wiki only, no panels/graph/music
- **ChatShell**: Chat mode

**For BootPage:** Use AppShell (default). No special `VITE_WIKI_MODE` or `VITE_CHAT_MODE` logic needed.

### Routing System
- **Hand-written routes** in `src/router.tsx` (not file-based)
- Catch-all route (`$`) at the end handles note slugs via `NoteRenderer`
- System pages (chess, hexo, graph, etc.) registered in `src/config/system-pages.ts`
- **Integration approach for BootPage: Explicit route** (like `/graph`), NOT a system page
  - More control over layout
  - No `NoteRenderer` wrapping
  - Full-screen immersive experience

### Style System
**Global tokens** (`src/styles/tokens.scss`):
```scss
--color-bg: #0a0a0a            // OLED dark
--color-bg-surface: #1a1a1f
--color-text: #e0e0e0
--color-accent-base: #b4424c   // User-configurable (ROYGBIV cycle)
--font-header: "Playfair Display", serif
--font-body: "IBM Plex Sans", sans-serif
--font-code: "IBM Plex Mono", monospace
--main-width: 750px
--card-width: 512px
```

**Use `--font-code` for terminal text, `--color-accent-base` for highlights, `--color-bg` for background.**

### Important Layout Constraints (from CLAUDE.md)
1. **BgCanvas is z-index 0** — all containers must have `background: transparent` if overlaid
2. **BgCanvas skips on mobile (`≤800px`)** — use media query `@media (max-width: 800px)` for full-height on mobile
3. **`import.meta.glob` is build-time only** — can't dynamically load pages at runtime
4. **No block elements wrapping sidenotes** (not relevant here, but noted)
5. **Case sensitivity:** Routes case-insensitive at runtime; CF case-sensitive for static assets
6. **Music links** (`music:` prefix) only work in `NoteBody`; don't use them elsewhere

### Zustand Store
Single flat store in `src/store/index.ts`. Example from the codebase:
```typescript
const useStore = create<Store>((set) => ({
  theme: "dark",
  setTheme: (theme: "dark" | "light") => set({ theme }),
  // ...
}))
```

If BootPage needs to track boot state (pause/resume, seed), add slices to the store. Otherwise, use local React state.

### Existing Component Patterns
See `src/components/layout/TerminalTitle.tsx` for reference:
- Async generators: `async function* snippet(): AsyncGenerator<string, void, unknown>`
- Sleep utility: `function sleep(ms): Promise<void>`
- Tooltip state: simple `useState` for hover tooltips
- Line updates: `setLine(text)` in useCallback

---

## Implementation Plan

### Files to Create

#### 1. `src/lib/bootSequenceGenerator.ts`
Seeded RNG + procedural snippet factories.

**Exports:**
- `class SeededRNG` — xorshift-based, deterministic random number generator
- `generateSystemCheck()` → `AsyncGenerator<string>`
- `generateMemoryDump()` → `AsyncGenerator<string>`
- `generateFilesystemMount()` → `AsyncGenerator<string>`
- `generatePacketCapture()` → `AsyncGenerator<string>`
- `generateArtisticSequence()` → `AsyncGenerator<string>`
- `generateBootSequenceQueue(seed: number)` → array of generators
- Word lists: `SYSTEM_NAMES`, `SUBSYSTEM_STATUSES`, `PATHS`, `ARTS`

**Key constraints:**
- All randomness derived from seed for reproducibility
- Generators must yield one line at a time
- Include variable sleep times (40–300ms range, realistic for "boot speed")
- Use Unicode characters safely: test `\u2588`, `\u2591`, etc. (already used in TerminalTitle)

#### 2. `src/components/ui/BootPage.tsx`
Full-page boot display component.

**Props:** None (or optional `seed?: number` from URL query params)

**Key responsibilities:**
- Manage generator queue (current index, generators array)
- Line buffer (last N lines, scrollable)
- Typewriter effect state (current line being typed, character index)
- Auto-loop logic
- Pause/resume (optional)
- Store seed in localStorage or URL for reproducibility

**Hooks used:**
- `useEffect` for boot startup
- `useRef` for AbortController (to cancel on unmount)
- `useState` for line buffer, current line, typing progress
- `useStore` to pull theme + accent colors if desired

**Styling:**
- SCSS module: `src/components/ui/BootPage.module.scss`
- Full viewport: `min-height: 100vh`, `overflow: auto`
- Monospace font + dark theme
- Line-by-line reveal with typewriter effect (50–100ms per character)

#### 3. `src/components/ui/BootPage.module.scss`
Styling for the boot page.

**Classes:**
- `.container` — full viewport, dark bg, padding
- `.terminalWindow` — bordered "monitor" effect (optional)
- `.lineBuffer` — scrollable container
- `.line` — individual line
- `.activeLine` — currently typing line (cursor/highlight)
- `.cursor` — blinking pipe `|` or underscore `_`
- `.scrollbar` — optional styled scrollbar

**Dark mode:** Already global; just use tokens.

---

## Architecture Details

### Generator Pattern (from TerminalTitle.tsx)

All snippet generators follow this shape:
```typescript
async function* snippetName(): AsyncGenerator<string, void, unknown> {
  yield "First line"
  await sleep(100)
  yield "Second line"
  await sleep(150)
}
```

**Boot generators to implement:**

#### `generateSystemCheck(rng: SeededRNG): AsyncGenerator<string>`
Simulate system initialization checks. Yields ~5–7 lines:
```
  renderer ................... READY
  audio context .............. OK
  content-index (120 notes) .. OK
  graph (35 edges) ........... OK
  noise field ................. ACTIVE
```
Use dots to pad to fixed width. Random subsystem names from word list. Random statuses: OK, READY, ACTIVE, [time in ms].

#### `generateMemoryDump(rng: SeededRNG): AsyncGenerator<string>`
Hex dump simulation. Yields ~4 lines of fake hex addresses + ASCII:
```
0000: 48 65 6C 6C 6F 20 57 6F 72 6C 64 00 20 2E 2E    Hello World...
0008: 53 55 42 2D 53 55 52 46 41 43 45 20 43 4F 52    SUB-SURFACE COR
0010: 45 20 76 32 2E 30 2E 30 00 00 00 00 00 00 00    E v2.0.0.......
```

#### `generateFilesystemMount(rng: SeededRNG): AsyncGenerator<string>`
Mount point listing. Yields ~6 lines:
```
/dev/note (240M, 180M free)
/mnt/garden (1.2G, 800M free)
/var/thought (64M, 32M free)
```
Seed which paths appear, which sizes.

#### `generatePacketCapture(rng: SeededRNG): AsyncGenerator<string>`
Network traffic simulation. Yields ~8 lines:
```
[12:34:56.123] 192.168.1.42:5001 → 10.0.0.1:443 [SYN]
[12:34:57.045] 192.168.1.42:5001 → 10.0.0.1:443 [ACK] (1024 bytes)
[12:34:58.201] Timeout on 10.0.0.99:9000
```
Use seeded RNG for IPs, ports, times (fake timestamps).

#### `generateArtisticSequence(rng: SeededRNG): AsyncGenerator<string>`
ASCII art or visual sequences. Examples:
- Expanding/contracting waves
- Rotating spinner
- Growing plant/tree
- Constellation forming
- Digital rain
- Fractal expansion

Yield individual frames, 100–200ms per frame.

#### `generateBootSequenceQueue(seed: number): AsyncGenerator[]`
Return array of 8–12 generators in randomized order. Something like:
```typescript
const generators = [
  generateSystemCheck(rng),
  generateMemoryDump(rng),
  generateFilesystemMount(rng),
  generatePacketCapture(rng),
  generateArtisticSequence(rng),
  // repeat some for length
]
shuffle(generators, rng) // deterministic shuffle
return generators
```

---

### BootPage Component Logic

```typescript
export function BootPage() {
  // State
  const [lineBuffer, setLineBuffer] = useState<string[]>([])
  const [currentLine, setCurrentLine] = useState("")
  const [charIndex, setCharIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [seed, setSeed] = useState(() => getOrCreateSeed())
  
  const genQueueRef = useRef<AsyncGenerator<string>[]>([])
  const genIndexRef = useRef(0)
  const abortRef = useRef(new AbortController())
  
  // On mount: create generator queue, start boot
  useEffect(() => {
    genQueueRef.current = generateBootSequenceQueue(seed)
    runBootSequence()
    return () => abortRef.current.abort()
  }, [seed])
  
  // Main loop: consume generators
  const runBootSequence = async () => {
    while (genIndexRef.current < genQueueRef.current.length) {
      const gen = genQueueRef.current[genIndexRef.current]
      for await (const line of gen) {
        if (abortRef.current.signal.aborted) return
        
        // Typewriter effect for this line
        for (let i = 0; i <= line.length; i++) {
          if (isPaused) await new Promise(r => setTimeout(r, 100))
          setCurrentLine(line.slice(0, i))
          await sleep(50 + Math.random() * 50)
        }
        
        // Line complete: add to buffer, scroll
        setLineBuffer(prev => [...prev.slice(-40), line]) // keep last 40 lines
        setCurrentLine("")
        setCharIndex(0)
      }
      genIndexRef.current++
    }
    
    // Loop: restart with same seed or new seed
    genIndexRef.current = 0
    await sleep(2000)
    runBootSequence()
  }
  
  return (
    <div className={styles.container}>
      <div className={styles.lineBuffer}>
        {lineBuffer.map((line, i) => (
          <div key={i} className={styles.line}>{line}</div>
        ))}
        {currentLine && (
          <div className={styles.activeLine}>
            {currentLine}
            <span className={styles.cursor}>_</span>
          </div>
        )}
      </div>
    </div>
  )
}
```

---

### Seeded RNG Implementation

Use simple xorshift32 (or include a lightweight library like `seedrandom`):

```typescript
export class SeededRNG {
  private state: number
  
  constructor(seed: number) {
    this.state = seed || 1
  }
  
  next(): number {
    let x = this.state
    x ^= x << 13
    x ^= x >> 17
    x ^= x << 5
    this.state = x
    return Math.abs(x) % 1
  }
  
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }
  
  nextChoice<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)]
  }
  
  shuffle<T>(arr: T[]): T[] {
    const result = [...arr]
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
  }
}
```

---

### Word Lists for Procedural Generation

Keep in `bootSequenceGenerator.ts`:

```typescript
const SYSTEM_NAMES = [
  "renderer", "audio context", "content-index", "graph", "noise field",
  "memory controller", "cache", "scheduler", "network layer", "entropy pool",
  "garden matrix", "thought indexer", "link processor", "sidenote buffer",
]

const SUBSYSTEM_STATUSES = [
  "OK", "READY", "ACTIVE", "ONLINE", "LOADED", "INITIALIZED",
  "✓", "→ 256ms", "→ 1.2s", "cached", "verified",
]

const PATHS = [
  "/dev/thought", "/mnt/garden", "/var/notes", "/sys/graph",
  "/home/subsurface", "/tmp/buffer", "/proc/mind", "/etc/config",
]

const ARTISTIC_CHARS = [
  "░", "▒", "▓", "█", "▄", "▀", "│", "─", "┌", "┐", "└", "┘",
  "═", "║", "╔", "╗", "╚", "╝", "·", "∘", "○", "●", "◇", "◆",
]
```

---

## Integration into Router

Add to `src/router.tsx` **before the catch-all route** (which is at the very end):

```typescript
// Near top, with other lazy imports
const BootPage = lazy(() => import("@/components/ui/BootPage").then(m => ({ default: m.BootPage })))

// After recent route, before catch-all ($):
const bootRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/boot",
  component: function BootRouteComponent() {
    return (
      <article className="game-layout">
        <div className="game-stage">
          <Suspense fallback={<div className="loading-shimmer">Initializing boot sequence...</div>}>
            <BootPage />
          </Suspense>
        </div>
      </article>
    )
  }
})

// Then add bootRoute to router.createRoute() call at the bottom
```

**Important:** `bootRoute` must come **before** the catch-all `$` route, otherwise all `/boot` traffic gets caught by the note renderer.

---

## Styling (BootPage.module.scss)

```scss
@import "@/styles/tokens";

.container {
  width: 100%;
  height: 100vh;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-code);
  font-size: 0.9rem;
  padding: var(--space-6);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.lineBuffer {
  flex: 1;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.4;
  
  // Styled scrollbar (webkit)
  scrollbar-width: thin;
  scrollbar-color: var(--color-accent-base) transparent;
  
  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--color-accent-base);
    border-radius: 4px;
    opacity: 0.5;
    
    &:hover {
      opacity: 0.8;
    }
  }
}

.line {
  opacity: 0.9;
  margin-bottom: 0.2rem;
}

.activeLine {
  opacity: 1;
  color: var(--color-accent-base);
  display: inline-block;
}

.cursor {
  animation: blink 1s infinite;
  
  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }
}

@media (max-width: 800px) {
  .container {
    padding: var(--space-4);
    font-size: 0.8rem;
  }
}
```

---

## URL Seed Parameter (Optional)

Allow `/boot?seed=12345` to override default seed:

```typescript
function getOrCreateSeed(): number {
  const params = new URLSearchParams(window.location.search)
  const seedParam = params.get("seed")
  if (seedParam) {
    const parsed = parseInt(seedParam, 10)
    return isNaN(parsed) ? Math.random() * 0xffffffff : parsed
  }
  
  let stored = localStorage.getItem("bootSeed")
  if (!stored) {
    stored = (Math.random() * 0xffffffff).toString()
    localStorage.setItem("bootSeed", stored)
  }
  return parseInt(stored, 10)
}
```

This way:
- First visit: random seed, stored in localStorage
- Reload same browser: same boot sequence (reproducible)
- Share `/boot?seed=12345` with others: they get identical sequence
- `/boot?seed=new`: force a new random sequence

---

## Type Definitions

```typescript
// In bootSequenceGenerator.ts
export type BootSnippet = () => AsyncGenerator<string, void, unknown>

// Optional: store in BootPage state
interface BootState {
  lineBuffer: string[]
  currentLine: string
  isPaused: boolean
  seed: number
}
```

---

## Testing / Verification Checklist

- [ ] Route `/boot` loads without errors
- [ ] Generator queue produces non-empty stream
- [ ] Typewriter effect visible (lines appear char-by-char)
- [ ] Line buffer scrolls (stays at last 40–50 lines)
- [ ] Seed parameter works: `/boot?seed=42` reproducible
- [ ] Mobile responsive (≤800px padding/font adjustments)
- [ ] No `import.meta.glob` issues (boot code is static)
- [ ] Accent color changes reflected in cursor + active line
- [ ] Unmount cleans up AbortController (no memory leaks)
- [ ] Theme toggle (dark/light) still works
- [ ] No conflicting z-index with BgCanvas

---

## Common Pitfalls to Avoid

1. **Don't use `import.meta.glob` for boot data** — generators must be defined statically or built at compile time
2. **Don't forget the AbortController** — cleanup on unmount prevents infinite loops in console
3. **Seed must be deterministic** — xorshift state mutation must be reproducible from same initial seed
4. **Unicode characters:** Test all `\uXXXX` escapes on Windows (some may not render identically)
5. **Async generator syntax** — use `async function*`, not `function async *` (latter is invalid)
6. **Router order:** Boot route MUST come before catch-all `$` route
7. **Don't wrap in NoteRenderer** — use explicit route to avoid content-index lookup
8. **Media query for mobile:** BgCanvas disables at ≤800px, so BootPage should handle full-height naturally

---

## Success Criteria

- ✅ Page loads at `/boot` without routing to catch-all
- ✅ Endless stream of boot lines, no errors in console
- ✅ Procedural generation changes with different seeds
- ✅ Typewriter effect smooth (not jumpy)
- ✅ Scrolls properly (keeps last ~40 lines visible)
- ✅ Theme/accent colors apply correctly
- ✅ No layout shift on scroll
- ✅ Works on mobile + desktop
