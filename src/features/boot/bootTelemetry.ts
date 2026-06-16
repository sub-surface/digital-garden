import { SeededRNG } from "./bootRng"
import { mixSeed } from "./bootSeed"

const SPARKS = " ⡀⡄⡆⡇⣇⣧⣷⣿"

export let activeScopeMode: "auto" | 0 | 1 | 2 = "auto"

export function setScopeMode(mode: "auto" | 0 | 1 | 2): void {
  activeScopeMode = mode
}

export interface TelemetryProcess {
  pid: number
  name: string
  cpu: string
  memory: string
  state: "run" | "sleep" | "wait"
}

export interface BootTelemetrySnapshot {
  tick: number
  scopeRows: readonly string[]
  scopeFrequency: string
  scopeVoltage: string
  scopeTrigger: string
  rxHistory: string
  txHistory: string
  rxRate: string
  txRate: string
  packetLoss: string
  peerCount: number
  route: string
  loadAverage: string
  temperature: string
  uptime: string
  processes: readonly TelemetryProcess[]
  phaseCode: string
  /** Small ASCII node-link mesh for the net pane, animated by tick. */
  networkRows: readonly string[]
}

function sparkline(values: readonly number[]): string {
  const maximum = Math.max(1, ...values)
  return values
    .map((value) => {
      const index = Math.min(
        SPARKS.length - 1,
        Math.floor((value / maximum) * (SPARKS.length - 1)),
      )
      return SPARKS[index]
    })
    .join("")
}

function makeSeries(rng: SeededRNG, count: number, floor: number, ceiling: number): number[] {
  const values: number[] = []
  let current = rng.int(floor, ceiling)

  for (let index = 0; index < count; index += 1) {
    const drift = rng.int(-Math.max(1, Math.floor(ceiling * 0.12)), Math.max(1, Math.floor(ceiling * 0.12)))
    current = Math.max(floor, Math.min(ceiling, current + drift))
    if (rng.chance(0.08)) current = rng.int(Math.floor(ceiling * 0.55), ceiling)
    values.push(current)
  }

  return values
}

