import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ARCADE_PRIMER, ARCADE_STANDARD, BLUE, PLAYER_NAMES, RED, area, check, cloneState, edgesOf, enclosedRegions, fmtArea, newGame,
  pk, step, type Move, type Player, type Pt, type State, type StepInfo,
} from "@/lib/enclosure"
import { planTurn, rng, type BotLevel, type Plan } from "@/lib/enclosure-bot"
import { GameCabinet } from "./GameCabinet"
import { ignoreGameKey, writeStored } from "./gameUtils"
import styles from "./EnclosurePage.module.scss"
import type { BotRequest } from "./enclosure.worker"

type Board = "primer" | "standard"
type Opponent = BotLevel | "friend"

const BOARDS: Record<Board, { cfg: typeof ARCADE_STANDARD; label: string }> = {
  primer: { cfg: ARCADE_PRIMER, label: "Primer 7×7" },
  standard: { cfg: ARCADE_STANDARD, label: "Standard 19×19" },
}
const OPPONENTS: { key: Opponent; label: string; title: string }[] = [
  { key: "pilgrim", label: "Pilgrim", title: "Wanders; takes ground when it falls into its lap" },
  { key: "warden", label: "Warden", title: "Plans both moves together and guards what it holds" },
  { key: "friend", label: "Two players", title: "Pass and play on one screen" },
]
const BOT_NAME: Record<BotLevel, string> = { pilgrim: "Pilgrim", warden: "Warden" }
const PAD = 0.8
const MOVE_GAP = 420 // ms between a bot's two moves, so each can be seen

const samePt = (a: Pt | null, b: Pt | null) => !!a && !!b && a[0] === b[0] && a[1] === b[1]

// ── the bot, in a worker when there is one ──
function useBot() {
  const ref = useRef<{ worker: Worker | null; id: number; waiting: ((p: Plan) => void) | null }>({ worker: null, id: 0, waiting: null })
  const drop = useCallback(() => {
    const b = ref.current
    // A stale search would hold the worker; start a fresh one instead.
    if (b.waiting && b.worker) { b.worker.terminate(); b.worker = null }
    b.waiting = null
  }, [])
  useEffect(() => () => { ref.current.worker?.terminate(); ref.current.worker = null }, [])
  const ask = useCallback((state: State, level: BotLevel): Promise<Plan> => {
    const b = ref.current
    const seed = (Math.random() * 0x100000000) >>> 0
    if (typeof Worker === "undefined") {
      return new Promise((resolve) => setTimeout(() => resolve(planTurn(state, level, rng(seed))), 0))
    }
    if (!b.worker) {
      b.worker = new Worker(new URL("./enclosure.worker.ts", import.meta.url), { type: "module" })
      b.worker.onmessage = (e: MessageEvent<{ id: number; plan: Plan }>) => {
        if (e.data.id !== ref.current.id) return
        const done = ref.current.waiting
        ref.current.waiting = null
        done?.(e.data.plan)
      }
    }
    const id = ++b.id
    return new Promise((resolve) => {
      b.waiting = resolve
      b.worker!.postMessage({ id, state, level, seed } satisfies BotRequest)
    })
  }, [])
  return { ask, drop }
}

// ── record against each opponent, per board ──
type Record3 = [number, number, number]
const recordKey = (level: BotLevel, board: Board) => `enclosure:record:${level}:${board}`
function readRecord(level: BotLevel, board: Board): Record3 {
  try {
    const v = (localStorage.getItem(recordKey(level, board)) ?? "").split("-").map(Number)
    return v.length === 3 && v.every(Number.isFinite) ? (v as Record3) : [0, 0, 0]
  } catch { return [0, 0, 0] }
}

