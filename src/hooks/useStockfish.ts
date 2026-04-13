import { useEffect, useRef, useCallback, useState } from "react"

const STOCKFISH_CDN = "https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.wasm.js"

// Map UI levels 1-8 to Stockfish Skill Level (0-20) and depth limits
const LEVEL_CONFIG: Record<number, { skill: number; depth: number }> = {
  1: { skill: 0, depth: 1 },
  2: { skill: 3, depth: 2 },
  3: { skill: 5, depth: 4 },
  4: { skill: 8, depth: 6 },
  5: { skill: 11, depth: 8 },
  6: { skill: 14, depth: 10 },
  7: { skill: 17, depth: 14 },
  8: { skill: 20, depth: 18 },
}

export type StockfishState = "loading" | "ready" | "thinking" | "error"

export function useStockfish(difficulty: number) {
  const workerRef = useRef<Worker | null>(null)
  const resolveRef = useRef<((move: string) => void) | null>(null)
  const rejectRef = useRef<((err: Error) => void) | null>(null)
  const stateRef = useRef<StockfishState>("loading")
  const [state, setState] = useState<StockfishState>("loading")

  const setEngineState = useCallback((s: StockfishState) => {
    stateRef.current = s
    setState(s)
  }, [])

  // Initialize worker
  useEffect(() => {
    let cancelled = false

    try {
      const worker = new Worker(STOCKFISH_CDN)
      workerRef.current = worker

      worker.onmessage = (e: MessageEvent) => {
        const line = typeof e.data === "string" ? e.data : e.data?.toString?.() ?? ""

        if (line === "uciok") {
          if (!cancelled) setEngineState("ready")
        }

        // Parse "bestmove e2e4 ..."
        if (line.startsWith("bestmove")) {
          const move = line.split(" ")[1]
          if (move && move !== "(none)" && resolveRef.current) {
            resolveRef.current(move)
          } else if (rejectRef.current) {
            rejectRef.current(new Error("No valid move returned"))
          }
          resolveRef.current = null
          rejectRef.current = null
          if (!cancelled) setEngineState("ready")
        }
      }

      worker.onerror = (e) => {
        console.error("Stockfish worker error:", e.message ?? e)
        if (!cancelled) setEngineState("error")
      }

      worker.postMessage("uci")
    } catch (e) {
      console.error("Stockfish init failed:", e)
      if (!cancelled) setEngineState("error")
    }

    return () => {
      cancelled = true
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [setEngineState])

  // Update skill level when difficulty changes
  useEffect(() => {
    const worker = workerRef.current
    if (!worker || state === "loading" || state === "error") return

    const config = LEVEL_CONFIG[difficulty] ?? LEVEL_CONFIG[1]
    worker.postMessage(`setoption name Skill Level value ${config.skill}`)
  }, [difficulty, state])

  const getBestMove = useCallback(
    (fen: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const worker = workerRef.current
        if (!worker || stateRef.current === "error") {
          reject(new Error("Stockfish not available"))
          return
        }

        // Reject any pending request before starting a new one
        if (rejectRef.current) {
          rejectRef.current(new Error("Superseded by new request"))
        }
        resolveRef.current = resolve
        rejectRef.current = reject
        setEngineState("thinking")

        const config = LEVEL_CONFIG[difficulty] ?? LEVEL_CONFIG[1]
        worker.postMessage(`position fen ${fen}`)
        worker.postMessage(`go depth ${config.depth}`)
      })
    },
    [difficulty, setEngineState],
  )

  return { getBestMove, state }
}
