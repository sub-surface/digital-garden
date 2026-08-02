/**
 * Icons drawn on a 16×16 grid, in the chunky style of the era.
 *
 * Inline SVG rather than bitmaps: they inherit the site accent, they stay crisp
 * at 32px on the desktop and 16px in the taskbar, and they cost no requests.
 * `shapeRendering="crispEdges"` keeps the pixel grid hard at every size.
 */

export type IconName =
  | "doc"
  | "article"
  | "folder"
  | "computer"
  | "terminal"
  | "help"
  | "bin"
  | "binFull"
  | "app"
  | "display"
  | "music"
  | "chat"
  | "graph"
  | "image"
  | "paint"
  | "petri"
  | "user"

interface Props {
  name: IconName
  size?: number
  className?: string
}

const A = "var(--color-accent-base)"
const PAPER = "#f4f4ef"
const INK = "#2a2a30"
const SHADE = "#9a9aa2"
const METAL = "#b8b8c0"

export function OSIcon({ name, size = 32, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[name]}
    </svg>
  )
}

/** A sheet of paper with a folded corner — the base for every document type. */
function page(lines: { y: number; w: number; fill?: string }[]) {
  return (
    <>
      <path d="M3 1h7l3 3v11H3z" fill={PAPER} stroke={INK} strokeWidth="0.5" />
      <path d="M10 1v3h3z" fill={SHADE} />
      {lines.map((l, i) => (
        <rect key={i} x="5" y={l.y} width={l.w} height="1" fill={l.fill ?? SHADE} />
      ))}
    </>
  )
}

