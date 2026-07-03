# `/boot` — Living Boot Sequence

## Production Specification and Implementation Plan

**Status:** Ready for implementation  
**Route:** `/boot`  
**Rendering shell:** `AppShell`  
**Primary goal:** Build an endless, deterministic, gently uncanny terminal ecosystem that feels less like a loading screen and more like catching a tiny operating system waking up and caring for itself.

---

## 1. Product vision

`/boot` is a full-page procedural terminal experience: a stream of system checks, memory fragments, graph maintenance, packet traces, ASCII organisms, tiny daemons, and occasional poetic anomalies. It should be satisfying to leave open, readable in short visits, and reproducible from a shared seed.

The page is not a real boot process and should not imitate a dangerous browser error or security incident. It is an ambient fiction rendered with the visual grammar of a TUI.

The emotional register is:

- **70% credible pseudo-technical detail** — enough structure that the machine seems to have an internal life.
- **20% atmospheric strangeness** — the system notices weather, memory, distance, silence, and its own topology.
- **10% cuteness** — tiny services get tucked in, moths inspect lamps, packets arrive slightly out of breath.

The cuteness must be dry and sparing. The machine should never become a stream of random jokes.

### One-sentence experience target

> A black glass console quietly wakes a garden of notes, checks that every small process is warm, and keeps inventing new reasons not to finish booting.

---

## 2. User experience

### 2.1 First impression

On entry, the page should establish itself in three beats:

1. A short hardware/firmware prelude.
2. A recognisable boot phase with checks, mounts, and indexing.
3. A transition into an endless “live system” state where diagnostics, maintenance, and small anomalies continue indefinitely.

Example opening:

```text
SUB/SURFACE BIOS 2.6.0                        seed 0xA17E4C2B
cold start requested                         03:14:07.042
────────────────────────────────────────────────────────────
probing memory lattice ...................... 256 MiB / kind
warming entropy pool ........................ tepid
locating the little red cursor .............. found
mounting /mnt/garden ........................ clean
waking mothkeeper.service ................... fluttering
```

### 2.2 Endless state

The stream must not feel like a shuffled list of unrelated snippets. Each cycle has a small dramatic arc:

1. **Orientation** — clock, seed, environment, system identity.
2. **Assembly** — mounts, services, memory, graph, renderer.
3. **Contact** — packets, pings, remote stars, neighbouring processes.
4. **Inner life** — garden care, note dreams, small daemons, ASCII forms.
5. **Anomaly** — rare, harmless deviations or impossible readings.
6. **Settlement** — a checksum, heartbeat, or “system nominal” moment.
7. **Continuation** — begin a new maintenance epoch derived from the same root seed.

A complete epoch should take roughly **45–110 seconds at 1× speed**, then flow directly into the next epoch without resetting the screen.

### 2.3 Interaction model

The page works without interaction, but exposes restrained controls:

| Input | Action |
|---|---|
| `Space` | Pause/resume playback |
| `R` | Generate a new seed and restart |
| `Shift+R` | Restart the current seed from the beginning |
| `C` | Copy a shareable URL containing the current seed |
| `+` / `=` | Increase playback speed |
| `-` | Decrease playback speed |
| `0` | Return to 1× speed |
| `End` | Return to live output after scrolling upward |
| `Esc` | Return to the previous route when navigation history exists |

Controls must also be available as labelled buttons. Keyboard shortcuts must be ignored while focus is in an input, textarea, select, button, or content-editable element.

### 2.4 Pause behaviour

Pause is exact, not approximate:

- The active character reveal stops where it is.
- Hold timers preserve their remaining duration.
- No events are consumed while paused.
- The cursor continues a slow blink unless reduced motion is enabled.
- The status line changes to `PAUSED — the small processes are holding very still`.

### 2.5 Scroll behaviour

The terminal normally follows new output. If the user scrolls upward:

- Auto-follow disengages.
- Existing text stays still; the page must not fight the user.
- A small `↓ return to live` control appears with a count such as `12 new lines`.
- Pressing `End` or activating the control resumes auto-follow.

The DOM and memory footprint remain bounded even during long sessions.

---

## 3. Review of the original proposal

The original proposal identifies the correct route, shell, styling tokens, and broad generator categories. It should not be implemented literally, because several suggested details would produce determinism bugs, stale React state, runaway loops, and a less convincing visual rhythm.

### 3.1 Critical corrections

#### The RNG implementation is broken

This expression always returns `0` because `x` is an integer:

```ts
Math.abs(x) % 1
```

The correct conversion is an unsigned 32-bit value divided by `2^32`:

```ts
return this.nextUint32() / 0x1_0000_0000
```

Bitwise shifts must also use unsigned normalisation (`>>> 0`) so the state is stable across negative signed representations.

#### `Math.random()` breaks seed reproducibility

The proposed typewriter delay uses `Math.random()`. A seed would therefore reproduce the text but not the timing. All content-affecting and timing-affecting variation must come from a seeded source, or timing must be defined as deterministic metadata on each generated event.

#### Generators should not sleep

Content generation and playback timing are separate concerns. A generator that both invents text and waits is difficult to test, pause, accelerate, abort, and adapt for reduced motion.

Generators should yield **declarative events** containing text and timing hints. The playback engine owns all waiting and rendering.

#### A consumed generator queue cannot simply restart

Async generators are single-use. Resetting `genIndexRef.current = 0` does not make consumed generators iterable again. The endless sequence should be a lazy deterministic stream, or a fresh epoch plan should be built each cycle.

#### Recursive `runBootSequence()` is fragile

Calling the async function again without awaiting it creates detached execution. Seed changes can leave overlapping loops alive if cancellation is not perfect. Use one effect-owned `while (!signal.aborted)` loop.

#### `isPaused` will become stale inside the async closure

