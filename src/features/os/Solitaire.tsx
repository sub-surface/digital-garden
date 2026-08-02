import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import {
  SUITS,
  canFound,
  canStack,
  deal,
  isRed,
  removeSelection,
  selectedCards,
  type Card,
  type Selection,
  type Suit,
} from "./solitaireLogic"
import styles from "./Solitaire.module.scss"

interface SolitaireStats {
  games: number
  wins: number
  recordGame: () => void
  recordWin: () => void
}

const useSolitaireStats = create<SolitaireStats>()(
  persist(
    (set) => ({
      games: 0,
      wins: 0,
      recordGame: () => set((state) => ({ games: state.games + 1 })),
      recordWin: () => set((state) => ({ wins: state.wins + 1 })),
    }),
    {
      name: "subsurfaces95-solitaire",
      version: 1,
      migrate: (persisted) => persisted as SolitaireStats,
    },
  ),
)

const SUIT_GLYPH: Record<Suit, string> = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" }
const RANK_LABEL = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]

function CardFace({ card, selected, onClick, onDoubleClick, className, style }: {
  card: Card
  selected?: boolean
  onClick?: () => void
  onDoubleClick?: () => void
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <button
      type="button"
      className={`${styles.card} ${!card.faceUp ? styles.back : ""} ${className ?? ""}`}
      style={style}
      data-red={card.faceUp && isRed(card) || undefined}
      data-selected={selected || undefined}
      aria-label={card.faceUp ? `${RANK_LABEL[card.rank]} of ${card.suit}` : "Face-down card"}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {card.faceUp && (
        <>
          <span className={styles.corner}>{RANK_LABEL[card.rank]}<span>{SUIT_GLYPH[card.suit]}</span></span>
          <span className={styles.pip}>{SUIT_GLYPH[card.suit]}</span>
        </>
      )}
    </button>
  )
}