const GLYPHS: Record<IconName, React.ReactNode> = {
  doc: page([{ y: 6, w: 6 }, { y: 8, w: 6 }, { y: 10, w: 4 }]),

  // An article carries an accent rule where its title would be.
  article: page([{ y: 6, w: 6, fill: A }, { y: 8, w: 6 }, { y: 10, w: 6 }, { y: 12, w: 3 }]),

  folder: (
    <>
      <path d="M1 3h5l1.5 2H15v9H1z" fill={A} stroke={INK} strokeWidth="0.5" />
      <path d="M1 6h14v8H1z" fill={A} opacity="0.55" />
    </>
  ),

  computer: (
    <>
      <rect x="1" y="2" width="14" height="9" fill={METAL} stroke={INK} strokeWidth="0.5" />
      <rect x="2.5" y="3.5" width="11" height="6" fill={A} />
      <rect x="5" y="12" width="6" height="1.5" fill={SHADE} />
      <rect x="3" y="13.5" width="10" height="1.5" fill={METAL} stroke={INK} strokeWidth="0.5" />
    </>
  ),

  terminal: (
    <>
      <rect x="1" y="2" width="14" height="12" fill={INK} stroke={SHADE} strokeWidth="0.5" />
      <rect x="3" y="5" width="1" height="1" fill={A} />
      <rect x="4" y="6" width="1" height="1" fill={A} />
      <rect x="3" y="7" width="1" height="1" fill={A} />
      <rect x="6" y="7" width="5" height="1" fill={SHADE} />
    </>
  ),

  help: (
    <>
      <rect x="2" y="1" width="12" height="14" fill={PAPER} stroke={INK} strokeWidth="0.5" />
      <rect x="2" y="1" width="3" height="14" fill={A} />
      <path
        d="M8 5h2v1h1v2h-2v1h-1V7h1V6H8z M9 11h1v1H9z"
        fill={INK}
      />
    </>
  ),

  bin: (
    <>
      <path d="M4 4h8l-1 11H5z" fill={METAL} stroke={INK} strokeWidth="0.5" />
      <rect x="3" y="2" width="10" height="2" fill={SHADE} stroke={INK} strokeWidth="0.5" />
      <rect x="6.5" y="6" width="1" height="7" fill={SHADE} />
      <rect x="8.5" y="6" width="1" height="7" fill={SHADE} />
    </>
  ),

  binFull: (
    <>
      <path d="M4 4h8l-1 11H5z" fill={METAL} stroke={INK} strokeWidth="0.5" />
      <rect x="3" y="2" width="10" height="2" fill={SHADE} stroke={INK} strokeWidth="0.5" />
      <rect x="5" y="0" width="3" height="2" fill={PAPER} stroke={INK} strokeWidth="0.4" />
      <rect x="8" y="1" width="3" height="1" fill={PAPER} stroke={INK} strokeWidth="0.4" />
      <rect x="6.5" y="6" width="1" height="7" fill={SHADE} />
      <rect x="8.5" y="6" width="1" height="7" fill={SHADE} />
    </>
  ),

  app: (
    <>
      <rect x="2" y="2" width="12" height="12" fill={METAL} stroke={INK} strokeWidth="0.5" />
      <rect x="4" y="4" width="8" height="3" fill={A} />
      <rect x="4" y="9" width="4" height="3" fill={SHADE} />
      <rect x="9" y="9" width="3" height="3" fill={SHADE} />
    </>
  ),

  display: (
    <>
      <rect x="1" y="2" width="14" height="10" fill={METAL} stroke={INK} strokeWidth="0.5" />
      <rect x="2.5" y="3.5" width="11" height="7" fill={A} />
      <rect x="4" y="5" width="8" height="1" fill={PAPER} opacity="0.7" />
      <rect x="6" y="12" width="4" height="2" fill={SHADE} />
    </>
  ),

  music: (
    <>
      <rect x="9" y="2" width="1.5" height="9" fill={INK} />
      <path d="M10.5 2h3v2h-3z" fill={INK} />
      <circle cx="7.5" cy="11" r="2.5" fill={A} />
    </>
  ),

  chat: (
    <>
      <path d="M1 3h14v8H8l-4 3v-3H1z" fill={PAPER} stroke={INK} strokeWidth="0.5" />
      <rect x="3" y="5.5" width="10" height="1" fill={A} />
      <rect x="3" y="8" width="6" height="1" fill={SHADE} />
    </>
  ),

  graph: (
    <>
      <rect x="1" y="1" width="14" height="14" fill={INK} stroke={SHADE} strokeWidth="0.5" />
      <path d="M4 12L7 5l4 6 2-4" stroke={A} strokeWidth="1" fill="none" />
      <circle cx="7" cy="5" r="1.4" fill={PAPER} />
      <circle cx="11" cy="11" r="1.2" fill={A} />
    </>
  ),

  image: (
    <>
      <rect x="1" y="2" width="14" height="12" fill={PAPER} stroke={INK} strokeWidth="0.5" />
      <rect x="2.5" y="3.5" width="11" height="9" fill={A} opacity="0.58" />
      <circle cx="11" cy="6" r="1.5" fill={PAPER} />
      <path d="M3 11l3-3 2 2 2-3 3 4z" fill={INK} />
    </>
  ),

  paint: (
    <>
      <rect x="1" y="2" width="12" height="11" fill={PAPER} stroke={INK} strokeWidth="0.5" />
      <rect x="3" y="4" width="3" height="3" fill={A} />
      <rect x="7" y="4" width="3" height="3" fill="#e8c547" />
      <rect x="3" y="8" width="3" height="3" fill="#4c8ccf" />
      <path d="M10 12l4-6 1 1-4 6z" fill={INK} />
      <rect x="10" y="12" width="2" height="2" fill={A} />
    </>
  ),

  petri: (
    <>
      <circle cx="8" cy="8" r="7" fill={PAPER} stroke={INK} strokeWidth="0.6" />
      <circle cx="8" cy="8" r="5.4" fill={A} opacity="0.34" />
      <path d="M4.5 9c0-2.4 1.4-4 3.6-4 2.5 0 3.9 1.8 3.5 4.1-.3 1.8-1.7 2.8-3.7 2.8-2.2 0-3.4-1.1-3.4-2.9z" fill={A} stroke={INK} strokeWidth="0.4" />
      <rect x="6" y="7" width="1" height="1.5" fill={INK} />
      <rect x="9" y="7" width="1" height="1.5" fill={INK} />
    </>
  ),

  user: (
    <>
      <rect x="1" y="1" width="14" height="14" fill={METAL} stroke={INK} strokeWidth="0.5" />
      <circle cx="8" cy="5.5" r="3" fill={PAPER} stroke={INK} strokeWidth="0.5" />
      <path d="M3 14v-2.5C3 9.6 5.2 8.5 8 8.5s5 1.1 5 3V14z" fill={A} stroke={INK} strokeWidth="0.5" />
    </>
  ),
}