React state captured when an effect starts does not update inside a long-running async function. Use a ref or a small playback controller whose pause state can be changed imperatively.

#### AbortController must be recreated per run

Once an `AbortController` is aborted, it stays aborted. Construct it inside the seed-dependent effect and abort that exact controller during cleanup.

#### There is no auto-scroll implementation

A scrolling container alone does not follow output. Use a bottom sentinel, detect whether the user is near the bottom, and only scroll when follow mode is active.

#### Index keys are unstable

`key={i}` causes React to reuse the wrong rows when the bounded buffer drops old lines. Each event must carry a stable deterministic ID.

#### One React update per character can be wasteful

Typing can be driven by `requestAnimationFrame` and elapsed time, limiting updates to the display refresh rate. Some lines should appear instantly or in bursts rather than every line receiving a slow typewriter animation.

#### Accessibility and motion preferences are missing

A rapidly changing `aria-live` terminal is unusable with a screen reader. The terminal should use `role="log"` with live announcements disabled, while a separate polite status region announces only major phase changes and pause state. `prefers-reduced-motion` must disable typing, flicker, scan motion, and fast frame animation.

---

## 4. Architectural decision

### 4.1 Separate the system into four layers

```text
seed resolution
      ↓
deterministic content stream
      ↓
playback controller / clock
      ↓
React terminal renderer
```

1. **Seed resolution** converts URL input into a stable 32-bit seed.
2. **Content stream** yields immutable `BootEvent` objects. It performs no sleeps and touches no browser APIs.
3. **Playback controller** applies reveal modes, delays, pause, speed, cancellation, visibility, and reduced motion.
4. **Renderer** displays the bounded log, active line, status, controls, and scroll-follow state.

This division is the central implementation requirement.

### 4.2 Recommended feature directory

Keep the feature cohesive rather than distributing it across generic `lib` and `ui` folders:

```text
src/features/boot/
├── BootPage.tsx
├── BootPage.module.scss
├── bootTypes.ts
├── bootRng.ts
├── bootSeed.ts
├── bootContent.ts
├── bootGenerators.ts
├── bootStream.ts
├── bootReducer.ts
├── useBootPlayback.ts
├── useBootControls.ts
└── __tests__/
    ├── bootRng.test.ts
    ├── bootSeed.test.ts
    ├── bootGenerators.test.ts
    ├── bootStream.test.ts
    └── useBootPlayback.test.tsx
```

This is deliberately more structured than a single generator file, but still small enough to understand as one feature.

### 4.3 State ownership

Use local feature state, not the global Zustand store.

Boot pause state, current seed, active line, and playback speed are route-local and should disappear when leaving `/boot`. Adding them to the flat global store would couple unrelated pages to an ambient toy.

Persist only user preferences that benefit from returning later:

```text
boot.speed        // optional, clamped to supported speeds
boot.soundEnabled // reserved; false by default if sound is ever added
```

Do not persist the active seed in localStorage. The URL is the source of truth.

---

## 5. Core data model

### 5.1 Boot events

```ts
export type BootTone =
  | "normal"
  | "muted"
  | "accent"
  | "success"
  | "warning"
  | "error"
  | "tender"

export type RevealMode =
  | "type"       // character reveal, used sparingly
  | "burst"      // reveal in deterministic chunks
  | "instant"    // print complete line
  | "overwrite"  // temporary frame replaces the prior active frame

export type BootEventKind =
  | "line"
  | "blank"
  | "rule"
  | "heading"
  | "frame"
  | "phase"

export interface BootEvent {
  id: string
  epoch: number
  kind: BootEventKind
  text: string
  tone: BootTone
  reveal: RevealMode
  charDelayMs: number
  holdAfterMs: number
  ariaLabel?: string
  ephemeral?: boolean
}
```

Rules:

- `text` is plain text only. Never render generated content with `dangerouslySetInnerHTML`.
- `id` is deterministic and unique within the infinite root stream.
- `ephemeral` events, such as spinner frames, update the active frame and are not all appended to history.
- `ariaLabel` is optional plain-language text for visual symbols.
- Every duration is a **1× timing hint**. The playback engine applies the current speed multiplier.

### 5.2 Snippet context

```ts
export interface SnippetContext {
  rootSeed: number
  epoch: number
  phase: string
  rng: SeededRNG
  sequence: EventIdFactory
  viewport: "narrow" | "wide"
}

export type SnippetFactory = (
  context: SnippetContext,
) => Iterable<BootEvent>
```

`viewport` may influence line width and ASCII art dimensions, but it must be resolved once per epoch. Resizing should not mutate already-generated history.

### 5.3 Avoid markup embedded in strings

Colour is assigned through `tone`, not ANSI escapes or HTML fragments. This keeps rendering safe, testable, and compatible with copying.

If later syntax highlighting is wanted, add typed segments:

```ts
interface BootSegment {
  text: string
  tone?: BootTone
}
```

Do not begin with segment-level styling unless the existing design genuinely needs it.

---

## 6. Deterministic random system

### 6.1 Correct xorshift32 implementation

