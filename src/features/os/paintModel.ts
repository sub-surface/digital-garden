export const PAINT_DOCUMENT_VERSION = 1
export const PAINT_EXTENSION = ".pxl"
export const PAINT_FOLDER = "Pictures"

export const PAINT_PALETTE = [
  "#111318", "#ffffff", "#b4424c", "#e47d3e",
  "#e8c547", "#79b85a", "#3c9d8f", "#4c8ccf",
  "#6657ad", "#b65a9e", "#7a4d2b", "#9a9aa2",
  "#e9b7ad", "#b8d986", "#8fd5d0", "#a9bff2",
] as const

export type PaintTool = "pencil" | "eraser" | "fill" | "picker"

export interface PaintPoint {
  x: number
  y: number
}

export interface PaintDocument {
  version: typeof PAINT_DOCUMENT_VERSION
  width: number
  height: number
  /** Empty string is transparent; otherwise a normalized six-digit hex color. */
  pixels: string[]
}

function clampDimension(value: unknown, fallback: number) {
  const number = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(64, Math.max(8, number))
}

export function normalizePaintColor(value: unknown): string {
  if (value === "") return ""
  if (typeof value !== "string") return ""
  const color = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(color)) return color
  if (/^#[0-9a-f]{3}$/.test(color)) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
  }
  return ""
}

export function createPaintDocument(width = 32, height = 24): PaintDocument {
  const safeWidth = clampDimension(width, 32)
  const safeHeight = clampDimension(height, 24)
  return {
    version: PAINT_DOCUMENT_VERSION,
    width: safeWidth,
    height: safeHeight,
    pixels: Array.from({ length: safeWidth * safeHeight }, () => ""),
  }
}

export function normalizePaintDocument(value: unknown): PaintDocument {
  if (!value || typeof value !== "object") return createPaintDocument()
  const candidate = value as Partial<PaintDocument>
  const width = clampDimension(candidate.width, 32)
  const height = clampDimension(candidate.height, 24)
  const source = Array.isArray(candidate.pixels) ? candidate.pixels : []
  return {
    version: PAINT_DOCUMENT_VERSION,
    width,
    height,
    pixels: Array.from({ length: width * height }, (_, index) => normalizePaintColor(source[index])),
  }
}

export function parsePaintDocument(content: string | undefined): PaintDocument {
  if (!content) return createPaintDocument()
  try {
    return normalizePaintDocument(JSON.parse(content))
  } catch {
    return createPaintDocument()
  }
}

export function serializePaintDocument(document: PaintDocument): string {
  return JSON.stringify(normalizePaintDocument(document))
}

export function isPaintFile(name: string): boolean {
  return name.toLowerCase().endsWith(PAINT_EXTENSION)
}

export function paintProjectName(value: string): string {
  const cleaned = value.trim().replace(/[\\/:*?"<>|]/g, "-") || "Untitled"
  return isPaintFile(cleaned) ? cleaned : `${cleaned}${PAINT_EXTENSION}`
}

function cellIndex(document: PaintDocument, point: PaintPoint) {
  if (point.x < 0 || point.y < 0 || point.x >= document.width || point.y >= document.height) return -1
  return point.y * document.width + point.x
}

function withPixel(document: PaintDocument, point: PaintPoint, color: string): PaintDocument {
  const index = cellIndex(document, point)
  if (index < 0 || document.pixels[index] === color) return document
  const pixels = [...document.pixels]
  pixels[index] = color
  return { ...document, pixels }
}

export function paintPixel(
  document: PaintDocument,
  point: PaintPoint,
  color: string,
  mirror = false,
): PaintDocument {
  const normalized = normalizePaintColor(color)
  let next = withPixel(document, point, normalized)
  if (mirror) next = withPixel(next, { x: document.width - point.x - 1, y: point.y }, normalized)
  return next
}

/** Integer line rasterization keeps quick pointer movement from leaving gaps. */
export function paintLine(
  document: PaintDocument,
  from: PaintPoint,
  to: PaintPoint,
  color: string,
  mirror = false,
): PaintDocument {
  let next = document
  let x = from.x
  let y = from.y
  const dx = Math.abs(to.x - x)
  const sx = x < to.x ? 1 : -1
  const dy = -Math.abs(to.y - y)
  const sy = y < to.y ? 1 : -1
  let error = dx + dy
  while (true) {
    next = paintPixel(next, { x, y }, color, mirror)
    if (x === to.x && y === to.y) return next
    const doubled = error * 2
    if (doubled >= dy) { error += dy; x += sx }
    if (doubled <= dx) { error += dx; y += sy }
  }
}

export function floodPaint(document: PaintDocument, point: PaintPoint, color: string): PaintDocument {
  const start = cellIndex(document, point)
  const replacement = normalizePaintColor(color)
  if (start < 0 || document.pixels[start] === replacement) return document
  const target = document.pixels[start]
  const pixels = [...document.pixels]
  const pending = [start]
  pixels[start] = replacement
  while (pending.length) {
    const index = pending.pop()!
    const x = index % document.width
    const y = Math.floor(index / document.width)
    const neighbors = [
      x > 0 ? index - 1 : -1,
      x < document.width - 1 ? index + 1 : -1,
      y > 0 ? index - document.width : -1,
      y < document.height - 1 ? index + document.width : -1,
    ]
    for (const neighbor of neighbors) {
      if (neighbor >= 0 && pixels[neighbor] === target) {
        pixels[neighbor] = replacement
        pending.push(neighbor)
      }
    }
  }
  return { ...document, pixels }
}
