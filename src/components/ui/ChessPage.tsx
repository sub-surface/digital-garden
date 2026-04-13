import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { Chess } from "chess.js"
import { Chessboard } from "react-chessboard"
import { useStore } from "@/store"
import { useStockfish } from "@/hooks/useStockfish"
import styles from "./ChessPage.module.scss"

const DIFFICULTY_LABELS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"]

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

  const difficulty = useStore((s) => s.chessDifficulty)
  const setDifficulty = useStore((s) => s.setChessDifficulty)

  const { getBestMove, state: engineState } = useStockfish(difficulty)

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

  // Fallback random move when Stockfish isn't available
  const makeRandomMove = useCallback(() => {
    const possibleMoves = game.moves()
    if (game.isGameOver() || game.isDraw() || possibleMoves.length === 0) return

    const randomIndex = Math.floor(Math.random() * possibleMoves.length)
    makeAMove(possibleMoves[randomIndex])
  }, [game, makeAMove])

  // Stockfish move via UCI (returns long algebraic like "e2e4")
  const makeEngineMove = useCallback(async () => {
    if (game.isGameOver() || game.isDraw()) return

    try {
      const bestMove = await getBestMove(game.fen())
      // UCI returns long algebraic: "e2e4" or "e7e8q" for promotion
      const from = bestMove.slice(0, 2)
      const to = bestMove.slice(2, 4)
      const promotion = bestMove.length > 4 ? bestMove[4] : undefined
      makeAMove({ from, to, promotion })
    } catch {
      // Stockfish failed, fall back to random
      makeRandomMove()
    }
  }, [game, getBestMove, makeAMove, makeRandomMove])

  // Trigger AI move if it's not the player's turn
  useEffect(() => {
    const turn = game.turn() === "w" ? "white" : "black"
    if (turn !== playerColor && !game.isGameOver()) {
      const delay = engineState === "ready" ? 300 + difficulty * 50 : 400
      const timer = setTimeout(() => {
        if (engineState === "ready" || engineState === "thinking") {
          makeEngineMove()
        } else {
          makeRandomMove()
        }
      }, delay)
      return () => clearTimeout(timer)
    }
  }, [game, playerColor, makeEngineMove, makeRandomMove, engineState, difficulty])

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
    return engineState === "thinking" ? "Machine is thinking..." : "Machine's turn"
  }, [game, playerColor, engineState])

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

  // Export GIF via Lichess API
  const exportGif = useCallback(async () => {
    const pgn = game.pgn()
    if (!pgn.trim()) return

    setExporting("gif")
    try {
      const res = await fetch("https://lichess1.org/game/export/gif", {
        method: "POST",
        headers: { "Content-Type": "application/x-chess-pgn" },
        body: pgn,
      })

      if (!res.ok) throw new Error(`Lichess API error: ${res.status}`)

      const blob = await res.blob()
      downloadBlob(blob, `game-${Date.now()}.gif`)
    } catch (err) {
      console.error("GIF export failed:", err)
    } finally {
      setExporting(null)
    }
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
        <p>Encounter the machine-god.</p>
      </header>

      <div className={styles.gameLayout}>
        <div className={styles.boardWrapper} ref={boardRef}>
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
            <span className={styles.label}>
              Stockfish Level
              {engineState === "loading" && <span className={styles.engineTag}> (loading...)</span>}
              {engineState === "error" && <span className={styles.engineTag}> (fallback)</span>}
            </span>
            <div className={styles.levelGrid}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((level, i) => (
                <button
                  key={level}
                  className={styles.diffBtn}
                  data-active={difficulty === level}
                  onClick={() => setDifficulty(level)}
                  title={`Level ${level}`}
                >
                  {DIFFICULTY_LABELS[i]}
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
              {exporting === "gif" ? "Generating..." : "Export GIF"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