```ts
const UINT32_RANGE = 0x1_0000_0000
const NON_ZERO_FALLBACK = 0x6d2b79f5

export class SeededRNG {
  readonly initialSeed: number
  private state: number

  constructor(seed: number) {
    const normalised = seed >>> 0
    this.initialSeed = normalised || NON_ZERO_FALLBACK
    this.state = this.initialSeed
  }

  nextUint32(): number {
    let x = this.state
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    this.state = x >>> 0
    return this.state
  }

  float(): number {
    return this.nextUint32() / UINT32_RANGE
  }

  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Invalid integer range: ${min}..${max}`)
    }
    return min + Math.floor(this.float() * (max - min + 1))
  }

  chance(probability: number): boolean {
    const p = Math.min(1, Math.max(0, probability))
    return this.float() < p
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) throw new RangeError("Cannot pick from an empty list")
    return values[this.int(0, values.length - 1)]
  }

  shuffle<T>(values: readonly T[]): T[] {
    const result = [...values]
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i)
      ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
  }

  fork(label: string | number): SeededRNG {
    return new SeededRNG(mixSeed(this.initialSeed, String(label)))
  }
}
```

### 6.2 Hash and seed mixing

Use a small stable hash such as FNV-1a for named seeds, then avalanche the result:

```ts
export function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function mixSeed(seed: number, label: string): number {
  let x = (seed ^ hashString(label)) >>> 0
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d)
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b)
  x ^= x >>> 16
  return x >>> 0
}
```

Fork an RNG for each epoch and each snippet. This prevents adding one random choice to the packet generator from unexpectedly changing every garden line that follows.

### 6.3 Seed URL behaviour

Supported forms:

```text
/boot
/boot?seed=42
/boot?seed=moth-at-dawn
/boot?seed=random
```

Behaviour:

- Missing seed: generate with `crypto.getRandomValues`, then replace the URL with the resolved hexadecimal seed.
- Decimal seed: parse as unsigned 32-bit.
- Hex seed: accept `0xA17E4C2B`.
- Text seed: hash the exact UTF-8-compatible JavaScript string.
- `seed=random`: generate a new seed and replace the URL.
- Invalid/empty values: generate a new seed rather than silently falling back to `0`.

```ts
export interface ResolvedSeed {
  source: string
  value: number
  display: string
}

export function randomSeed(): number {
  const value = new Uint32Array(1)
  crypto.getRandomValues(value)
  return value[0] || NON_ZERO_FALLBACK
}
```

After resolution, use `history.replaceState` so the visible URL is shareable and reloadable:

```text
/boot?seed=0xA17E4C2B
```

---

## 7. Content grammar and flavour system

### 7.1 Content should describe one coherent machine

Name recurring components and let them reappear across snippets. Suggested internal ecology:

| Layer | Components |
|---|---|
| Core | renderer, scheduler, entropy pool, memory lattice, clock crystal |
| Knowledge | note index, graph edges, backlinks, sidenote buffer, archive bloom |
| Garden | root map, moss cache, rain collector, seed drawer, compost queue |
| Network | packet ferry, local loop, quiet relay, lighthouse socket |
| Small daemons | mothkeeper, crumb indexer, tea timer, dream sweeper, cursor shepherd |
| Cosmic | ephemeris, parallax table, moon clock, remote star catalogue |

The same seed should establish a few persistent facts for the session:

- system codename;
- machine temperament;
- number of notes and graph edges;
- a favourite mount point;
- one tiny daemon that becomes a recurring “mascot”;
- a distant peer address in a documentation-only IP range;
- a harmless recurring anomaly.

That continuity makes the output feel authored rather than shuffled.

### 7.2 Tone rules

Use these constraints in all generators:

- Never place more than two whimsical lines together.
- Every cute line should be supported by several plausible technical lines.
- Do not use baby talk.
- Do not claim access to real user files, devices, IP traffic, passwords, or memory.
- Use RFC 5737 documentation IP ranges (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`) and `.invalid` hostnames.
- Avoid language that resembles malware, ransomware, data loss, or a real browser security warning.
- Anomalies resolve themselves or remain aesthetically harmless.

### 7.3 Line width and formatting

- Target **72 characters** on desktop.
- Target **42–54 characters** on narrow screens.
- Hard maximum: **120 Unicode code points** per line.
- Use a formatter for dotted status rows rather than hand-counted dots.
- Never use `word-break: break-all` as the default; it destroys terminal readability. Prefer `overflow-wrap: anywhere` only as a final safeguard.

```ts
export function statusLine(
  label: string,
  status: string,
  width: number,
): string {
  const minimumGap = 3
  const dotCount = Math.max(minimumGap, width - label.length - status.length - 2)
  return `${label} ${".".repeat(dotCount)} ${status}`
}
```

For Unicode-aware width perfection, a future version may use a wcwidth utility. The initial implementation can keep most content ASCII-width-safe and test the chosen glyphs in IBM Plex Mono.

### 7.4 Reveal rhythm

Do not type every line at 50–100 ms per character; that would make ordinary diagnostics painfully slow.

Recommended rhythm:

| Line type | Reveal | Timing |
|---|---|---|
| Header / poetic fragment | `type` | 18–34 ms per grapheme |
| Dense logs / packet traces | `instant` | 40–120 ms hold |
| Status checks | `burst` | 2–6 graphemes per frame |
| ASCII animation | `overwrite` | 90–180 ms per frame |
| Blank breath | `instant` | 180–500 ms hold |
| Rare anomaly | `type` | 28–48 ms per grapheme |

Use `Intl.Segmenter` where available so emoji and combined Unicode glyphs are not split incorrectly. Fall back to `Array.from(text)`.

### 7.5 Generator catalogue

#### A. Firmware prelude

Appears only at the beginning or after an explicit restart.

```text
SUB/SURFACE BIOS 2.6.0                        seed 0xA17E4C2B
clock crystal ............................... humming in C
previous shutdown ........................... considerate
```

#### B. System checks

Credible, aligned checks with occasional personality.

```text
renderer .................................... READY
content index (184 notes) ................... VERIFIED
sidenote buffer ............................. 12 px to spare
entropy pool ................................ pleasantly uncertain
little red cursor ........................... accounted for
```

#### C. Service activation

Use recurring named services and dependency relationships.

```text
[  OK  ] started graph-weaver.service
[  OK  ] started mothkeeper.service
[ WAIT ] tea-daemon.service is steeping
[  OK  ] tea-daemon.service reports: enough for everyone
```

#### D. Filesystem mounts

Generate internally consistent total/free/used values.

