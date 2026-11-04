/**
 * FILAMENT — drawing the dark-matter sheet.
 *
 * Cold dark matter is a 2D sheet folded through phase space (see `cosmos.ts`).
 * Its particles sit on a fixed Lagrangian lattice, so every lattice cell —
 * split into two triangles — carries an exact, unchanging mass. Draw each
 * triangle with its mass spread evenly over its *current* area and the density
 * field comes out continuous and noise-free: a stretched void triangle covers
 * many pixels faintly, a squeezed filament triangle covers few brightly, and
 * where the sheet has folded, overlapping triangles simply add. That is the
 * whole of the method of Abel, Hahn & Kaehler (2012), in the plane.
 *
 * It gives two fields for one pass:
 *
 *   • `density`, in units of the cosmic mean — total mass per pixel;
 *   • `streams`, the number of sheet layers over each pixel. One stream is
 *     space that has never been crossed; three is a pancake; many is a halo.
 *     Shell-crossing is the formal definition of nonlinearity, and this is the
 *     only way to see it directly.
 *
 * A triangle's density is constant, so drawn flat the sheet shows its
 * lattice as facets wherever it has stretched. Each vertex therefore takes the
 * density of its own neighbourhood — the mass of its six triangles over their
 * total area — and each triangle is shaded linearly between its three
 * vertices, rescaled so its mean is still its own exact density. Mass is
 * conserved triangle by triangle; folds still add, stream by stream; only the
 * facets go.
 *
 * Triangles smaller than a few pixels are deposited as a point mass with a
 * bilinear kernel instead: below that scale the scanline would only alias, and
 * the point carries exactly the same mass.
 *
 * The box is periodic, so the camera may pan forever: every triangle is drawn
 * at each image of itself that overlaps the screen.
 */

/** Below this pixel area a triangle is deposited as a point: scanline is exact
 *  for a smooth sheet at any size, but misses a triangle no pixel centre falls in. */
const POINT_AREA = 0.6

export interface SheetCamera {
  /** World coordinates at the centre of the raster. */
  cx: number
  cy: number
  /** Pixels per world unit. */
  scale: number
}

export class SheetRaster {
  w = 0
  h = 0
  /** Mass per pixel in units of the mean density. */
  density = new Float32Array(0)
  /** Sheet layers over each pixel (fractional where triangles are sub-pixel). */
  streams = new Float32Array(0)
  /** Per-vertex area of the six surrounding triangles, then vertex density. */
  private vertex = new Float32Array(0)

  resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return
    this.w = w
    this.h = h
    this.density = new Float32Array(w * h)
    this.streams = new Float32Array(w * h)
  }

  /**
   * Rasterise a periodic lattice sheet.
   *
   * @param x,y    vertex positions, unwrapped (each moves continuously from its
   *               lattice site and is never folded back into the box)
   * @param grid   lattice width; vertex (i, j) is at index j·grid + i
   * @param period box side in world units
   */
  draw(x: Float32Array, y: Float32Array, grid: number, period: number, cam: SheetCamera): void {
    const { w, h, density, streams } = this
    density.fill(0)
    streams.fill(0)
    this.shadeVertices(x, y, grid, period)
    const rho = this.vertex
    const scale = cam.scale
    const P = period * scale
    // Mean density 1: the box (P² pixels) holds 2·grid² triangles.
    const triMass = (P * P) / (2 * grid * grid)
    const ox = w * 0.5 - cam.cx * scale
    const oy = h * 0.5 + cam.cy * scale
    // Re-centre each triangle into the tile around the screen centre, then
    // draw it at every tile offset that touches the raster.
    const homeX = w * 0.5 - P * 0.5
    const homeY = h * 0.5 - P * 0.5
    const invP = 1 / P

    for (let j = 0; j < grid; j++) {
      const j1 = j + 1 === grid ? 0 : j + 1
      const wy = j + 1 === grid ? P : 0
      for (let i = 0; i < grid; i++) {
        const i1 = i + 1 === grid ? 0 : i + 1
        const wx = i + 1 === grid ? P : 0
        const a = j * grid + i
        const b = j * grid + i1
        const c = j1 * grid + i
        const d = j1 * grid + i1
        // Screen coordinates, y down. Wrapped neighbours are shifted a period.
        const ax = x[a] * scale + ox
        const ay = oy - y[a] * scale
        const bx = x[b] * scale + ox + wx
        const by = oy - y[b] * scale
        const cx = x[c] * scale + ox
        const cy = oy - y[c] * scale - wy
        const dx = x[d] * scale + ox + wx
        const dy = oy - y[d] * scale - wy
        // Pull the cell's home image near the screen centre.
        const sx = Math.floor((ax - homeX) * invP) * P
        const sy = Math.floor((ay - homeY) * invP) * P
        this.tile(ax - sx, ay - sy, bx - sx, by - sy, cx - sx, cy - sy, rho[a], rho[b], rho[c], triMass, P)
        this.tile(bx - sx, by - sy, dx - sx, dy - sy, cx - sx, cy - sy, rho[b], rho[d], rho[c], triMass, P)
      }
    }
  }

  /**
   * Vertex densities, in units of the mean: 6·m / ΣA over the six triangles
   * meeting at each vertex (A at its own cell, B of the cell to its left and
   * C of the cell below, both triangles each, and D of the diagonal cell).
   */
  private shadeVertices(x: Float32Array, y: Float32Array, grid: number, period: number): void {
    const n = grid * grid
    if (this.vertex.length !== n) this.vertex = new Float32Array(n)
    const acc = this.vertex
    acc.fill(0)
    for (let j = 0; j < grid; j++) {
      const j1 = j + 1 === grid ? 0 : j + 1
      const wy = j + 1 === grid ? period : 0
      for (let i = 0; i < grid; i++) {
        const i1 = i + 1 === grid ? 0 : i + 1
        const wx = i + 1 === grid ? period : 0
        const a = j * grid + i
        const b = j * grid + i1
        const c = j1 * grid + i
        const d = j1 * grid + i1
        const ax = x[a], ay = y[a]
        const bx = x[b] + wx, by = y[b]
        const cx = x[c], cy = y[c] + wy
        const dx = x[d] + wx, dy = y[d] + wy
        const t1 = 0.5 * Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay))
        const t2 = 0.5 * Math.abs((dx - bx) * (cy - by) - (cx - bx) * (dy - by))
        acc[a] += t1
        acc[b] += t1 + t2
        acc[c] += t1 + t2
        acc[d] += t2
      }
    }
    // Each triangle holds (period²/2)/grid² of a unit-mean box.
    const six = (6 * period * period) / (2 * n)
    for (let k = 0; k < n; k++) acc[k] = acc[k] > 0 ? six / acc[k] : 0
  }

  /** Draw one triangle at every periodic image overlapping the raster. */
  private tile(
    x0: number, y0: number, x1: number, y1: number, x2: number, y2: number,
    r0: number, r1: number, r2: number,
    mass: number, P: number,
  ): void {
    const minX = Math.min(x0, x1, x2)
    const maxX = Math.max(x0, x1, x2)
    const minY = Math.min(y0, y1, y2)
    const maxY = Math.max(y0, y1, y2)
    // A triangle wider than the box is a lattice the dynamics has torn (or a
    // wrap mistake); either way it has no honest area to draw.
    if (maxX - minX > P || maxY - minY > P) return
    const tx0 = Math.ceil((-1 - maxX) / P)
    const tx1 = Math.floor((this.w + 1 - minX) / P)
    const ty0 = Math.ceil((-1 - maxY) / P)
    const ty1 = Math.floor((this.h + 1 - minY) / P)
    if (tx0 > tx1 || ty0 > ty1) return
    const area = 0.5 * Math.abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0))
    // Keep the vertex gradient but rescale it so the triangle's mean is its own
    // exact density: shading moves mass within a triangle, never between them.
    const mean = (r0 + r1 + r2) / 3
    const f = mean > 0 ? mass / area / mean : 0
    for (let ty = ty0; ty <= ty1; ty++) {
      const dy = ty * P
      for (let tx = tx0; tx <= tx1; tx++) {
        const dx = tx * P
        if (area < POINT_AREA) {
          this.point((x0 + x1 + x2) / 3 + dx, (y0 + y1 + y2) / 3 + dy, mass, area)
        } else {
          this.fill(x0 + dx, y0 + dy, x1 + dx, y1 + dy, x2 + dx, y2 + dy, r0 * f, r1 * f, r2 * f)
        }
      }
    }
  }

  /** Bilinear point deposit of mass and covered area, at pixel-centre lattice. */
  private point(px: number, py: number, mass: number, area: number): void {
    const { w, h, density, streams } = this
    const gx = px - 0.5
    const gy = py - 0.5
    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    const fx = gx - x0
    const fy = gy - y0
    for (let k = 0; k < 4; k++) {
      const xx = x0 + (k & 1)
      const yy = y0 + (k >> 1)
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
      const wgt = ((k & 1) ? fx : 1 - fx) * ((k >> 1) ? fy : 1 - fy)
      const i = yy * w + xx
      density[i] += mass * wgt
      streams[i] += area * wgt
    }
  }

  /**
   * Scanline fill with half-open pixel-centre sampling (the top-left rule):
   * a pixel belongs to a triangle if its centre is inside, and a centre on a
   * shared edge belongs to exactly one of the two triangles. Adjacent
   * triangles therefore tile without gaps or double counting. Density is the
   * plane through the three vertex values, stepped by its x-gradient.
   */
  private fill(
    x0: number, y0: number, x1: number, y1: number, x2: number, y2: number,
    r0: number, r1: number, r2: number,
  ): void {
    // The shading plane, from the unsorted vertices.
    const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    if (det === 0) return
    const gx = ((r1 - r0) * (y2 - y0) - (r2 - r0) * (y1 - y0)) / det
    const gy = ((r2 - r0) * (x1 - x0) - (r1 - r0) * (x2 - x0)) / det
    const ox = x0
    const oy = y0
    const or = r0
    // Sort by y.
    let t: number
    if (y1 < y0) { t = y0; y0 = y1; y1 = t; t = x0; x0 = x1; x1 = t }
    if (y2 < y0) { t = y0; y0 = y2; y2 = t; t = x0; x0 = x2; x2 = t }
    if (y2 < y1) { t = y1; y1 = y2; y2 = t; t = x1; x1 = x2; x2 = t }
    const { w, h, density, streams } = this
    const rowStart = Math.max(0, Math.ceil(y0 - 0.5))
    const rowEnd = Math.min(h, Math.ceil(y2 - 0.5))
    if (rowStart >= rowEnd) return
    const longSlope = (x2 - x0) / (y2 - y0)
    const upperSlope = y1 > y0 ? (x1 - x0) / (y1 - y0) : 0
    const lowerSlope = y2 > y1 ? (x2 - x1) / (y2 - y1) : 0
    // The plane can dip below zero just outside the hull of its vertices;
    // a sliver of negative mass is never right.
    const floor = Math.min(r0, r1, r2) > 0 ? 0 : -Infinity
    for (let row = rowStart; row < rowEnd; row++) {
      const yc = row + 0.5
      const xa = x0 + (yc - y0) * longSlope
      const xb = yc < y1 ? x0 + (yc - y0) * upperSlope : x1 + (yc - y1) * lowerSlope
      const left = xa < xb ? xa : xb
      const right = xa < xb ? xb : xa
      const c0 = Math.max(0, Math.ceil(left - 0.5))
      const c1 = Math.min(w, Math.ceil(right - 0.5))
      const base = row * w
      let v = or + gx * (c0 + 0.5 - ox) + gy * (yc - oy)
      for (let col = c0; col < c1; col++) {
        density[base + col] += v > floor ? v : 0
        streams[base + col] += 1
        v += gx
      }
    }
  }
}
