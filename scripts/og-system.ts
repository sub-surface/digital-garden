/**
 * Generative OG cards for system / custom pages (arcade, graph, chess, …).
 *
 * Notes get their cards from og-gen.ts (driven by content-index.json). System
 * pages aren't in that index, so the worker points og:image at
 * /og/<slug>.png with nothing behind it — this script fills that gap.
 *
 * Each card has a bespoke procedural motif rendered with satori. Motifs are
 * built from a slug-seeded RNG so the output is deterministic across builds
 * (stable hashes, cache-friendly). Run via: PROCESS_OG=true npm run prebuild
 * (og-gen invokes this), or directly: tsx scripts/og-system.ts
 */
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import { ogCardName } from "../src/lib/slug"
import satori from "satori"
import { Resvg } from "@resvg/resvg-js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.resolve(__dirname, "../public")
const OG_DIR = path.join(PUBLIC_DIR, "og")

const BG = "#0a0a0a"
const FG = "#ffffff"
const DIM = "#888888"
export const OG_FONT_FAMILY = "EBGaramond"
const OG_FONT_URLS = {
  regular: "https://raw.githubusercontent.com/octaviopardo/EBGaramond12/master/fonts/ttf/EBGaramond-Regular.ttf",
  semibold: "https://raw.githubusercontent.com/octaviopardo/EBGaramond12/master/fonts/ttf/EBGaramond-SemiBold.ttf",
} as const

export interface OgFontData {
  regular: ArrayBuffer
  semibold: ArrayBuffer
}