function drawScope(
  rng: SeededRNG,
  width: number,
  height: number,
  tick: number,
): string[] {
  let mode: number
  if (activeScopeMode === "auto") {
    mode = Math.floor(tick / 250) % 3
  } else {
    mode = activeScopeMode
  }

  const safeWidth = Math.max(12, width)
  const safeHeight = Math.max(5, height)
  const pxW = safeWidth * 2
  const pxH = safeHeight * 4
  const grid = Array.from({ length: safeHeight }, () => new Uint8Array(safeWidth))
  const DOTS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]]
  
  if (mode === 0) {
    // Oscilloscope
    for (let y = 0; y < pxH; y++) {
      for (let x = 0; x < pxW; x++) {
        if (x % 8 === 0 && y % 8 === 0) grid[Math.floor(y / 4)][Math.floor(x / 2)] |= DOTS[y % 4][x % 2]
      }
    }
    const t = tick * 0.15
    let amplitudeScale = 0.8
    if (typeof window !== "undefined" && (window.performance as any)?.memory) {
      const mem = (window.performance as any).memory
      amplitudeScale = Math.min(1, Math.max(0.2, mem.usedJSHeapSize / mem.jsHeapSizeLimit))
    }
    const ampX = (pxW / 2 - 2)
    const ampY = (pxH / 2 - 2) * amplitudeScale

    for (let i = 0; i < 120; i++) {
      const pt = t + i * 0.05
      const x = Math.floor((pxW / 2) + Math.sin(pt * 1.3) * ampX)
      const y = Math.floor((pxH / 2) + Math.sin(pt * 2.1) * ampY)
      if (x >= 0 && x < pxW && y >= 0 && y < pxH) {
        grid[Math.floor(y / 4)][Math.floor(x / 2)] |= DOTS[y % 4][x % 2]
      }
    }
    for (let i = 0; i < 60; i++) {
      const pt = t * 1.5 + i * 0.08
      const x = Math.floor((pxW / 2) + Math.cos(pt * 3.7) * (ampX * 0.6))
      const y = Math.floor((pxH / 2) + Math.sin(pt * 4.2) * (ampY * 0.6) + (rng.float()-0.5)*4)
      if (x >= 0 && x < pxW && y >= 0 && y < pxH) {
        grid[Math.floor(y / 4)][Math.floor(x / 2)] |= DOTS[y % 4][x % 2]
      }
    }
  } else if (mode === 1) {
    // Globe
    const cx = pxW / 2; const cy = pxH / 2
    const radius = Math.min(pxW / 2, pxH / 2) - 1
    const t = tick * 0.05
    for (let i = -radius; i <= radius; i++) {
      for (let j = -radius; j <= radius; j++) {
        if (i * i + j * j <= radius * radius) {
          const z = Math.sqrt(radius * radius - i * i - j * j)
          const lat = Math.asin(j / radius)
          const lon = Math.atan2(i, z) - t
          const land = Math.sin(lat * 3.5) + Math.cos(lon * 4.5) + Math.sin(lat * 4 + lon * 2) > 0.6
          const isEdge = i * i + j * j > (radius - 1) * (radius - 1)
          if (land || isEdge) {
            const x = Math.floor(cx + i * 1.6) // aspect ratio stretch
            const y = Math.floor(cy + j)
            if (x >= 0 && x < pxW && y >= 0 && y < pxH) {
              grid[Math.floor(y / 4)][Math.floor(x / 2)] |= DOTS[y % 4][x % 2]
            }
          }
        }
      }
    }
  } else {
    // Radar (Full Elliptical)
    const cx = pxW / 2; const cy = pxH / 2
    const rx = (pxW / 2) - 1
    const ry = (pxH / 2) - 1
    const t = (tick * 0.05) % (Math.PI * 2)
    
    for (let sy = 0; sy < pxH; sy++) {
       for (let sx = 0; sx < pxW; sx++) {
          const dx = sx - cx
          const dy = sy - cy
          // Normalized distance for ellipse (0 to 1)
          const dist = Math.hypot(dx / rx, dy / ry)
          if (dist > 1.0) continue
          
          let draw = false
          // Crosshairs
          if ((Math.abs(dx) < 1.0 || Math.abs(dy) < 1.0) && Math.floor(dist * 20) % 4 === 0) draw = true 
          
          if (Math.abs(dist - 0.33) < 0.03 || Math.abs(dist - 0.66) < 0.03 || Math.abs(dist - 1.0) < 0.03) {
             if (Math.floor(Math.atan2(dy, dx) * 10) % 2 === 0) draw = true 
          }

          let angle = Math.atan2(dy, dx)
          if (angle < 0) angle += Math.PI * 2
          let sweepDiff = t - angle
          if (sweepDiff < 0) sweepDiff += Math.PI * 2
          
          if (sweepDiff < 0.1) draw = true 
          else if (sweepDiff < 1.0 && rng.chance(1 - sweepDiff)) draw = true 

          if (draw) grid[Math.floor(sy / 4)][Math.floor(sx / 2)] |= DOTS[sy % 4][sx % 2]
       }
    }
    
    for (let i = 0; i < 4; i++) {
       const targetT = tick * 0.02 + i * 100
       const tx = Math.sin(targetT * 0.3 + i) * rx * 0.8
       const ty = Math.cos(targetT * 0.4 + i * 2) * ry * 0.8
       let angle = Math.atan2(ty, tx)
       if (angle < 0) angle += Math.PI * 2
       let sweepDiff = t - angle
       if (sweepDiff < 0) sweepDiff += Math.PI * 2
       
       if (sweepDiff < 1.5) {
          const sx = Math.floor(cx + tx)
          const sy = Math.floor(cy + ty)
          if (sx >= 0 && sx < pxW && sy >= 0 && sy < pxH) {
             grid[Math.floor(sy / 4)][Math.floor(sx / 2)] |= DOTS[sy % 4][sx % 2]
             if (sx+1 < pxW) grid[Math.floor(sy / 4)][Math.floor((sx+1) / 2)] |= DOTS[sy % 4][(sx+1) % 2]
          }
       }
    }
  }

  return grid.map((row) => 
    Array.from(row, (mask) => mask === 0 ? " " : String.fromCharCode(0x2800 + mask)).join("")
  )
}

