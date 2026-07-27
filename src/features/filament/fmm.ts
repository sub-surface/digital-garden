/**
 * FILAMENT — a 2D Fast Multipole Method solver.
 *
 * Pure logic: typed arrays in, typed arrays out. No DOM, no imports beyond
 * types, so it runs identically in a Web Worker and in `scripts/test-fmm.ts`
 * (same convention as `src/lib/sigil.ts`).
 *
 * ---------------------------------------------------------------------------
 * WHY COMPLEX NUMBERS
 * ---------------------------------------------------------------------------
 * In two dimensions gravity is *analytic*. Write a point as z = x + iy and
 * define the field function of a set of masses:
 *
 *     f(z) = Σ_j  m_j / (z - z_j)
 *
 * The acceleration of a test body at z is then exactly
 *
 *     a = -G · conj( f(z) )
 *
 * (check: one mass at the origin, test body at z = R > 0 → f = m/R, so
 * a = -Gm/R pointing back at the origin, magnitude Gm/R — 2D gravity, the
 * force of the logarithmic potential.)
 *
 * Because f is analytic away from its poles, it has convergent Laurent and
 * Taylor expansions, and translating those expansions is *pure binomial
 * algebra*. That is the whole trick: every FMM operator below is three lines.
 *
 * ---------------------------------------------------------------------------
 * THE FOUR EXPANSIONS
 * ---------------------------------------------------------------------------
 * P2M  multipole of a cell centred at z_b, valid for |z - z_b| large:
 *          f(z) = Σ_{k<p} M_k / (z - z_b)^{k+1},   M_k = Σ_j m_j (z_j - z_b)^k
 *      (M_0 is just the cell's total mass — the monopole.)
 *
 * M2M  re-centre a multipole from z_old to z_new, d = z_old - z_new:
 *          M'_k = Σ_{i≤k} C(k,i) d^{k-i} M_i
 *
 * M2L  the "flip": turn a far multipole about z_b into a local (Taylor)
 *      expansion about z_c, with δ = z_c - z_b:
 *          f(z) = Σ_{l<p} L_l (z - z_c)^l
 *          L_l  = (-1)^l Σ_{k<p} C(k+l, l) M_k / δ^(k+l+1)
 *      This is the only O(p²) operator, and the only one that ever looks at a
 *      cell other than a parent or a child. It is where the O(N) comes from:
 *      it is applied *per cell pair*, not per particle pair.
 *
 * L2L  re-centre a local expansion from z_old to z_new, d = z_new - z_old:
 *          L'_i = Σ_{l≥i} C(l,i) L_l d^{l-i}
 *
 * L2P  evaluate — Horner's method, p complex multiply-adds per particle.
 *
 * ---------------------------------------------------------------------------
 * THE TREE
 * ---------------------------------------------------------------------------
 * A *balanced* (uniform-depth) quadtree, stored as flat Morton-indexed arrays
 * — no nodes, no pointers, no per-frame allocation. A cell's four children are
 * always `4c, 4c+1, 4c+2, 4c+3`, so M2M/L2L are contiguous strided loops.
 *
 * A cell's interaction list is the children of its parent's neighbours that are
 * not its own neighbours: at most 27 cells in 2D. Everything closer than that
 * is left to the leaf level, where the nine-cell near neighbourhood is summed
 * directly (P2P). Nothing is dropped and nothing is double counted, which is
 * the difference between this and Barnes-Hut: there is no opening angle θ and
 * no approximation *choice*, only a truncation order p that you can dial to
 * whatever accuracy you want.
 *
 * Adaptive FMM would subdivide only where particles are dense. We deliberately
 * use the balanced variant: for the near-uniform-then-clustering distributions
 * a cosmological box actually produces, it is within a small factor of adaptive
 * and it vectorises into flat arrays with no tree-walk branch misprediction —
 * which matters far more in JavaScript than the asymptotic constant does.
 */

/** Deepest tree level the solver will allocate for (4^8 = 65,536 leaf cells). */
export const MAX_DEPTH = 8
/** Widest expansion order supported (p = 10 is well past visual convergence). */
export const MAX_ORDER = 10