export async function loadOgFonts(): Promise<OgFontData> {
  const load = async (url: string) => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to load OG font: ${response.status} ${response.statusText}`)
    return response.arrayBuffer()
  }
  const [regular, semibold] = await Promise.all([
    load(OG_FONT_URLS.regular),
    load(OG_FONT_URLS.semibold),
  ])
  return { regular, semibold }
}

// Minimal node-tree helpers so the motif code reads less noisily than raw satori.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any
function el(type: string, style: Record<string, unknown>, children?: Node[] | string): Node {
  return { type, props: { style, ...(children !== undefined ? { children } : {}) } }
}

/** Deterministic xorshift32 RNG seeded from the slug (matches the boot RNG idea). */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
function rng(seed: number) {
  let state = seed || 0x6d2b79f5
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 0x100000000
  }
}

interface CardSpec {
  slug: string
  kicker: string
  title: string
  subtitle: string
  accent: string
  /** Builds the right-hand visual motif as a satori node. */
  motif: (accent: string, seed: number) => Node
}

// ── Motifs ──────────────────────────────────────────────────────────────────

/** Node-and-edge constellation (graph, constellation). */
function constellationMotif(accent: string, seed: number): Node {
  const r = rng(seed)
  const points = Array.from({ length: 10 }, () => ({
    x: 36 + r() * 250,
    y: 40 + r() * 470,
    s: 8 + r() * 12,
  }))
  // Centre of each node — edges must start and end exactly here so the lines
  // visibly touch the dots.
  const cx = (p: { x: number; s: number }) => p.x + p.s / 2
  const cy = (p: { y: number; s: number }) => p.y + p.s / 2

  // Connect each node to its nearest neighbour: short edges that read as a real
  // constellation rather than long crossing diagonals that miss the dots.
  const edges: Node[] = []
  for (let i = 0; i < points.length; i += 1) {
    let best = -1
    let bestDist = Infinity
    for (let j = 0; j < points.length; j += 1) {
      if (j === i) continue
      const d = (cx(points[i]) - cx(points[j])) ** 2 + (cy(points[i]) - cy(points[j])) ** 2
      if (d < bestDist) {
        bestDist = d
        best = j
      }
    }
    const a = points[i]
    const b = points[best]
    const dx = cx(b) - cx(a)
    const dy = cy(b) - cy(a)
    const len = Math.sqrt(dx * dx + dy * dy)
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI
    edges.push(
      el("div", {
        position: "absolute",
        left: `${cx(a)}px`,
        top: `${cy(a)}px`,
        width: `${len}px`,
        height: "2px",
        backgroundColor: accent,
        opacity: 0.35,
        transform: `rotate(${angle}deg)`,
        transformOrigin: "0 1px",
      }),
    )
  }
  const dots = points.map((p) =>
    el("div", {
      position: "absolute",
      left: `${p.x}px`,
      top: `${p.y}px`,
      width: `${p.s}px`,
      height: `${p.s}px`,
      borderRadius: "50%",
      backgroundColor: accent,
    }),
  )
  return el("div", { display: "flex", position: "relative", width: "340px", height: "100%" }, [
    ...edges,
    ...dots,
  ])
}

/** Checkerboard fragment (chess). */
function chessMotif(accent: string): Node {
  const cells: Node[] = []
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const dark = (row + col) % 2 === 1
      cells.push(
        el("div", {
          width: "52px",
          height: "52px",
          backgroundColor: dark ? accent : "#161616",
          opacity: dark ? 0.85 : 1,
        }),
      )
    }
  }
  return el(
    "div",
    {
      display: "flex",
      position: "relative",
      width: "340px",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
    },
    [el("div", { display: "flex", flexWrap: "wrap", width: "312px" }, cells)],
  )
}

/**
 * Honeycomb of cells in hex-packed offset rows. satori has no clip-path, so a
 * true hexagon polygon isn't drawable — circles in a hex lattice read as a hex
 * grid far better than rotated squares did. Shared by hexo and hex-life.
 *
 * `filled` decides each cell's state: outlined rings (hexo board) vs solid
 * on/off cells (hex-life). Deterministic from the seed.
 */
function honeycomb(accent: string, seed: number, style: "ring" | "life"): Node {
  const r = rng(seed)
  const cell = 52
  const gapX = cell + 8 // horizontal spacing between cell centres
  const rowH = cell * 0.86 // hex rows overlap vertically
  const cols = 4
  const rows = 7
  const cells: Node[] = []
  for (let row = 0; row < rows; row += 1) {
    const offset = (row % 2) * (gapX / 2)
    for (let col = 0; col < cols; col += 1) {
      const live = r() > 0.5
      const left = 18 + offset + col * gapX
      const top = 8 + row * rowH
      if (left + cell > 340) continue
      cells.push(
        style === "ring"
          ? el("div", {
              position: "absolute",
              left: `${left}px`,
              top: `${top}px`,
              width: `${cell}px`,
              height: `${cell}px`,
              borderRadius: "50%",
              border: `2px solid ${accent}`,
              opacity: 0.3 + r() * 0.6,
            })
          : el("div", {
              position: "absolute",
              left: `${left}px`,
              top: `${top}px`,
              width: `${cell}px`,
              height: `${cell}px`,
              borderRadius: "50%",
              backgroundColor: live ? accent : "#161616",
              opacity: live ? 0.55 + r() * 0.45 : 1,
            }),
      )
    }
  }
  return el("div", { display: "flex", position: "relative", width: "340px", height: "100%" }, cells)
}

function hexMotif(accent: string, seed: number): Node {
  return honeycomb(accent, seed, "ring")
}

function hexLifeMotif(accent: string, seed: number): Node {
  return honeycomb(accent, seed, "life")
}

/** Equalizer bars (music-library). */
function waveMotif(accent: string, seed: number): Node {
  const r = rng(seed)
  const bars = Array.from({ length: 18 }, () =>
    el("div", {
      width: "10px",
      height: `${40 + r() * 380}px`,
      backgroundColor: accent,
      borderRadius: "3px",
      opacity: 0.55 + r() * 0.45,
    }),
  )
  return el(
    "div",
    {
      display: "flex",
      width: "340px",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
    },
    bars,
  )
}

/** Stacked book spines (bookshelf). */
function shelfMotif(accent: string, seed: number): Node {
  const r = rng(seed)
  const palette = [accent, "#427ab4", "#b4424c", "#6a9955", "#c8a84c", "#7a5fb4"]
  const spines = Array.from({ length: 7 }, (_, i) =>
    el("div", {
      width: `${36 + r() * 14}px`,
      height: `${360 + r() * 200}px`,
      backgroundColor: palette[i % palette.length],
      opacity: 0.85,
      borderRadius: "2px",
      borderTop: `4px solid ${FG}`,
    }),
  )
  return el(
    "div",
    {
      display: "flex",
      width: "340px",
      height: "100%",
      alignItems: "flex-end",
      justifyContent: "center",
      gap: "8px",
      paddingBottom: "40px",
    },
    spines,
  )
}

/** Film strip (movieshelf). */
function filmMotif(accent: string): Node {
  const frames = Array.from({ length: 5 }, () =>
    el("div", {
      width: "200px",
      height: "80px",
      backgroundColor: "#161616",
      border: `2px solid ${accent}`,
      borderRadius: "4px",
    }),
  )
  const perfs = (side: string) =>
    el(
      "div",
      {
        position: "absolute",
        top: "0px",
        [side]: "30px",
        display: "flex",
        flexDirection: "column",
        gap: "18px",
        paddingTop: "14px",
      },
      Array.from({ length: 12 }, () =>
        el("div", { width: "14px", height: "20px", backgroundColor: accent, opacity: 0.5, borderRadius: "2px" }),
      ),
    )
  return el(
    "div",
    {
      display: "flex",
      position: "relative",
      width: "340px",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: "12px",
    },
    [perfs("left"), perfs("right"), ...frames],
  )
}

/**
 * Seeded pixel grid (arcade + individual games). The per-slug seed gives each
 * game a distinct "sprite", and the accent colour + title text carry identity —
 * no font glyphs, so nothing can fail to render.
 */
function arcadeMotif(accent: string, seed: number): Node {
  const r = rng(seed)
  const cols = 9
  const pixels: Node[] = []
  for (let i = 0; i < cols * cols; i += 1) {
    const on = r() > 0.5
    pixels.push(
      el("div", {
        width: "30px",
        height: "30px",
        backgroundColor: on ? accent : "#141414",
        opacity: on ? 0.45 + r() * 0.55 : 1,
        borderRadius: "3px",
      }),
    )
  }
  return el(
    "div",
    {
      display: "flex",
      width: "340px",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
    },
    [el("div", { display: "flex", flexWrap: "wrap", width: `${cols * 32}px`, gap: "2px" }, pixels)],
  )
}

// ── Card registry ────────────────────────────────────────────────────────────

const CARDS: CardSpec[] = [
  { slug: "arcade", kicker: "Sub-Surface Arcade", title: "The Arcade", subtitle: "A cabinet of small, hand-built games", accent: "#c8a84c", motif: arcadeMotif },
  { slug: "graph", kicker: "Sub-Surface Territories", title: "The Graph", subtitle: "Every note and the links between them", accent: "#427ab4", motif: constellationMotif },
  { slug: "constellation", kicker: "Sub-Surface Territories", title: "Constellation", subtitle: "The garden, charted as a night sky", accent: "#8ed7e8", motif: constellationMotif },
  { slug: "chess", kicker: "Sub-Surface Arcade", title: "Chess", subtitle: "Play the in-house engine", accent: "#b4424c", motif: chessMotif },
  { slug: "hexo", kicker: "Sub-Surface Arcade", title: "HeXO", subtitle: "A connection game on a hex board", accent: "#6a9955", motif: hexMotif },
  { slug: "music-library", kicker: "Sub-Surface Territories", title: "Music Library", subtitle: "Tracks, mixes and liner notes", accent: "#d2a3e8", motif: waveMotif },
  { slug: "bookshelf", kicker: "Sub-Surface Territories", title: "Bookshelf", subtitle: "What I'm reading and have read", accent: "#c8a84c", motif: shelfMotif },
  { slug: "movieshelf", kicker: "Sub-Surface Territories", title: "Movieshelf", subtitle: "Films worth keeping", accent: "#b4424c", motif: filmMotif },
  // Individual arcade games — seeded pixel motif, distinguished by accent + title.
  { slug: "snake", kicker: "Sub-Surface Arcade", title: "Snake", subtitle: "The classic, grown long", accent: "#6a9955", motif: arcadeMotif },
  { slug: "tetris", kicker: "Sub-Surface Arcade", title: "Tetris", subtitle: "Fill the well", accent: "#427ab4", motif: arcadeMotif },
  { slug: "2048", kicker: "Sub-Surface Arcade", title: "2048", subtitle: "Slide and merge", accent: "#c8a84c", motif: arcadeMotif },
  { slug: "blackjack", kicker: "Sub-Surface Arcade", title: "Blackjack", subtitle: "Beat the dealer to 21", accent: "#b4424c", motif: arcadeMotif },
  { slug: "murmuration", kicker: "Sub-Surface Arcade", title: "Murmuration", subtitle: "A flock that follows your cursor", accent: "#8ed7e8", motif: arcadeMotif },
  { slug: "sandbox", kicker: "Sub-Surface Arcade", title: "Sandbox", subtitle: "Falling-sand cellular toys", accent: "#c8a84c", motif: arcadeMotif },
  { slug: "hex-mines", kicker: "Sub-Surface Arcade", title: "Hex Mines", subtitle: "Minesweeper on hexagons", accent: "#b4424c", motif: hexMotif },
  { slug: "ant-farm", kicker: "Sub-Surface Arcade", title: "Ant Farm", subtitle: "A small emergent colony", accent: "#6a9955", motif: arcadeMotif },
  { slug: "hex-life", kicker: "Sub-Surface Arcade", title: "Hex Life", subtitle: "Conway's Life on a hex grid", accent: "#8ed7e8", motif: hexLifeMotif },
  { slug: "progressions", kicker: "Sub-Surface Arcade", title: "Progressions", subtitle: "A generative harmonic board", accent: "#d2a3e8", motif: arcadeMotif },
]

function cardTree(spec: CardSpec): Node {
  const seed = hash(spec.slug)
  return el(
    "div",
    {
      height: "100%",
      width: "100%",
      display: "flex",
      flexDirection: "row",
      alignItems: "stretch",
      backgroundColor: BG,
      backgroundImage: "radial-gradient(circle at 25px 25px, #1a1a1a 2%, transparent 0%)",
      backgroundSize: "50px 50px",
      fontFamily: OG_FONT_FAMILY,
      borderLeft: `12px solid ${spec.accent}`,
    },
    [
      // Left: text
      el(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px",
          flex: 1,
        },
        [
          el(
            "div",
            { fontSize: 24, color: spec.accent, marginBottom: "20px", textTransform: "uppercase", letterSpacing: "4px" },
            spec.kicker,
          ),
          el("div", { fontSize: 84, fontWeight: 600, color: FG, marginBottom: "24px", lineHeight: 1.05 }, spec.title),
          el("div", { fontSize: 28, color: DIM, lineHeight: 1.4, maxWidth: "620px" }, spec.subtitle),
        ],
      ),
      // Right: motif panel
      el(
        "div",
        {
          width: "360px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderLeft: "1px solid #1a1a1a",
        },
        [spec.motif(spec.accent, seed)],
      ),
    ],
  )
}

export async function generateSystemCards(fontData: OgFontData): Promise<number> {
  if (!fs.existsSync(OG_DIR)) fs.mkdirSync(OG_DIR, { recursive: true })

  for (const spec of CARDS) {
    const svg = await satori(cardTree(spec), {
      width: 1200,
      height: 630,
      fonts: [
        { name: OG_FONT_FAMILY, data: fontData.regular, weight: 400, style: "normal" },
        { name: OG_FONT_FAMILY, data: fontData.semibold, weight: 600, style: "normal" },
      ],
    })
    const png = new Resvg(svg).render().asPng()
    fs.writeFileSync(path.join(OG_DIR, ogCardName(spec.slug)), png)
  }
  return CARDS.length
}

// Allow standalone execution (cross-platform entry check).
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  const fonts = await loadOgFonts()
  const n = await generateSystemCards(fonts)
  console.log(`Generated ${n} system-page OG card(s) in public/og/`)
}
