import { useCallback, useEffect, useMemo, useState } from "react"
import {
  FRONTS, REINFORCE, ROUNDS, newFronts, planFronts, resolve, sum, winner,
  type FrontsLevel, type FrontsState, type RoundLog,
} from "@/lib/fronts"
import { GameCabinet } from "./GameCabinet"
import { ignoreGameKey, writeStored } from "./gameUtils"
import styles from "./FrontsPage.module.scss"

const LEVELS: { key: FrontsLevel; label: string; title: string }[] = [
  { key: "recruit", label: "Recruit", title: "Plays a plausible split, a little too evenly" },
  { key: "marshal", label: "Marshal", title: "Learns your habits and answers them" },
]
const NAME: Record<FrontsLevel, string> = { recruit: "Recruit", marshal: "Marshal" }
const seed = () => (Math.random() * 0x7fffffff) >>> 0

type Rec = [number, number, number]
const recKey = (l: FrontsLevel) => `fronts:record:${l}`
function readRec(l: FrontsLevel): Rec {
  try {
    const v = (localStorage.getItem(recKey(l)) ?? "").split("-").map(Number)
    return v.length === 3 && v.every(Number.isFinite) ? (v as Rec) : [0, 0, 0]
  } catch { return [0, 0, 0] }
}

export function FrontsPage() {
  const [level, setLevel] = useState<FrontsLevel>("marshal")
  const [game, setGame] = useState<FrontsState>(() => newFronts(seed()))
  const [alloc, setAlloc] = useState<number[]>(() => new Array(FRONTS).fill(0))
  const [focus, setFocus] = useState(0)
  /** The round just fought, shown until "next". */
  const [shown, setShown] = useState<{ log: RoundLog; read: string } | null>(null)
  const [record, setRecord] = useState<Rec>(() => readRec("marshal"))

  const army = game.armies[0]
  const left = army - sum(alloc)
  const opp = NAME[level]

  const restart = useCallback((l: FrontsLevel = level) => {
    setGame(newFronts(seed()))
    setAlloc(new Array(FRONTS).fill(0))
    setShown(null)
    setFocus(0)
    setRecord(readRec(l))
  }, [level])

  const add = useCallback((i: number, d: number) => {
    if (shown || game.done) return
    setAlloc((a) => {
      const n = [...a]
      const nx = n[i] + d
      if (nx < 0 || sum(n) + d > army) return a
      n[i] = nx
      return n
    })
  }, [shown, game.done, army])

  const commit = useCallback(() => {
    if (shown || game.done) return
    const plan = planFronts(game, 1, level)
    const next = resolve(game, alloc, plan.alloc)
    setShown({ log: next.log[next.log.length - 1], read: plan.read })
    setGame(next)
    if (next.done) {
      const w = winner(next)
      const r = readRec(level)
      r[w === null ? 2 : w === 0 ? 0 : 1]++
      writeStored(recKey(level), r.join("-"))
      setRecord(r)
    }
  }, [shown, game, alloc, level])

  const nextRound = useCallback(() => {
    if (!shown || game.done) return
    setShown(null)
    setAlloc(new Array(FRONTS).fill(0))
  }, [shown, game.done])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ignoreGameKey(e)) return
      const n = Number(e.key)
      if (n >= 1 && n <= FRONTS) { setFocus(n - 1); return }
      if (e.key === "ArrowLeft") { e.preventDefault(); setFocus((f) => (f + FRONTS - 1) % FRONTS) }
      else if (e.key === "ArrowRight") { e.preventDefault(); setFocus((f) => (f + 1) % FRONTS) }
      else if (e.key === "ArrowUp" || e.key === "+" || e.key === "=") { e.preventDefault(); add(focus, 1) }
      else if (e.key === "ArrowDown" || e.key === "-") { e.preventDefault(); add(focus, -1) }
      else if (e.key === "Enter") { e.preventDefault(); if (shown) nextRound(); else commit() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [add, focus, shown, commit, nextRound])

  const values = shown ? shown.log.values : game.values
  const w = winner(game)
  const status = game.done ? (w === 0 ? "won" : "lost") : "playing"
  const endLine = !game.done ? "" : w === null ? `Level, ${game.scores[0]} all` : w === 0 ? `You win, ${game.scores[0]} to ${game.scores[1]}` : `${opp} wins, ${game.scores[1]} to ${game.scores[0]}`
  const maxPips = useMemo(() => Math.max(8, army, ...(shown ? shown.log.alloc.flat() : [])), [army, shown])

  return (
    <GameCabinet
      title="Fronts"
      blurb="Split your army across five fronts. The bigger force takes the front but keeps only its margin; a tie wipes out both."
      status={status}
      veil={false}
      controls={
        <>
          <div className={styles.seg} role="group" aria-label="Opponent">
            {LEVELS.map((l) => (
              <button key={l.key} title={l.title} data-active={level === l.key || undefined} onClick={() => { setLevel(l.key); restart(l.key) }}>{l.label}</button>
            ))}
          </div>
          <div className={styles.seg}><button onClick={() => restart()}>new war</button></div>
        </>
      }
    >
      <div className={styles.wrap}>
        <div className={styles.top}>
          <span className={styles.side} data-who="you">You <strong>{game.scores[0]}</strong></span>
          <span className={styles.round}>{game.done ? "the war is over" : `round ${game.round + 1} of ${ROUNDS}`}</span>
          <span className={styles.side} data-who="them"><strong>{game.scores[1]}</strong> {opp}</span>
        </div>

        <div className={styles.fronts}>
          {values.map((v, i) => {
            const mine = shown ? shown.log.alloc[0][i] : alloc[i]
            const theirs = shown ? shown.log.alloc[1][i] : null
            const won = shown ? shown.log.won[i] : undefined
            return (
              <div
                key={i}
                className={styles.front}
                data-focus={!shown && !game.done && focus === i || undefined}
                data-won={won === 0 ? "you" : won === 1 ? "them" : won === null && shown ? "none" : undefined}
                onClick={() => setFocus(i)}
              >
                <div className={styles.value} title={`worth ${v} this round`}>
                  {Array.from({ length: v }, (_, k) => <i key={k} />)}
                  <span>{v}</span>
                </div>
                <div className={styles.field}>
                  <div className={styles.stack} data-who="you" aria-label={`your troops: ${mine}`}>
                    {Array.from({ length: mine }, (_, k) => <i key={k} style={{ height: `${100 / maxPips}%` }} data-fallen={shown && (won !== 0 || k >= mine - (theirs ?? 0)) || undefined} />)}
                  </div>
                  {theirs !== null && (
                    <div className={styles.stack} data-who="them" aria-label={`their troops: ${theirs}`}>
                      {Array.from({ length: theirs }, (_, k) => <i key={k} style={{ height: `${100 / maxPips}%` }} data-fallen={won !== 1 || k >= theirs - mine || undefined} />)}
                    </div>
                  )}
                </div>
                <div className={styles.count}>
                  {shown ? <span>{mine} <em>v</em> {theirs}</span> : <span>{mine}</span>}
                </div>
                {!shown && !game.done && (
                  <div className={styles.steppers}>
                    <button onClick={(e) => { e.stopPropagation(); add(i, -1) }} disabled={!alloc[i]} aria-label={`one fewer on front ${i + 1}`}>−</button>
                    <button onClick={(e) => { e.stopPropagation(); add(i, 1) }} disabled={left <= 0} aria-label={`one more on front ${i + 1}`}>+</button>
                  </div>
                )}
                {shown && <div className={styles.verdict}>{won === 0 ? "taken" : won === 1 ? "lost" : mine + (theirs ?? 0) ? "both broken" : "empty"}</div>}
              </div>
            )
          })}
        </div>

        <div className={styles.bar}>
          {shown ? (
            <>
              <span>
                You took {shown.log.gained[0]}, lost {shown.log.lost[0]} troops · {opp} took {shown.log.gained[1]}, lost {shown.log.lost[1]}
                {level === "marshal" && <em> · {opp} read: {shown.read}</em>}
              </span>
              {game.done ? <strong className={styles.end}>{endLine}</strong> : <button className={styles.go} onClick={nextRound}>next round ↵</button>}
            </>
          ) : (
            <>
              <span>
                army <strong>{army}</strong> · held back <strong>{left}</strong> (safe) · {opp} has <strong>{game.armies[1]}</strong>
                <em> · +{REINFORCE} each between rounds</em>
              </span>
              <button className={styles.go} onClick={commit} disabled={game.done}>march ↵</button>
            </>
          )}
        </div>

        <div className={styles.history} aria-label="rounds so far">
          {Array.from({ length: ROUNDS }, (_, r) => {
            const l = game.log[r]
            return (
              <div key={r} className={styles.hround} data-now={!game.done && r === game.round || undefined}>
                {Array.from({ length: FRONTS }, (_, i) => (
                  <i key={i} data-won={l ? (l.won[i] === 0 ? "you" : l.won[i] === 1 ? "them" : "none") : undefined} title={l ? `round ${r + 1}, front ${i + 1}: worth ${l.values[i]}, ${l.alloc[0][i]} v ${l.alloc[1][i]}` : undefined} />
                ))}
              </div>
            )
          })}
        </div>

        <div className={styles.meta}>
          <span>1–5 or ←→ pick a front · ↑↓ move troops · Enter marches</span>
          <span title="wins – losses – draws">record vs {opp} {record.join(" – ")}</span>
        </div>
      </div>
    </GameCabinet>
  )
}