/** Pascal's triangle, flat, `C(n,k) = binom[n * stride + k]`. */
function binomTable(stride: number): Float64Array {
  const t = new Float64Array(stride * stride)
  for (let n = 0; n < stride; n++) {
    t[n * stride] = 1
    for (let k = 1; k <= n; k++) {
      t[n * stride + k] = t[(n - 1) * stride + k - 1] + t[(n - 1) * stride + k]
    }
  }
  return t
}

/** Morton bit-spread LUT: `spread[v]` interleaves a zero after each bit of v. */
function spreadTable(bits: number): Uint32Array {
  const t = new Uint32Array(1 << bits)
  for (let v = 0; v < t.length; v++) {
    let r = 0
    for (let b = 0; b < bits; b++) if (v & (1 << b)) r |= 1 << (2 * b)
    t[v] = r
  }
  return t
}

/**
 * The 27-cell interaction list, as (dx, dy) offsets from a cell to its sources.
 *
 * Which offsets are legal depends on where the cell sits inside its parent: the
 * candidate window is the 6×6 block of the parent's neighbours' children, so a
 * cell in the left half of its parent reaches from -2 to +3, and one in the
 * right half from -3 to +2. Four parity classes, each with 36 - 9 = 27 entries.
 */
function interactionLists(): Int32Array[] {
  const lists: Int32Array[] = []
  for (let q = 0; q < 4; q++) {
    const qx = q & 1
    const qy = (q >> 1) & 1
    const out: number[] = []
    for (let dy = -2 - qy; dy <= 3 - qy; dy++) {
      for (let dx = -2 - qx; dx <= 3 - qx; dx++) {
        if (dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1) continue // near field
        out.push(dx, dy)
      }
    }
    lists.push(Int32Array.from(out))
  }
  return lists
}

/** Index into the per-level M2L coefficient cache for a source offset. */
const K_SPAN = 7 // dx, dy each range over [-3, 3]
const kSlot = (dx: number, dy: number) => (dx + 3) * K_SPAN + (dy + 3)

export interface FmmStats {
  /** Leaf cells at the current depth. */
  cells: number
  /** Direct pair interactions actually evaluated in the near field. */
  nearPairs: number
  /** Cell-to-cell M2L translations actually evaluated. */
  translations: number
}

export class Fmm {
  /** Expansion order (number of retained terms). */
  readonly p: number
  /** Current tree depth — set by {@link sort}. */
  depth = 0

  private readonly binom: Float64Array
  private readonly bstride: number
  private readonly spread: Uint32Array
  private readonly lists: Int32Array[]

  /** Per level: multipole and local coefficients, `[cell * p * 2 + k * 2]`. */
  private readonly mp: (Float64Array | null)[] = []
  private readonly lc: (Float64Array | null)[] = []
  /** Per level: de-interleaved grid coords, so no Morton decode in hot loops. */
  private readonly gxOf: (Uint16Array | null)[] = []
  private readonly gyOf: (Uint16Array | null)[] = []

  /** M2L translation coefficients for the current level: 49 × p × p complex. */
  private readonly kmat: Float64Array
  private readonly kLive: Uint8Array

  /** Leaf bucket boundaries, length cells + 1. */
  private cellStart = new Uint32Array(1)
  private cursor = new Uint32Array(1)
  /** Sort permutation: `perm[k]` is the original index of sorted slot k. */
  private perm = new Uint32Array(0)
  private codeOf = new Uint32Array(0)

  /** Bounding box of the tree root (square, centred). */
  boxCx = 0
  boxCy = 0
  boxHalf = 1

  private n = 0
  readonly stats: FmmStats = { cells: 0, nearPairs: 0, translations: 0 }

  constructor(order: number) {
    this.p = Math.max(2, Math.min(MAX_ORDER, order | 0))
    this.bstride = 2 * MAX_ORDER + 2
    this.binom = binomTable(this.bstride)
    this.spread = spreadTable(MAX_DEPTH)
    this.lists = interactionLists()
    this.kmat = new Float64Array(K_SPAN * K_SPAN * this.p * this.p * 2)
    this.kLive = new Uint8Array(K_SPAN * K_SPAN)
    for (let l = 0; l <= MAX_DEPTH; l++) {
      this.mp.push(null)
      this.lc.push(null)
      this.gxOf.push(null)
      this.gyOf.push(null)
    }
  }