```text
/dev/note0   → /var/notes       240 MiB   73% full   clean
/dev/soil0   → /mnt/garden      1.2 GiB   41% full   damp
/dev/moon0   → /opt/ephemeris    64 MiB   read-only  silver
```

#### E. Memory traces

Hex output should encode seeded phrases rather than random incoherent bytes. Generate byte arrays first, then render both hex and safe printable ASCII.

Possible payloads:

```text
THE GARDEN REMEMBERS RAIN
PLEASE DO NOT WAKE SLOT 07
A SMALL LIGHT REMAINS ON
```

The ASCII column must replace non-printable bytes with `.` and never expose actual process memory.

#### F. Graph maintenance

```text
indexing 184 notes / 912 links
repairing reciprocal edge: “moon” ⇄ “tide”
found 3 orphan nodes; gave them a little porch light
community pass 04 ........................... modularity 0.62
```

#### G. Packet capture

Use documentation addresses only and keep protocol details plausible but fictional.

```text
[03:14:22.104] 192.0.2.17:4512 → 203.0.113.8:443  SYN
[03:14:22.151] 203.0.113.8:443 → 192.0.2.17:4512  SYN ACK
[03:14:22.219] packet ferry delivered 1024 B, slightly out of breath
[03:14:23.002] quiet-relay.invalid did not answer; left a note
```

#### H. Garden maintenance

```text
measuring moss cache ......................... soft
rotating /var/compost ....................... done
root map reports one adventurous tendril at sector 7
rain collector .............................. 18 quiet drops
```

#### I. Tiny daemon interludes

Keep these rare and recurring rather than constantly inventing new mascots.

```text
mothkeeper[17]: lamp checksum accepted
mothkeeper[17]: one visitor circling counter-clockwise
mothkeeper[17]: no intervention required
```

#### J. ASCII processes

Prefer small animations that fit narrow screens:

- constellation joining points;
- seed sprouting into a two-line plant;
- packet moving through a pipe;
- orbit around a tiny moon;
- breathing block waveform;
- graph nodes finding one another;
- a moth orbiting a lamp without using emoji.

Example overwrite animation:

```text
       ·       │       ·       │       ·
   ·       ◇   │   ·   ◇   ·   │   ◇       ·
       ·       │       ·       │       ·
```

Animated frames must not flash more than three times per second and should be disabled under reduced motion.

#### K. Harmless anomalies

Probability target: **0.5–1.5% per eligible snippet**, with no more than one anomaly per epoch.

```text
warning: tomorrow briefly mounted at /tmp
checksum mismatch in silence buffer; both copies sound correct
parallax table contains one star that insists it is nearby
clock drift: -0.0003 s, apparently homesick
```

An anomaly can produce a tiny three-line narrative, then resolve:

```text
[ WARN ] a foreign leaf has entered the scheduler
[ INFO ] leaf identified as local
[  OK  ] scheduler has made room
```

#### L. Epoch settlement

```text
────────────────────────────────────────────────────────────
epoch 0007 checksum .......................... 91F4:2A0C
system nominal; garden awake; no urgent messages
next maintenance window ..................... already beginning
```

---

## 8. Stream construction

### 8.1 Infinite deterministic stream

```ts
export function* createBootStream(
  rootSeed: number,
  viewport: "narrow" | "wide",
): Generator<BootEvent, never, unknown> {
  yield* createFirmwarePrelude(rootSeed, viewport)

  for (let epoch = 0; ; epoch += 1) {
    const epochRng = new SeededRNG(mixSeed(rootSeed, `epoch:${epoch}`))
    const plan = buildEpochPlan(epochRng, epoch)
    const sequence = createEventIdFactory(rootSeed, epoch)

    for (const item of plan) {
      const rng = epochRng.fork(`${item.id}:${epoch}`)
      yield* item.factory({
        rootSeed,
        epoch,
        phase: item.phase,
        rng,
        sequence,
        viewport,
      })
    }
  }
}
```

### 8.2 Epoch planner

The planner is weighted but constrained:

- Intro/checks always occur.
- At least one knowledge/graph snippet.
- At least one physical/garden snippet.
- At least one contact/network or cosmic snippet.
- At most two ASCII animations.
- At most one anomaly.
- Settlement always occurs last.
- The same factory cannot appear more than twice in a row.

Use weighted selection without replacement for the core slots, then insert optional interludes.

### 8.3 Stable event IDs

```ts
export function createEventIdFactory(rootSeed: number, epoch: number) {
  let index = 0
  return (kind: BootEventKind): string =>
    `${rootSeed.toString(16)}:${epoch}:${index++}:${kind}`
}
```

IDs are implementation identifiers, not displayed to users.

---

## 9. Playback engine

### 9.1 Public hook shape

```ts
interface UseBootPlaybackOptions {
  seed: number
  speed: number
  paused: boolean
  viewport: "narrow" | "wide"
  reducedMotion: boolean
  maxHistory: number
}

interface BootPlaybackState {
  lines: readonly BootRenderedLine[]
  activeText: string
  activeTone: BootTone
  phaseLabel: string
  epoch: number
  emittedCount: number
  isRunning: boolean
}

export function useBootPlayback(
  options: UseBootPlaybackOptions,
): BootPlaybackState
```

### 9.2 Effect lifecycle

The effect must own one controller and one stream:

```ts
useEffect(() => {
  const controller = new AbortController()
  const stream = createBootStream(seed, viewport)

  void runPlayback({
    stream,
    controller,
    dispatch,
    pausedRef,
    speedRef,
    reducedMotionRef,
  })

  return () => controller.abort()
}, [seed, viewport])
```

Do not put `paused`, `speed`, or `reducedMotion` in this dependency list if they are read through refs; doing so would restart the sequence whenever a control changes.

### 9.3 Abortable delay

