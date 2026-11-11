import { useCallback, useMemo, useState } from "react"
import {
  CAPACITY, FENCE_COST, FENCED_MAX, MAX_GRAZE, PERSONAS, SEASONS, SUSTAINABLE, decide, newCommons, regrowth, season, welfare,
  type CommonsState, type Persona,
} from "@/lib/commons"
import { GameCabinet } from "./GameCabinet"
import styles from "./CommonsPage.module.scss"

type Temperament = Exclude<Persona, "you">
const TEMPERAMENTS = Object.keys(PERSONAS) as Temperament[]
const PLACES = ["up the hill", "by the river"]
const TUFTS = 140

function pickNeighbours(): [Temperament, Temperament] {
  const a = TEMPERAMENTS[Math.floor(Math.random() * TEMPERAMENTS.length)]
  const b = TEMPERAMENTS[Math.floor(Math.random() * TEMPERAMENTS.length)]
  return [a, b]
}

/** Fixed scatter for the meadow's tufts and the sheep's spots. */
function scatter(n: number, seed: number) {
  let x = seed
  const r = () => ((x = (x * 16807) % 2147483647) / 2147483647)
  return Array.from({ length: n }, () => ({ x: 20 + r() * 560, y: 30 + r() * 170, k: r() }))
}

export function CommonsPage() {
  const [game, setGame] = useState<CommonsState>(() => newCommons(pickNeighbours()))
  const [graze, setGraze] = useState(3)
  const [fence, setFence] = useState<number | null>(null)
  const [reveal, setReveal] = useState(false)

  const tufts = useMemo(() => scatter(TUFTS, 9001).sort((a, b) => a.k - b.k), [])
  const spots = useMemo(() => scatter(MAX_GRAZE * 3, 77), [])
  const shownTufts = Math.round((game.grass / CAPACITY) * TUFTS)
  const last = game.log[game.log.length - 1]
  const cap = game.caps[0]
  const g = Math.min(graze, cap)

  const restart = useCallback(() => {
    setGame(newCommons(pickNeighbours()))
    setGraze(3)
    setFence(null)
  }, [])

  const send = useCallback(() => {
    if (game.done) return
    const choices = [{ graze: g, fence }, decide(game, 1), decide(game, 2)]
    setGame(season(game, choices))
    setFence(null)
  }, [game, g, fence])

  const label = (i: number) => (i === 0 ? "You" : reveal || game.done ? PERSONAS[game.herders[i].persona as Temperament].name : `The herder ${PLACES[i - 1]}`)
  const fair = regrowth(Math.max(game.grass, 20)) / 3
  const bareAt = game.log.findIndex((l) => l.grassAfter < 2)
  const w = welfare(game)
  const totals = game.herders.map((h) => h.total)
  const best = Math.max(...totals)
  const youWon = game.done && totals[0] === best
  const meadow = game.grass > 55 ? "thick" : game.grass > 30 ? "thinning" : game.grass > 8 ? "sparse" : "bare"

  return (
    <GameCabinet
      title="Commons"
      blurb="Three herders, one meadow. Graze what you like; the grass regrows only from what's left."
      status={game.done ? (youWon ? "won" : "lost") : "playing"}
      veil={false}
      controls={
        <>
          <div className={styles.seg}>
            <button data-active={reveal || undefined} onClick={() => setReveal((r) => !r)} title="Show your neighbours' temperaments now, not at the end">
              {reveal ? "temperaments shown" : "temperaments hidden"}
            </button>
          </div>
          <div className={styles.seg}><button onClick={restart}>new valley</button></div>
        </>
      }
    >
      <div className={styles.wrap}>
        <svg className={styles.meadow} viewBox="0 0 600 230" role="img" aria-label={`The meadow is ${meadow}: ${game.grass.toFixed(0)} of ${CAPACITY}.`}>
          <rect x={0} y={0} width={600} height={230} className={styles.soil} />
          {tufts.slice(0, shownTufts).map((t, i) => (
            <path key={i} d={`M${t.x},${t.y} q-3,-9 -5,-11 M${t.x},${t.y} q0,-10 1,-13 M${t.x},${t.y} q3,-8 6,-10`} className={styles.tuft} style={{ opacity: 0.45 + t.k * 0.55 }} />
          ))}
          {last && last.choices.flatMap((c, h) => Array.from({ length: c.graze }, (_, k) => {
            const p = spots[h * MAX_GRAZE + k]
            const ate = last.eaten[h] / Math.max(1, c.graze)
            return (
              <g key={`${h}-${k}-${game.season}`} transform={`translate(${p.x},${p.y})`} data-h={h}><g className={styles.sheep} style={{ animationDelay: `${(k + h) * 40}ms` }}>
                <ellipse rx={9 * (0.75 + ate * 0.25)} ry={6 * (0.75 + ate * 0.25)} className={styles.wool} />
                <circle cx={8} cy={-3} r={3} className={styles.face} />
                <rect x={-6} y={4} width={2} height={4} className={styles.face} />
                <rect x={4} y={4} width={2} height={4} className={styles.face} />
                <circle cx={-1} cy={-5.5} r={1.6} className={styles.collar} />
              </g></g>
            )
          }))}
          <text x={590} y={222} textAnchor="end" className={styles.caption}>{game.done ? "the last season" : `season ${game.season + 1} of ${SEASONS}`} · the meadow is {meadow}</text>
        </svg>

        <div className={styles.gauge} title="grass now; the mark is half full, where it regrows fastest">
          <span style={{ width: `${(game.grass / CAPACITY) * 100}%` }} />
          <i style={{ left: "50%" }} />
        </div>

        <div className={styles.herders}>
          {game.herders.map((h, i) => (
            <div key={i} className={styles.herder} data-h={i}>
              <span className={styles.name}>{label(i)}</span>
              <span className={styles.total}>{h.total.toFixed(1)}</span>
              <span className={styles.lastGraze}>
                {last ? `${last.choices[i].graze} out, ate ${last.eaten[i].toFixed(1)}` : " "}
                {last && last.choices[i].fence !== null && <em> · fenced {last.choices[i].fence === 0 ? "you" : label(last.choices[i].fence!).toLowerCase()}</em>}
              </span>
              {game.caps[i] < MAX_GRAZE && <span className={styles.fenced}>fenced out: at most {game.caps[i]} this season</span>}
              {(reveal || game.done) && i > 0 && <span className={styles.about}>{PERSONAS[h.persona as Temperament].about}</span>}
            </div>
          ))}
        </div>

        {!game.done ? (
          <div className={styles.choose}>
            <div className={styles.flock} role="group" aria-label="Sheep to graze">
              <span>graze</span>
              {Array.from({ length: MAX_GRAZE + 1 }, (_, n) => (
                <button key={n} data-active={g === n || undefined} disabled={n > cap} onClick={() => setGraze(n)}>{n}</button>
              ))}
              <em>a fair share of what regrows is about {fair.toFixed(1)}</em>
            </div>
            <div className={styles.flock} role="group" aria-label="Fence out a neighbour">
              <span>fence out</span>
              <button data-active={fence === null || undefined} onClick={() => setFence(null)}>no one</button>
              {[1, 2].map((i) => (
                <button key={i} data-active={fence === i || undefined} onClick={() => setFence(i)}>{label(i).replace(/^The herder /, "")}</button>
              ))}
              <em>costs {FENCE_COST}; they may graze {FENCED_MAX} next season</em>
            </div>
            <button className={styles.go} onClick={send}>send the flock out</button>
          </div>
        ) : (
          <div className={styles.end}>
            <p><strong>{youWon ? "Your flock ate best." : `${label(totals.indexOf(best))} ate best.`}</strong> You ate {totals[0].toFixed(1)}.</p>
            <p>
              The valley ate {w.got.toFixed(0)} in all, of about {w.possible.toFixed(0)} it could have shared forever
              ({Math.round((w.got / w.possible) * 100)}%).{" "}
              {bareAt >= 0 ? `The meadow was grazed bare in season ${bareAt + 1}.` : `The meadow survived, ${meadow}.`}
            </p>
          </div>
        )}

        <details className={styles.rules}>
          <summary>How it works</summary>
          <p>
            Each season all three herders choose at once how many sheep to put out (0–{MAX_GRAZE}). Each sheep eats one
            unit of grass; when there isn't enough, it's shared in proportion. What's left regrows, fastest at half full
            (about {SUSTAINABLE.toFixed(1)} a season, a little over three sheep each) and not at all from bare earth.
            Your score is what your flock ate over {SEASONS} seasons. Fencing a neighbour out costs you {FENCE_COST} and
            holds them to two sheep next season. Your neighbours each have a temperament: watch what they do, or reveal it.
          </p>
        </details>
      </div>
    </GameCabinet>
  )
}