  /** Allocate coefficient + coordinate tables for every level up to `depth`. */
  private ensureDepth(depth: number): void {
    const p2 = this.p * 2
    for (let l = 0; l <= depth; l++) {
      if (this.mp[l]) continue
      const cells = 1 << (2 * l)
      this.mp[l] = new Float64Array(cells * p2)
      this.lc[l] = new Float64Array(cells * p2)
      const gx = new Uint16Array(cells)
      const gy = new Uint16Array(cells)
      const side = 1 << l
      for (let y = 0; y < side; y++) {
        for (let x = 0; x < side; x++) {
          const c = this.spread[x] | (this.spread[y] << 1)
          gx[c] = x
          gy[c] = y
        }
      }
      this.gxOf[l] = gx
      this.gyOf[l] = gy
    }
  }

  private ensureN(n: number): void {
    if (this.perm.length >= n) return
    const cap = Math.max(n, (this.perm.length * 2) | 0, 1024)
    this.perm = new Uint32Array(cap)
    this.codeOf = new Uint32Array(cap)
  }

  /**
   * Bin `n` particles into leaf cells and produce the sort permutation.
   *
   * The caller is expected to physically permute its particle arrays with
   * {@link applyPerm} before calling {@link build}: keeping the whole particle
   * state Morton-ordered turns every subsequent pass — P2M, P2P, L2P — into a
   * linear scan of contiguous memory, which is worth far more than the sort
   * costs. It also means the ordering is already almost correct next frame.
   *
   * @returns the permutation, `perm[sortedSlot] = originalIndex`.
   */
  sort(x: Float32Array, y: Float32Array, n: number, depth: number): Uint32Array {
    depth = Math.max(2, Math.min(MAX_DEPTH, depth | 0))
    this.depth = depth
    this.n = n
    this.ensureDepth(depth)
    this.ensureN(n)

    const cells = 1 << (2 * depth)
    if (this.cellStart.length < cells + 1) {
      this.cellStart = new Uint32Array(cells + 1)
      this.cursor = new Uint32Array(cells + 1)
    }
    const { cellStart, cursor, spread, codeOf, perm } = this
    cellStart.fill(0, 0, cells + 1)

    const side = 1 << depth
    const x0 = this.boxCx - this.boxHalf
    const y0 = this.boxCy - this.boxHalf
    const scale = side / (2 * this.boxHalf)
    const top = side - 1

    for (let i = 0; i < n; i++) {
      // Clamp before truncating: escapers land in the border cells rather than
      // out of bounds. Their forces are then slightly wrong, which is exactly
      // the right trade for a handful of particles already leaving the system.
      let fx = (x[i] - x0) * scale
      let fy = (y[i] - y0) * scale
      fx = fx > 0 ? (fx > top ? top : fx) : 0
      fy = fy > 0 ? (fy > top ? top : fy) : 0
      const code = spread[fx | 0] | (spread[fy | 0] << 1)
      codeOf[i] = code
      cellStart[code + 1]++
    }
    for (let c = 0; c < cells; c++) {
      cellStart[c + 1] += cellStart[c]
      cursor[c] = cellStart[c]
    }
    for (let i = 0; i < n; i++) perm[cursor[codeOf[i]]++] = i

    this.stats.cells = cells
    return perm
  }

  /**
   * Build every expansion in the tree. `x`, `y`, `m` must already be in the
   * order produced by {@link sort}.
   */
  build(x: Float32Array, y: Float32Array, m: Float32Array): void {
    this.p2m(x, y, m)
    this.m2m()
    this.m2lSweep()
    this.l2l()
  }

  /** Leaf multipoles, straight from the particles in each bucket. */
  private p2m(x: Float32Array, y: Float32Array, m: Float32Array): void {
    const { depth, p, cellStart } = this
    const M = this.mp[depth]!
    const gxOf = this.gxOf[depth]!
    const gyOf = this.gyOf[depth]!
    M.fill(0)

    const cells = 1 << (2 * depth)
    const h = (2 * this.boxHalf) / (1 << depth)
    const x0 = this.boxCx - this.boxHalf
    const y0 = this.boxCy - this.boxHalf
    const p2 = p * 2

    for (let c = 0; c < cells; c++) {
      const s = cellStart[c]
      const e = cellStart[c + 1]
      if (s === e) continue
      const cx = x0 + (gxOf[c] + 0.5) * h
      const cy = y0 + (gyOf[c] + 0.5) * h
      const o = c * p2
      for (let k = s; k < e; k++) {
        const mk = m[k]
        const zr = x[k] - cx
        const zi = y[k] - cy
        // running power (z_j - z_c)^k, accumulated with mass
        let pr = mk
        let pi = 0
        for (let t = 0; t < p; t++) {
          M[o + t * 2] += pr
          M[o + t * 2 + 1] += pi
          const nr = pr * zr - pi * zi
          pi = pr * zi + pi * zr
          pr = nr
        }
      }
    }
  }

