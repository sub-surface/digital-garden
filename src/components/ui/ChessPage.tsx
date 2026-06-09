import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { Chess } from "chess.js"
import { Chessboard } from "react-chessboard"
import { useStore } from "@/store"
import { pickBotMove, BOT_FLAVOURS } from "@/lib/chessBot"
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

export function ChessPage() {
  const [game, setGame] = useState(new Chess())
  const [playerColor, setPlayerColor] = useState<"white" | "black">("white")
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white")
  const [exporting, setExporting] = useState<"pgn" | "gif" | null>(null)
  const [exportError, setExportError] = useState(false)

  const botFlavour = useStore((s) => s.chessBot)
  const setBotFlavour = useStore((s) => s.setChessBot)

  const makeAMove = useCallback((move: any) => {
    try {
      const gameCopy = cloneGame(game)
      const result = gameCopy.move(move)
      if (result) {
        setGame(gameCopy)
        return result
      }
    } catch {
      return null
    }
    return null
  }, [game])

  // Homemade bot move (synchronous)
  const makeBotMove = useCallback(() => {
    if (game.isGameOver() || game.isDraw()) return
    const move = pickBotMove(game, botFlavour)
    if (move) makeAMove({ from: move.from, to: move.to, promotion: move.promotion })
  }, [game, botFlavour, makeAMove])

  // Trigger bot move when it's not the player's turn
  useEffect(() => {
    const turn = game.turn() === "w" ? "white" : "black"
    if (turn !== playerColor && !game.isGameOver()) {
      const timer = setTimeout(() => makeBotMove(), 350)
      return () => clearTimeout(timer)
    }
  }, [game, playerColor, makeBotMove])

  function onDrop({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) {
    const turn = game.turn() === "w" ? "white" : "black"
    if (turn !== playerColor) return false
    if (!targetSquare) return false

    const move = makeAMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: "q",
    })

    return move !== null
  }

  const resetGame = (color: "white" | "black" = "white") => {
    setGame(new Chess())
    setPlayerColor(color)
    setBoardOrientation(color)
  }

  const status = useMemo(() => {
    if (game.isCheckmate()) return `Checkmate! ${game.turn() === "w" ? "Black" : "White"} wins.`
    if (game.isDraw()) return "Draw"
    if (game.isGameOver()) return "Game Over"
    const turn = game.turn() === "w" ? "White" : "Black"
    const isPlayerTurn =
      (game.turn() === "w" && playerColor === "white") || (game.turn() === "b" && playerColor === "black")
    if (isPlayerTurn) return `${turn}'s Turn (You)`
    return "Thinking…"
  }, [game, playerColor])

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
    const accent = getComputedStyle(el).getPropertyValue("--color-accent-base").trim() || accentBase
    const bg = getComputedStyle(el).getPropertyValue("--color-bg-surface").trim()
    const border = getComputedStyle(el).getPropertyValue("--color-border").trim()
    return { accent, bg, border }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accentBase, theme])

  // Format move history as numbered pairs: "1. e4 e5  2. Nf3 Nc6"
  const moveHistory = useMemo(() => {
    const moves = game.history()
    const pairs: { num: number; white: string; black?: string }[] = []
    for (let i = 0; i < moves.length; i += 2) {
      pairs.push({
        num: Math.floor(i / 2) + 1,
        white: moves[i],
        black: moves[i + 1],
      })
    }
    return pairs
  }, [game])

  // Export PGN
  const exportPgn = useCallback(() => {
    const pgn = game.pgn()
    if (!pgn.trim()) return

    const blob = new Blob([pgn], { type: "application/x-chess-pgn" })
    downloadBlob(blob, `game-${Date.now()}.pgn`)
  }, [game])

  // Export GIF via Worker proxy (avoids browser CORS against Lichess)
  const exportGif = useCallback(async () => {
    const pgn = game.pgn()
    if (!pgn.trim()) return

    setExporting("gif")
    setExportError(false)
    try {
      const res = await fetch("/api/chess/gif", {
        method: "POST",
        headers: { "Content-Type": "application/x-chess-pgn" },
        body: pgn,
      })

      if (!res.ok) throw new Error(`GIF export error: ${res.status}`)

      const blob = await res.blob()
      downloadBlob(blob, `game-${Date.now()}.gif`)
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
    if (!list) return
    list.scrollTop = list.scrollHeight
  }, [game])

  return (
    <div className={styles.chessContainer}>
      <header className={styles.header}>
        <h1>Chess</h1>
        <p>A small handmade machine that plays chess.</p>
      </header>

      <div className={styles.gameLayout}>
        <div className={styles.boardWrapper} ref={boardRef} data-flourish={flourish ?? undefined}>
          <Chessboard
            options={{
              position: game.fen(),
              onPieceDrop: onDrop,
              boardOrientation: boardOrientation,
              animationDurationInMs: 300,
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
                  title={f.label}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.difficultySection}>
            <span className={styles.label}>Play As</span>
            <div className={styles.difficultyGrid}>
              <button
                className={styles.diffBtn}
                data-active={playerColor === "white"}
                onClick={() => resetGame("white")}
              >
                White
              </button>
              <button
                className={styles.diffBtn}
                data-active={playerColor === "black"}
                onClick={() => resetGame("black")}
              >
                Black
              </button>
              <button
                className={styles.diffBtn}
                onClick={() => setBoardOrientation((prev) => (prev === "white" ? "black" : "white"))}
              >
                Flip
              </button>
            </div>
          </div>

          <div className={styles.statusBox}>
            <div className={styles.statusText}>{status}</div>
            <button className={styles.resetBtn} onClick={() => resetGame(playerColor)}>
              Reset Session
            </button>
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
            <button className={styles.exportBtn} onClick={exportPgn} disabled={!hasHistory}>
              Export PGN
            </button>
            <button
              className={styles.exportBtn}
              onClick={exportGif}
              disabled={!hasHistory || exporting === "gif"}
            >
              {exportError ? "Export failed" : exporting === "gif" ? "Generating..." : "Export GIF"}
            </button>
            <button className={styles.exportBtn} onClick={openInLichess} disabled={!hasHistory}>
              Analyse on Lichess
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
