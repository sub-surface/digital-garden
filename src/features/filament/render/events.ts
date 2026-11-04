/**
 * Quasars and starbursts. They are not dynamics: they carry no mass and exert
 * no force. They are a *reading* of the dynamics, triggered by the mass and
 * compactness of the cells a force solver has already measured.
 *
 * Quasars need a deep well and a supply of gas, so they track the most massive
 * compact haloes, and in the web their abundance peaks at z ≈ 2 ("cosmic
 * noon"). In a galaxy, compactness alone decides, which is why a merger lights
 * one at coalescence, as real mergers are thought to. Starbursts fire at a
 * rate proportional to surface density, roughly the Kennicutt–Schmidt law.
 */

import { wrapPeriodic } from "../engine/particle-mesh"
import { sprite, spikes, type Raster } from "./draw"

interface Quasar {
  x: number
  y: number
  mass: number
  born: number
  life: number
  phase: number
}

interface Burst {
  x: number
  y: number
  born: number
}

const BURST_LIFE = 1.1

export type CellVisitor = (cb: (mass: number, x: number, y: number, size: number) => void) => void

export class Events {
  private quasars: Quasar[] = []
  private bursts: Burst[] = []
  private clock = 0
  private sinceScan = 0
  private rng: number
  total = 0

  /**
   * @param periodic half-width of a periodic world, or 0 for an island
   * @param cosmic   true in the web: cosmic noon and a sparser burst field
   */
  constructor(seed: number, private readonly periodic: number, private readonly cosmic: boolean) {
    this.rng = (seed | 1) >>> 0
  }

  get quasarCount(): number {
    return this.quasars.length
  }

  private rand(): number {
    let r = this.rng
    r ^= r << 13
    r ^= r >>> 17
    r ^= r << 5
    this.rng = r
    return (r >>> 0) / 4294967296
  }

  clear(): void {
    this.quasars = []
    this.bursts = []
  }

  /** Advance the event clock and, every tenth of a second, rescan the cells. */
  advance(dtSec: number, cells: CellVisitor, z: number, span: number): void {
    this.clock += dtSec
    this.sinceScan += dtSec
    if (this.sinceScan < 0.1) return
    const dt = this.sinceScan
    this.sinceScan = 0

    let peak = 0
    cells((m) => {
      if (m > peak) peak = m
    })
    if (peak <= 0) return
    const cosmic = this.cosmic
    const noon = cosmic ? Math.exp(-Math.pow(Math.log((1 + z) / 3) / 0.62, 2)) : 1
    const quasarThreshold = peak * 0.45
    const burstThreshold = peak * (cosmic ? 0.12 : 0.05)
    const burstRate = 8 * dt * (cosmic ? 0.3 + noon : 1)
    const half = this.periodic
    const clock = this.clock

    cells((m, cx, cy, h) => {
      if (m < burstThreshold) return
      if (this.rand() < burstRate * m) {
        this.bursts.push({ x: cx + (this.rand() - 0.5) * h, y: cy + (this.rand() - 0.5) * h, born: clock })
        this.total++
      }
      if (m < quasarThreshold) return
      const near = Math.max(h * 2.5, span * 0.05)
      for (const q of this.quasars) {
        const dx = half ? wrapPeriodic(cx - q.x, half) : cx - q.x
        const dy = half ? wrapPeriodic(cy - q.y, half) : cy - q.y
        if (Math.abs(dx) < near && Math.abs(dy) < near) {
          q.x += dx * 0.25
          q.y += dy * 0.25
          return
        }
      }
      if (this.quasars.length >= (cosmic ? 5 : 2)) return
      if (this.rand() < (cosmic ? 0.04 * noon : 0.012)) {
        this.quasars.push({
          x: cx,
          y: cy,
          mass: m / peak,
          born: clock,
          life: 3 + this.rand() * 7,
          phase: this.rand() * Math.PI * 2,
        })
      }
    })

    this.quasars = this.quasars.filter((q) => clock - q.born < q.life)
    this.bursts = this.bursts.filter((b) => clock - b.born < BURST_LIFE)
    if (this.bursts.length > 300) this.bursts.splice(0, this.bursts.length - 300)
  }

  /** Draw through `toScreen`, which maps world to raster pixels; `size` scales the sprites. */
  draw(r: Raster, toScreen: (x: number, y: number) => [number, number], size: number): void {
    const clock = this.clock
    for (const b of this.bursts) {
      const age = (clock - b.born) / BURST_LIFE
      const f = (1 - age) * (1 - age)
      const [sx, sy] = toScreen(b.x, b.y)
      if (sx < -8 || sy < -8 || sx > r.w + 8 || sy > r.h + 8) continue
      sprite(r, sx, sy, (2 + 5 * (1 - f)) * size, 255 * f, 240 * f, 200 * f)
    }
    for (const q of this.quasars) {
      const age = (clock - q.born) / q.life
      const envelope = Math.sin(Math.PI * Math.min(1, Math.max(0, age)))
      const variability = 0.97 + 0.03 * Math.sin(clock * 1.4 + q.phase)
      const f = envelope * variability * (0.55 + q.mass)
      if (f <= 0.02) continue
      const [sx, sy] = toScreen(q.x, q.y)
      if (sx < -40 || sy < -40 || sx > r.w + 40 || sy > r.h + 40) continue
      spikes(r, sx, sy, (9 + 26 * f) * size, 150 * f, 190 * f, 255 * f)
      sprite(r, sx, sy, (2.5 + 4 * f) * size, 255 * f, 250 * f, 255 * f)
    }
  }
}