  /** Roll multipoles up the tree, level by level. */
  private m2m(): void {
    const { p, binom, bstride } = this
    const p2 = p * 2
    for (let l = this.depth - 1; l >= 2; l--) {
      const child = this.mp[l + 1]!
      const parent = this.mp[l]!
      parent.fill(0)
      const hc = (2 * this.boxHalf) / (1 << (l + 1))
      const q = hc * 0.5

      // d = childCentre - parentCentre, one of four corner offsets. Its powers
      // are shared by every cell at this level, so hoist them.
      const dpow = new Float64Array(4 * p * 2)
      for (let k = 0; k < 4; k++) {
        const dr = (k & 1 ? q : -q)
        const di = (k & 2 ? q : -q)
        let pr = 1
        let pi = 0
        for (let t = 0; t < p; t++) {
          dpow[(k * p + t) * 2] = pr
          dpow[(k * p + t) * 2 + 1] = pi
          const nr = pr * dr - pi * di
          pi = pr * di + pi * dr
          pr = nr
        }
      }

      const pcells = 1 << (2 * l)
      for (let pc = 0; pc < pcells; pc++) {
        const po = pc * p2
        for (let k = 0; k < 4; k++) {
          const co = (4 * pc + k) * p2
          if (child[co] === 0 && child[co + 1] === 0) continue // empty subtree
          const dbase = k * p * 2
          for (let t = 0; t < p; t++) {
            let ar = 0
            let ai = 0
            for (let i = 0; i <= t; i++) {
              const b = binom[t * bstride + i]
              const dr = dpow[dbase + (t - i) * 2]
              const di = dpow[dbase + (t - i) * 2 + 1]
              const mr = child[co + i * 2]
              const mi = child[co + i * 2 + 1]
              ar += b * (dr * mr - di * mi)
              ai += b * (dr * mi + di * mr)
            }
            parent[po + t * 2] += ar
            parent[po + t * 2 + 1] += ai
          }
        }
      }
    }
  }

  /**
   * Cache the M2L coefficient matrix for one source offset at the current cell
   * size. Each of the ≤27 distinct offsets is used by (almost) every cell at
   * the level, so building the p×p matrix once per offset per level turns the
   * translation itself into a division-free matrix-vector product.
   */
  private kbuild(dx: number, dy: number, h: number): number {
    const slot = kSlot(dx, dy)
    const base = slot * this.p * this.p * 2
    if (this.kLive[slot]) return base
    const { p, binom, bstride, kmat } = this

    // δ = targetCentre - sourceCentre; the source sits at +(dx, dy) cells.
    const dr = -dx * h
    const di = -dy * h
    const inv = 1 / (dr * dr + di * di)
    const ir = dr * inv
    const ii = -di * inv // 1/δ

    // δ^-(k+l+1) for exponents 1 .. 2p-1
    const pw = new Float64Array(2 * p * 2)
    let cr = ir
    let ci = ii
    for (let e = 1; e <= 2 * p - 1; e++) {
      pw[e * 2] = cr
      pw[e * 2 + 1] = ci
      const nr = cr * ir - ci * ii
      ci = cr * ii + ci * ir
      cr = nr
    }

    for (let l = 0; l < p; l++) {
      const sign = l & 1 ? -1 : 1
      for (let k = 0; k < p; k++) {
        const coef = sign * binom[(k + l) * bstride + l]
        const e = (k + l + 1) * 2
        const o = base + (l * p + k) * 2
        kmat[o] = coef * pw[e]
        kmat[o + 1] = coef * pw[e + 1]
      }
    }
    this.kLive[slot] = 1
    return base
  }

