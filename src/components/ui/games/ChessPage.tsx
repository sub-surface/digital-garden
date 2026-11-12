import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { Chess, type Move, type Square, type PieceSymbol } from "chess.js"
import { Chessboard } from "react-chessboard"
import { useStore } from "@/store"
import { pickBotMove, BOT_FLAVOURS, type BotFlavour } from "@/lib/chessBot"
import { ignoreGameKey } from "./gameUtils"
import { sfx } from "@/lib/sfx"
import type { ChessBotReply, ChessBotRequest } from "./chess.worker"
import styles from "./ChessPage.module.scss"

type BotMove = { from: string; to: string; promotion?: string }

/** The bot, in a worker when there is one; stale replies (after a reset or take-back) are dropped. */
function useChessBot() {
  const ref = useRef<{ worker: Worker | null; id: number; waiting: ((m: BotMove | null) => void) | null }>({ worker: null, id: 0, waiting: null })
  useEffect(() => () => { ref.current.worker?.terminate(); ref.current.worker = null }, [])
  return useCallback((pgn: string, flavour: BotFlavour): Promise<BotMove | null> => {
    const b = ref.current
    if (typeof Worker === "undefined") {
      return new Promise((resolve) => setTimeout(() => {
        const g = new Chess(); g.loadPgn(pgn)
        const m = pickBotMove(g, flavour)
        resolve(m ? { from: m.from, to: m.to, promotion: m.promotion } : null)
      }, 0))
    }
    if (!b.worker) {
      b.worker = new Worker(new URL("./chess.worker.ts", import.meta.url), { type: "module" })
      b.worker.onmessage = (e: MessageEvent<ChessBotReply>) => {
        if (e.data.id !== ref.current.id) return
        const done = ref.current.waiting
        ref.current.waiting = null
        done?.(e.data.move)
      }
    }
    const id = ++b.id
    return new Promise((resolve) => {
      b.waiting = resolve
      b.worker!.postMessage({ id, pgn, flavour } satisfies ChessBotRequest)
    })
  }, [])
}

/** The position as if it were `side`'s move (en passant cleared), or null if chess.js refuses it. */
function asTurn(fen: string, side: "w" | "b"): Chess | null {
  const f = fen.split(" ")
  f[1] = side
  f[3] = "-"
  try { return new Chess(f.join(" ")) } catch { return null }
}

type Premove = { from: Square; to: Square }
const PREMOVE_MAX = 4

/** Clone a Chess instance preserving full move history via PGN */
function cloneGame(g: Chess): Chess {
  const copy = new Chess()
  copy.loadPgn(g.pgn())
  return copy
}

/** Trigger a file download from a Blob, revoking the object URL after a short delay */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type Side = "white" | "black"
type Rec = [number, number, number] // wins, losses, draws

const recKey = (f: BotFlavour) => `chess:record:${f}`
function readRec(f: BotFlavour): Rec {
  try {
    const v = (localStorage.getItem(recKey(f)) ?? "").split("-").map(Number)
    return v.length === 3 && v.every(Number.isFinite) ? (v as Rec) : [0, 0, 0]
  } catch { return [0, 0, 0] }
}
function writeRec(f: BotFlavour, r: Rec) {
  try { localStorage.setItem(recKey(f), r.join("-")) } catch { /* storage blocked */ }
}

const PROMOS: { p: PieceSymbol; glyph: string; name: string }[] = [
  { p: "q", glyph: "♛", name: "queen" },
  { p: "r", glyph: "♜", name: "rook" },
  { p: "b", glyph: "♝", name: "bishop" },
  { p: "n", glyph: "♞", name: "knight" },
]
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const GLYPH: Record<string, string> = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛" }
const START: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 }