export function EnclosurePage() {
  const [board, setBoard] = useState<Board>("primer")
  const [opponent, setOpponent] = useState<Opponent>("warden")
  const [humanSide, setHumanSide] = useState<Player>(BLUE)
  const [game, setGame] = useState<State>(() => newGame(ARCADE_PRIMER))
  const [gameId, setGameId] = useState(0)
  const [past, setPast] = useState<State[]>([])
  const [sel, setSel] = useState<Pt | null>(null)
  const [hover, setHover] = useState<Pt | null>(null)
  const [last, setLast] = useState<StepInfo | null>(null)
  const [thinking, setThinking] = useState(false)
  const [thought, setThought] = useState<string | null>(null)
  const [record, setRecord] = useState<Record3>(() => readRecord("warden", "primer"))
  const { ask, drop } = useBot()

  const gameRef = useRef(game)
  gameRef.current = game
  const selRef = useRef(sel)
  selRef.current = sel

  const cfg = game.cfg
  const R = cfg.R
  const vs = opponent === "friend" ? null : opponent
  const isBot = useCallback((p: Player) => vs !== null && p !== humanSide, [vs, humanSide])
  const nameOf = (p: Player) => (vs === null ? PLAYER_NAMES[p] : p === humanSide ? "You" : BOT_NAME[vs])
  const humanTurn = !game.done && !isBot(game.toMove)

  const restart = useCallback((b: Board = board, o: Opponent = opponent, side: Player = humanSide) => {
    drop()
    setGame(newGame(BOARDS[b].cfg))
    setGameId((n) => n + 1)
    setPast([])
    setSel(null)
    setLast(null)
    setThinking(false)
    setThought(null)
    if (o !== "friend") setRecord(readRecord(o, b))
  }, [board, opponent, humanSide, drop])

  // ── the bot's turn ──
  useEffect(() => {
    const s = gameRef.current
    if (s.done || !isBot(s.toMove) || !vs) return
    let cancelled = false
    const timers: number[] = []
    const t0 = performance.now()
    setThinking(true)
    ask(s, vs).then((plan) => {
      if (cancelled) return
      const wait = Math.max(0, 500 - (performance.now() - t0))
      let cur = s
      if (!plan.moves.length) { setThinking(false); return }
      plan.moves.forEach((m, i) => {
        timers.push(window.setTimeout(() => {
          if (cancelled) return
          const next = cloneState(cur)
          const info = step(next, m)
          cur = next
          setLast(info)
          if (i === plan.moves.length - 1) { setThinking(false); setThought(plan.thought) }
          setGame(next)
        }, wait + i * MOVE_GAP))
      })
    })
    return () => { cancelled = true; timers.forEach(clearTimeout); drop(); setThinking(false) }
  }, [gameId, game.turn, game.toMove, game.done, isBot, vs, ask, drop])

  // ── tally the result once per game ──
  const tallied = useRef(-1)
  useEffect(() => {
    if (!game.done || !vs || tallied.current === gameId) return
    tallied.current = gameId
    const r = readRecord(vs, board)
    const winner = game.result === "Draw" ? null : game.result === "Blue" ? BLUE : RED
    r[winner === null ? 2 : winner === humanSide ? 0 : 1]++
    writeStored(recordKey(vs, board), r.join("-"))
    setRecord(r)
  }, [game.done, game.result, gameId, vs, board, humanSide])

  // ── a human move ──
  const play = useCallback((m: Move) => {
    const s = gameRef.current
    const c = check(s, m)
    if (!c.ok || s.done) return
    const next = cloneState(s)
    const info = step(next, m, c)
    setPast((p) => [...p, s])
    setLast(info)
    setThought(null)
    setGame(next)
    // Keep drawing from where the wall ended, if it's still your turn.
    const me = s.toMove
    setSel(!next.done && next.toMove === me && next.nodes.get(pk(m.b)) === me ? m.b : null)
  }, [])

  const undo = useCallback(() => {
    if (!past.length) return
    drop()
    setGame(past[past.length - 1])
    setPast(past.slice(0, -1))
    setGameId((n) => n + 1)
    setSel(null)
    setLast(null)
    setThinking(false)
    setThought(null)
  }, [past, drop])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ignoreGameKey(e)) return
      if (e.key === "Escape") setSel(null)
      else if (e.key === "u" || e.key === "U" || e.key === "Backspace") { e.preventDefault(); undo() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [undo])

  // ── geometry ──
  const lattice = useMemo(() => {
    const pts: Pt[] = []
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) pts.push([x, y])
    return pts
  }, [R])
  /** user units per CSS pixel at the reference 600px board */
  const u = (2 * R + 2 * PAD) / 600

  const territory = useMemo(() => [BLUE, RED].map((p) => enclosedRegions(edgesOf(game, p as Player))), [game])
  const areas = useMemo(() => [area(game, BLUE), area(game, RED)], [game])

  const targets = useMemo(() => {
    const out = new Map<string, boolean>()
    if (!sel || !humanTurn) return out
    const k = cfg.step
    for (let dx = -k; dx <= k; dx++) for (let dy = -k; dy <= k; dy++) {
      if (!dx && !dy) continue
      const b: Pt = [sel[0] + dx, sel[1] + dy]
      if (Math.abs(b[0]) > R || Math.abs(b[1]) > R) continue
      out.set(pk(b), check(game, { a: sel, b }).ok)
    }
    return out
  }, [sel, humanTurn, game, cfg.step, R])

  /** What the hovered move would do, or why it can't be made. */
  const preview = useMemo(() => {
    if (!sel || !hover || !humanTurn || samePt(sel, hover) || !targets.has(pk(hover))) return null
    const m = { a: sel, b: hover }
    const c = check(game, m)
    if (!c.ok) return { ok: false as const, reason: c.reason, cut: c.touched.map((i) => game.edges.get(i)!).filter(Boolean) }
    const me = game.toMove, them = (me ^ 1) as Player
    const next = cloneState(game, true)
    const info = step(next, m, c)
    return {
      ok: true as const,
      gain: area(next, me) - areas[me],
      loss: areas[them] - area(next, them),
      cut: c.touched.map((i) => game.edges.get(i)!).filter(Boolean),
      captured: info.captured,
    }
  }, [sel, hover, humanTurn, targets, game, areas])

  // ── pointer → nearest lattice point ──
  const svgRef = useRef<SVGSVGElement>(null)
  const pointAt = (e: React.PointerEvent): Pt | null => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    const x = Math.round(p.x), y = Math.round(p.y)
    if (Math.abs(x) > R || Math.abs(y) > R || Math.hypot(p.x - x, p.y - y) > 0.42) return null
    return [x, y]
  }
  const mine = (p: Pt | null) => !!p && game.nodes.get(pk(p)) === game.toMove
  const down = useRef<{ wasSel: Pt | null } | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    if (!humanTurn || e.button !== 0) return
    svgRef.current?.setPointerCapture?.(e.pointerId)
    const p = pointAt(e)
    down.current = { wasSel: selRef.current }
    // Press on a node to pick it up; a drag to the target plays the wall.
    if (p && mine(p) && !samePt(p, selRef.current) && !(selRef.current && targets.get(pk(p)))) setSel(p)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = down.current
    down.current = null
    if (!humanTurn || !d) return
    const p = pointAt(e)
    const from = selRef.current
    if (!p) { setSel(null); return }
    if (from && !samePt(p, from) && check(game, { a: from, b: p }).ok) { play({ a: from, b: p }); return }
    if (samePt(p, from)) { if (samePt(d.wasSel, p)) setSel(null); return }
    setSel(mine(p) ? p : null)
  }

  // ── status ──
  const winner = game.result === "Draw" || !game.result ? null : game.result === "Blue" ? BLUE : RED
  const margin = Math.abs(game.scores[0] - game.scores[1])
  const endMessage = !game.done ? "" : winner === null
    ? "drawn dead level"
    : `${nameOf(winner)} ${nameOf(winner) === "You" ? "win" : "wins"} by ${fmtArea(margin)}`
  const statusLine = game.done ? endMessage
    : thinking ? `${nameOf(game.toMove)} is thinking…`
    : game.passed.length ? `${game.passed.map(nameOf).join(" and ")} had no wall to draw and passed · ${nameOf(game.toMove) === "You" ? "your move" : `${nameOf(game.toMove)} to move`}`
    : vs === null ? `${PLAYER_NAMES[game.toMove]} to move`
    : isBot(game.toMove) ? `${nameOf(game.toMove)} to move` : "Your move"
  const cabinetStatus = !game.done ? "playing" : (vs === null ? winner !== null : winner === humanSide) ? "won" : "lost"
  const hint = preview
    ? preview.ok
      ? [preview.gain > 1e-9 && `+${fmtArea(preview.gain)} ground`, preview.cut.length > 0 && `cuts a wall${preview.loss > 1e-9 ? ` (−${fmtArea(preview.loss)} theirs)` : ""}`, preview.captured && "takes the node"].filter(Boolean).join(" · ") || "a plain wall"
      : preview.reason
    : humanTurn ? (sel ? "pick where the wall ends · Esc to put it down" : "pick one of your nodes") : ""

  const turnsTotal = Math.ceil(cfg.maxMoves / 2)
  const turnNow = Math.min(turnsTotal, Math.ceil((game.moveCount + 1) / 2))

  const r = (px: number) => px * u

  return (
    <GameCabinet
      title="Enclosure"
      blurb="Rule walls, close off ground, cut your rival's walls. Ground held is scored every turn."
      status={cabinetStatus}
      veil={false}
      zen
      controls={
        <>
          <div className={styles.seg} role="group" aria-label="Board">
            {(Object.keys(BOARDS) as Board[]).map((b) => (
              <button key={b} data-active={board === b || undefined} onClick={() => { setBoard(b); restart(b) }}>{BOARDS[b].label}</button>
            ))}
          </div>
          <div className={styles.seg} role="group" aria-label="Opponent">
            {OPPONENTS.map((o) => (
              <button key={o.key} title={o.title} data-active={opponent === o.key || undefined} onClick={() => { setOpponent(o.key); restart(board, o.key) }}>{o.label}</button>
            ))}
          </div>
          {vs && (
            <div className={styles.seg} role="group" aria-label="Your side">
              {([BLUE, RED] as Player[]).map((p) => (
                <button key={p} data-side={p} data-active={humanSide === p || undefined} title={p === BLUE ? "Blue opens" : "Red replies"} onClick={() => { setHumanSide(p); restart(board, opponent, p) }}>
                  play {PLAYER_NAMES[p]}
                </button>
              ))}
            </div>
          )}
          <div className={styles.seg}>
            <button onClick={undo} disabled={!past.length} title="Take back your last wall (U)">undo</button>
            <button onClick={() => restart()}>new game</button>
          </div>
        </>
      }
    >
      <div className={styles.wrap}>
        <div className={styles.scoreboard}>
          {([BLUE, RED] as Player[]).map((p) => (
            <div key={p} className={styles.side} data-side={p} data-active={!game.done && game.toMove === p || undefined} data-won={winner === p || undefined}>
              <span className={styles.who}>{nameOf(p)}</span>
              <span className={styles.pips} aria-label={`${game.toMove === p ? game.movesLeft : 0} moves left`}>
                {Array.from({ length: game.turn === 1 && p === BLUE ? 1 : 2 }, (_, i) => (
                  <i key={i} data-on={!game.done && game.toMove === p && i < game.movesLeft || undefined} />
                ))}
              </span>
              <span className={styles.num} title="Ground held now">{fmtArea(areas[p])}<small>held</small></span>
              <span className={styles.num} title="Score: ground held, summed each turn">{game.scores[p].toFixed(game.scores[p] % 1 ? 1 : 0)}<small>score</small></span>
            </div>
          ))}
        </div>

        <svg
          ref={svgRef}
          className={styles.board}
          viewBox={`${-R - PAD} ${-R - PAD} ${2 * R + 2 * PAD} ${2 * R + 2 * PAD}`}
          data-turn={game.toMove}
          data-live={humanTurn || undefined}
          onPointerDown={onPointerDown}
          onPointerMove={(e) => { const p = pointAt(e); if (!samePt(p, hover)) setHover(p) }}
          onPointerUp={onPointerUp}
          onPointerLeave={() => setHover(null)}
          onPointerCancel={() => { down.current = null }}
          role="img"
          aria-label={`Enclosure board. ${statusLine}. Blue holds ${fmtArea(areas[0])}, Red holds ${fmtArea(areas[1])}.`}
        >
          <rect x={-R - PAD} y={-R - PAD} width={2 * R + 2 * PAD} height={2 * R + 2 * PAD} className={styles.ground} />

          {territory.map((regions, p) => regions.map((g, i) => (
            <polygon key={`t${p}-${i}`} points={g.outer.map(([x, y]) => `${x},${y}`).join(" ")} className={styles.field} data-side={p} />
          )))}

          {lattice.map(([x, y]) => <circle key={`${x},${y}`} cx={x} cy={y} r={r(1.4)} className={styles.dot} />)}

          {sel && [...targets].map(([k, ok]) => {
            const [x, y] = k.split(",").map(Number)
            return <circle key={`g${k}`} cx={x} cy={y} r={r(ok ? 5 : 2.5)} className={ok ? styles.target : styles.blocked} />
          })}

          {last?.cut && (
            <line key={`cut${game.moveCount}`} x1={last.cut[0][0]} y1={last.cut[0][1]} x2={last.cut[1][0]} y2={last.cut[1][1]} className={styles.cutGhost} data-side={(last.player ^ 1) as Player} vectorEffect="non-scaling-stroke" />
          )}

          {[...game.edges.values()].map((e) => {
            const guarded = game.protected.has(e.id)
            const fresh = game.placedNow.includes(e.id)
            return (
              <g key={e.id}>
                {guarded && <line x1={e.a[0]} y1={e.a[1]} x2={e.b[0]} y2={e.b[1]} className={styles.guard} data-side={e.owner} vectorEffect="non-scaling-stroke" />}
                <line x1={e.a[0]} y1={e.a[1]} x2={e.b[0]} y2={e.b[1]} className={styles.edge} data-side={e.owner} data-fresh={fresh || undefined} vectorEffect="non-scaling-stroke" />
              </g>
            )
          })}

          {preview?.cut.map((e) => (
            <line key={`pc${e.id}`} x1={e.a[0]} y1={e.a[1]} x2={e.b[0]} y2={e.b[1]} className={styles.willCut} vectorEffect="non-scaling-stroke" />
          ))}
          {sel && hover && preview && (
            <line x1={sel[0]} y1={sel[1]} x2={hover[0]} y2={hover[1]} className={styles.ghost} data-ok={preview.ok || undefined} data-side={game.toMove} vectorEffect="non-scaling-stroke" />
          )}

          {[...game.nodes].map(([k, o]) => {
            const [x, y] = k.split(",").map(Number)
            const taken = last?.captured && samePt(last.move.b, [x, y])
            return <circle key={`n${k}`} cx={x} cy={y} r={r(5.5)} className={styles.node} data-side={o} data-taken={taken || undefined} />
          })}
          {last?.removed.map((p) => <circle key={`rm${pk(p)}-${game.moveCount}`} cx={p[0]} cy={p[1]} r={r(5.5)} className={styles.lost} />)}
          {sel && <circle cx={sel[0]} cy={sel[1]} r={r(10)} className={styles.sel} data-side={game.toMove} />}
        </svg>

        <div className={styles.status} aria-live="polite">
          <span>{statusLine}{thought && !thinking && !game.done && vs && <em> · {BOT_NAME[vs].toLowerCase()} was {thought}</em>}</span>
          <span className={styles.hint}>{hint}</span>
        </div>

        <AreaChart log={game.areaLog} turns={turnsTotal} />

        <div className={styles.meta}>
          <span>turn {turnNow} of {turnsTotal}</span>
          {vs && <span title="wins – losses – draws on this board">record vs {BOT_NAME[vs]} {record.join(" – ")}</span>}
        </div>

        <details className={styles.rules}>
          <summary>How to play</summary>
          <ol>
            <li>Each turn you draw two straight walls (Blue opens with one). A wall runs from one of your nodes to any lattice point at most {cfg.step} away across and {cfg.step} up or down.</li>
            <li>A wall may not run along your own wall, pass through your own node, or stop partway along your own wall.</li>
            <li>A wall that crosses or touches an enemy wall cuts it, and the cut wall is gone (with any node it leaves bare). A wall may cut only one at a time, and walls drawn on the opponent&rsquo;s last turn are sealed: the faint halo marks them.</li>
            <li>End on an enemy node to take it. That cuts its wall, so only a node held by a single wall can be taken.</li>
            <li>Ground your walls close off is yours, holes and all. At the end of every turn each player&rsquo;s ground is added to their score, so ground taken early counts for more.</li>
            <li>After {cfg.maxMoves} walls the higher score wins. A player with no legal wall passes; if neither can move, the remaining turns are scored as they stand.</li>
          </ol>
          <p>Drag from a node, or tap a node then a target. Esc puts a node down; U takes back your last wall.</p>
        </details>
      </div>
    </GameCabinet>
  )
}

/** Ground held at the end of each turn, both players: the score is the area under each line. */
function AreaChart({ log, turns }: { log: [number, number][]; turns: number }) {
  const W = 600, H = 70
  const top = Math.max(4, ...log.flat())
  const path = (p: 0 | 1) => {
    if (!log.length) return ""
    let d = `M0,${H}`
    log.forEach((a, i) => {
      const x0 = (i / turns) * W, x1 = ((i + 1) / turns) * W, y = H - (a[p] / top) * (H - 6)
      d += ` L${x0.toFixed(1)},${y.toFixed(1)} L${x1.toFixed(1)},${y.toFixed(1)}`
    })
    return d + ` L${((log.length / turns) * W).toFixed(1)},${H}`
  }
  return (
    <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1={0} y1={H - 0.5} x2={W} y2={H - 0.5} className={styles.axis} />
      <path d={path(0)} className={styles.curve} data-side={0} />
      <path d={path(1)} className={styles.curve} data-side={1} />
    </svg>
  )
}