  /** The flip, at every level from 2 down to the leaves. */
  private m2lSweep(): void {
    const { p, kmat, spread, lists } = this
    const p2 = p * 2
    this.stats.translations = 0

    for (let l = 2; l <= this.depth; l++) {
      const M = this.mp[l]!
      const L = this.lc[l]!
      const gxOf = this.gxOf[l]!
      const gyOf = this.gyOf[l]!
      L.fill(0)
      this.kLive.fill(0) // cell size changed → rebuild coefficients lazily

      const side = 1 << l
      const cells = side * side
      const h = (2 * this.boxHalf) / side
      let translations = 0

      for (let c = 0; c < cells; c++) {
        const co = c * p2
        // An empty *target* cell has no particles to evaluate a local expansion
        // at, and — since emptiness is inherited downward — no descendants that
        // do either. Skipping it is what makes a deep tree affordable over a
        // clustered universe: the cost then follows the occupied cells, which
        // grow like the structure, rather than 4^depth, which does not. This is
        // most of what adaptive FMM buys, for one comparison per cell.
        if (M[co] === 0 && M[co + 1] === 0) continue
        const gx = gxOf[c]
        const gy = gyOf[c]
        const list = lists[((gy & 1) << 1) | (gx & 1)]

        for (let e = 0; e < list.length; e += 2) {
          const sx = gx + list[e]
          const sy = gy + list[e + 1]
          if (sx < 0 || sx >= side || sy < 0 || sy >= side) continue
          const bo = (spread[sx] | (spread[sy] << 1)) * p2
          // M_0 is the cell's total mass: zero means an empty subtree, and in a
          // clustered universe most of the tree is empty. This one test is the
          // difference between balanced FMM being wasteful and being fast.
          if (M[bo] === 0 && M[bo + 1] === 0) continue

          const kb = this.kbuild(list[e], list[e + 1], h)
          translations++
          for (let li = 0; li < p; li++) {
            let ar = 0
            let ai = 0
            const ko = kb + li * p * 2
            for (let k = 0; k < p; k++) {
              const kr = kmat[ko + k * 2]
              const ki = kmat[ko + k * 2 + 1]
              const mr = M[bo + k * 2]
              const mi = M[bo + k * 2 + 1]
              ar += kr * mr - ki * mi
              ai += kr * mi + ki * mr
            }
            L[co + li * 2] += ar
            L[co + li * 2 + 1] += ai
          }
        }
      }
      this.stats.translations += translations
    }
  }

  /** Push local expansions down to the children. */
  private l2l(): void {
    const { p, binom, bstride } = this
    const p2 = p * 2
    for (let l = 2; l < this.depth; l++) {
      const parent = this.lc[l]!
      const child = this.lc[l + 1]!
      const hc = (2 * this.boxHalf) / (1 << (l + 1))
      const q = hc * 0.5

      // d = childCentre - parentCentre, same four corners as M2M.
      const dpow = new Float64Array(4 * p * 2)
      for (let k = 0; k < 4; k++) {
        const dr = (k & 1 ? q : -q)
        const di = (k & 2 ? q : -q)
        let pr = 1
        let pi = 0
        for (let t = 0; t < p; t++) {
          dpow[(k * p + t) * 2] = pr
          dpow[(k * p + t) * 2 + 1] = pi
          const nr = pr * dr - pi * di
          pi = pr * di + pi * dr
          pr = nr
        }
      }

      const pcells = 1 << (2 * l)
      const mask = this.mp[l]!
      for (let pc = 0; pc < pcells; pc++) {
        const po = pc * p2
        // Same emptiness test as the M2L sweep: no mass beneath this cell means
        // no descendant will ever evaluate the local expansion we would be
        // pushing down to it.
        if (mask[po] === 0 && mask[po + 1] === 0) continue
        for (let k = 0; k < 4; k++) {
          const co = (4 * pc + k) * p2
          const dbase = k * p * 2
          for (let i = 0; i < p; i++) {
            let ar = 0
            let ai = 0
            for (let t = i; t < p; t++) {
              const b = binom[t * bstride + i]
              const dr = dpow[dbase + (t - i) * 2]
              const di = dpow[dbase + (t - i) * 2 + 1]
              const lr = parent[po + t * 2]
              const li2 = parent[po + t * 2 + 1]
              ar += b * (dr * lr - di * li2)
              ai += b * (dr * li2 + di * lr)
            }
            child[co + i * 2] += ar
            child[co + i * 2 + 1] += ai
          }
        }
      }
    }
  }

