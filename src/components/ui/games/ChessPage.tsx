import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { Chess, type Move, type Square, type PieceSymbol } from "chess.js"
import { Chessboard } from "react-chessboard"
import { useStore } from "@/store"
import { pickBotMove, BOT_FLAVOURS, type BotFlavour } from "@/lib/chessBot"
import { ignoreGameKey } from "./gameUtils"
import styles from "./ChessPage.module.scss"

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

  // The bot replies after a short beat, so its move reads as a reply.
  useEffect(() => {
    if (over || game.turn() === me) return
    const timer = setTimeout(() => {
      const move = pickBotMove(game, botFlavour)
      if (move) makeAMove({ from: move.from, to: move.to, promotion: move.promotion })
    }, 350)
    return () => clearTimeout(timer)
  }, [game, me, over, botFlavour, makeAMove])

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
    if (!myTurn || !targetSquare) return false
    return tryMove(sourceSquare as Square, targetSquare as Square)
  }

  function onSquareClick({ square }: { square: string }) {
    if (!myTurn) return
    const sq = square as Square
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
  }, [game, me, over])
  const canTakeBack = game.history().length >= (me === "w" ? 1 : 2) && !over

  const status = useMemo(() => {
    if (resigned) return "You resigned."
    if (result) return result.text
    if (myTurn) return game.isCheck() ? "Check — your move." : "Your move."
    return "Thinking…"
  }, [game, result, resigned, myTurn])

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

  // Highlights: the last move, the picked-up piece and where it can go, a king in check.
  const squareStyles = useMemo(() => {
    const out: Record<string, React.CSSProperties> = {}
    const hist = game.history({ verbose: true }) as Move[]
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
    if (selected) {
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
  }, [game, selected, legalFrom])

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
  const keysRef = useRef({ takeBack, resetGame })
  keysRef.current = { takeBack, resetGame }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ignoreGameKey(e)) return
      const k = e.key.toLowerCase()
      if (k === "u") keysRef.current.takeBack()
      else if (k === "f") setBoardOrientation((o) => (o === "white" ? "black" : "white"))
      else if (k === "n") keysRef.current.resetGame()
      else if (k === "escape") setSelected(null)
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
          <div className={styles.boardWrapper} ref={boardRef} data-flourish={flourish ?? undefined}>
            <Chessboard
              options={{
                position: game.fen(),
                onPieceDrop: onDrop,
                onSquareClick,
                canDragPiece: ({ piece }) => myTurn && piece.pieceType[0] === me,
                squareStyles,
                boardOrientation,
                animationDurationInMs: 250,
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
            <div className={styles.statusText} aria-live="polite">{status}</div>
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
              {moveHistory.map((pair) => (
                <div key={pair.num} className={styles.movePair}>
                  <span className={styles.moveNum}>{pair.num}.</span>
                  <span className={styles.moveItem}>{pair.white}</span>
                  {pair.black && <span className={styles.moveItem}>{pair.black}</span>}
                </div>
              ))}
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
            <span className="on-desktop">Drag or click a piece, then its square. U take back · F flip · N new game.</span>
            <span className="on-touch">Tap a piece, then where it goes.</span>
          </p>
        </div>
      </div>
    </div>
  )
}
