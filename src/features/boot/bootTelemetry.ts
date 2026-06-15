import { SeededRNG } from "./bootRng"
import { mixSeed } from "./bootSeed"

const SPARKS = "▁▂▃▄▅▆▇█"

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
  const safeWidth = Math.max(12, width)
  const safeHeight = Math.max(5, height)
  const rows = Array.from({ length: safeHeight }, () =>
    Array.from({ length: safeWidth }, () => " "),
  )
  const centre = Math.floor(safeHeight / 2)
  const amplitude = Math.max(1, Math.floor((safeHeight - 2) / 2))
  const frequency = rng.int(2, 5)
  const phase = (tick % safeWidth) / safeWidth * Math.PI * 2
  let previousY = centre

  for (let x = 0; x < safeWidth; x += 1) {
    if (rows[centre][x] === " ") rows[centre][x] = x % 2 === 0 ? "·" : " "

    const fundamental = Math.sin((x / safeWidth) * Math.PI * 2 * frequency + phase)
    const harmonic = Math.sin((x / safeWidth) * Math.PI * 2 * (frequency + 1) - phase * 0.35) * 0.22
    const noise = (rng.float() - 0.5) * 0.18
    const sample = Math.max(-1, Math.min(1, fundamental * 0.78 + harmonic + noise))
    const y = Math.max(0, Math.min(safeHeight - 1, centre - Math.round(sample * amplitude)))

    if (x > 0 && Math.abs(y - previousY) > 1) {
      const from = Math.min(y, previousY) + 1
      const to = Math.max(y, previousY)
      for (let bridge = from; bridge < to; bridge += 1) {
        rows[bridge][x] = "│"
      }
    }

    rows[y][x] = y === previousY ? "─" : y < previousY ? "╭" : "╰"
    previousY = y
  }

  return rows.map((row) => row.join(""))
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
  emittedCount: number,
  phaseLabel: string,
  narrow = false,
): BootTelemetrySnapshot {
  const tick = Math.floor(emittedCount / 2)
  const rng = new SeededRNG(mixSeed(seed, `telemetry:${epoch}:${tick}`))
  const seriesLength = narrow ? 18 : 28
  const rx = makeSeries(rng.fork("rx"), seriesLength, 8, 98)
  const tx = makeSeries(rng.fork("tx"), seriesLength, 4, 72)
  const scopeRng = rng.fork("scope")
  const scopeRows = drawScope(scopeRng, narrow ? 24 : 34, narrow ? 6 : 8, tick)
  const processNames = [
    "graph-weaver",
    "mothkeeper",
    "rain-catcher",
    "note-indexer",
    "cursor-herd",
    "dream-sweeper",
  ] as const

  const processes = rng
    .shuffle(processNames)
    .slice(0, narrow ? 3 : 5)
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
  }
}
