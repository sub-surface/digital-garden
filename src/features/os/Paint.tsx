import { useCallback, useEffect, useRef, useState } from "react"
import { useOS, useOSFiles } from "./osStore"
import type { AppProps } from "./appTypes"
import {
  PAINT_FOLDER,
  PAINT_PALETTE,
  createPaintDocument,
  floodPaint,
  paintLine,
  paintProjectName,
  parsePaintDocument,
  serializePaintDocument,
  type PaintDocument,
  type PaintPoint,
  type PaintTool,
} from "./paintModel"
import styles from "./Paint.module.scss"

const CELL = 14
const HISTORY_LIMIT = 32

function drawPicture(
  canvas: HTMLCanvasElement,
  picture: PaintDocument,
  grid: boolean,
  cell = CELL,
) {
  canvas.width = picture.width * cell
  canvas.height = picture.height * cell
  const context = canvas.getContext("2d")
  if (!context) return
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, canvas.width, canvas.height)
  for (let y = 0; y < picture.height; y++) {
    for (let x = 0; x < picture.width; x++) {
      const index = y * picture.width + x
      context.fillStyle = picture.pixels[index] || ((x + y) % 2 ? "#d8d8d8" : "#f3f3f3")
      context.fillRect(x * cell, y * cell, cell, cell)
    }
  }
  if (!grid || cell < 4) return
  context.beginPath()
  for (let x = 0; x <= picture.width; x++) {
    context.moveTo(x * cell + 0.5, 0)
    context.lineTo(x * cell + 0.5, canvas.height)
  }
  for (let y = 0; y <= picture.height; y++) {
    context.moveTo(0, y * cell + 0.5)
    context.lineTo(canvas.width, y * cell + 0.5)
  }
  context.strokeStyle = "rgba(30, 32, 38, .18)"
  context.lineWidth = 1
  context.stroke()
}

function stem(name: string | undefined) {
  return (name ?? "Untitled.pxl").replace(/\.pxl$/i, "")
}