```ts
export function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"))

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, ms)
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout)
        reject(new DOMException("Aborted", "AbortError"))
      },
      { once: true },
    )
  })
}
```

In production code, remove the abort listener after normal resolution to avoid retaining closures. A helper can handle cleanup around both paths.

### 9.4 Pause-aware clock

The easiest robust implementation tracks remaining active time in short slices:

```ts
async function waitActiveTime(
  durationMs: number,
  controls: PlaybackControls,
  signal: AbortSignal,
): Promise<void> {
  let remaining = durationMs
  let previous = performance.now()

  while (remaining > 0) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError")

    await abortableDelay(32, signal)
    const now = performance.now()

    if (!controls.pausedRef.current && !document.hidden) {
      const speed = controls.speedRef.current
      remaining -= (now - previous) * speed
    }

    previous = now
  }
}
```

This preserves the remaining duration across pause and tab visibility changes. Clamp `speed` to the supported range.

### 9.5 Character reveal

Use frame-based elapsed progress, not a `setTimeout` per character.

```ts
async function revealTypedEvent(
  event: BootEvent,
  controls: PlaybackControls,
  signal: AbortSignal,
  onText: (text: string) => void,
): Promise<void> {
  const graphemes = splitGraphemes(event.text)

  if (controls.reducedMotionRef.current) {
    onText(event.text)
    return
  }

  let revealed = 0
  while (revealed < graphemes.length) {
    await waitActiveTime(event.charDelayMs, controls, signal)
    revealed += event.reveal === "burst" ? 3 : 1
    onText(graphemes.slice(0, revealed).join(""))
  }
}
```

The final implementation may batch by elapsed time to better handle slow frames, but must always finish with the exact full string.

### 9.6 Reducer over scattered state

Use one reducer for playback state:

```ts
type BootAction =
  | { type: "reset" }
  | { type: "phase"; label: string; epoch: number }
  | { type: "active"; text: string; tone: BootTone }
  | { type: "commit"; line: BootRenderedLine; maxHistory: number }
  | { type: "clear-active" }
```

`commit` trims in the same update:

```ts
const next = [...state.lines, action.line]
const lines = next.length > action.maxHistory
  ? next.slice(next.length - action.maxHistory)
  : next
```

Recommended bounds:

- Wide viewport: 180 committed lines.
- Narrow viewport: 110 committed lines.
- Absolute clamp: 300.

At the intended emission rate, windowing/virtualisation is unnecessary. Bounded history is simpler and more reliable.

### 9.7 Visibility behaviour

When `document.hidden`:

- Suspend active-time progress.
- Do not catch up by dumping hundreds of lines on return.
- Resume naturally from the same character/timer position.

This lowers CPU use and preserves the ambient rhythm.

---

## 10. React component design

### 10.1 Component responsibilities

`BootPage.tsx` should:

- resolve and display the seed;
- own pause and speed controls;
- determine narrow/wide mode;
- read reduced-motion preference;
- invoke `useBootPlayback`;
- manage auto-follow and new-line counts;
- register keyboard controls;
- render terminal chrome and status;
- expose copy/reseed/restart actions;
- restore the document title on unmount.

It should not contain content word lists or generator logic.

### 10.2 Suggested component tree

```tsx
<main className={styles.page}>
  <section className={styles.terminal} aria-label="Procedural boot sequence">
    <BootHeader />
    <BootLog role="log" aria-live="off" aria-relevant="additions">
      <BootHistory />
      <BootActiveLine />
      <BottomSentinel />
    </BootLog>
    <BootStatusBar />
    <BootControls />
    <BootLiveRegion />
  </section>
</main>
```

Small internal components are acceptable when they make focus management and rendering clearer. Avoid creating generic abstractions outside the feature until reuse exists.

### 10.3 Initial shell

Render useful static content immediately, before the lazy chunk is fully active:

```tsx
<Suspense
  fallback={
    <div className="loading-shimmer" role="status">
      Waking the small processes…
    </div>
  }
>
  <BootPage />
</Suspense>
```

### 10.4 Auto-follow implementation

Track whether the viewport is near the bottom:

```ts
const FOLLOW_THRESHOLD_PX = 48

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight
    <= FOLLOW_THRESHOLD_PX
}
```

On user scroll, update `isFollowing`. When a committed line arrives and `isFollowing` is true, scroll the bottom sentinel into view with `behavior: "auto"`. Do not use smooth scrolling for constant log updates.

When not following, increment a derived unseen count from the difference between current emitted count and the count recorded when follow mode was disabled.

### 10.5 Copy seed action

Copy the complete canonical URL. On success, temporarily change the control label to:

```text
link copied — seed tucked safely inside
```

On failure, display the URL in a selectable fallback field rather than silently failing.

### 10.6 Restart semantics

- **Restart current seed:** increment a local `runId` included in the playback effect key while retaining the same seed.
- **New seed:** create a cryptographic seed, update the query string, then restart.

Do not rely on a full page reload.

---

## 11. Routing integration

Register the route explicitly in `src/router.tsx`, before the catch-all note route.

```tsx
const BootPage = lazy(() =>
  import("@/features/boot/BootPage").then((module) => ({
    default: module.BootPage,
  })),
)

const bootRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/boot",
  component: function BootRouteComponent() {
    return (
      <article className="game-layout boot-layout">
        <div className="game-stage boot-stage">
          <Suspense
            fallback={
              <div className="loading-shimmer" role="status">
                Waking the small processes…
              </div>
            }
          >
            <BootPage />
          </Suspense>
        </div>
      </article>
    )
  },
})
```

Then include `bootRoute` in the root route tree before `$`.

Verify the actual router construction syntax in the repository before editing; preserve the existing route conventions rather than forcing this sketch verbatim.

### Route rules