/**
 * A small node-link mesh rendered to ASCII. Node positions are seeded (stable
 * for a given seed), links connect nearby nodes, and a pulse travels along the
 * edges driven by `tick` so the mesh reads as a live network. O(nodes²) for
 * link-finding + O(cells) raster on a ~tiny grid — cheap.
 */
function drawNetwork(
  rng: SeededRNG,
  width: number,
  height: number,
  tick: number,
): string[] {
  const W = Math.max(16, width)
  const H = Math.max(5, height)
  const grid = Array.from({ length: H }, () => new Uint8Array(W))

  const nodeCount = Math.min(7, Math.max(4, Math.floor(W / 6)))
  const nodes: { x: number; y: number }[] = []
  let guard = 0
  while (nodes.length < nodeCount && guard++ < 200) {
    const x = rng.int(1, W - 2)
    const y = rng.int(0, H - 1)
    // keep nodes from overlapping
    if (nodes.some((n) => Math.abs(n.x - x) < 3 && Math.abs(n.y - y) < 2)) continue
    nodes.push({ x, y })
  }

  // links: connect each node to its 1-2 nearest neighbours
  const links: { a: number; b: number; pts: { x: number; y: number }[] }[] = []
  for (let i = 0; i < nodes.length; i++) {
    const dists = nodes
      .map((n, j) => ({ j, d: Math.hypot(n.x - nodes[i].x, n.y - nodes[i].y) }))
      .filter((o) => o.j !== i)
      .sort((p, q) => p.d - q.d)
    const k = rng.chance(0.5) ? 2 : 1
    for (const { j } of dists.slice(0, k)) {
      if (!links.some((l) => (l.a === i && l.b === j) || (l.a === j && l.b === i))) {
        // Orthogonal (Manhattan) pathfinding
        const A = nodes[i], B = nodes[j]
        const pts: { x: number; y: number }[] = []
        let { x, y } = A
        pts.push({ x, y })
        const horizFirst = rng.chance(0.5)
        if (horizFirst) {
          const sx = A.x < B.x ? 1 : -1
          while (x !== B.x) { x += sx; pts.push({ x, y }) }
          const sy = A.y < B.y ? 1 : -1
          while (y !== B.y) { y += sy; pts.push({ x, y }) }
        } else {
          const sy = A.y < B.y ? 1 : -1
          while (y !== B.y) { y += sy; pts.push({ x, y }) }
          const sx = A.x < B.x ? 1 : -1
          while (x !== B.x) { x += sx; pts.push({ x, y }) }
        }
        
        // Burn path into bitmask grid
        // 1=UP, 2=RIGHT, 4=DOWN, 8=LEFT
        for (let p = 0; p < pts.length - 1; p++) {
          const curr = pts[p], next = pts[p+1]
          if (next.x > curr.x) { grid[curr.y][curr.x] |= 2; grid[next.y][next.x] |= 8 }
          else if (next.x < curr.x) { grid[curr.y][curr.x] |= 8; grid[next.y][next.x] |= 2 }
          else if (next.y > curr.y) { grid[curr.y][curr.x] |= 4; grid[next.y][next.x] |= 1 }
          else if (next.y < curr.y) { grid[curr.y][curr.x] |= 1; grid[next.y][next.x] |= 4 }
        }
        links.push({ a: i, b: j, pts })
      }
    }
  }

  // Map bitmask to elegant box drawing characters
  const BOX = [" ", "╵", "╶", "└", "╷", "│", "┌", "├", "╴", "┘", "─", "┴", "┐", "┤", "┬", "┼"]
  const charGrid = grid.map((row) => Array.from(row, (mask) => BOX[mask]))

  // Pulses
  links.forEach((l, li) => {
    if (l.pts.length < 2) return
    const pulse = Math.floor((tick * 0.7 + li * 2)) % l.pts.length
    const p = l.pts[pulse]
    if (charGrid[p.y][p.x] !== " ") {
      charGrid[p.y][p.x] = "•"
    }
  })

  // Nodes on top
  nodes.forEach((n, i) => {
    charGrid[n.y][n.x] = i === 0 ? "◉" : "◇"
  })

  return charGrid.map((row) => row.join(""))
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
}