export function PaintApp({ args, windowId }: AppProps) {
  const files = useOSFiles((state) => state.files)
  const createFile = useOSFiles((state) => state.createFile)
  const createFolder = useOSFiles((state) => state.createFolder)
  const saveFile = useOSFiles((state) => state.saveFile)
  const updateWindowArgs = useOS((state) => state.updateWindowArgs)
  const setWindowTitle = useOS((state) => state.setWindowTitle)
  const file = files.find((candidate) => candidate.id === args.fileId)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<PaintPoint | null>(null)
  const [picture, setPicture] = useState(() => parsePaintDocument(file?.content))
  const [name, setName] = useState(() => stem(file?.name))
  const [tool, setTool] = useState<PaintTool>("pencil")
  const [color, setColor] = useState<string>(PAINT_PALETTE[2])
  const [mirror, setMirror] = useState(false)
  const [grid, setGrid] = useState(true)
  const [history, setHistory] = useState<PaintDocument[]>([])
  const [future, setFuture] = useState<PaintDocument[]>([])
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState(file ? `Opened ${file.name}` : "New local picture")

  useEffect(() => {
    if (canvasRef.current) drawPicture(canvasRef.current, picture, grid)
  }, [grid, picture])

  const remember = useCallback((current: PaintDocument) => {
    setHistory((items) => [...items, current].slice(-HISTORY_LIMIT))
    setFuture([])
  }, [])

  const pointFor = (event: React.PointerEvent<HTMLCanvasElement>): PaintPoint | null => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    const x = Math.floor((event.clientX - rect.left) / rect.width * picture.width)
    const y = Math.floor((event.clientY - rect.top) / rect.height * picture.height)
    if (x < 0 || y < 0 || x >= picture.width || y >= picture.height) return null
    return { x, y }
  }

  const drawTo = (point: PaintPoint) => {
    const from = lastPointRef.current ?? point
    const ink = tool === "eraser" ? "" : color
    setPicture((current) => paintLine(current, from, point, ink, mirror))
    lastPointRef.current = point
    setDirty(true)
  }

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return
    const point = pointFor(event)
    if (!point) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    if (tool === "picker") {
      const picked = picture.pixels[point.y * picture.width + point.x]
      if (picked) setColor(picked)
      setTool("pencil")
      setStatus(picked ? `Picked ${picked}` : "Transparent cell")
      return
    }
    remember(picture)
    if (tool === "fill") {
      setPicture((current) => floodPaint(current, point, color))
      setDirty(true)
      return
    }
    drawingRef.current = true
    lastPointRef.current = point
    drawTo(point)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    const point = pointFor(event)
    if (point) drawTo(point)
  }

  const endStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false
    lastPointRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const undo = () => {
    const previous = history.at(-1)
    if (!previous) return
    setFuture((items) => [picture, ...items].slice(0, HISTORY_LIMIT))
    setHistory((items) => items.slice(0, -1))
    setPicture(previous)
    setDirty(true)
  }

  const redo = () => {
    const next = future[0]
    if (!next) return
    setHistory((items) => [...items, picture].slice(-HISTORY_LIMIT))
    setFuture((items) => items.slice(1))
    setPicture(next)
    setDirty(true)
  }

  const save = useCallback(() => {
    const content = serializePaintDocument(picture)
    const requestedName = paintProjectName(name)
    let id = file?.id
    if (id) {
      saveFile(id, content, requestedName)
    } else {
      if (!useOSFiles.getState().folders.includes(PAINT_FOLDER)) createFolder(PAINT_FOLDER)
      id = createFile(requestedName, content, PAINT_FOLDER)
      updateWindowArgs(windowId, { fileId: id })
    }
    const saved = useOSFiles.getState().files.find((candidate) => candidate.id === id)
    if (saved) {
      setName(stem(saved.name))
      setWindowTitle(windowId, `${saved.name} — Paint`)
      setStatus(`Saved H:\\MY DOCUMENTS\\${PAINT_FOLDER}\\${saved.name}`)
    }
    setDirty(false)
  }, [createFile, createFolder, file?.id, name, picture, saveFile, setWindowTitle, updateWindowArgs, windowId])

  const exportPng = () => {
    const output = window.document.createElement("canvas")
    const scale = 12
    output.width = picture.width * scale
    output.height = picture.height * scale
    const context = output.getContext("2d")
    if (!context) { setStatus("PNG export unavailable"); return }
    for (let y = 0; y < picture.height; y++) {
      for (let x = 0; x < picture.width; x++) {
        const pixel = picture.pixels[y * picture.width + x]
        if (!pixel) continue
        context.fillStyle = pixel
        context.fillRect(x * scale, y * scale, scale, scale)
      }
    }
    const link = window.document.createElement("a")
    link.download = `${stem(paintProjectName(name))}.png`
    link.href = output.toDataURL("image/png")
    link.click()
    setStatus(`Exported ${link.download}`)
  }

  const newPicture = (width: number, height: number) => {
    if (dirty && !window.confirm("Discard unsaved changes and start a new picture?")) return
    setPicture(createPaintDocument(width, height))
    setHistory([])
    setFuture([])
    setName("Untitled")
    setDirty(false)
    updateWindowArgs(windowId, { fileId: undefined })
    setWindowTitle(windowId, "Untitled.pxl — Paint")
    setStatus(`New ${width} × ${height} picture`)
  }

  return (
    <div
      className={styles.root}
      tabIndex={0}
      onKeyDown={(event) => {
        if (!(event.ctrlKey || event.metaKey)) return
        if (event.key.toLowerCase() === "s") { event.preventDefault(); save(); return }
        if ((event.target as HTMLElement).tagName === "INPUT") return
        if (event.key.toLowerCase() === "z" && !event.shiftKey) { event.preventDefault(); undo() }
        if (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey)) { event.preventDefault(); redo() }
      }}
    >
      <div className={styles.filebar}>
        <label>Name <input value={name} maxLength={48} onChange={(event) => { setName(event.target.value); setDirty(true) }} aria-label="Picture name" /></label>
        <button type="button" onClick={save}>Save</button>
        <button type="button" onClick={exportPng}>Export PNG</button>
        <select aria-label="New picture size" defaultValue="" onChange={(event) => {
          const [width, height] = event.target.value.split("x").map(Number)
          if (width && height) newPicture(width, height)
          event.target.value = ""
        }}>
          <option value="" disabled>New…</option>
          <option value="16x16">16 × 16 icon</option>
          <option value="32x24">32 × 24 picture</option>
          <option value="32x32">32 × 32 square</option>
          <option value="48x32">48 × 32 wide</option>
        </select>
      </div>

      <div className={styles.body}>
        <aside className={styles.tools} aria-label="Paint tools">
          {(["pencil", "eraser", "fill", "picker"] as const).map((candidate) => (
            <button key={candidate} type="button" data-active={tool === candidate} onClick={() => setTool(candidate)}>
              {candidate === "pencil" ? "Pencil" : candidate === "eraser" ? "Eraser" : candidate === "fill" ? "Fill" : "Pick"}
            </button>
          ))}
          <hr />
          <button type="button" data-active={mirror} onClick={() => setMirror((value) => !value)}>Mirror</button>
          <button type="button" data-active={grid} onClick={() => setGrid((value) => !value)}>Grid</button>
          <hr />
          <button type="button" onClick={undo} disabled={!history.length}>Undo</button>
          <button type="button" onClick={redo} disabled={!future.length}>Redo</button>
          <button type="button" onClick={() => {
            if (!picture.pixels.some(Boolean) || window.confirm("Clear every pixel?")) {
              remember(picture); setPicture(createPaintDocument(picture.width, picture.height)); setDirty(true)
            }
          }}>Clear</button>
        </aside>

        <div className={styles.stage}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            aria-label={`${picture.width} by ${picture.height} pixel canvas`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
          />
        </div>
      </div>

      <div className={styles.palette}>
        <span className={styles.swatches}>
          {PAINT_PALETTE.map((candidate) => (
            <button
              key={candidate}
              type="button"
              data-active={color === candidate}
              style={{ backgroundColor: candidate }}
              onClick={() => { setColor(candidate); setTool("pencil") }}
              aria-label={`Use color ${candidate}`}
            />
          ))}
        </span>
        <label className={styles.customColor}>Custom <input type="color" value={color} onChange={(event) => { setColor(event.target.value); setTool("pencil") }} /></label>
        <span className={styles.currentColor} style={{ backgroundColor: color }} title={color} />
      </div>

      <footer className={styles.status}>
        <span>{dirty ? "● UNSAVED" : "SAVED"}</span>
        <span>{picture.width} × {picture.height} · {tool.toUpperCase()}{mirror ? " · MIRROR" : ""}</span>
        <span role="status">{status}</span>
      </footer>
    </div>
  )
}