/** The game's result in words, or null while it is still on. */
function outcome(g: Chess): { text: string; winner: "w" | "b" | null } | null {
  if (g.isCheckmate()) return { text: `Checkmate — ${g.turn() === "w" ? "Black" : "White"} wins.`, winner: g.turn() === "w" ? "b" : "w" }
  if (g.isStalemate()) return { text: "Stalemate — a draw.", winner: null }
  if (g.isInsufficientMaterial()) return { text: "Draw — neither side can mate.", winner: null }
  if (g.isThreefoldRepetition()) return { text: "Draw by threefold repetition.", winner: null }
  if (g.isDrawByFiftyMoves()) return { text: "Draw by the fifty-move rule.", winner: null }
  if (g.isDraw()) return { text: "Draw.", winner: null }
  return null
}

export function ChessPage() {
  const [game, setGame] = useState(() => new Chess())
  const [playerColor, setPlayerColor] = useState<Side>("white")
  const [boardOrientation, setBoardOrientation] = useState<Side>("white")
  const [exporting, setExporting] = useState<"pgn" | "gif" | null>(null)
  const [exportError, setExportError] = useState(false)
  // Tap-to-move: the square the player picked up, and what a pawn becomes.
  const [selected, setSelected] = useState<Square | null>(null)
  const [promo, setPromo] = useState<PieceSymbol>("q")
  const [resigned, setResigned] = useState(false)
  // Premoves: moves queued while the bot thinks, played the instant it's your
  // turn if they're still legal (the first illegal one clears the queue).
  const [premoves, setPremoves] = useState<Premove[]>([])
  const [premoveNote, setPremoveNote] = useState<string | null>(null)
  // Reviewing: the ply on the board, or null for the live position.
  const [view, setView] = useState<number | null>(null)
  const askBot = useChessBot()

  const botFlavour = useStore((s) => s.chessBot)
  const setBotFlavour = useStore((s) => s.setChessBot)
  const [record, setRecord] = useState<Rec>(() => readRec(botFlavour))
  useEffect(() => { setRecord(readRec(botFlavour)) }, [botFlavour])

  const me = playerColor === "white" ? "w" : "b"
  const result = useMemo(() => outcome(game), [game])
  const over = !!result || resigned
  const myTurn = game.turn() === me && !over

  const makeAMove = useCallback((move: { from: string; to: string; promotion?: string }) => {
    try {
      const gameCopy = cloneGame(game)
      const res = gameCopy.move(move)
      if (res) {
        setGame(gameCopy)
        setSelected(null)
        return res
      }
    } catch {
      return null
    }
    return null
  }, [game])

  // The bot thinks off the main thread, then replies after a short, slightly
  // varied beat, so its move reads as a reply rather than a reflex.
  useEffect(() => {
    if (over || game.turn() === me) return
    let cancelled = false
    let timer = 0
    const t0 = performance.now()
    void askBot(game.pgn(), botFlavour).then((move) => {
      if (cancelled || !move) return
      const beat = (botFlavour === "sharp" ? 420 : 260) + Math.random() * 280
      timer = window.setTimeout(() => { if (!cancelled) makeAMove(move) }, Math.max(0, beat - (performance.now() - t0)))
    })
    return () => { cancelled = true; clearTimeout(timer) }
  }, [game, me, over, botFlavour, makeAMove, askBot])

  // A move just landed: a sound, and a note if it ended the game.
  const plies = game.history().length
  const lastSound = useRef(0)
  useEffect(() => {
    // Only for a move made, not one taken back.
    if (plies <= lastSound.current) { lastSound.current = plies; return }
    lastSound.current = plies
    const last = (game.history({ verbose: true }) as Move[])[plies - 1]
    const r = outcome(game)
    if (r) sfx.play(r.winner === null ? "push" : r.winner === me ? "win" : "lose")
    else sfx.play(last.captured ? "eat" : game.isCheck() ? "flip" : "move")
  }, [plies, game, me])

  // Play the next premove as soon as it's our turn.
  useEffect(() => {
    if (!myTurn || !premoves.length) return
    const t = setTimeout(() => {
      const [pm, ...rest] = premoves
      const legal = (game.moves({ square: pm.from, verbose: true }) as Move[]).find((m) => m.to === pm.to)
      if (!legal) {
        setPremoves([])
        setPremoveNote(`premove ${pm.from}–${pm.to} no longer legal, queue cleared`)
        return
      }
      setPremoves(rest)
      makeAMove({ from: pm.from, to: pm.to, promotion: legal.promotion ? promo : undefined })
    }, 70)
    return () => clearTimeout(t)
  }, [myTurn, premoves, game, makeAMove, promo])
  useEffect(() => {
    if (!premoveNote) return
    const t = setTimeout(() => setPremoveNote(null), 2600)
    return () => clearTimeout(t)
  }, [premoveNote])

  /**
   * The board as it will be once the queued premoves are played (the opponent
   * passing in between), for picking up a piece a premove has already moved.
   */
  const premoveBoard = useMemo(() => {
    if (myTurn || over) return null
    let v = asTurn(game.fen(), me)
    for (const pm of premoves) {
      if (!v) break
      try { v.move({ from: pm.from, to: pm.to, promotion: "q" }) } catch { /* geometric premove (a pawn's capture): just move it */
        const piece = v.get(pm.from)
        if (piece) { v.remove(pm.from); v.put(piece, pm.to) }
      }
      v = asTurn(v.fen(), me)
    }
    return v
  }, [myTurn, over, game, premoves, me])

  /** Where a premove from `sq` may go: its moves on the premove board, plus a pawn's diagonals (for a capture yet to come). */
  const premoveTargets = useCallback((sq: Square): Square[] => {
    const v = premoveBoard
    if (!v) return []
    const out = new Set((v.moves({ square: sq, verbose: true }) as Move[]).map((m) => m.to))
    const p = v.get(sq)
    if (p?.type === "p") {
      const f = sq.charCodeAt(0), r = parseInt(sq[1], 10) + (me === "w" ? 1 : -1)
      for (const df of [-1, 1]) {
        const ff = f + df
        if (ff >= 97 && ff <= 104 && r >= 1 && r <= 8) out.add(`${String.fromCharCode(ff)}${r}` as Square)
      }
    }
    return [...out]
  }, [premoveBoard, me])

  const queuePremove = (from: Square, to: Square): boolean => {
    if (premoves.length >= PREMOVE_MAX || !premoveTargets(from).includes(to)) return false
    setPremoves((q) => [...q, { from, to }])
    setSelected(null)
    sfx.play("click")
    return true
  }

  // Record each finished game once, against the opponent it was played with.
  const recordedRef = useRef(false)
  useEffect(() => {
    if (!over) { recordedRef.current = false; return }
    if (recordedRef.current || game.history().length < 2) return
    recordedRef.current = true
    const r = readRec(botFlavour)
    if (resigned) r[1]++
    else if (result?.winner === me) r[0]++
    else if (result?.winner) r[1]++
    else r[2]++
    writeRec(botFlavour, r)
    setRecord([...r] as Rec)
  }, [over, resigned, result, me, botFlavour, game])

  const legalFrom = useCallback((sq: Square) => game.moves({ square: sq, verbose: true }) as Move[], [game])

  function tryMove(from: Square, to: Square): boolean {
    const legal = legalFrom(from).find((m) => m.to === to)
    if (!legal) return false
    return makeAMove({ from, to, promotion: legal.promotion ? promo : undefined }) !== null
  }

  function onDrop({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) {
    if (!targetSquare || over) return false
    if (view !== null) { setView(null); return false }
    if (!myTurn) { queuePremove(sourceSquare as Square, targetSquare as Square); return false }
    return tryMove(sourceSquare as Square, targetSquare as Square)
  }

  function onSquareClick({ square }: { square: string }) {
    if (over) return
    // Clicking the board while reviewing returns to the game.
    if (view !== null) { setView(null); return }
    const sq = square as Square
    if (!myTurn) {
      if (selected && selected !== sq && queuePremove(selected, sq)) return
      const p = premoveBoard?.get(sq)
      if (!p || p.color !== me) { setSelected(null); if (!selected && premoves.length) setPremoves([]); return }
      setSelected(sq !== selected ? sq : null)
      return
    }
    if (selected && selected !== sq && tryMove(selected, sq)) return
    const p = game.get(sq)
    setSelected(p && p.color === me && sq !== selected ? sq : null)
  }

  const resetGame = useCallback((color: Side = playerColor) => {
    setGame(new Chess())
    setPlayerColor(color)
    setBoardOrientation(color)
    setSelected(null)
    setResigned(false)
    setPremoves([])
    setView(null)
  }, [playerColor])

  /** Take back the player's last move (and the bot's reply to it). */
  const takeBack = useCallback(() => {
    // Not once the game is decided: that would let a lost game be replayed into the record.
    if (over) return
    const g = cloneGame(game)
    if (!g.undo()) return
    while (g.history().length && g.turn() !== me) g.undo()
    if (g.turn() !== me) return // black, before white's first move: nothing of ours to take back
    setGame(g)
    setSelected(null)
    setPremoves([])
    setView(null)
  }, [game, me, over])
  const canTakeBack = game.history().length >= (me === "w" ? 1 : 2) && !over

  const status = useMemo(() => {
    if (resigned) return "You resigned."
    if (result) return result.text
    if (myTurn) return game.isCheck() ? "Check — your move." : "Your move."
    return premoves.length ? `Thinking… ${premoves.length} premove${premoves.length > 1 ? "s" : ""} queued` : "Thinking…"
  }, [game, result, resigned, myTurn, premoves.length])

  // Check / checkmate flourish flags (transient pulse on the board wrapper)
  const [flourish, setFlourish] = useState<"check" | "mate" | null>(null)
  useEffect(() => {
    if (game.isCheckmate()) {
      setFlourish("mate")
      return
    }
    if (game.isCheck()) {
      setFlourish("check")
      const t = setTimeout(() => setFlourish(null), 600)
      return () => clearTimeout(t)
    }
    setFlourish(null)
  }, [game])

  // Board theme colors from CSS variables
  const boardRef = useRef<HTMLDivElement>(null)
  const accentBase = useStore((s) => s.accentBase)
  const theme = useStore((s) => s.theme)

  const boardColors = useMemo(() => {
    const el = boardRef.current ?? document.documentElement
    const cs = getComputedStyle(el)
    const accent = cs.getPropertyValue("--color-accent-base").trim() || accentBase
    const bg = cs.getPropertyValue("--color-bg-surface").trim()
    const border = cs.getPropertyValue("--color-border").trim()
    return { accent, bg, border }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accentBase, theme])

  // Every position in the game, for stepping back through it.
  const timeline = useMemo(() => {
    const hist = game.history({ verbose: true }) as Move[]
    return { fens: [new Chess().fen(), ...hist.map((m) => m.after)], moves: hist }
  }, [game])
  const shownFen = view === null ? game.fen() : timeline.fens[view]

  // Highlights: the last move, the picked-up piece and where it can go, a king in check, premoves.
  const squareStyles = useMemo(() => {
    const out: Record<string, React.CSSProperties> = {}
    if (view !== null) {
      const m = timeline.moves[view - 1]
      const tint = "color-mix(in srgb, #9ab4d8 40%, transparent)"
      if (m) { out[m.from] = { boxShadow: `inset 0 0 0 999px ${tint}` }; out[m.to] = { boxShadow: `inset 0 0 0 999px ${tint}` } }
      return out
    }
    const hist = timeline.moves
    const last = hist[hist.length - 1]
    const tint = "color-mix(in srgb, #e8c25a 38%, transparent)"
    if (last) {
      out[last.from] = { boxShadow: `inset 0 0 0 999px ${tint}` }
      out[last.to] = { boxShadow: `inset 0 0 0 999px ${tint}` }
    }
    if (game.isCheck()) {
      for (const row of game.board()) for (const p of row) {
        if (p && p.type === "k" && p.color === game.turn()) {
          out[p.square] = { background: "radial-gradient(circle, rgba(232,72,72,0.85) 0%, rgba(232,72,72,0.35) 45%, transparent 72%)" }
        }
      }
    }
    const pre = "color-mix(in srgb, #4f8fe6 48%, transparent)"
    premoves.forEach((pm) => {
      out[pm.from] = { ...out[pm.from], boxShadow: `inset 0 0 0 999px ${pre}` }
      out[pm.to] = { ...out[pm.to], boxShadow: `inset 0 0 0 999px ${pre}` }
    })
    if (selected && !myTurn) {
      out[selected] = { ...out[selected], boxShadow: "inset 0 0 0 3px rgba(120,170,240,0.9)" }
      for (const to of premoveTargets(selected)) {
        out[to] = { ...out[to], background: "radial-gradient(circle, rgba(79,143,230,0.45) 18%, transparent 21%)" }
      }
    } else if (selected) {
      out[selected] = { ...out[selected], boxShadow: "inset 0 0 0 3px rgba(255,255,255,0.75)" }
      for (const m of legalFrom(selected)) {
        out[m.to] = {
          ...out[m.to],
          background: m.captured
            ? "radial-gradient(circle, transparent 58%, rgba(0,0,0,0.38) 60%)"
            : "radial-gradient(circle, rgba(0,0,0,0.32) 18%, transparent 21%)",
        }
      }
    }
    return out
  }, [game, selected, legalFrom, view, timeline, premoves, myTurn, premoveTargets])

  // Material: what each side has taken, and the running balance.
  const material = useMemo(() => {
    const left: Record<"w" | "b", Record<string, number>> = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } }
    for (const row of game.board()) for (const p of row) if (p && p.type !== "k") left[p.color][p.type]++
    const taken = (side: "w" | "b") => {
      const opp = side === "w" ? "b" : "w"
      return Object.keys(START).flatMap((t) => Array(Math.max(0, START[t] - left[opp][t])).fill(GLYPH[t])).join("")
    }
    const score = (side: "w" | "b") => Object.entries(left[side]).reduce((s, [t, n]) => s + VALUE[t] * n, 0)
    return { w: taken("w"), b: taken("b"), diff: score("w") - score("b") }
  }, [game])
  const meTaken = me === "w" ? material.w : material.b
  const themTaken = me === "w" ? material.b : material.w
  const myLead = me === "w" ? material.diff : -material.diff

  // Format move history as numbered pairs: "1. e4 e5  2. Nf3 Nc6"
  const moveHistory = useMemo(() => {
    const moves = game.history()
    const pairs: { num: number; white: string; black?: string }[] = []
    for (let i = 0; i < moves.length; i += 2) {
      pairs.push({ num: Math.floor(i / 2) + 1, white: moves[i], black: moves[i + 1] })
    }
    return pairs
  }, [game])

  // Export PGN
  const exportPgn = useCallback(() => {
    const pgn = game.pgn()
    if (!pgn.trim()) return
    downloadBlob(new Blob([pgn], { type: "application/x-chess-pgn" }), `game-${Date.now()}.pgn`)
  }, [game])

  // Export GIF via Worker proxy (avoids browser CORS against Lichess)
  const exportGif = useCallback(async () => {
    const pgn = game.pgn()
    if (!pgn.trim()) return
    setExporting("gif")
    setExportError(false)
    try {
      // Deliberately raw fetch, not src/lib/api.ts: this endpoint returns an
      // image/gif blob, and the helper's contract is JSON in / JSON out.
      const res = await fetch("/api/chess/gif", {
        method: "POST",
        headers: { "Content-Type": "application/x-chess-pgn" },
        body: pgn,
      })
      if (!res.ok) throw new Error(`GIF export error: ${res.status}`)
      downloadBlob(await res.blob(), `game-${Date.now()}.gif`)
    } catch (err) {
      console.error("GIF export failed:", err)
      setExportError(true)
      setTimeout(() => setExportError(false), 2500)
    } finally {
      setExporting(null)
    }
  }, [game])

  // Open the current game in Lichess analysis (POST form handles long PGNs)
  const openInLichess = useCallback(() => {
    const pgn = game.pgn()
    if (!pgn.trim()) return
    const form = document.createElement("form")
    form.method = "POST"
    form.action = "https://lichess.org/import"
    form.target = "_blank"
    const field = document.createElement("input")
    field.type = "hidden"
    field.name = "pgn"
    field.value = pgn
    form.appendChild(field)
    document.body.appendChild(form)
    form.submit()
    form.remove()
  }, [game])

  const hasHistory = game.history().length > 0
  const moveListRef = useRef<HTMLDivElement>(null)

  // Auto-scroll ONLY the move list container, not the page
  useEffect(() => {
    const list = moveListRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [game])

  // U take back · F flip · N new game · Esc drop the picked-up piece.
  const stepView = (d: number) => setView((v) => {
    const cur = v ?? plies
    const n = Math.max(0, Math.min(plies, cur + d))
    return n === plies ? null : n
  })
  const keysRef = useRef({ takeBack, resetGame, step: stepView, jump: (n: number) => setView(n >= plies ? null : n) })
  keysRef.current = { takeBack, resetGame, step: stepView, jump: (n: number) => setView(n >= plies ? null : n) }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ignoreGameKey(e)) return
      const k = e.key.toLowerCase()
      if (k === "u") keysRef.current.takeBack()
      else if (k === "f") setBoardOrientation((o) => (o === "white" ? "black" : "white"))
      else if (k === "n") keysRef.current.resetGame()
      else if (k === "escape") { setSelected(null); setPremoves([]) }
      else if (k === "arrowleft") { e.preventDefault(); keysRef.current.step(-1) }
      else if (k === "arrowright") { e.preventDefault(); keysRef.current.step(1) }
      else if (k === "home") keysRef.current.jump(0)
      else if (k === "end") setView(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const opponent = BOT_FLAVOURS.find((f) => f.value === botFlavour)

  return (
    <div className={styles.chessContainer}>
      <header className={styles.header}>
        <h1>Chess</h1>
        <p>A small handmade machine that plays chess.</p>
      </header>

      <div className={styles.gameLayout}>
        <div className={styles.boardColumn}>
          <div className={styles.captured} title="pieces you have lost">
            <span>{themTaken}</span>
            {myLead < 0 && <span className={styles.lead}>+{-myLead}</span>}
          </div>
          <div className={styles.boardWrapper} ref={boardRef} data-flourish={flourish ?? undefined} data-review={view !== null || undefined}>
            <Chessboard
              options={{
                position: shownFen,
                onPieceDrop: onDrop,
                onSquareClick,
                onSquareRightClick: () => { if (premoves.length) { setPremoves([]); setSelected(null) } },
                canDragPiece: ({ piece }) => !over && view === null && piece.pieceType[0] === me,
                squareStyles,
                boardOrientation,
                animationDurationInMs: 200,
                boardStyle: {
                  borderRadius: "4px",
                  boxShadow: "0 5px 15px rgba(0, 0, 0, 0.5)",
                  border: `1px solid ${boardColors.border}`,
                },
                darkSquareStyle: { backgroundColor: boardColors.accent },
                lightSquareStyle: { backgroundColor: boardColors.bg },
              }}
            />
          </div>
          <div className={styles.captured} title="pieces you have taken">
            <span>{meTaken}</span>
            {myLead > 0 && <span className={styles.lead}>+{myLead}</span>}
          </div>
        </div>

        <div className={styles.controls}>
          <div className={styles.difficultySection}>
            <span className={styles.label}>Opponent</span>
            <div className={styles.difficultyGrid}>
              {BOT_FLAVOURS.map((f) => (
                <button
                  key={f.value}
                  className={styles.diffBtn}
                  data-active={botFlavour === f.value}
                  onClick={() => setBotFlavour(f.value)}
                  title={f.hint}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {opponent && <span className={styles.hint}>{opponent.hint} · record {record.join(" – ")}</span>}
          </div>

          <div className={styles.difficultySection}>
            <span className={styles.label}>Play as</span>
            <div className={styles.difficultyGrid}>
              <button className={styles.diffBtn} data-active={playerColor === "white"} onClick={() => resetGame("white")}>White</button>
              <button className={styles.diffBtn} data-active={playerColor === "black"} onClick={() => resetGame("black")}>Black</button>
              <button className={styles.diffBtn} onClick={() => setBoardOrientation((prev) => (prev === "white" ? "black" : "white"))}>Flip</button>
            </div>
          </div>

          <div className={styles.difficultySection}>
            <span className={styles.label}>Pawns promote to</span>
            <div className={styles.difficultyGrid}>
              {PROMOS.map((p) => (
                <button key={p.p} className={styles.diffBtn} data-active={promo === p.p} onClick={() => setPromo(p.p)} title={p.name} aria-label={p.name}>
                  {p.glyph}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.statusBox}>
            <div className={styles.statusText} aria-live="polite">
              {view !== null ? `Reviewing move ${Math.ceil(view / 2) || 0}${view % 2 ? "" : view ? "…" : ""} — → or End to return` : status}
            </div>
            {premoveNote && <div className={styles.note}>{premoveNote}</div>}
            <div className={styles.statusActions}>
              <button className={styles.resetBtn} onClick={takeBack} disabled={!canTakeBack} title="U">Take back</button>
              {over
                ? <button className={styles.resetBtn} onClick={() => resetGame()} title="N">New game</button>
                : <button className={styles.resetBtn} onClick={() => setResigned(true)} disabled={!hasHistory}>Resign</button>}
            </div>
          </div>

          <div className={styles.history}>
            <h2>History</h2>
            <div className={styles.moveList} ref={moveListRef}>
              {moveHistory.length === 0 && <span className={styles.moveEmpty}>No moves yet</span>}
              {moveHistory.map((pair) => {
                const wPly = pair.num * 2 - 1, bPly = pair.num * 2
                const at = view ?? plies
                return (
                  <div key={pair.num} className={styles.movePair}>
                    <span className={styles.moveNum}>{pair.num}.</span>
                    <button className={styles.moveItem} data-current={at === wPly || undefined} onClick={() => setView(wPly >= plies ? null : wPly)}>{pair.white}</button>
                    {pair.black && <button className={styles.moveItem} data-current={at === bPly || undefined} onClick={() => setView(bPly >= plies ? null : bPly)}>{pair.black}</button>}
                  </div>
                )
              })}
            </div>
          </div>

          <div className={styles.exportSection}>
            <button className={styles.exportBtn} onClick={exportPgn} disabled={!hasHistory}>Export PGN</button>
            <button className={styles.exportBtn} onClick={exportGif} disabled={!hasHistory || exporting === "gif"}>
              {exportError ? "Export failed" : exporting === "gif" ? "Generating..." : "Export GIF"}
            </button>
            <button className={styles.exportBtn} onClick={openInLichess} disabled={!hasHistory}>Analyse on Lichess</button>
          </div>
          <p className={styles.hint}>
            <span className="on-desktop">Drag or click a piece, then its square; move while it thinks to premove (right-click or Esc clears). ← → review · U take back · F flip · N new game.</span>
            <span className="on-touch">Tap a piece, then where it goes; tap during its turn to premove.</span>
          </p>
        </div>
      </div>
    </div>
  )
}