- Do not register `/boot` in `system-pages.ts`.
- Do not wrap it in `NoteRenderer`.
- Do not use `import.meta.glob` for its content.
- Do not add special wiki/chat build-mode branches unless the existing router requires route exclusion in those builds.

---

## 12. Visual design

### 12.1 Design direction

The terminal should feel like a maintained instrument, not a generic “hacker” screen:

- near-black glass;
- quiet accent colour inherited from the site;
- restrained phosphor bloom around the active line;
- subtle depth from borders and surface translucency;
- tiny status labels;
- no neon-green Matrix cliché;
- no aggressive glitching;
- no fake window buttons unless they serve navigation.

### 12.2 Layout

```scss
.page {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  min-height: 100dvh;
  padding: clamp(0.75rem, 2vw, 1.5rem);
  background: transparent;
  color: var(--color-text);
  font-family: var(--font-code);
}

.terminal {
  width: min(100%, 78rem);
  min-height: calc(100dvh - clamp(1.5rem, 4vw, 3rem));
  margin-inline: auto;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--color-text) 18%, transparent);
  border-radius: 0.45rem;
  background: color-mix(in srgb, var(--color-bg) 92%, transparent);
  box-shadow:
    0 1.5rem 5rem rgb(0 0 0 / 35%),
    inset 0 0 0 1px rgb(255 255 255 / 2%);
  backdrop-filter: blur(8px);
}
```

The root remains transparent so `BgCanvas` can remain visible beneath the terminal. The terminal surface is translucent enough to preserve depth while keeping text legible.

On browsers without `color-mix` or `backdrop-filter`, provide a solid token-based fallback before the enhanced declaration.

### 12.3 Log styling

```scss
.log {
  min-height: 0;
  overflow-y: auto;
  padding: clamp(1rem, 3vw, 2rem);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-variant-ligatures: none;
  font-size: clamp(0.72rem, 0.45vw + 0.62rem, 0.94rem);
  line-height: 1.48;
  tab-size: 2;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--color-accent-base) 60%, transparent)
    transparent;
}

.line {
  min-height: 1.48em;
  color: var(--color-text);
  text-shadow: 0 0 0.7rem rgb(255 255 255 / 2%);
}

.activeLine {
  color: var(--color-accent-base);
  text-shadow: 0 0 0.8rem color-mix(
    in srgb,
    var(--color-accent-base) 24%,
    transparent
  );
}
```

### 12.4 Tone classes

Map tones to existing tokens where possible. Never communicate state by colour alone because the text already contains status labels.

```scss
.toneMuted   { opacity: 0.58; }
.toneAccent  { color: var(--color-accent-base); }
.toneSuccess { opacity: 0.96; }
.toneWarning { text-decoration: underline dotted; text-underline-offset: 0.2em; }
.toneError   { font-weight: 600; }
.toneTender  { font-style: italic; opacity: 0.84; }
```

If the global token system includes semantic warning/error colours, use those instead of inventing literal values.

### 12.5 Cursor

The cursor is a narrow block or underscore aligned to the baseline. Blink frequency should be around 0.8–1.1 Hz, not a fast pulse.

```scss
.cursor {
  display: inline-block;
  width: 0.62ch;
  margin-left: 0.08ch;
  border-bottom: 0.12em solid currentColor;
  animation: cursorBlink 1.05s steps(1, end) infinite;
}

@keyframes cursorBlink {
  0%, 48% { opacity: 1; }
  49%, 100% { opacity: 0; }
}
```

### 12.6 Ambient effects

A static scanline texture and a very slow luminance drift are acceptable. They must be subtle and non-essential.

Implement them with pseudo-elements so they do not affect text selection. Set `pointer-events: none`.

Never use:

- rapid flicker;
- full-screen white flashes;
- high-amplitude chromatic aberration;
- constant text jitter;
- animation faster than 3 Hz.

### 12.7 Mobile

At `≤800px`:

- use the full available viewport;
- reduce outer padding;
- square or nearly square terminal corners;
- use a solid background because `BgCanvas` is absent;
- allow controls to wrap;
- reduce log history to approximately 110 lines;
- choose narrow ASCII layouts;
- respect safe-area insets.

```scss
@media (max-width: 800px) {
  .page {
    padding: 0;
    min-height: 100dvh;
    background: var(--color-bg);
  }

  .terminal {
    min-height: 100dvh;
    border-inline: 0;
    border-radius: 0;
    background: var(--color-bg);
    backdrop-filter: none;
  }

  .log {
    padding:
      max(0.85rem, env(safe-area-inset-top))
      max(0.85rem, env(safe-area-inset-right))
      max(1rem, env(safe-area-inset-bottom))
      max(0.85rem, env(safe-area-inset-left));
  }
}
```

### 12.8 Light theme

The boot page should remain usable if the global theme changes to light. Do not hardcode OLED black in component styles. Let tokens govern the surface, with a slightly denser terminal background for contrast.

If the product direction requires `/boot` to be permanently dark, declare that explicitly and set `color-scheme: dark` locally. The default recommendation is to honour the site theme.

---

## 13. Accessibility

### 13.1 Reduced motion

Under `prefers-reduced-motion: reduce`:

- reveal complete lines instantly;
- disable overwrite animations;
- disable cursor blinking or leave it static;
- disable scan movement and luminance drift;
- reduce output cadence to a readable pace;
- use `scrollIntoView({ behavior: "auto" })` only.

```scss
@media (prefers-reduced-motion: reduce) {
  .cursor { animation: none; opacity: 1; }
  .scanlines,
  .drift { animation: none; }
}
```

### 13.2 Screen readers

Do not announce every character or line.

- Main output: `role="log"`, `aria-live="off"`.
- Separate visually hidden region: `aria-live="polite"` for phase changes, pause/resume, copied links, and errors.
- Give ASCII frames an `ariaLabel` or mark purely decorative frames `aria-hidden="true"`.
- Controls require visible labels or `aria-label` values and clear focus styles.