export function SolitaireApp() {
  const recordGame = useSolitaireStats((state) => state.recordGame)
  const recordWin = useSolitaireStats((state) => state.recordWin)
  const games = useSolitaireStats((state) => state.games)
  const wins = useSolitaireStats((state) => state.wins)
  const [game, setGame] = useState(() => deal(Date.now() >>> 0))
  const [selection, setSelection] = useState<Selection | null>(null)
  const [won, setWon] = useState(false)
  const countedInitialRef = useRef(false)
  const recordedWinRef = useRef(false)

  const start = useCallback((seed = Date.now() >>> 0) => {
    setGame(deal(seed))
    setSelection(null)
    setWon(false)
    recordedWinRef.current = false
    recordGame()
  }, [recordGame])

  useEffect(() => {
    if (countedInitialRef.current) return
    countedInitialRef.current = true
    recordGame()
  }, [recordGame])

  useEffect(() => {
    if (won || recordedWinRef.current || game.foundations.reduce((total, pile) => total + pile.length, 0) !== 52) return
    recordedWinRef.current = true
    setWon(true)
    recordWin()
  }, [game.foundations, recordWin, won])

  const draw = useCallback(() => {
    setSelection(null)
    setGame((current) => {
      if (!current.stock.length) {
        return {
          ...current,
          stock: [...current.waste].reverse().map((card) => ({ ...card, faceUp: false })),
          waste: [],
        }
      }
      const card = current.stock[current.stock.length - 1]
      return {
        ...current,
        stock: current.stock.slice(0, -1),
        waste: [...current.waste, { ...card, faceUp: true }],
      }
    })
  }, [])

  const moveToTableau = (targetPile: number) => {
    if (!selection) return
    const cards = selectedCards(game, selection)
    if (!cards.length || !canStack(cards[0], game.tableau[targetPile].at(-1))) return
    const stripped = removeSelection(game, selection)
    setGame({
      ...stripped,
      tableau: stripped.tableau.map((pile, index) => index === targetPile ? [...pile, ...cards] : pile),
    })
    setSelection(null)
  }

  const moveToFoundation = (foundation: number, chosen = selection) => {
    if (!chosen) return
    const cards = selectedCards(game, chosen)
    if (cards.length !== 1 || !canFound(cards[0], game.foundations[foundation].at(-1), SUITS[foundation])) return
    const stripped = removeSelection(game, chosen)
    setGame({
      ...stripped,
      foundations: stripped.foundations.map((pile, index) => index === foundation ? [...pile, cards[0]] : pile),
    })
    setSelection(null)
  }

  const autoFoundation = (chosen: Selection) => {
    const card = selectedCards(game, chosen)[0]
    if (!card) return
    const target = SUITS.indexOf(card.suit)
    moveToFoundation(target, chosen)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return
      if (event.key.toLowerCase() === "n") start()
      if (event.key.toLowerCase() === "d") draw()
      if (event.key === "Escape") setSelection(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [draw, start])

  const cascade = useMemo(() => Array.from({ length: 36 }, (_, index) => ({
    id: index,
    x: (index * 37) % 94,
    drift: `${((index * 53) % 180) - 90}px`,
    delay: `${(index % 12) * 70}ms`,
    duration: `${1300 + (index % 7) * 90}ms`,
  })), [])

  return (
    <div className={styles.root} aria-label="Klondike solitaire">
      <div className={styles.toolbar}>
        <button type="button" onClick={() => start()}>New deal</button>
        <button type="button" onClick={draw}>Draw</button>
        <span>Deal {game.seed.toString(16).toUpperCase().padStart(8, "0")}</span>
        <span className={styles.status}>{wins} win{wins === 1 ? "" : "s"} / {games} game{games === 1 ? "" : "s"}</span>
      </div>

      <div className={styles.top}>
        <button type="button" className={`${styles.slot} ${game.stock.length ? styles.back : ""}`} onClick={draw} aria-label={game.stock.length ? `Draw from ${game.stock.length} cards` : "Recycle waste"}>
          {!game.stock.length && "↻"}
        </button>
        <div className={styles.slot}>
          {game.waste.at(-1) && (
            <CardFace
              card={game.waste.at(-1)!}
              selected={selection?.source === "waste"}
              onClick={() => setSelection({ source: "waste", pile: 0, index: game.waste.length - 1 })}
              onDoubleClick={() => autoFoundation({ source: "waste", pile: 0, index: game.waste.length - 1 })}
            />
          )}
        </div>
        {game.foundations.map((pile, index) => {
          const top = pile.at(-1)
          const activate = () => selection
            ? moveToFoundation(index)
            : top && setSelection({ source: "foundation", pile: index, index: pile.length - 1 })
          return top ? (
            <CardFace
              key={SUITS[index]}
              card={top}
              selected={selection?.source === "foundation" && selection.pile === index}
              className={index === 0 ? styles.foundationStart : undefined}
              onClick={activate}
            />
          ) : (
            <button
              type="button"
              key={SUITS[index]}
              className={`${styles.slot} ${index === 0 ? styles.foundationStart : ""}`}
              onClick={activate}
              aria-label={`${SUITS[index]} foundation`}
            >
              {SUIT_GLYPH[SUITS[index]]}
            </button>
          )
        })}
      </div>

      <div className={styles.tableau}>
        {game.tableau.map((pile, pileIndex) => (
          <div
            key={pileIndex}
            className={`${styles.slot} ${styles.pile}`}
            onClick={(event) => { if (event.target === event.currentTarget) moveToTableau(pileIndex) }}
          >
            {!pile.length && <span className={styles.emptyHint}>K</span>}
            {pile.map((card, cardIndex) => {
              const offset = pile.slice(0, cardIndex).reduce((total, prior) => total + (prior.faceUp ? 27 : 14), 0)
              const selected = selection?.source === "tableau" && selection.pile === pileIndex && cardIndex >= selection.index
              return (
                <CardFace
                  key={card.id}
                  card={card}
                  selected={selected}
                  className={styles.tableauCard}
                  style={{ top: offset }}
                  onClick={() => {
                    if (!card.faceUp) return
                    if (selection && !(selection.source === "tableau" && selection.pile === pileIndex && selection.index === cardIndex)) moveToTableau(pileIndex)
                    else setSelection({ source: "tableau", pile: pileIndex, index: cardIndex })
                  }}
                  onDoubleClick={() => cardIndex === pile.length - 1 && autoFoundation({ source: "tableau", pile: pileIndex, index: cardIndex })}
                />
              )
            })}
          </div>
        ))}
      </div>

      <div className={styles.help}>Click a run, then its destination · double-click top cards to send home · N new · D draw</div>
      {won && (
        <div className={styles.win} aria-live="polite">
          <span>You won.</span>
          {cascade.map((card) => (
            <span
              key={card.id}
              className={styles.cascadeCard}
              style={{
                "--x": card.x,
                "--drift": card.drift,
                "--delay": card.delay,
                "--duration": card.duration,
              } as React.CSSProperties}
            >
              {card.id % 2 ? "♥" : "♠"}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
