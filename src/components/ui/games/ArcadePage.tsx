import { useMemo, useState } from "react"
import styles from "./ArcadePage.module.scss"

interface GameCard {
  /** Internal slug, or an absolute URL for games on other subdomains. */
  href: string | null
  name: string
  blurb: string
  live: boolean
  /** Larger feature tile for the marquee games. */
  featured?: boolean
  /** Opens on another subdomain / external. */
  external?: boolean
}

const GAMES: GameCard[] = [
  {
    href: "https://star.subsurfaces.net",
    name: "StarWeft",
    blurb: "Reweave a fractured galaxy: trade, build routes, hold back the Scourge. A whole space-logistics strategy game.",
    live: true,
    featured: true,
    external: true,
  },
  {
    href: "https://lines.subsurfaces.net",
    name: "Lines of Flight",
    blurb: "A dot that stays, a line that leaves. Draw living ink through an invisible field, with a voice from Deleuze. A meditation.",
    live: true,
    featured: true,
    external: true,
  },
  {
    href: "https://anabasis.subsurfaces.net",
    name: "Anabasis",
    blurb: "Feed it an image; the machine forgets the image and hallucinates a world. A PS1-era topographic apparatus, after Fontcuberta. A toy you wander.",
    live: true,
    featured: true,
    external: true,
  },
  { href: "hexo", name: "HeXO", blurb: "Connect six on an endless hex field, against a handmade opponent.", live: true, featured: true },
  {
    href: "https://omega.subsurfaces.net",
    name: "The Predictor",
    blurb: "A roguelike where the antagonist is trained on you. Escape the station; disagree with the machine that hunts you.",
    live: true,
    featured: true,
    external: true,
  },
  { href: "chess", name: "Chess", blurb: "A small handmade machine to play against.", live: true },
  { href: "tetris", name: "Tetris", blurb: "The falling well, themed in accent monochrome.", live: true },
  { href: "snake", name: "Snake", blurb: "Walls wrap; the rare bloom bends time.", live: true },
  { href: "2048", name: "2048", blurb: "Merge tiles up the ROYGBIV spectrum.", live: true },
  { href: "blackjack", name: "Blackjack", blurb: "Dealer stands on 17. Blackjack pays 3:2.", live: true },
  { href: "hex-mines", name: "Hex Mines", blurb: "Minesweeper on hexes — six neighbours each.", live: true },
  { href: "murmuration", name: "Murmuration", blurb: "A flock of boids that flees your cursor. A toy.", live: true },
  { href: "sandbox", name: "Sandbox", blurb: "Falling sand: paint, flow, grow, burn. A toy.", live: true },
  { href: "ant-farm", name: "Ant Farm", blurb: "A colony foraging by pheromone — paths emerge and fade. A toy.", live: true },
  { href: "hex-life", name: "Hex Life", blurb: "Cellular automata on a hex grid — simple rules, emergent worlds. A toy.", live: true },
  { href: "life", name: "Life", blurb: "Conway's Game of Life — the original square-grid automaton. A toy.", live: true },
  { href: "progressions", name: "Progressions", blurb: "Two agents race to build the longest arithmetic progression. A toy.", live: true },
  { href: "persian-carpet", name: "Persian Carpet", blurb: "Born from a shower thought about asking Claude to weave cute rugs. Seed a loom, pick a dye lot, find the deliberate flaw.", live: true },
  { href: "sigil", name: "SIGIL", blurb: "Inscribe the plate: route leader lines between instrument pairs without crossing. Solved boards read as drawn sigils. Daily plate included.", live: true },
]

export function ArcadePage() {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return GAMES
    return GAMES.filter(
      (g) => g.name.toLowerCase().includes(q) || g.blurb.toLowerCase().includes(q),
    )
  }, [query])

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

      <ul className={styles.list}>
        {filtered.map((g) => {
          const inner = (
            <>
              <span className={styles.rowName}>
                {g.name}
                {g.external && g.live && <span className={styles.ext}> ↗</span>}
              </span>
              <span className={styles.rowBlurb}>{g.blurb}</span>
            </>
          )

          const cls = [styles.row, g.featured ? styles.rowFeatured : "", !g.live ? styles.rowDisabled : ""]
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
        })}
        {filtered.length === 0 && <li className={styles.empty}>Nothing matches “{query}”.</li>}
      </ul>
    </div>
  )
}
