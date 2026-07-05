/**
 * Plate ↔ URL code. The full IR round-trips to a compact code packed into the
 * URL hash (`/apparatus#<code>`); opening the URL reconstructs the exact plate,
 * edits and all. Node anchors are stripped before encoding (they re-realize
 * deterministically on decode), which roughly halves the payload.
 *
 * Pure and dependency-free (its own base64url) so it round-trips in the headless
 * test and in the Worker as well as the browser.
 */

import type { Plate } from "./types"
import { realizeNode } from "./realize"

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

function bytesToB64(bytes: Uint8Array): string {
  let out = ""
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0
    const n = (a << 16) | (b << 8) | c
    out += ALPHA[(n >> 18) & 63] + ALPHA[(n >> 12) & 63]
    out += i + 1 < bytes.length ? ALPHA[(n >> 6) & 63] : ""
    out += i + 2 < bytes.length ? ALPHA[n & 63] : ""
  }
  return out
}

function b64ToBytes(s: string): Uint8Array {
  const lookup = new Int16Array(128).fill(-1)
  for (let i = 0; i < ALPHA.length; i++) lookup[ALPHA.charCodeAt(i)] = i
  const out: number[] = []
  let buf = 0
  let bits = 0
  for (const ch of s) {
    const v = lookup[ch.charCodeAt(0)]
    if (v < 0) continue
    buf = (buf << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((buf >> bits) & 0xff)
    }
  }
  return new Uint8Array(out)
}

/** Compact URL code for a plate (version-prefixed). */
export function encodePlate(plate: Plate): string {
  const slim: Plate = { ...plate, nodes: plate.nodes.map((n) => ({ ...n, anchors: [] })) }
  return "1" + bytesToB64(new TextEncoder().encode(JSON.stringify(slim)))
}

/** Reconstruct a plate from its URL code, re-realizing anchors. Returns null on any error. */
export function decodePlate(code: string): Plate | null {
  try {
    if (code[0] !== "1") return null
    const json = new TextDecoder().decode(b64ToBytes(code.slice(1)))
    const plate = JSON.parse(json) as Plate
    if (plate.version !== 1 || !Array.isArray(plate.nodes)) return null
    plate.nodes = plate.nodes.map((n) => ({ ...n, anchors: realizeNode(n, plate.seed).anchors }))
    return plate
  } catch {
    return null
  }
}
