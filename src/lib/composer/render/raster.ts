/**
 * Raster / era pass — browser-only (needs a canvas + Image). Rasterizes the
 * clean SVG, downsamples to the era's chunky resolution, quantizes + dithers to
 * the device palette, and hands back a low-res canvas the stage scales up with
 * `image-rendering: pixelated`. Guarded so headless tests skip it (design note
 * in the spec: the core is pure except this module).
 */

import type { Era } from "../eras"
import type { Plate } from "../types"
import { eraPaletteRGB } from "../eras"
import { renderSVG } from "./svg"
import { ditherToPalette } from "./dither"

function assertDom() {
  if (typeof document === "undefined") {
    throw new Error("raster pass requires a DOM (browser-only)")
  }
}

/** Low-res dims for an era (square pixels; the on-screen overlay stays aligned). */
function eraDims(era: Era, ratio: [number, number]): { w: number; h: number } {
  const [rw, rh] = ratio
  const long = era.resolution
  const w = rw >= rh ? long : Math.round((long * rw) / rh)
  const h = rh > rw ? long : Math.round((long * rh) / rw)
  return { w, h }
}

// Ink bias + contrast, applied to the greyscale field before quantization.
// inkBias < 0 darkens (more ink); contrast pivots around mid-grey.
function applyLevels(data: Uint8ClampedArray, inkBias: number, contrast: number): void {
  if (inkBias === 0 && contrast === 1) return
  const bias = inkBias * 255
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = (data[i + c] - 128) * contrast + 128 - bias
      data[i + c] = v < 0 ? 0 : v > 255 ? 255 : v
    }
  }
}

function svgToImage(svg: string): Promise<HTMLImageElement> {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const img = new Image()
  return new Promise((resolve, reject) => {
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

/**
 * The low-res, dithered canvas for a device era (era.resolution long edge). The
 * stage scales this up nearest-neighbour via CSS. Vector eras never call this.
 */
export async function rasterizePlate(plate: Plate, era: Era): Promise<HTMLCanvasElement> {
  assertDom()
  const svg = renderSVG(plate, { standalone: true })
  const img = await svgToImage(svg)
  const { w, h } = eraDims(era, plate.ratio)

  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")!
  ctx.imageSmoothingEnabled = true // smooth downsample → greys for the dither to work on
  ctx.drawImage(img, 0, 0, w, h)

  const image = ctx.getImageData(0, 0, w, h)
  applyLevels(image.data, plate.post.inkBias, plate.post.contrast)
  ditherToPalette(image.data, w, h, eraPaletteRGB(era), era.dither)
  ctx.putImageData(image, 0, 0)

  // Optional scanline artifact (off by default — no glow house rule).
  const scan = era.artifacts?.scanline
  if (scan) {
    ctx.globalAlpha = scan
    ctx.fillStyle = "#000"
    for (let y = 0; y < h; y += 2) ctx.fillRect(0, y, w, 1)
    ctx.globalAlpha = 1
  }
  return canvas
}

/** High-res PNG blob for export. Device eras upscale nearest; vector eras render the SVG crisp. */
export async function toPNGBlob(plate: Plate, era: Era, longEdge: number): Promise<Blob> {
  assertDom()
  const [rw, rh] = plate.ratio
  const outW = rw >= rh ? longEdge : Math.round((longEdge * rw) / rh)
  const outH = rh > rw ? longEdge : Math.round((longEdge * rh) / rw)
  const out = document.createElement("canvas")
  out.width = outW
  out.height = outH
  const octx = out.getContext("2d")!

  if (era.vector) {
    const img = await svgToImage(renderSVG(plate, { standalone: true }))
    octx.imageSmoothingEnabled = true
    octx.drawImage(img, 0, 0, outW, outH)
  } else {
    const low = await rasterizePlate(plate, era)
    octx.imageSmoothingEnabled = false // preserve chunky pixels
    octx.drawImage(low, 0, 0, outW, outH)
  }

  return new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  )
}
