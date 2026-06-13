import { useCallback, useMemo, useState } from "react"
import styles from "./BlackjackPage.module.scss"

/**
 * Blackjack — minimal, typographic, single hand vs the dealer.
 * Dealer stands on all 17s. Blackjack pays 3:2. Chips persist in localStorage.
 */

type Suit = "♠" | "♥" | "♦" | "♣"
type Card = { rank: string; suit: Suit; value: number }
type Phase = "betting" | "player" | "dealer" | "done"

const RANKS: { rank: string; value: number }[] = [
  { rank: "A", value: 11 },
  { rank: "2", value: 2 }, { rank: "3", value: 3 }, { rank: "4", value: 4 },
  { rank: "5", value: 5 }, { rank: "6", value: 6 }, { rank: "7", value: 7 },
  { rank: "8", value: 8 }, { rank: "9", value: 9 }, { rank: "10", value: 10 },
  { rank: "J", value: 10 }, { rank: "Q", value: 10 }, { rank: "K", value: 10 },
]
const SUITS: Suit[] = ["♠", "♥", "♦", "♣"]

function freshDeck(): Card[] {
  const deck: Card[] = []
  for (const s of SUITS) for (const r of RANKS) deck.push({ rank: r.rank, suit: s, value: r.value })
  // Fisher–Yates
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

function handValue(cards: Card[]): number {
  let total = cards.reduce((s, c) => s + c.value, 0)
  let aces = cards.filter((c) => c.rank === "A").length
  while (total > 21 && aces > 0) { total -= 10; aces-- }
  return total
}

const isBlackjack = (cards: Card[]) => cards.length === 2 && handValue(cards) === 21

export function BlackjackPage() {
  const [chips, setChips] = useState(() => {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem("bj-chips") : null
    return v ? parseInt(v, 10) : 100
  })
  const [bet, setBet] = useState(10)
  const [deck, setDeck] = useState<Card[]>([])
  const [player, setPlayer] = useState<Card[]>([])
  const [dealer, setDealer] = useState<Card[]>([])
  const [phase, setPhase] = useState<Phase>("betting")
  const [message, setMessage] = useState("Place your bet.")
  const [holeHidden, setHoleHidden] = useState(true)

  const saveChips = useCallback((n: number) => {
    setChips(n)
    localStorage.setItem("bj-chips", String(n))
  }, [])

  const settle = useCallback((p: Card[], d: Card[], betAmt: number) => {
    const pv = handValue(p)
    const dv = handValue(d)
    const pBJ = isBlackjack(p)
    const dBJ = isBlackjack(d)
    let delta = 0
    let msg = ""
    if (pv > 21) { delta = -betAmt; msg = "Bust. The house takes it." }
    else if (pBJ && !dBJ) { delta = Math.round(betAmt * 1.5); msg = "Blackjack. 3:2." }
    else if (dBJ && !pBJ) { delta = -betAmt; msg = "Dealer blackjack." }
    else if (dv > 21) { delta = betAmt; msg = "Dealer busts. You win." }
    else if (pv > dv) { delta = betAmt; msg = "You win." }
    else if (pv < dv) { delta = -betAmt; msg = "Dealer wins." }
    else { delta = 0; msg = "Push." }
    saveChips(chips + delta)
    setMessage(msg)
    setPhase("done")
  }, [chips, saveChips])

  const deal = useCallback(() => {
    if (bet <= 0 || bet > chips) { setMessage("Adjust your bet."); return }
    const d = freshDeck()
    const p = [d.pop()!, d.pop()!]
    const dl = [d.pop()!, d.pop()!]
    setDeck(d); setPlayer(p); setDealer(dl)
    setHoleHidden(true)

    if (isBlackjack(p) || isBlackjack(dl)) {
      setHoleHidden(false)
      settle(p, dl, bet)
    } else {
      setPhase("player")
      setMessage("Hit or stand.")
    }
  }, [bet, chips, settle])

  const hit = useCallback(() => {
    if (phase !== "player") return
    const d = [...deck]
    const p = [...player, d.pop()!]
    setDeck(d); setPlayer(p)
    if (handValue(p) > 21) {
      setHoleHidden(false)
      settle(p, dealer, bet)
    }
  }, [phase, deck, player, dealer, bet, settle])

  const stand = useCallback(() => {
    if (phase !== "player") return
    setPhase("dealer")
    setHoleHidden(false)
    const d = [...deck]
    const dl = [...dealer]
    while (handValue(dl) < 17) dl.push(d.pop()!)
    setDeck(d); setDealer(dl)
    settle(player, dl, bet)
  }, [phase, deck, dealer, player, bet, settle])

  const newRound = useCallback(() => {
    setPlayer([]); setDealer([]); setPhase("betting"); setHoleHidden(true)
    setMessage(chips <= 0 ? "Out of chips — have 100 on the house." : "Place your bet.")
    if (chips <= 0) saveChips(100)
  }, [chips, saveChips])

  const pv = handValue(player)
  const dealerShown = useMemo(
    () => (holeHidden ? dealer.slice(0, 1) : dealer),
    [dealer, holeHidden],
  )
  const dv = handValue(dealerShown)

  const renderCard = (c: Card, i: number, hidden = false) => (
    <div
      key={i}
      className={`${styles.card} ${c.suit === "♥" || c.suit === "♦" ? styles.red : ""} ${hidden ? styles.faceDown : ""}`}
    >
      {hidden ? (
        <span className={styles.cardBack}>◈</span>
      ) : (
        <>
          <span className={styles.rank}>{c.rank}</span>
          <span className={styles.suit}>{c.suit}</span>
        </>
      )}
    </div>
  )

  return (
    <div className={styles.bjContainer}>
      <header className={styles.header}>
        <h1>Blackjack</h1>
        <p>Dealer stands on 17. Blackjack pays 3:2.</p>
      </header>

      <div className={styles.table}>
        <div className={styles.seat}>
          <div className={styles.seatLabel}>
            Dealer{phase !== "betting" && !holeHidden && <span className={styles.total}>{dv}</span>}
          </div>
          <div className={styles.cards}>
            {dealer.length === 0
              ? <div className={styles.cardPlaceholder} />
              : dealer.map((c, i) => renderCard(c, i, holeHidden && i === 1))}
          </div>
        </div>

        <div className={styles.message}>{message}</div>

        <div className={styles.seat}>
          <div className={styles.seatLabel}>
            You{player.length > 0 && <span className={styles.total}>{pv}</span>}
          </div>
          <div className={styles.cards}>
            {player.length === 0
              ? <div className={styles.cardPlaceholder} />
              : player.map((c, i) => renderCard(c, i))}
          </div>
        </div>
      </div>

      <div className={styles.controls}>
        {phase === "betting" && (
          <div className={styles.betRow}>
            <div className={styles.betStepper}>
              <button onClick={() => setBet((b) => Math.max(5, b - 5))} aria-label="Lower bet">−</button>
              <span className={styles.betAmt}>{bet}</span>
              <button onClick={() => setBet((b) => Math.min(chips, b + 5))} aria-label="Raise bet">+</button>
            </div>
            <button className={styles.primary} onClick={deal} disabled={bet > chips || bet <= 0}>Deal</button>
          </div>
        )}
        {phase === "player" && (
          <div className={styles.actionRow}>
            <button className={styles.primary} onClick={hit}>Hit</button>
            <button className={styles.secondary} onClick={stand}>Stand</button>
          </div>
        )}
        {(phase === "done") && (
          <button className={styles.primary} onClick={newRound}>Next Hand</button>
        )}
      </div>

      <div className={styles.chipBar}>
        <span>chips <strong>{chips}</strong></span>
      </div>
    </div>
  )
}