  /**
   * Accelerations for the mass particles themselves: the smooth far field from
   * the leaf's local expansion, plus a direct sum over the nine-cell near
   * neighbourhood. Arrays are in {@link sort} order; results are written in the
   * same order.
   *
   * `eps2` is a squared Plummer softening length. Note that 2D gravity needs no
   * square root at all — the 1/r force with a 1/r direction vector is just
   * `(dx, dy) / r²` — which makes this inner loop unusually cheap.
   */
  evalMasses(
    x: Float32Array,
    y: Float32Array,
    m: Float32Array,
    ax: Float32Array,
    ay: Float32Array,
    G: number,
    eps2: number,
  ): void {
    const { depth, p, cellStart, spread } = this
    const L = this.lc[depth]!
    const gxOf = this.gxOf[depth]!
    const gyOf = this.gyOf[depth]!
    const side = 1 << depth
    const cells = side * side
    const h = (2 * this.boxHalf) / side
    const x0 = this.boxCx - this.boxHalf
    const y0 = this.boxCy - this.boxHalf
    const p2 = p * 2
    const nb = new Uint32Array(18) // up to 9 [start, end) ranges
    let nearPairs = 0

    for (let c = 0; c < cells; c++) {
      const s = cellStart[c]
      const e = cellStart[c + 1]
      if (s === e) continue
      const gx = gxOf[c]
      const gy = gyOf[c]
      const ccx = x0 + (gx + 0.5) * h
      const ccy = y0 + (gy + 0.5) * h
      const co = c * p2

      // Gather the near neighbourhood once per cell, not once per particle.
      let nn = 0
      for (let dy = -1; dy <= 1; dy++) {
        const sy = gy + dy
        if (sy < 0 || sy >= side) continue
        for (let dx = -1; dx <= 1; dx++) {
          const sx = gx + dx
          if (sx < 0 || sx >= side) continue
          const b = spread[sx] | (spread[sy] << 1)
          const bs = cellStart[b]
          const be = cellStart[b + 1]
          if (bs === be) continue
          nb[nn++] = bs
          nb[nn++] = be
        }
      }

      for (let i = s; i < e; i++) {
        const xi = x[i]
        const yi = y[i]

        // L2P — Horner over the local expansion.
        const ur = xi - ccx
        const ui = yi - ccy
        let fr = L[co + (p - 1) * 2]
        let fi = L[co + (p - 1) * 2 + 1]
        for (let t = p - 2; t >= 0; t--) {
          const nr = fr * ur - fi * ui + L[co + t * 2]
          fi = fr * ui + fi * ur + L[co + t * 2 + 1]
          fr = nr
        }
        // a = -G · conj(f)
        let axi = -G * fr
        let ayi = G * fi

        // P2P over the near field.
        for (let r = 0; r < nn; r += 2) {
          const be = nb[r + 1]
          for (let j = nb[r]; j < be; j++) {
            const dx = x[j] - xi
            const dy = y[j] - yi
            const r2 = dx * dx + dy * dy + eps2
            const w = (G * m[j]) / r2
            axi += dx * w
            ayi += dy * w
          }
          nearPairs += be - nb[r]
        }
        // j === i contributed dx = dy = 0, i.e. nothing — no branch needed.

        ax[i] = axi
        ay[i] = ayi
      }
    }
    this.stats.nearPairs = nearPairs
  }

  /**
   * Accelerations for massless tracers: the leaf local expansion only.
   *
   * A tracer costs one Morton lookup and p complex multiply-adds — roughly a
   * tenth of a mass particle — because it contributes no multipole and needs no
   * near-field sum. It therefore samples the *smooth* field: correct at every
   * scale above one leaf cell, and blind to the granular scattering inside one.
   * For dust tracing the large-scale flow that is not a compromise, it is the
   * physically right answer.
   */
  evalTracers(
    x: Float32Array,
    y: Float32Array,
    n: number,
    ax: Float32Array,
    ay: Float32Array,
    G: number,
  ): void {
    const { depth, p, spread } = this
    const L = this.lc[depth]!
    const gxOf = this.gxOf[depth]!
    const gyOf = this.gyOf[depth]!
    const side = 1 << depth
    const h = (2 * this.boxHalf) / side
    const x0 = this.boxCx - this.boxHalf
    const y0 = this.boxCy - this.boxHalf
    const scale = side / (2 * this.boxHalf)
    const top = side - 1
    const p2 = p * 2

    for (let i = 0; i < n; i++) {
      const xi = x[i]
      const yi = y[i]
      let fx = (xi - x0) * scale
      let fy = (yi - y0) * scale
      fx = fx > 0 ? (fx > top ? top : fx) : 0
      fy = fy > 0 ? (fy > top ? top : fy) : 0
      const gx = fx | 0
      const gy = fy | 0
      const co = ((spread[gx] | (spread[gy] << 1)) * p2)

      const ur = xi - (x0 + (gx + 0.5) * h)
      const ui = yi - (y0 + (gy + 0.5) * h)
      let fr = L[co + (p - 1) * 2]
      let fi = L[co + (p - 1) * 2 + 1]
      for (let t = p - 2; t >= 0; t--) {
        const nr = fr * ur - fi * ui + L[co + t * 2]
        fi = fr * ui + fi * ur + L[co + t * 2 + 1]
        fr = nr
      }
      ax[i] = -G * fr
      ay[i] = G * fi
    }
  }

