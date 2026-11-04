/**
 * The descent as one continuous zoom.
 *
 * FILAMENT is a stack of nested worlds, each living in its own coordinates:
 *
 *     web      the periodic box, 180 Mpc across, unit = half the box
 *     galaxy   one halo resimulated, unit = the halo's radius
 *     nucleus  its black hole, unit = M (GM/c²)
 *
 * Each child sits at an *anchor* in its parent, with a fixed ratio of units.
 * A single camera moves through all of them. It is stored in the deepest
 * frame it has entered, never in absolute terms: from the web to the horizon
 * is twenty-odd orders of magnitude, far past what any one float can hold,
 * but each step down is a modest, exact change of origin and scale. (It is
 * the trick deep-zoom renderers use, and the reason a quadtree works: only the
 * branch under the camera is ever built.)
 *
 * Children exist only while the camera is near them. A halo's galaxy is built
 * as the camera closes in on it and dropped once the camera leaves; its black
 * hole likewise. Layers crossfade over about an octave of zoom, and the clock
 * runs only in the deepest layer on screen: while you watch a galaxy, the
 * web around it stands still at the epoch you left it.
 */

import type { LensName, LevelName, WorldUnits } from "../protocol"
import { wrapPeriodic } from "../engine/particle-mesh"

/** What a layer is asked to draw: its own coordinates under the camera. */
export interface View {
  /** Camera centre in the layer's coordinates. */
  x: number
  y: number
  /** Raster pixels per layer unit. */
  scale: number
  w: number
  h: number
}

/** Anything a layer may want to know while drawing, beyond its view. */
export interface DrawContext {
  lens: LensName
  exposure: number
  accent: [number, number, number]
  /** Luminous events (quasars, starbursts, afterglow) on. */
  events: boolean
  /** Trail persistence, 0 for none. */
  trails: number
  /** Wall seconds since the last frame (0 when paused or re-rendering). */
  dt: number
  /** The layer is fading in or out over a deeper one: skip markers. */
  fading: boolean
}

export interface Layer {
  readonly kind: LevelName
  /** Half-size of the layer's natural framing, in its units. */
  readonly extent: number
  /** What one unit is, physically. */
  readonly units: WorldUnits
  /** Advance this layer's clock by `dtSec` wall seconds at playback `rate`. */
  step(dtSec: number, rate: number, view: View): void
  /** Draw, opaquely, the whole raster. */
  render(out: Uint32Array, view: View, ctx: DrawContext): void
}

/** Where a child layer sits in its parent: parent = origin + unit · child. */
export interface Anchor {
  x: number
  y: number
  /** Size of one child unit in parent units. */
  unit: number
}

/** Fill at which the camera hands over to a child frame, and back. */
const ENTER = 0.5
const LEAVE = 0.35

/**
 * A camera through the stack. `depth` names the frame it is held in; `x`,
 * `y` are in that frame's units, and `scale` is pixels per unit there.
 */
export class Camera {
  depth = 0
  x = 0
  y = 0
  scale = 1

  constructor(private readonly stack: Stack) {}

  /** The camera as seen from layer `j`. */
  viewIn(j: number, w: number, h: number): View {
    let { x, y, scale } = this
    let d = this.depth
    while (d > j) {
      const a = this.stack.anchor(d)
      x = a.x + a.unit * x
      y = a.y + a.unit * y
      scale /= a.unit
      d--
    }
    while (d < j) {
      d++
      const a = this.stack.anchor(d)
      const periodic = this.stack.periodic(d - 1)
      const dx = periodic ? wrapPeriodic(x - a.x, 1) : x - a.x
      const dy = periodic ? wrapPeriodic(y - a.y, 1) : y - a.y
      x = dx / a.unit
      y = dy / a.unit
      scale *= a.unit
    }
    if (j === 0 && this.stack.periodic(0)) {
      x = wrapPeriodic(x, 1)
      y = wrapPeriodic(y, 1)
    }
    return { x, y, scale, w, h }
  }

  /**
   * How much of the screen layer `j`'s natural framing fills: 1 when its
   * extent spans the shorter half-axis.
   */
  fill(j: number, w: number, h: number): number {
    const layer = this.stack.layer(j)
    if (!layer) return 0
    return (this.viewIn(j, w, h).scale * layer.extent) / (0.5 * Math.min(w, h))
  }

  /** Hold the camera in the deepest frame it has entered. */
  normalise(w: number, h: number): void {
    for (;;) {
      const down = this.depth + 1
      if (this.stack.attached(down) && this.fill(down, w, h) >= ENTER) {
        this.moveTo(down, w, h)
        continue
      }
      if (this.depth > 0 && (!this.stack.attached(this.depth) || this.fill(this.depth, w, h) < LEAVE)) {
        this.moveTo(this.depth - 1, w, h)
        continue
      }
      break
    }
  }

  /** Re-express the camera in frame `j` without moving it. */
  moveTo(j: number, w: number, h: number): void {
    const v = this.viewIn(j, w, h)
    this.depth = j
    this.x = v.x
    this.y = v.y
    this.scale = v.scale
  }

  /** Raster pixel → the camera frame's coordinates. */
  toWorld(px: number, py: number, w: number, h: number): { x: number; y: number } {
    return { x: this.x + (px - w * 0.5) / this.scale, y: this.y + (h * 0.5 - py) / this.scale }
  }

  /** Pan by a drag of (dx, dy) raster pixels. */
  pan(dx: number, dy: number): void {
    this.x -= dx / this.scale
    this.y += dy / this.scale
    this.wrap()
  }

  /** Zoom by `factor` about raster pixel (px, py), keeping the point beneath it fixed. */
  zoomAt(px: number, py: number, factor: number, w: number, h: number): void {
    const before = this.toWorld(px, py, w, h)
    this.scale *= factor
    const after = this.toWorld(px, py, w, h)
    this.x += before.x - after.x
    this.y += before.y - after.y
    this.wrap()
  }

  private wrap(): void {
    if (this.depth === 0 && this.stack.periodic(0)) {
      this.x = wrapPeriodic(this.x, 1)
      this.y = wrapPeriodic(this.y, 1)
    }
  }
}

/** The stack of nested layers the camera moves through. */
export interface Stack {
  layer(j: number): Layer | null
  /** Anchor of layer j (j ≥ 1) in layer j − 1. */
  anchor(j: number): Anchor
  /** Layer j exists and its frame is attached to its parent. */
  attached(j: number): boolean
  /** Layer j tiles the plane with period 2 (the web). */
  periodic(j: number): boolean
}

/** Smooth step from 0 at `a` to 1 at `b`. */
export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
