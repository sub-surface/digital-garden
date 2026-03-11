import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { Chess } from "chess.js"
import { Chessboard } from "react-chessboard"
import { useStore } from "@/store"
import styles from "./ChessPage.module.scss"

const DIFFICULTY_LABELS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"]

export function ChessPage() {
  const [game, setGame] = useState(new Chess())
  const [playerColor, setPlayerColor] = useState<"white" | "black">("white")
  const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white")
  
  const difficulty = useStore((s) => s.chessDifficulty)
  const setDifficulty = useStore((s) => s.setChessDifficulty)

  const makeAMove = useCallback((move: any) => {
    try {
      const gameCopy = new Chess(game.fen())
      const result = gameCopy.move(move)
      if (result) {
        setGame(gameCopy)
        return result
      }
    } catch (e) {
      return null
    }
    return null
  }, [game])

  const makeRandomMove = useCallback(() => {
    const possibleMoves = game.moves()
    if (game.isGameOver() || game.isDraw() || possibleMoves.length === 0) return
    
    // ---- Machine Thinking Logic ----
    // This is a placeholder for a real Stockfish WASM engine.
    // For now, we simulate difficulty by biasing move selection.
    
    let move;
    
    if (difficulty >= 7) {
      // Very aggressive: prefers captures and checks
      const checks = possibleMoves.filter(m => m.includes('+'));
      const captures = possibleMoves.filter(m => m.includes('x'));
      if (checks.length > 0 && Math.random() > 0.3) {
        move = checks[Math.floor(Math.random() * checks.length)];
      } else if (captures.length > 0) {
        move = captures[Math.floor(Math.random() * captures.length)];
      }
    } else if (difficulty >= 4) {
      // Moderate: prefers captures
      const captures = possibleMoves.filter(m => m.includes('x'));
      if (captures.length > 0 && Math.random() > 0.5) {
        move = captures[Math.floor(Math.random() * captures.length)];
      }
    } else if (difficulty >= 2) {
      // Basic: occasional captures
      const captures = possibleMoves.filter(m => m.includes('x'));
      if (captures.length > 0 && Math.random() > 0.8) {
        move = captures[Math.floor(Math.random() * captures.length)];
      }
    }
    
    if (!move) {
      const randomIndex = Math.floor(Math.random() * possibleMoves.length)
      move = possibleMoves[randomIndex];
    }
    
    makeAMove(move)
  }, [game, difficulty, makeAMove])

  // Trigger AI move if it's not the player's turn
  useEffect(() => {
    const turn = game.turn() === "w" ? "white" : "black"
    if (turn !== playerColor && !game.isGameOver()) {
      // Thinking time scales slightly with difficulty
      const delay = 400 + (difficulty * 100)
      const timer = setTimeout(makeRandomMove, delay)
      return () => clearTimeout(timer)
    }
  }, [game, playerColor, makeRandomMove, difficulty])

  function onDrop({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) {
    // Only allow moves if it's the player's turn
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
    if (game.isCheckmate()) return `Checkmate! ${game.turn() === 'w' ? 'Black' : 'White'} wins.`
    if (game.isDraw()) return "Draw"
    if (game.isGameOver()) return "Game Over"
    const turn = game.turn() === "w" ? "White" : "Black"
    const isPlayerTurn = (game.turn() === "w" && playerColor === "white") || (game.turn() === "b" && playerColor === "black")
    return isPlayerTurn ? `${turn}'s Turn (You)` : "Machine is thinking..."
  }, [game, playerColor])

  // Read CSS variable colours so the board matches the current theme + accent
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
              lightSquareStyle: { backgroundColor: boardColors.bg }
            }}
          />
        </div>

        <div className={styles.controls}>
          <div className={styles.difficultySection}>
            <span className={styles.label}>Stockfish Level</span>
            <div className={styles.difficultyGrid}>
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
                onClick={() => setBoardOrientation(prev => prev === "white" ? "black" : "white")}
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
            <div className={styles.moveList}>
              {game.history().map((m, i) => (
                <span key={i} className={styles.moveItem}>{m}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