  /**
   * Mass and centre of mass of a leaf cell, read straight off its multipole.
   *
   * No extra pass is needed for this: M₀ *is* the cell's total mass, and M₁/M₀
   * *is* the offset of its centre of mass from the cell centre — the monopole
   * and the dipole, both already computed by P2M. Halo finding therefore comes
   * free with the force solve, which is what lets the event layer above (where
   * quasars light up and starbursts fire) run on real local density rather than
   * on a decorative approximation of it.
   *
   * @returns the cell's mass; `out` receives its centre of mass.
   */
  leafCom(c: number, out: { x: number; y: number }): number {
    const p2 = this.p * 2
    const L = this.mp[this.depth]!
    const o = c * p2
    const m = L[o]
    if (m <= 0) {
      out.x = 0
      out.y = 0
      return 0
    }
    const side = 1 << this.depth
    const h = (2 * this.boxHalf) / side
    const gx = this.gxOf[this.depth]![c]
    const gy = this.gyOf[this.depth]![c]
    // M₁ is complex; its real and imaginary parts are the x and y moments.
    out.x = this.boxCx - this.boxHalf + (gx + 0.5) * h + L[o + 2] / m
    out.y = this.boxCy - this.boxHalf + (gy + 0.5) * h + L[o + 3] / m
    return m
  }

  /** Gate lookup so the enclosing tree extent can be set before {@link sort}. */
  setBox(cx: number, cy: number, half: number): void {
    this.boxCx = cx
    this.boxCy = cy
    this.boxHalf = half > 1e-9 ? half : 1e-9
  }
}

/** Reorder `src` into `dst` by a permutation from {@link Fmm.sort}. */
export function applyPerm(
  src: Float32Array,
  dst: Float32Array,
  perm: Uint32Array,
  n: number,
): void {
  for (let i = 0; i < n; i++) dst[i] = src[perm[i]]
}

/**
 * Choose a tree depth so that leaves hold roughly `occupancy` particles each.
 *
 * The balance is the whole cost model: shallower trees mean fewer M2L
 * translations (O(4^depth · 27 · p²)) but more near-field pairs (O(N · 9 · s));
 * deeper trees the reverse. Differentiating gives an optimum around s ≈ 8–16
 * for the orders we use, and the curve is flat enough there that rounding to a
 * power of four costs nothing.
 */
export function chooseDepth(n: number, occupancy = 12): number {
  const d = Math.round(Math.log2(Math.max(1, n / occupancy)) / 2)
  return Math.max(2, Math.min(MAX_DEPTH, d))
}

/**
 * O(N²) reference solver — the thing FMM exists to avoid. Used by
 * `scripts/test-fmm.ts` to measure the approximation error, and never shipped
 * to the hot path.
 */
export function directAccel(
  x: Float32Array,
  y: Float32Array,
  m: Float32Array,
  n: number,
  ax: Float32Array,
  ay: Float32Array,
  G: number,
  eps2: number,
): void {
  for (let i = 0; i < n; i++) {
    let axi = 0
    let ayi = 0
    const xi = x[i]
    const yi = y[i]
    for (let j = 0; j < n; j++) {
      if (j === i) continue
      const dx = x[j] - xi
      const dy = y[j] - yi
      const r2 = dx * dx + dy * dy + eps2
      const w = (G * m[j]) / r2
      axi += dx * w
      ayi += dy * w
    }
    ax[i] = axi
    ay[i] = ayi
  }
}
