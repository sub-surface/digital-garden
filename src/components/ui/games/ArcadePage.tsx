import { useMemo, useState } from "react"
import styles from "./ArcadePage.module.scss"

type Section = "featured" | "games" | "toys"

interface GameCard {
  /** Internal slug, or an absolute URL for games on other subdomains. */
  href: string | null
  name: string
  blurb: string
  live: boolean
  /** Which shelf this card sorts into. "featured" gets the larger marquee tile. */
  section: Section
  /** Opens on another subdomain / external. */
  external?: boolean
}

const SECTIONS: { key: Section; label: string }[] = [
  { key: "featured", label: "Featured" },
  { key: "games", label: "Games" },
  { key: "toys", label: "Toys" },
]

const GAMES: GameCard[] = [
  {
    href: "https://star.subsurfaces.net",
    name: "StarWeft",
    blurb: "Reweave a fractured galaxy: trade, build routes, hold back the Scourge. A whole space-logistics strategy game.",
    live: true,
    section: "featured",
    external: true,
  },
  {
    href: "https://lines.subsurfaces.net",
    name: "Lines of Flight",
    blurb: "A dot that stays, a line that leaves. Draw living ink through an invisible field, with a voice from Deleuze. A meditation.",
    live: true,
    section: "featured",
    external: true,
  },
  {
    href: "https://anabasis.subsurfaces.net",
    name: "Anabasis",
    blurb: "Feed it an image; the machine forgets the image and hallucinates a world. A PS1-era topographic apparatus, after Fontcuberta. A toy you wander.",
    live: true,
    section: "featured",
    external: true,
  },
  {
    href: "https://rps.subsurfaces.net",
    name: "JANKEN",
    blurb: "Rock–paper–scissors chess: pieces move like chess but may take only what they beat, so identity is as much a wall as a weapon. Multiplayer, analysis board, and a solved tablebase for the 3×3 variants.",
    live: true,
    section: "featured",
    external: true,
  },
  { href: "hexo", name: "HeXO", blurb: "Connect six on an endless hex field, against a handmade opponent.", live: true, section: "featured" },
  {
    href: "https://omega.subsurfaces.net",
    name: "The Predictor",
    blurb: "A roguelike where the antagonist is trained on you. Escape the station; disagree with the machine that hunts you.",
    live: true,
    section: "featured",
    external: true,
  },
  { href: "chess", name: "Chess", blurb: "A small handmade machine to play against.", live: true, section: "games" },
  { href: "tetris", name: "Tetris", blurb: "The falling well, themed in accent monochrome.", live: true, section: "games" },
  { href: "snake", name: "Snake", blurb: "Walls wrap; the rare bloom bends time.", live: true, section: "games" },
  { href: "2048", name: "2048", blurb: "Merge tiles up the ROYGBIV spectrum.", live: true, section: "games" },
  { href: "blackjack", name: "Blackjack", blurb: "Dealer stands on 17. Blackjack pays 3:2.", live: true, section: "games" },
  { href: "hex-mines", name: "Hex Mines", blurb: "Minesweeper on hexes — six neighbours each.", live: true, section: "games" },
  { href: "murmuration", name: "Murmuration", blurb: "A flock of boids that flees your cursor. A toy.", live: true, section: "toys" },
  { href: "sandbox", name: "Sandbox", blurb: "Falling sand: paint, flow, grow, burn. A toy.", live: true, section: "toys" },
  { href: "ant-farm", name: "Ant Farm", blurb: "A colony foraging by pheromone — paths emerge and fade. A toy.", live: true, section: "toys" },
  { href: "hex-life", name: "Hex Life", blurb: "Cellular automata on a hex grid — simple rules, emergent worlds. A toy.", live: true, section: "toys" },
  { href: "life", name: "Life", blurb: "Conway's Game of Life — the original square-grid automaton. A toy.", live: true, section: "toys" },
  { href: "progressions", name: "Progressions", blurb: "Two agents race to build the longest arithmetic progression. A toy.", live: true, section: "toys" },
  { href: "persian-carpet", name: "Persian Carpet", blurb: "Born from a shower thought about asking Claude to weave cute rugs. Seed a loom, pick a dye lot, find the deliberate flaw.", live: true, section: "toys" },
  { href: "sigil", name: "SIGIL", blurb: "Inscribe the plate: route leader lines between instrument pairs without crossing. Solved boards read as drawn sigils. Daily plate included.", live: true, section: "games" },
  { href: "collider", name: "Collider", blurb: "Fire particle tracks through an invisible flow field to strike specimen targets. Aim is skill; the currents are the puzzle. A toy.", live: true, section: "games" },
  {
    href: "filament",
    name: "FILAMENT",
    blurb:
      "A periodic universe from recombination to now, on a real ΛCDM clock. Up to a quarter-million fully gravitating particles form a multiscale cosmic web under a fast particle-mesh solver; isolated galaxies retain exact 2D Fast Multipole gravity. Watch the CMB fade, the dark ages pass, and quasars light at cosmic noon.",
    live: true,
    section: "featured",
  },
  { href: "apparatus", name: "Apparatus", blurb: "A seeded studio for generative dithered plates — compose whole plates, lock the good bits and re-roll the rest, then re-emulate through vintage output devices (Mac 1-bit, Game Boy, CGA, plotter…). Square by default; exports SVG/PNG.", live: true, section: "featured" },
]

function renderRow(g: GameCard) {
  const inner = (
    <>
      <span className={styles.rowName}>
        {g.name}
        {g.external && g.live && <span className={styles.ext}> ↗</span>}
      </span>
      <span className={styles.rowBlurb}>{g.blurb}</span>
    </>
  )

  const cls = [styles.row, g.section === "featured" ? styles.rowFeatured : "", !g.live ? styles.rowDisabled : ""]
    .filter(Boolean)
    .join(" ")

  if (!g.live || !g.href) {
    return (
      <li key={g.name} className={cls}>
        {inner}
      </li>
    )
  }
  if (g.external) {
    return (
      <li key={g.name}>
        <a href={g.href} className={cls} target="_blank" rel="noreferrer" data-panel-ignore>
          {inner}
        </a>
      </li>
    )
  }
  return (
    <li key={g.name}>
      <a href={`/${g.href}`} className={`internal-link ${cls}`} data-no-preview>
        {inner}
      </a>
    </li>
  )
}

export function ArcadePage() {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return GAMES
    return GAMES.filter(
      (g) => g.name.toLowerCase().includes(q) || g.blurb.toLowerCase().includes(q),
    )
  }, [query])

  const groups = useMemo(
    () =>
      SECTIONS.map((s) => ({ ...s, items: filtered.filter((g) => g.section === s.key) })).filter(
        (s) => s.items.length > 0,
      ),
    [filtered],
  )

  return (
    <div className={styles.arcadeContainer}>
      <header className={styles.header}>
        <h1>Arcade</h1>
        <p>A cabinet of handmade games, toys, and small worlds.</p>
      </header>

      <input
        type="search"
        className={styles.search}
        placeholder="Filter…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        aria-label="Filter games"
      />

      {groups.map((group) => (
        <section key={group.key}>
          <h2 className={styles.sectionLabel}>{group.label}</h2>
          <ul className={styles.list}>{group.items.map(renderRow)}</ul>
        </section>
      ))}
      {filtered.length === 0 && <p className={styles.empty}>Nothing matches “{query}”.</p>}
    </div>
  )
}
