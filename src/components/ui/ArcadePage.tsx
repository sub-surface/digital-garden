import styles from "./ArcadePage.module.scss"

interface GameCard {
  slug: string | null
  name: string
  blurb: string
  live: boolean
}

const GAMES: GameCard[] = [
  { slug: "chess", name: "Chess", blurb: "Play a small handmade machine.", live: true },
  { slug: "hexo", name: "heXO", blurb: "Connect six on endless hexes.", live: true },
  { slug: null, name: "Snake", blurb: "Coming soon.", live: false },
  { slug: null, name: "Blackjack", blurb: "Coming soon.", live: false },
]

export function ArcadePage() {
  return (
    <div className={styles.arcadeContainer}>
      <header className={styles.header}>
        <h1>Arcade</h1>
        <p>A small cabinet of simple games.</p>
      </header>
      <div className={styles.grid}>
        {GAMES.map((g) =>
          g.live && g.slug ? (
            <a key={g.name} href={`/${g.slug}`} className={`internal-link ${styles.card}`}>
              <span className={styles.cardName}>{g.name}</span>
              <span className={styles.cardBlurb}>{g.blurb}</span>
            </a>
          ) : (
            <div key={g.name} className={`${styles.card} ${styles.cardDisabled}`}>
              <span className={styles.cardName}>{g.name}</span>
              <span className={styles.cardBlurb}>{g.blurb}</span>
            </div>
          ),
        )}
      </div>
    </div>
  )
}
