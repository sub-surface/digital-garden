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
  { href: "hexo", name: "heXO", blurb: "Connect six on an endless hex field, against a handmade opponent.", live: true, featured: true },
  { href: "chess", name: "Chess", blurb: "A small handmade machine to play against.", live: true },
  { href: "snake", name: "Snake", blurb: "Walls wrap; the rare bloom bends time.", live: true },
  { href: "blackjack", name: "Blackjack", blurb: "Dealer stands on 17. Blackjack pays 3:2.", live: true },
  { href: null, name: "Ant Farm", blurb: "A simulator, not a game — watch a colony forage, dig, and drift. Coming soon.", live: false },
]

export function ArcadePage() {
  return (
    <div className={styles.arcadeContainer}>
      <header className={styles.header}>
        <h1>Arcade</h1>
        <p>A cabinet of handmade games, toys, and small worlds.</p>
      </header>
      <div className={styles.grid}>
        {GAMES.map((g) => {
          const cls = [
            styles.card,
            g.featured ? styles.cardFeatured : "",
            !g.live ? styles.cardDisabled : "",
          ].filter(Boolean).join(" ")

          const inner = (
            <>
              <span className={styles.cardName}>
                {g.name}
                {g.external && g.live && <span className={styles.ext}> ↗</span>}
              </span>
              <span className={styles.cardBlurb}>{g.blurb}</span>
            </>
          )

          if (!g.live || !g.href) {
            return <div key={g.name} className={cls}>{inner}</div>
          }
          if (g.external) {
            return (
              <a
                key={g.name}
                href={g.href}
                className={cls}
                target="_blank"
                rel="noreferrer"
                data-panel-ignore
              >
                {inner}
              </a>
            )
          }
          return (
            <a key={g.name} href={`/${g.href}`} className={`internal-link ${cls}`}>
              {inner}
            </a>
          )
        })}
      </div>
    </div>
  )
}