function compactPhase(value: string): string {
  const cleaned = value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return cleaned.slice(0, 18) || "IDLE"
}

export function buildBootTelemetry(
  seed: number,
  epoch: number,
  tick: number,
  phaseLabel: string,
  narrow = false,
): BootTelemetrySnapshot {
  // `tick` advances at half the line rate (see caller) so telemetry repaints
  // every other line — cheaper, and visually indistinguishable.
  const emittedCount = tick * 2
  const rng = new SeededRNG(mixSeed(seed, `telemetry:${epoch}:${tick}`))
  const seriesLength = narrow ? 18 : 28

  let downlink = 10
  let rtt = 50
  if (typeof navigator !== "undefined" && (navigator as any).connection) {
    downlink = (navigator as any).connection.downlink || 10
    rtt = (navigator as any).connection.rtt || 50
  }
  const rxLimit = Math.max(10, Math.floor(downlink * 10))
  const txLimit = Math.max(10, Math.floor(1000 / rtt))

  const rx = makeSeries(rng.fork("rx"), seriesLength, 8, rxLimit)
  const tx = makeSeries(rng.fork("tx"), seriesLength, 4, txLimit)
  const scopeRng = rng.fork("scope")
  const scopeRows = drawScope(scopeRng, narrow ? 24 : 34, narrow ? 6 : 8, tick)
  const networkRows = drawNetwork(rng.fork("netmap"), narrow ? 32 : 44, narrow ? 6 : 8, tick)
  const processNames = [
    "graph-weaver",
    "mothkeeper",
    "rain-catcher",
    "note-indexer",
    "cursor-herd",
    "dream-sweeper",
    "light-parser",
    "void-mapper",
    "dust-collector",
    "echo-chamber",
    "timer-drift",
    "signal-tap",
    "logic-gate",
    "shadow-proc"
  ] as const

  const processes = rng
    .shuffle(processNames)
    .slice(0, 14)
    .map((name, index): TelemetryProcess => ({
      pid: rng.int(12, 640),
      name,
      cpu: `${(rng.int(1, index === 0 ? 84 : 28) / 10).toFixed(1)}%`,
      memory: `${rng.int(6, 164)}M`,
      state: index === 0 ? "run" : rng.pick(["sleep", "sleep", "wait"] as const),
    }))

  const routeA = rng.int(1, 223)
  const routeB = rng.int(1, 223)
  const uptimeSeconds = epoch * 311 + emittedCount * 3 + rng.int(0, 59)

  return {
    tick,
    scopeRows,
    scopeFrequency: `${(rng.int(52, 164) / 10).toFixed(1)} Hz`,
    scopeVoltage: `${(rng.int(18, 84) / 10).toFixed(1)} mV`,
    scopeTrigger: rng.pick(["AUTO", "RISING", "FALLING"] as const),
    rxHistory: sparkline(rx),
    txHistory: sparkline(tx),
    rxRate: `${rx[rx.length - 1].toString().padStart(2, "0")}.${rng.int(0, 9)} kB/s`,
    txRate: `${tx[tx.length - 1].toString().padStart(2, "0")}.${rng.int(0, 9)} kB/s`,
    packetLoss: `${(rng.int(0, 12) / 100).toFixed(2)}%`,
    peerCount: rng.int(3, 11),
    route: `192.0.2.${routeA} → 203.0.113.${routeB}`,
    loadAverage: `${(rng.int(6, 74) / 100).toFixed(2)} ${(rng.int(4, 62) / 100).toFixed(2)} ${(rng.int(2, 48) / 100).toFixed(2)}`,
    temperature: `${rng.int(34, 57)}°C`,
    uptime: formatDuration(uptimeSeconds),
    processes,
    phaseCode: compactPhase(phaseLabel),
    networkRows,
  }
}
