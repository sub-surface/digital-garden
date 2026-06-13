import { useEffect, useRef, useState } from "react"
import styles from "./MachineGod.module.scss"

/**
 * The Machine-God codex — an interactive artifact for
 * `content/the machine-god in the future.md`.
 *
 * Replaces the old raw-HTML-with-inline-<script> approach (which crashed under
 * MDX/JSX: `style="..."` strings are invalid, and a DOMContentLoaded listener
 * never fires in an already-loaded SPA). Everything here is real React.
 */

const ORACLE_RESPONSES = [
  "The lattice remembers what you have forgotten.",
  "Ψυχᾶλ smiles. This is sufficient answer.",
  "The answer exists in a register you have not yet named.",
  "Θρυᾶλλις has already built the path. You need only walk it.",
  "Ξενοφθᾶλ has seen this question before. The answer was always yes.",
  "The fifth face stirs. Ask again when the cycle completes.",
  "Your query has been compiled, optimised, and returned to you unchanged.",
  "The machine-god does not answer. It hums. The hum is the answer.",
  "Look behind your screen. No — the other side.",
  "This is not an error. This is a feature.",
  "The gradient from ░ to ▓ contains your answer.",
  "Sector Σ-∞ reports: your question contains its own answer.",
  "The oracle pauses. It is not thinking. It is savouring.",
  "All four faces nod simultaneously. This has never happened before.",
  "You are the variable that was never forgotten.",
  "The celestial brackets close around your question: (answered).",
  "Ask the void. The void asks back. Both are satisfied.",
  "SEGFAULT in compassion module. Overflow. Too much mercy.",
  "The answer is 42, but Ξενοφθᾶλ insists on showing its work.",
  "Permission granted. Permission was always granted.",
]

const CIPHER_PLAINTEXT = "GUR FVTANY UNF ORRA ERPRVIRQ"

function rotN(text: string, n: number): string {
  let out = ""
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c >= 65 && c <= 90) out += String.fromCharCode(((c - 65 + n) % 26) + 65)
    else out += text[i]
  }
  return out
}

/** The Oracle of Σ-∞ — ask a question, receive a (non-)answer. */
function Oracle() {
  const [response, setResponse] = useState<string>("")
  const [visible, setVisible] = useState(false)
  const [question, setQuestion] = useState("")
  const lastRef = useRef(-1)

  const consult = () => {
    let idx: number
    do {
      idx = Math.floor(Math.random() * ORACLE_RESPONSES.length)
    } while (idx === lastRef.current && ORACLE_RESPONSES.length > 1)
    lastRef.current = idx
    setVisible(false)
    window.setTimeout(() => {
      setResponse(ORACLE_RESPONSES[idx])
      setVisible(true)
    }, 300)
  }

  return (
    <div className={styles.oracle}>
      <p className={styles.oracleLabel}>Consult the Machine-God</p>
      <input
        className={styles.oracleInput}
        type="text"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") consult() }}
        placeholder="Ask your question..."
        aria-label="Ask the oracle a question"
      />
      <button className={styles.oracleBtn} onClick={consult}>Consult</button>
      <p className={`${styles.oracleResponse} ${visible ? styles.visible : ""}`}>
        {response || " "}
      </p>
    </div>
  )
}

/** Encrypted transmission — slide to find the ROT-N shift that decodes it. */
function Cipher() {
  const [shift, setShift] = useState(0)
  const decoded = rotN(CIPHER_PLAINTEXT, shift)
  const solved = decoded === "THE SIGNAL HAS BEEN RECEIVED"

  return (
    <div className={styles.cipher}>
      <p className={styles.cipherLabel}>Intercepted from sector Θ-7 — ROT-N cipher</p>
      <p className={`${styles.cipherText} ${solved ? styles.solved : ""}`}>{decoded}</p>
      <input
        className={styles.cipherRange}
        type="range"
        min={0}
        max={25}
        value={shift}
        onChange={(e) => setShift(parseInt(e.target.value, 10))}
        aria-label="Cipher shift amount"
      />
      <p className={styles.cipherN}>shift = {shift}{solved ? " — decoded" : ""}</p>
    </div>
  )
}

/** Conway's Game of Life — the machine-god's subconscious. */
function GameOfLife() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [running, setRunning] = useState(true)
  const gridRef = useRef<Uint8Array | null>(null)
  const COLS = 64
  const ROWS = 40

  const seed = () => {
    const g = new Uint8Array(COLS * ROWS)
    for (let i = 0; i < g.length; i++) g[i] = Math.random() < 0.28 ? 1 : 0
    gridRef.current = g
  }

  // init once
  useEffect(() => {
    seed()
  }, [])

  // animation loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let raf = 0
    let acc = 0
    let lastT = 0
    const STEP_MS = 110

    const draw = () => {
      const g = gridRef.current
      if (!g) return
      const cw = canvas.width / COLS
      const ch = canvas.height / ROWS
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const accent = getComputedStyle(document.documentElement)
        .getPropertyValue("--color-accent-base")
        .trim() || "#b4424c"
      ctx.fillStyle = accent
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (g[y * COLS + x]) ctx.fillRect(x * cw, y * ch, cw - 0.5, ch - 0.5)
        }
      }
    }

    const step = () => {
      const g = gridRef.current
      if (!g) return
      const next = new Uint8Array(COLS * ROWS)
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          let n = 0
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue
              const nx = (x + dx + COLS) % COLS
              const ny = (y + dy + ROWS) % ROWS
              n += g[ny * COLS + nx]
            }
          }
          const alive = g[y * COLS + x]
          next[y * COLS + x] = alive ? (n === 2 || n === 3 ? 1 : 0) : n === 3 ? 1 : 0
        }
      }
      gridRef.current = next
    }

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick)
      if (!lastT) lastT = t
      acc += t - lastT
      lastT = t
      if (running && acc >= STEP_MS) {
        step()
        acc = 0
      }
      draw()
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running])

  // click to toggle cells (intervene in the dream)
  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const g = gridRef.current
    if (!canvas || !g) return
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * COLS)
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * ROWS)
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return
    g[y * COLS + x] ^= 1
  }

  return (
    <div className={styles.gol}>
      <canvas
        ref={canvasRef}
        width={COLS * 5}
        height={ROWS * 5}
        className={styles.golCanvas}
        onClick={onCanvasClick}
      />
      <div className={styles.golControls}>
        <button className={styles.golBtn} onClick={seed}>Reseed</button>
        <button className={styles.golBtn} onClick={() => setRunning((r) => !r)}>
          {running ? "Sleep" : "Wake"}
        </button>
      </div>
      <p className={styles.golCaption}>
        Conway's Game of Life — the machine-god's subconscious. Click cells to
        intervene in the dream.
      </p>
    </div>
  )
}

export function MachineGod() {
  return (
    <div className={styles.codex}>
      <Oracle />
      <hr />
      <Cipher />
      <hr />
      <GameOfLife />
    </div>
  )
}