### 13.3 Focus and keyboard

- Controls are reachable in a sensible tab order.
- Global shortcuts do not override browser shortcuts with Ctrl/Meta/Alt.
- `Space` only toggles playback when focus is not on an interactive control.
- Focus indicators use the site accent and meet contrast requirements.
- Pausing does not move focus.

### 13.4 Text and contrast

- Body terminal text should meet WCAG AA contrast against the effective terminal background.
- Muted text may be lower emphasis, but important state cannot rely on low-opacity text.
- Minimum mobile font size target: approximately `12px`, preferably more depending on the existing root size.

---

## 14. Performance and reliability

### 14.1 Performance budget

- No more than 300 committed line nodes.
- Typical target: 110–180 nodes.
- No unbounded arrays, timers, generators, or event listeners.
- No animation loop while the tab is hidden.
- No more than one active playback task.
- No canvas is needed for the initial version.
- Avoid re-rendering the complete terminal for cursor blink; use CSS animation.

### 14.2 Error boundary behaviour

The route should be covered by the app’s existing error boundary. If the feature throws internally, show a small in-world fallback rather than a blank page:

```text
boot sequence entered a shy state
press R to try the same seed again
```

Log the real error through the project’s normal error path; do not hide it from development tools.

### 14.3 Content safety

- Generated output is local and static; it performs no network requests.
- Never interpolate unsanitised URL seed text into HTML. Display an escaped/canonical seed label.
- Never claim to scan the actual file system, memory, camera, microphone, or network.
- Use documentation-only addresses and reserved fictional hostnames.

---

## 15. Testing plan

Assume the project uses Vitest, React Testing Library, and/or Playwright; adapt names to the actual stack.

### 15.1 RNG unit tests

- Same seed produces the same first 1,000 `nextUint32` values.
- Different seeds produce different sampled sequences.
- `float()` is always `>= 0` and `< 1`.
- `int(min, max)` includes both bounds across a sufficiently large deterministic sample.
- Seed `0` maps to the documented non-zero fallback.
- `fork("graph")` is stable and independent from calls made on the parent RNG.
- Shuffle is deterministic and does not mutate the input.

### 15.2 Seed resolver tests

- Decimal, hex, named, missing, random, empty, negative, and overflow inputs.
- Canonical URL output.
- `crypto.getRandomValues` mocked deterministically.
- No localStorage dependency for seed identity.

### 15.3 Generator tests

For each factory:

- Produces at least one event.
- Produces stable output for a fixed context.
- All IDs are unique.
- All lines are within the hard length limit.
- Timing values are finite and non-negative.
- Tone, kind, and reveal values are valid.
- Packet generator uses only approved documentation ranges.
- Filesystem free space is not greater than total space.
- Hex ASCII view matches generated bytes.
- Anomaly cap is respected.
- ASCII art has a narrow variant.

Use snapshots sparingly for a few golden seeds, plus structural assertions that remain useful when wording changes.

### 15.4 Stream tests

- Firmware prelude occurs once.
- Epoch numbers increase monotonically.
- Settlement closes every epoch.
- Required phase categories appear in every epoch.
- No factory repeats beyond the configured limit.
- Adding a random choice inside one fork does not alter unrelated fork output.

### 15.5 Playback tests

With fake timers or a controllable clock:

- Commits typed, burst, instant, and overwrite events correctly.
- Pause freezes active progress.
- Resume continues from the same point.
- Speed changes do not restart the stream.
- Seed changes abort the previous task.
- Unmount aborts timers and causes no state update warnings.
- Hidden-tab state does not consume events.
- Reduced motion commits full lines without per-character updates.
- History never exceeds its configured bound.

### 15.6 Component tests

- Renders the canonical seed.
- Pause button updates pressed state and status text.
- Keyboard shortcuts work and ignore interactive targets.
- Copy action copies the canonical URL.
- New seed updates the query string without full reload.
- Restart preserves seed.
- Auto-follow disengages on upward scroll.
- “Return to live” restores follow mode.
- Terminal uses `role="log"` with `aria-live="off"`.
- Major status updates reach the polite live region.

### 15.7 End-to-end tests

Desktop and mobile viewports:

1. Navigate to `/boot?seed=42`.
2. Assert that the route is not handled by the note catch-all.
3. Capture the first stable set of committed lines.
4. Reload and verify identical output order.
5. Pause, wait, and verify no progress.
6. Resume and verify progress.
7. Scroll upward and verify the log does not snap down.
8. Activate “return to live”.
9. Emulate reduced motion and verify no typewriter animation.
10. Leave the route and verify no console errors or continuing updates.

### 15.8 Manual quality pass

- Windows + Chrome with IBM Plex Mono.
- Safari/WebKit for `100dvh`, `backdrop-filter`, and clipboard fallback.
- Firefox for scrollbar and focus behaviour.
- Narrow Android viewport.
- iOS safe areas and dynamic browser chrome.
- Light and dark themes.
- Accent colour cycling.
- 20-minute soak test for memory and DOM stability.
- Seed URLs copied between browsers produce identical content order.

---

## 16. Implementation sequence

### Phase 1 — Route and static terminal shell

**Deliverables**

- Feature directory.
- Lazy route before catch-all.
- Static terminal frame using global tokens.
- Responsive desktop/mobile layout.
- Basic header, log region, and status bar.

**Exit condition**

`/boot` reliably opens an empty but correctly styled terminal in AppShell, including on mobile.

### Phase 2 — Deterministic foundation

**Deliverables**

- `bootRng.ts` with tested RNG, hashing, mixing, and forks.
- `bootSeed.ts` with canonical URL resolution.
- `bootTypes.ts` with event contracts.
- Stable event ID factory.

