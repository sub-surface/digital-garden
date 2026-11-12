import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { sfx } from "@/lib/sfx"
import { ignoreGameKey, readStoredInt, writeStored } from "./gameUtils"
import styles from "./BlackjackPage.module.scss"

/**
 * Blackjack — minimal, typographic, single hand vs the dealer.
 * Dealer stands on all 17s. Blackjack pays 3:2. Double down on the first two
 * cards. Chips (and the most you've ever held) persist in localStorage.
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
  const [chips, setChips] = useState(() => readStoredInt("bj-chips", 100))
  const [bet, setBet] = useState(10)
  const [deck, setDeck] = useState<Card[]>([])
  const [player, setPlayer] = useState<Card[]>([])
  const [dealer, setDealer] = useState<Card[]>([])
  const [phase, setPhase] = useState<Phase>("betting")
  const [message, setMessage] = useState("Place your bet.")
  const [holeHidden, setHoleHidden] = useState(true)
  /** The bet riding on this hand (twice `bet` after a double). */
  const [stake, setStake] = useState(0)
  const [peak, setPeak] = useState(() => readStoredInt("bj-peak", 100))

  // pending timeouts so we can cancel the dealer's dramatic play-out on unmount
  const timers = useRef<number[]>([])
  const after = (ms: number, fn: () => void) => {
    const id = window.setTimeout(fn, ms)
    timers.current.push(id)
  }
  useEffect(() => () => { timers.current.forEach(clearTimeout) }, [])

  const saveChips = useCallback((n: number) => {
    setChips(n)
    writeStored("bj-chips", n)
    setPeak((p) => { if (n > p) { writeStored("bj-peak", n); return n } return p })
  }, [])

  const settle = useCallback((p: Card[], d: Card[], betAmt: number) => {
    const pv = handValue(p)
    const dv = handValue(d)
    const pBJ = isBlackjack(p)
    const dBJ = isBlackjack(d)
    let delta = 0
    let msg = ""
    let sound: Parameters<typeof sfx.play>[0] = "win"
    if (pv > 21) { delta = -betAmt; msg = "Bust. The house takes it."; sound = "lose" }
    else if (pBJ && !dBJ) { delta = Math.round(betAmt * 1.5); msg = "Blackjack. 3:2."; sound = "blackjack" }
    else if (dBJ && !pBJ) { delta = -betAmt; msg = "Dealer blackjack."; sound = "lose" }
    else if (dv > 21) { delta = betAmt; msg = "Dealer busts. You win."; sound = "win" }
    else if (pv > dv) { delta = betAmt; msg = "You win."; sound = "win" }
    else if (pv < dv) { delta = -betAmt; msg = "Dealer wins."; sound = "lose" }
    else { delta = 0; msg = "Push."; sound = "push" }
    saveChips(chips + delta)
    setMessage(msg)
    setPhase("done")
    sfx.play(sound)
  }, [chips, saveChips])

  const deal = useCallback(() => {
    if (bet <= 0 || bet > chips) { setMessage("Adjust your bet."); return }
    const d = freshDeck()
    const p = [d.pop()!, d.pop()!]
    const dl = [d.pop()!, d.pop()!]
    setDeck(d); setPlayer(p); setDealer(dl)
    setStake(bet)
    setHoleHidden(true)
    sfx.play("deal")

    if (isBlackjack(p) || isBlackjack(dl)) {
      after(450, () => { setHoleHidden(false); sfx.play("flip") })
      after(900, () => settle(p, dl, bet))
      setPhase("dealer")
      setMessage("...")
    } else {
      setPhase("player")
      setMessage("Hit or stand.")
    }
  }, [bet, chips, settle])

  /** Dealer's dramatic turn: flip the hole card, then draw one card at a time. */
  const dealerPlays = useCallback((player: Card[], deck: Card[], bet: number) => {
    setPhase("dealer")
    setMessage("Dealer plays...")

    // reveal the hole card first
    after(450, () => { setHoleHidden(false); sfx.play("flip") })

    // pre-compute the dealer's final hand, then reveal each draw on a timer
    const d = [...deck]
    const draws: Card[] = []
    const working = [...dealer]
    while (handValue(working) < 17) {
      const c = d.pop()!
      working.push(c)
      draws.push(c)
    }

    let t = 950
    const STEP = 650
    draws.forEach((c) => {
      after(t, () => {
        setDealer((cur) => [...cur, c])
        sfx.play("deal")
      })
      t += STEP
    })
    after(t + 200, () => { setDeck(d); settle(player, working, bet) })
  }, [dealer, settle])

  /** After a card lands on the player's hand: bust settles, 21 stands for you. */
  const afterDraw = useCallback((p: Card[], d: Card[], betAmt: number, forced: boolean) => {
    if (handValue(p) > 21) {
      setPhase("dealer")
      after(500, () => { setHoleHidden(false); sfx.play("flip") })
      after(950, () => settle(p, dealer, betAmt))
    } else if (forced || handValue(p) === 21) {
      dealerPlays(p, d, betAmt)
    }
  }, [dealer, settle, dealerPlays])

  const hit = useCallback(() => {
    if (phase !== "player") return
    const d = [...deck]
    const p = [...player, d.pop()!]
    setDeck(d); setPlayer(p)
    sfx.play("deal")
    afterDraw(p, d, stake, false)
  }, [phase, deck, player, stake, afterDraw])

  const stand = useCallback(() => {
    if (phase !== "player") return
    dealerPlays(player, deck, stake)
  }, [phase, player, deck, stake, dealerPlays])

  /** Double the stake, take exactly one more card, then stand. */
  const canDouble = phase === "player" && player.length === 2 && chips >= stake * 2
  const double = useCallback(() => {
    if (!canDouble) return
    const d = [...deck]
    const p = [...player, d.pop()!]
    const s2 = stake * 2
    setDeck(d); setPlayer(p); setStake(s2)
    sfx.play("deal")
    afterDraw(p, d, s2, true)
  }, [canDouble, deck, player, stake, afterDraw])

  const newRound = useCallback(() => {
    setPlayer([]); setDealer([]); setPhase("betting"); setHoleHidden(true)
    setMessage(chips <= 0 ? "Out of chips — have 100 on the house." : "Place your bet.")
    if (chips <= 0) saveChips(100)
    // A bet bigger than what's left would leave Deal disabled with no reason given.
    const left = chips <= 0 ? 100 : chips
    setBet((b) => Math.min(Math.max(5, b), left))
    setStake(0)
  }, [chips, saveChips])

  // D/Space deal · H hit · S stand · 2 double · ←/→ bet · Enter next hand.
  const keys = useRef({ deal, hit, stand, double, newRound, phase, chips })
  keys.current = { deal, hit, stand, double, newRound, phase, chips }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ignoreGameKey(e)) return
      const k = keys.current
      const key = e.key.toLowerCase()
      if (k.phase === "betting") {
        if (key === "d" || key === " " || key === "enter") { e.preventDefault(); k.deal() }
        else if (key === "arrowleft" || key === "-") setBet((b) => Math.max(5, b - 5))
        else if (key === "arrowright" || key === "+" || key === "=") setBet((b) => Math.min(k.chips, b + 5))
      } else if (k.phase === "player") {
        if (key === "h") k.hit()
        else if (key === "s") k.stand()
        else if (key === "2") k.double()
      } else if (k.phase === "done" && (key === "enter" || key === " " || key === "n")) {
        e.preventDefault(); k.newRound()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

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
            {player.length === 2 && <button className={styles.secondary} onClick={double} disabled={!canDouble} title={canDouble ? "double the bet, one card, then stand" : "not enough chips to double"}>Double</button>}
          </div>
        )}
        {(phase === "done") && (
          <button className={styles.primary} onClick={newRound}>Next Hand</button>
        )}
      </div>

      <div className={styles.chipBar}>
        <span>chips <strong>{chips}</strong></span>
        {stake > 0 && phase !== "betting" && <span>on the table <strong>{stake}</strong></span>}
        <span title="the most you have ever held">high water {peak}</span>
      </div>
      <div className={styles.keyHint}>
        <span className="on-desktop">D deal · H hit · S stand · 2 double · ←→ bet · Enter next hand</span>
      </div>
    </div>
  )
}
