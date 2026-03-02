import { useState, useMemo } from "react"
import { Chess } from "chess.js"
import styles from "./ChessPage.module.scss"

export function ChessPage() {
  const [game, setGame] = useState(new Chess())
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)

  const board = useMemo(() => {
    return game.board()
  }, [game])

  const moves = useMemo(() => {
    return selectedSquare ? game.moves({ square: selectedSquare as any, verbose: true }) : []
  }, [selectedSquare, game])

  const handleSquareClick = (square: string) => {
    if (selectedSquare === square) {
      setSelectedSquare(null)
      return
    }

    const move = (moves as any[]).find(m => m.to === square)
    if (move) {
      const newGame = new Chess(game.fen())
      try {
        newGame.move(move)
        setGame(newGame)
        setSelectedSquare(null)
        
        // Basic AI: Random move
        setTimeout(() => {
          const aiGame = new Chess(newGame.fen())
          const possibleMoves = aiGame.moves()
          if (possibleMoves.length > 0) {
            const randomIndex = Math.floor(Math.random() * possibleMoves.length)
            aiGame.move(possibleMoves[randomIndex])
            setGame(aiGame)
          }
        }, 500)
      } catch (err) {
        console.error("Invalid move", err)
      }
    } else {
      const piece = game.get(square as any)
      if (piece && piece.color === game.turn()) {
        setSelectedSquare(square)
      } else {
        setSelectedSquare(null)
      }
    }
  }

  const renderPiece = (type: string, color: string) => {
    const symbols: Record<string, string> = {
      p: "♙", r: "♖", n: "♘", b: "♗", q: "♕", k: "♔",
      P: "♟", R: "♜", N: "♞", B: "♝", Q: "♛", K: "♚"
    }
    const piece = color === 'w' ? type.toUpperCase() : type.toLowerCase()
    return symbols[piece] || ""
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Chess</h1>
        <p>A simple game against the machine-god.</p>
      </header>

      <div className={styles.gameArea}>
        <div className={styles.board}>
          {board.map((row: any[], i: number) => (
            row.map((piece: any, j: number) => {
              const square = String.fromCharCode(97 + j) + (8 - i)
              const isBlack = (i + j) % 2 === 1
              const isSelected = selectedSquare === square
              const isPossibleMove = (moves as any[]).some(m => m.to === square)

              return (
                <div
                  key={square}
                  className={`${styles.square} ${isBlack ? styles.black : styles.white} ${isSelected ? styles.selected : ""} ${isPossibleMove ? styles.possibleMove : ""}`}
                  onClick={() => handleSquareClick(square)}
                >
                  {piece && (
                    <span className={`${styles.piece} ${piece.color === 'w' ? styles.whitePiece : styles.blackPiece}`}>
                      {renderPiece(piece.type, piece.color)}
                    </span>
                  )}
                  {isPossibleMove && !piece && <div className={styles.moveDot} />}
                </div>
              )
            })
          ))}
        </div>

        <div className={styles.sidebar}>
          <div className={styles.status}>
            {game.isGameOver() ? (
              <div className={styles.gameOver}>
                <h3>Game Over</h3>
                <p>{game.isCheckmate() ? "Checkmate!" : game.isDraw() ? "Draw" : ""}</p>
                <button onClick={() => setGame(new Chess())}>New Game</button>
              </div>
            ) : (
              <div className={styles.turn}>
                {game.turn() === 'w' ? "Your Turn" : "Machine is thinking..."}
                {game.inCheck() && <span className={styles.check}>CHECK</span>}
              </div>
            )}
          </div>
          
          <div className={styles.history}>
            <h4>History</h4>
            <div className={styles.movesList}>
              {game.history().map((m: string, i: number) => (
                <span key={i} className={styles.moveItem}>{m}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