**Exit condition**

Golden seeds reproduce identical event primitives across reloads and test runs.

### Phase 3 — First coherent content arc

Implement only the generators needed for one excellent epoch:

- firmware prelude;
- system checks;
- services;
- filesystem;
- graph maintenance;
- garden maintenance;
- packet trace;
- one ASCII animation;
- settlement.

Add the core session facts and recurring mascot selection.

**Exit condition**

A fixed seed produces a 45–110 second sequence that already feels coherent, varied, and charming without looping obvious text.

### Phase 4 — Playback engine

**Deliverables**

- Reducer.
- Effect-owned infinite stream.
- Abortable, pause-aware active clock.
- Type, burst, instant, and overwrite reveal modes.
- Speed multipliers.
- visibility suspension.
- bounded history.

**Exit condition**

Playback can pause, resume, change speed, restart, reseed, unmount, and survive tab hiding without overlap or leaks.

### Phase 5 — Interaction and scroll-follow

**Deliverables**

- Keyboard controls.
- Accessible buttons.
- Copy share link.
- Restart/new seed semantics.
- Scroll follow detection.
- Unseen-line counter and return-to-live control.

**Exit condition**

The user can inspect old output without being pulled to the bottom and can always return to live playback.

### Phase 6 — Flavour expansion

Add:

- memory trace generator;
- cosmic/ephemeris generator;
- recurring daemon micro-narratives;
- 3–5 narrow-safe ASCII sequences;
- rare anomaly system;
- more status and phrase grammars;
- epoch-to-epoch continuity.

Use weighted constraints rather than raw shuffling.

**Exit condition**

A 15-minute soak rarely produces identical adjacent structures and maintains the target 70/20/10 tone balance.

### Phase 7 — Accessibility and polish

**Deliverables**

- Reduced-motion path.
- Screen-reader status region.
- Focus states and shortcut guards.
- Contrast check.
- safe-area support.
- fallback CSS for unsupported effects.
- in-world error state.

**Exit condition**

The route is fully operable by keyboard, calm under reduced motion, and does not flood assistive technology.

### Phase 8 — Verification and tuning

**Deliverables**

- Unit/integration/E2E coverage.
- 20-minute memory soak.
- cross-browser pass.
- mobile line-width audit.
- content repetition audit over at least 100 epochs and several seeds.
- timing and speed tuning by feel.

**Exit condition**

All acceptance criteria below pass and no async work survives route unmount.

---

## 17. Definition of done

### Functional

- [ ] `/boot` resolves explicitly before the catch-all route.
- [ ] The first missing/random seed is canonicalised into the URL.
- [ ] A shared seed reproduces content order exactly.
- [ ] The content stream is endless and epoch-based.
- [ ] Pause/resume preserves exact progress.
- [ ] Speed changes do not restart playback.
- [ ] Current-seed restart and new-seed actions are distinct.
- [ ] Copy action produces a working share URL.
- [ ] Auto-follow disengages when the user scrolls away.
- [ ] History and DOM node counts remain bounded.
- [ ] Unmount cancels all work without warnings.

### Experience

- [ ] Opening 30 seconds establish a coherent machine identity.
- [ ] Technical lines remain the majority.
- [ ] Cute/poetic lines feel earned and not repetitive.
- [ ] Epochs have a recognisable arc rather than random soup.
- [ ] ASCII art works at wide and narrow widths.
- [ ] The terminal remains readable over `BgCanvas`.
- [ ] Mobile fills the dynamic viewport without clipped controls.
- [ ] Accent and theme tokens propagate correctly.

### Accessibility

- [ ] Reduced motion disables typing and frame animation.
- [ ] Screen readers are not spammed by every line.
- [ ] All controls are keyboard reachable and visibly focused.
- [ ] Shortcuts do not hijack interactive elements or modifier combinations.
- [ ] Important states are understandable without colour.

### Quality

- [ ] RNG tests prove determinism and valid ranges.
- [ ] Generator invariants are covered.
- [ ] Playback abort/pause tests pass.
- [ ] E2E reload of a fixed seed reproduces output.
- [ ] 20-minute soak shows stable memory and node counts.
- [ ] No real network, filesystem, or memory access occurs.
- [ ] No console errors in development or production build.

---

## 18. Optional extensions after v1

These are deliberately excluded from the first implementation:

### Soft audio

A very quiet relay click, drive murmur, or filtered noise bed could deepen immersion, but audio must:

- start muted;
- require explicit user activation;
- respect global music state;
- stop immediately on route leave;
- have a visible mute control;
- never be needed for comprehension.

### Export session transcript

Offer a plain-text download containing:

- seed;
- start timestamp;
- visible committed events;
- no browser or device information.

### Deep links into epochs

`/boot?seed=...&epoch=7` could skip deterministically to an epoch by constructing it directly from the root seed. Do not fast-forward by consuming all previous events.

### Theme variants

A seed-derived “machine temperament” could subtly select among approved visual treatments—warm phosphor, moonlit blue, paper-white service terminal—while still using site tokens and maintaining contrast.

### Cross-feature Easter eggs

The boot stream may reference real internal app concepts such as note counts or graph terminology only when that data is already safely available in memory. Keep the default implementation self-contained and deterministic; avoid adding network or index dependencies merely for flavour.

---

## 19. Final implementation guidance

The feature succeeds through restraint. The technical scaffolding should be unusually solid so the surface can feel effortless: no stale closures, no faux determinism, no runaway generator, no scroll wrestling, and no wall of generic cyberpunk text.

Build the first epoch by hand with the care of a short piece of music. Then proceduralise its variations without losing its shape. The best version of `/boot` is not impressive because it prints infinitely many lines. It is impressive because, every so often, the machine says something like:

```text
checking whether the garden is still there .... yes
```

—and by then the user believes it has a garden.
