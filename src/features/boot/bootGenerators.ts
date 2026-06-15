/**
 * Deterministic content grammar for the /boot route.
 *
 * This module never sleeps and never reads browser state. It produces plain,
 * serialisable events; useBootPlayback is responsible for timing and display.
 */

import { SeededRNG } from "./bootRng"
import { mixSeed } from "./bootSeed"
import type {
  BootEvent,
  BootEventKind,
  BootTone,
  BootViewport,
  EventIdFactory,
  RevealMode,
  SnippetContext,
} from "./bootTypes"

interface EventOptions {
  kind?: BootEventKind
  reveal?: RevealMode
  tone?: BootTone
  charDelayMs?: number
  holdAfterMs?: number
  ariaLabel?: string
  ephemeral?: boolean
}

interface EpochFacts {
  noteCount: number
  linkCount: number
  orphanCount: number
  rainDrops: number
  memoryMiB: number
  freeMemoryMiB: number
  packetPort: number
  packetBytes: number
}

const MEMORY_PHRASES = [
  "THE GARDEN REMEMBERS RAIN",
  "PLEASE DO NOT WAKE SLOT 07",
  "A SMALL LIGHT REMAINS ON",
  "NOTHING LOST, ONLY REINDEXED",
  "THE MOON CACHE IS READ ONLY",
  "LEAVE A PORCH LIGHT FOR ORPHANS",
] as const

const GRAPH_PAIRS = [
  ["moon", "tide"],
  ["memory", "weather"],
  ["signal", "silence"],
  ["garden", "machine"],
  ["camera", "ghost"],
  ["orbit", "home"],
] as const

const ANOMALIES = [
  [
    "[ WARN ] tomorrow briefly mounted at /tmp",
    "[ INFO ] temporal mount passed checksum",
    "[  OK  ] tomorrow returned to its usual location",
  ],
  [
    "[ WARN ] checksum mismatch in silence buffer",
    "[ INFO ] both copies sound correct",
    "[  OK  ] preserving the quieter one as a spare",
  ],
  [
    "[ WARN ] a foreign leaf has entered the scheduler",
    "[ INFO ] leaf identified as local",
    "[  OK  ] scheduler has made room",
  ],
  [
    "[ WARN ] parallax table contains one insistent star",
    "[ INFO ] star reports that it is nearby",
    "[  OK  ] claim filed under affectionate uncertainty",
  ],
] as const

const SERVICE_GROUPS = [
  ["graph-weaver.service", "reciprocal edges held gently"],
  ["mothkeeper.service", "lamp perimeter nominal"],
  ["cursor-shepherd.service", "all cursors accounted for"],
  ["dream-sweeper.service", "night cache folded and aired"],
  ["crumb-indexer.service", "trail remains navigable"],
] as const

const GARDEN_OBSERVATIONS = [
  "one adventurous tendril at sector 7",
  "moss cache soft and internally consistent",
  "three seeds negotiating shared sunlight",
  "a fern process waiting politely on stdin",
  "compost rotation complete; no complaints logged",
] as const

const RULE_WIDE = "─".repeat(64)
const RULE_NARROW = "─".repeat(42)

function createEventIdFactory(
  rootSeed: number,
  epoch: number,
): EventIdFactory {
  const prefix = mixSeed(rootSeed, `event-stream:${epoch}`)
    .toString(16)
    .padStart(8, "0")
  let index = 0

  return (kind) => {
    const id = `boot-${prefix}-${epoch.toString(36)}-${index
      .toString(36)
      .padStart(3, "0")}-${kind}`
    index += 1
    return id
  }
}

function defaultCharDelay(reveal: RevealMode): number {
  if (reveal === "type") return 24
  if (reveal === "burst") return 18
  return 0
}

function defaultHold(kind: BootEventKind): number {
  if (kind === "blank") return 260
  if (kind === "phase") return 220
  if (kind === "heading") return 180
  if (kind === "frame") return 130
  return 85
}

function statusLine(label: string, value: string, width: number): string {
  const minimumDots = 3
  const dots = Math.max(minimumDots, width - label.length - value.length - 2)
  return `${label} ${".".repeat(dots)} ${value}`
}

function formatHex(value: number, width: number): string {
  return (value >>> 0).toString(16).toUpperCase().padStart(width, "0")
}

function documentationAddress(rng: SeededRNG, family: "source" | "target"): string {
  const prefix = family === "source" ? "192.0.2" : "203.0.113"
  return `${prefix}.${rng.int(1, 254)}`
}

function renderHexDump(message: string, bytesPerLine: number): string[] {
  const bytes = Array.from(message, (character) => character.charCodeAt(0) & 0xff)
  const result: string[] = []

  for (let offset = 0; offset < bytes.length; offset += bytesPerLine) {
    const row = bytes.slice(offset, offset + bytesPerLine)
    const hex = row
      .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
      .join(" ")
      .padEnd(bytesPerLine * 3 - 1, " ")
    const ascii = row
      .map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : "."))
      .join("")

    result.push(`${formatHex(offset, 4)}  ${hex}  |${ascii}|`)
  }

  return result
}

const SPARK_CHARS = "▁▂▃▄▅▆▇█"

function renderSparkline(values: readonly number[]): string {
  const maximum = Math.max(1, ...values)
  return values
    .map((value) => {
      const index = Math.min(
        SPARK_CHARS.length - 1,
        Math.floor((value / maximum) * (SPARK_CHARS.length - 1)),
      )
      return SPARK_CHARS[index]
    })
    .join("")
}

function renderScopeFrame(
  rng: SeededRNG,
  width: number,
  height: number,
  frame: number,
): string {
  const rows = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => " "),
  )
  const centre = Math.floor(height / 2)
  const amplitude = Math.max(1, Math.floor((height - 2) / 2))
  const frequency = rng.int(2, 4)
  let previousY = centre

  for (let x = 0; x < width; x += 1) {
    if (x % 2 === 0) rows[centre][x] = "·"
    const phase = frame * 0.52
    const fundamental = Math.sin((x / width) * Math.PI * 2 * frequency + phase)
    const harmonic = Math.sin((x / width) * Math.PI * 2 * (frequency + 1) - phase * 0.4) * 0.2
    const noise = (rng.float() - 0.5) * 0.14
    const sample = Math.max(-1, Math.min(1, fundamental * 0.8 + harmonic + noise))
    const y = Math.max(0, Math.min(height - 1, centre - Math.round(sample * amplitude)))

    if (x > 0 && Math.abs(y - previousY) > 1) {
      for (let bridge = Math.min(y, previousY) + 1; bridge < Math.max(y, previousY); bridge += 1) {
        rows[bridge][x] = "│"
      }
    }

    rows[y][x] = y === previousY ? "─" : y < previousY ? "╭" : "╰"
    previousY = y
  }

  return rows.map((row) => row.join("")).join("\n")
}

function renderSpectrumFrame(
  rng: SeededRNG,
  width: number,
  height: number,
  frame: number,
): string {
  const peakA = 0.2 + Math.sin(frame * 0.31) * 0.035
  const peakB = 0.62 + Math.cos(frame * 0.23) * 0.045
  const peakC = 0.84 + Math.sin(frame * 0.17) * 0.025
  const bins = Array.from({ length: width }, (_, index) => {
    const x = index / Math.max(1, width - 1)
    const gaussian = (centre: number, spread: number, gain: number): number =>
      Math.exp(-Math.pow(x - centre, 2) / spread) * gain
    const signal =
      gaussian(peakA, 0.0018, 0.82) +
      gaussian(peakB, 0.0045, 0.58) +
      gaussian(peakC, 0.0012, 0.72)
    const floor = 0.05 + rng.float() * 0.13
    return Math.max(0, Math.min(1, signal + floor))
  })

  const rows = Array.from({ length: height }, (_, row) => {
    const threshold = 1 - row / Math.max(1, height - 1)
    return bins.map((value) => (value >= threshold ? "█" : value >= threshold - 0.08 ? "▄" : " ")).join("")
  })

  rows.push("└" + "─".repeat(Math.max(0, width - 2)) + "┘")
  return rows.join("\n")
}

/**
 * Animated ASCII set-pieces, ported from the standalone terminal ecology.
 *
 * Each scene renders from an integer frame index (0..frameCount) rather than a
 * wall clock, so the whole sequence stays deterministic for a given seed.
 */

function frameTurn(frame: number, frameCount: number): number {
  return frameCount <= 0 ? 0 : frame / frameCount
}

function renderBlueMarbleFrame(frame: number): string {
  const stars = ["·", "✦", ".", "☆"] as const
  const s = stars[frame % stars.length]
  const orbit = ((frame * 24) % 360).toString().padStart(3, "0")
  return [
    `       ${s}                     ✦               ·`,
    "                    .-~~~~~~~~-.",
    "        ·        .~      _      ~.       *",
    "                /   _.-'   '-._   \\",
    "    ✦          |  .'  EURASIA  '.  |",
    "               | /  .-~~~~~~-.  \\ |        ☆",
    `        ${s}      | |  (  ocean  )  | |`,
    "               | \\  '-.__.-'  / |",
    "           ·    \\  '._     _.'  /     ✦",
    "                 '~.  '---'  .~'",
    "                    '-.____.-'",
    `             ◇──── packet orbit ${orbit}° ────◇`,
    "        earth remains cute and locally addressable",
  ].join("\n")
}

function renderButterflyFrame(frame: number, width: number): string {
  const t = frame * 0.42
  const rows: string[] = []
  for (let y = -6; y <= 6; y += 1) {
    let row = ""
    for (let x = 0; x < width; x += 1) {
      const nx = (x - width / 2) / 8
      const ny = y / 2
      const f = Math.sin(nx * 1.8 + t * 5) * Math.exp(-Math.abs(nx) / 4)
      const g = Math.cos(nx * 0.75 - t * 3) * 0.8
      const d = Math.min(Math.abs(ny - f - g), Math.abs(ny + f - g))
      row += d < 0.22 ? "█" : d < 0.48 ? "▒" : y === 0 ? "─" : " "
    }
    rows.push(`│${row}│`)
  }
  return [
    `┌${"─".repeat(width)}┐`,
    ...rows,
    `└${"─".repeat(width)}┘  dx/dt ↔ dy/dt / butterfly offered tea`,
  ].join("\n")
}

function renderVoronoiFrame(frame: number, width: number): string {
  const height = 12
  const sites = Array.from({ length: 8 }, (_, i) => ({
    x: (i * 17 + 7) % width,
    y: (i * 7 + 3) % height,
  }))
  const bloom = 0.52 + frameTurn(frame, 18) * 0.5
  const rows: string[] = []
  for (let y = 0; y < height; y += 1) {
    let row = ""
    for (let x = 0; x < width; x += 1) {
      let nearest = Infinity
      let second = Infinity
      for (const p of sites) {
        const d = (x - p.x) ** 2 + (y - p.y) ** 2
        if (d < nearest) {
          second = nearest
          nearest = d
        } else if (d < second) {
          second = d
        }
      }
      row += Math.abs(Math.sqrt(second) - Math.sqrt(nearest)) < bloom ? "·" : " "
    }
    rows.push(`│${row}│`)
  }
  const pct = Math.round(frameTurn(frame, 18) * 100)
  return [
    `┌${"─".repeat(width)}┐`,
    ...rows,
    `└${"─".repeat(width)}┘  voronoi dream / ${pct}%`,
  ].join("\n")
}

function renderAuroraFrame(frame: number, width: number): string {
  const t = frame * 0.42
  const rows: string[] = []
  for (let y = 0; y < 11; y += 1) {
    let row = ""
    for (let x = 0; x < width; x += 1) {
      const v = Math.sin(x * 0.16 + t * 8 + y * 0.42) + Math.sin(x * 0.05 - t * 5)
      row += v > 1.35 ? "✦" : v > 0.65 ? "▓" : v > -0.1 ? "▒" : v > -0.7 ? "░" : " "
    }
    rows.push(row)
  }
  rows.push("aurora-tcp / route held above the polar cache")
  return rows.join("\n")
}

function renderCathedralFrame(frame: number): string {
  const glow = (["░", "▒", "▓", "█"] as const)[Math.min(3, frame % 4)]
  return [
    "                  ╱╲",
    "             ╱╲  ╱  ╲  ╱╲",
    `        ╱╲  ╱  ╲╱ ${glow}${glow} ╲╱  ╲  ╱╲`,
    "       ╱  ╲╱      ◇      ╲╱  ╲",
    "      ║      ┌────┼────┐      ║",
    "      ║      │  dm11   │      ║",
    "      ║      └────┼────┘      ║",
    "  ════╩═══════════╧═══════════╩════",
  ].join("\n")
}

function boundedSeries(
  rng: SeededRNG,
  count: number,
  floor: number,
  ceiling: number,
): number[] {
  const values: number[] = []
  let current = rng.int(floor, ceiling)
  for (let index = 0; index < count; index += 1) {
    current = Math.max(floor, Math.min(ceiling, current + rng.int(-12, 12)))
    if (rng.chance(0.1)) current = rng.int(Math.floor(ceiling * 0.55), ceiling)
    values.push(current)
  }
  return values
}

function epochFacts(rng: SeededRNG): EpochFacts {
  const memoryMiB = rng.int(12_288, 32_768)
  return {
    noteCount: rng.int(148, 246),
    linkCount: rng.int(640, 1_420),
    orphanCount: rng.int(1, 5),
    rainDrops: rng.int(7, 42),
    memoryMiB,
    freeMemoryMiB: rng.int(Math.floor(memoryMiB * 0.35), Math.floor(memoryMiB * 0.82)),
    packetPort: rng.int(4_096, 61_000),
    packetBytes: rng.pick([256, 512, 768, 1_024, 1_536, 2_048]),
  }
}

export class BootGenerator {
  readonly rootSeed: number

  constructor(seed: number) {
    this.rootSeed = new SeededRNG(seed).initialSeed
  }

  private context(
    epoch: number,
    phase: string,
    viewport: BootViewport,
    sequence: EventIdFactory,
  ): SnippetContext {
    return {
      rootSeed: this.rootSeed,
      epoch,
      phase,
      viewport,
      sequence,
      rng: new SeededRNG(mixSeed(this.rootSeed, `epoch:${epoch}:${phase}`)),
    }
  }

  private event(
    context: SnippetContext,
    text: string,
    options: EventOptions = {},
  ): BootEvent {
    const kind = options.kind ?? "line"
    const reveal = options.reveal ?? "instant"

    return {
      id: context.sequence(kind),
      epoch: context.epoch,
      kind,
      text,
      tone: options.tone ?? "normal",
      reveal,
      charDelayMs: options.charDelayMs ?? defaultCharDelay(reveal),
      holdAfterMs: options.holdAfterMs ?? defaultHold(kind),
      ariaLabel: options.ariaLabel,
      ephemeral: options.ephemeral,
    }
  }

  private blank(context: SnippetContext, holdAfterMs = 280): BootEvent {
    return this.event(context, "", {
      kind: "blank",
      reveal: "instant",
      tone: "muted",
      holdAfterMs,
    })
  }

  private phase(context: SnippetContext, label: string): BootEvent {
    return this.event(context, `phase :: ${label}`, {
      kind: "phase",
      reveal: "type",
      tone: "accent",
      charDelayMs: 20,
      holdAfterMs: 220,
      ariaLabel: `Boot phase: ${label}`,
    })
  }

  private firmwarePrelude(context: SnippetContext): BootEvent[] {
    const width = context.viewport === "narrow" ? 42 : 64
    const seed = `0x${formatHex(this.rootSeed, 8)}`
    const crystal = context.rng.pick(["C", "D♭", "F", "A", "a patient B♭"])

    return [
      this.event(
        context,
        context.viewport === "narrow"
          ? `SUB/SURFACE BIOS 2.6.0\nseed ${seed}`
          : `SUB/SURFACE BIOS 2.6.0${" ".repeat(24)}seed ${seed}`,
        {
          kind: "heading",
          reveal: "type",
          tone: "accent",
          charDelayMs: 19,
          holdAfterMs: 320,
        },
      ),
      this.event(context, statusLine("clock crystal", `humming in ${crystal}`, width), {
        reveal: "burst",
        tone: "tender",
      }),
      this.event(context, statusLine("previous shutdown", "considerate", width), {
        reveal: "burst",
        tone: "success",
      }),
      this.blank(context, 420),
    ]
  }

  private systemChecks(context: SnippetContext, facts: EpochFacts): BootEvent[] {
    const width = context.viewport === "narrow" ? 42 : 64
    const checks: ReadonlyArray<readonly [string, string, BootTone]> = [
      ["renderer", "READY", "success"],
      ["content index", `${facts.noteCount} notes VERIFIED`, "success"],
      ["memory", `${facts.freeMemoryMiB} / ${facts.memoryMiB} MiB free`, "normal"],
      ["sidenote buffer", context.viewport === "narrow" ? "compact" : "12 px to spare", "normal"],
      ["entropy pool", "pleasantly uncertain", "tender"],
      ["little red cursor", "accounted for", "tender"],
    ]

    return [
      this.phase(context, "foundation checks"),
      ...checks.map(([label, value, tone]) =>
        this.event(context, statusLine(label, value, width), {
          reveal: "burst",
          tone,
          charDelayMs: context.rng.int(12, 22),
          holdAfterMs: context.rng.int(70, 130),
        }),
      ),
      this.blank(context),
    ]
  }

  private serviceActivation(context: SnippetContext): BootEvent[] {
    const chosen = context.rng.shuffle(SERVICE_GROUPS).slice(0, 4)
    const events = [this.phase(context, "small services")]

    for (const [service, report] of chosen) {
      events.push(
        this.event(context, `[  OK  ] started ${service}`, {
          reveal: "burst",
          tone: "success",
          holdAfterMs: context.rng.int(75, 140),
        }),
      )
      if (context.rng.chance(0.45)) {
        events.push(
          this.event(context, `         ${service.replace(".service", "")}: ${report}`, {
            reveal: "instant",
            tone: service.startsWith("mothkeeper") ? "tender" : "muted",
            holdAfterMs: context.rng.int(90, 170),
          }),
        )
      }
    }

    events.push(
      this.event(context, "[ WAIT ] tea-daemon.service is steeping", {
        reveal: "type",
        tone: "warning",
        charDelayMs: 21,
        holdAfterMs: 360,
      }),
      this.event(context, "[  OK  ] tea-daemon.service reports: enough for everyone", {
        reveal: "burst",
        tone: "tender",
        holdAfterMs: 220,
      }),
      this.blank(context),
    )

    return events
  }

  private filesystemMounts(context: SnippetContext): BootEvent[] {
    const soilTotal = context.rng.int(900, 1_900)
    const noteTotal = context.rng.int(220, 540)
    const noteUsed = context.rng.int(42, 84)
    const soilUsed = context.rng.int(24, 67)

    const rows = context.viewport === "narrow"
      ? [
          `/dev/note0 → /var/notes  ${noteUsed}% clean`,
          `/dev/soil0 → /mnt/garden ${soilUsed}% damp`,
          "/dev/moon0 → /opt/moon   read-only",
        ]
      : [
          `/dev/note0  → /var/notes       ${noteTotal} MiB   ${noteUsed}% full   clean`,
          `/dev/soil0  → /mnt/garden      ${soilTotal} MiB  ${soilUsed}% full   damp`,
          "/dev/moon0  → /opt/ephemeris    64 MiB   read-only  silver",
        ]

    return [
      this.phase(context, "mounting familiar places"),
      ...rows.map((row, index) =>
        this.event(context, row, {
          reveal: index === rows.length - 1 ? "type" : "instant",
          tone: index === rows.length - 1 ? "tender" : "normal",
          charDelayMs: 18,
          holdAfterMs: 140,
        }),
      ),
      this.blank(context),
    ]
  }

  private memoryTrace(context: SnippetContext): BootEvent[] {
    const phrase = context.rng.pick(MEMORY_PHRASES)
    const bytesPerLine = context.viewport === "narrow" ? 8 : 16
    const dump = renderHexDump(phrase, bytesPerLine)

    return [
      this.phase(context, "memory trace"),
      this.event(context, "$ inspect --safe /dev/recollection0", {
        kind: "heading",
        reveal: "type",
        tone: "accent",
        charDelayMs: 20,
      }),
      ...dump.map((row) =>
        this.event(context, row, {
          reveal: "instant",
          tone: "muted",
          holdAfterMs: 95,
        }),
      ),
      this.event(context, `payload: “${phrase.toLowerCase()}”`, {
        reveal: "type",
        tone: "tender",
        charDelayMs: 24,
        holdAfterMs: 260,
      }),
      this.blank(context),
    ]
  }

  private graphMaintenance(context: SnippetContext, facts: EpochFacts): BootEvent[] {
    const [left, right] = context.rng.pick(GRAPH_PAIRS)
    const modularity = (context.rng.int(54, 73) / 100).toFixed(2)

    return [
      this.phase(context, "graph maintenance"),
      this.event(context, `indexing ${facts.noteCount} notes / ${facts.linkCount} links`, {
        reveal: "burst",
        tone: "normal",
      }),
      this.event(context, `repairing reciprocal edge: “${left}” ⇄ “${right}”`, {
        reveal: "type",
        tone: "accent",
        charDelayMs: 19,
      }),
      this.event(
        context,
        `found ${facts.orphanCount} orphan node${facts.orphanCount === 1 ? "" : "s"}; gave ${facts.orphanCount === 1 ? "it" : "them"} a little porch light`,
        {
          reveal: "type",
          tone: "tender",
          charDelayMs: 23,
          holdAfterMs: 220,
        },
      ),
      this.event(context, `community pass 04 ........................ modularity ${modularity}`, {
        reveal: "burst",
        tone: "success",
      }),
      this.blank(context),
    ]
  }

  private packetCapture(context: SnippetContext, facts: EpochFacts): BootEvent[] {
    const source = documentationAddress(context.rng, "source")
    const target = documentationAddress(context.rng, "target")
    const seconds = context.rng.int(10, 52)
    const base = `03:14:${seconds.toString().padStart(2, "0")}`

    return [
      this.phase(context, "packet ferry"),
      this.event(context, `[${base}.104] ${source}:${facts.packetPort} → ${target}:443  SYN`, {
        reveal: "instant",
        tone: "muted",
      }),
      this.event(context, `[${base}.151] ${target}:443 → ${source}:${facts.packetPort}  SYN ACK`, {
        reveal: "instant",
        tone: "muted",
      }),
      this.event(context, `[${base}.219] packet ferry delivered ${facts.packetBytes} B, slightly out of breath`, {
        reveal: "type",
        tone: "tender",
        charDelayMs: 19,
      }),
      this.event(context, `[${base}.302] quiet-relay.invalid did not answer; left a note`, {
        reveal: "burst",
        tone: "normal",
      }),
      this.blank(context),
    ]
  }

  private latencySurvey(context: SnippetContext): BootEvent[] {
    const nodes = context.rng.shuffle([
      "archive-gate",
      "moon-cache",
      "north-greenhouse",
      "quiet-relay",
      "graph-orchard",
      "porch-light",
    ] as const).slice(0, context.viewport === "narrow" ? 4 : 6)

    const rows = nodes.map((node, index) => {
      const hopRng = context.rng.fork(`latency:${node}`)
      const latency = hopRng.int(2, index === nodes.length - 1 ? 84 : 42)
      const jitter = hopRng.int(0, 8)
      const loss = (hopRng.int(0, 7) / 100).toFixed(2)
      return `${(index + 1).toString().padStart(2, "0")}  ${node.padEnd(18, " ")} ${latency
        .toString()
        .padStart(3, " ")} ms  ±${jitter}  ${loss}%`
    })

    return [
      this.phase(context, "latency survey"),
      this.event(context, "#   NODE                RTT     JIT LOSS", {
        kind: "heading",
        reveal: "instant",
        tone: "muted",
      }),
      ...rows.map((row, index) =>
        this.event(context, row, {
          reveal: "burst",
          tone: index === rows.length - 1 ? "accent" : "normal",
          holdAfterMs: 80,
        }),
      ),
      this.event(context, "route survey complete; every distant thing answered eventually", {
        reveal: "type",
        tone: "tender",
        charDelayMs: 18,
        holdAfterMs: 230,
      }),
      this.blank(context),
    ]
  }

  private networkMonitor(context: SnippetContext): BootEvent[] {
    const frames: BootEvent[] = []
    const width = context.viewport === "narrow" ? 22 : 44
    const source = documentationAddress(context.rng.fork("source"), "source")
    const target = documentationAddress(context.rng.fork("target"), "target")

    for (let frame = 0; frame < 6; frame += 1) {
      const frameRng = context.rng.fork(`network-frame:${frame}`)
      const rx = boundedSeries(frameRng.fork("rx"), width, 4, 98)
      const tx = boundedSeries(frameRng.fork("tx"), width, 2, 76)
      const rxRate = `${rx[rx.length - 1].toString().padStart(2, "0")}.${frameRng.int(0, 9)} kB/s`
      const txRate = `${tx[tx.length - 1].toString().padStart(2, "0")}.${frameRng.int(0, 9)} kB/s`
      const loss = (frameRng.int(0, 9) / 100).toFixed(2)
      const panel = [
        `eth0  ${source} → ${target}`,
        `RX ${renderSparkline(rx)} ${rxRate}`,
        `TX ${renderSparkline(tx)} ${txRate}`,
        `peers ${frameRng.int(3, 11)}   loss ${loss}%   queue ${frameRng.int(0, 4)}`,
      ].join("\n")

      frames.push(
        this.event(context, panel, {
          kind: "frame",
          reveal: "overwrite",
          tone: "accent",
          holdAfterMs: 170,
          ariaLabel: `Live network monitor frame ${frame + 1}`,
          ephemeral: true,
        }),
      )
    }

    return [
      this.phase(context, "live network monitor"),
      ...frames,
      this.event(context, "netwatch: six samples captured; packet ferry remains punctual", {
        reveal: "burst",
        tone: "success",
        holdAfterMs: 230,
      }),
      this.blank(context),
    ]
  }

  private oscilloscope(context: SnippetContext): BootEvent[] {
    const width = context.viewport === "narrow" ? 30 : 54
    const height = context.viewport === "narrow" ? 6 : 8
    const frequency = (context.rng.int(48, 164) / 10).toFixed(1)
    const millivolts = (context.rng.int(16, 82) / 10).toFixed(1)
    const frames: BootEvent[] = []

    for (let frame = 0; frame < 7; frame += 1) {
      const frameRng = context.rng.fork(`scope-frame:${frame}`)
      const panel = [
        `CH-A  ${frequency} Hz  ${millivolts} mV/div  TRIG:${frame < 3 ? "SEARCH" : "LOCK"}`,
        renderScopeFrame(frameRng, width, height, frame),
      ].join("\n")

      frames.push(
        this.event(context, panel, {
          kind: "frame",
          reveal: "overwrite",
          tone: frame < 3 ? "normal" : "accent",
          holdAfterMs: 145,
          ariaLabel: `Oscilloscope trace frame ${frame + 1}`,
          ephemeral: true,
        }),
      )
    }

    return [
      this.phase(context, "signal oscilloscope"),
      ...frames,
      this.event(
        context,
        `scope: carrier locked at ${frequency} Hz; waveform describes a very small tide`,
        {
          reveal: "type",
          tone: "tender",
          charDelayMs: 18,
          holdAfterMs: 260,
        },
      ),
      this.blank(context),
    ]
  }

  private spectrumAnalyzer(context: SnippetContext): BootEvent[] {
    const width = context.viewport === "narrow" ? 30 : 54
    const height = context.viewport === "narrow" ? 5 : 7
    const centre = context.rng.int(380, 920)
    const span = context.rng.pick([2, 5, 10, 20] as const)
    const frames: BootEvent[] = []

    for (let frame = 0; frame < 6; frame += 1) {
      const frameRng = context.rng.fork(`spectrum-frame:${frame}`)
      const noiseFloor = frameRng.int(-78, -52)
      const panel = [
        `FFT  centre ${centre} Hz  span ${span} kHz  floor ${noiseFloor} dB`,
        renderSpectrumFrame(frameRng, width, height, frame),
        `0 Hz${" ".repeat(Math.max(2, width - 18))}${span} kHz`,
      ].join("\n")

      frames.push(
        this.event(context, panel, {
          kind: "frame",
          reveal: "overwrite",
          tone: frame < 2 ? "normal" : "accent",
          holdAfterMs: 155,
          ariaLabel: `Spectrum analyser frame ${frame + 1}`,
          ephemeral: true,
        }),
      )
    }

    return [
      this.phase(context, "spectral survey"),
      ...frames,
      this.event(
        context,
        `fft: three stable carriers found; the smallest is humming at ${centre} Hz`,
        {
          reveal: "type",
          tone: "tender",
          charDelayMs: 18,
          holdAfterMs: 250,
        },
      ),
      this.blank(context),
    ]
  }

  private processMonitor(context: SnippetContext): BootEvent[] {
    const processes = context.rng.shuffle([
      "graph-weaver",
      "mothkeeper",
      "rain-catcher",
      "note-indexer",
      "cursor-herd",
      "dream-sweeper",
    ] as const).slice(0, context.viewport === "narrow" ? 4 : 6)

    const rows = processes.map((name, index) => {
      const pid = context.rng.int(12, 640).toString().padStart(3, "0")
      const state = index === 0 ? "R" : context.rng.pick(["S", "S", "D"] as const)
      const cpu = (context.rng.int(1, index === 0 ? 86 : 28) / 10).toFixed(1).padStart(4, " ")
      const memory = `${context.rng.int(6, 164)}M`.padStart(4, " ")
      return `${pid} ${state} ${cpu}% ${memory}  ${name}`
    })

    return [
      this.phase(context, "process garden"),
      this.event(context, "PID S  CPU  MEM  COMMAND", {
        kind: "heading",
        reveal: "instant",
        tone: "muted",
      }),
      ...rows.map((row, index) =>
        this.event(context, row, {
          reveal: "instant",
          tone: index === 0 ? "accent" : "normal",
          holdAfterMs: 70,
        }),
      ),
      this.event(context, "scheduler: all small processes received their turn", {
        reveal: "type",
        tone: "tender",
        charDelayMs: 18,
        holdAfterMs: 220,
      }),
      this.blank(context),
    ]
  }

  private storageMap(context: SnippetContext): BootEvent[] {
    const columns = context.viewport === "narrow" ? 16 : 28
    const rows = context.viewport === "narrow" ? 4 : 6
    const glyphs = ["░", "▒", "▓", "█"] as const
    const map = Array.from({ length: rows }, (_, row) =>
      Array.from({ length: columns }, (_, column) => {
        const cellRng = context.rng.fork(`cell:${row}:${column}`)
        return cellRng.pick(glyphs)
      }).join(""),
    ).join("\n")
    const wear = (context.rng.int(2, 19) / 10).toFixed(1)

    return [
      this.phase(context, "storage thermograph"),
      this.event(context, map, {
        kind: "frame",
        reveal: "burst",
        tone: "accent",
        charDelayMs: 12,
        ariaLabel: "A block map of storage activity",
        holdAfterMs: 280,
      }),
      this.event(context, `block temperature nominal; mean wear ${wear}%`, {
        reveal: "burst",
        tone: "success",
      }),
      this.event(context, "cold sector 07 has been given a small blanket", {
        reveal: "type",
        tone: "tender",
        charDelayMs: 20,
        holdAfterMs: 220,
      }),
      this.blank(context),
    ]
  }

  private gardenMaintenance(context: SnippetContext, facts: EpochFacts): BootEvent[] {
    const observation = context.rng.pick(GARDEN_OBSERVATIONS)

    return [
      this.phase(context, "garden maintenance"),
      this.event(context, "measuring moss cache ........................ soft", {
        reveal: "burst",
        tone: "tender",
      }),
      this.event(context, "rotating /var/compost ....................... done", {
        reveal: "burst",
        tone: "success",
      }),
      this.event(context, `root map reports ${observation}`, {
        reveal: "type",
        tone: "tender",
        charDelayMs: 23,
      }),
      this.event(context, `rain collector .............................. ${facts.rainDrops} quiet drops`, {
        reveal: "burst",
        tone: "normal",
      }),
      this.blank(context),
    ]
  }

  private tinyDaemon(context: SnippetContext): BootEvent[] {
    const pid = context.rng.int(11, 89)
    const direction = context.rng.pick(["clockwise", "counter-clockwise"])

    return [
      this.phase(context, "mothkeeper note"),
      this.event(context, `mothkeeper[${pid}]: lamp checksum accepted`, {
        reveal: "instant",
        tone: "normal",
      }),
      this.event(context, `mothkeeper[${pid}]: one visitor circling ${direction}`, {
        reveal: "type",
        tone: "tender",
        charDelayMs: 25,
      }),
      this.event(context, `mothkeeper[${pid}]: no intervention required`, {
        reveal: "burst",
        tone: "success",
      }),
      this.blank(context),
    ]
  }

  private asciiProcess(context: SnippetContext): BootEvent[] {
    const narrow = context.viewport === "narrow"
    const variants = [
      {
        phase: "constellation handshake",
        ariaLabel: "A small constellation gradually joining its points",
        frames: narrow
          ? [
              "      ·       │       ·",
              "  ·       ◇   │   ·",
              "      ·   │   ◇     ·",
              "  ·   ◇   │       ·",
            ]
          : [
              "       ·       │       ·       │       ·",
              "   ·       ◇   │   ·       ·   │       ·",
              "       ·       │       ◇       │   ·",
              "   ·       ·   │   ◇       ·   │       ◇",
            ],
        final: "constellation handshake ..................... complete",
      },
      {
        phase: "seed process",
        ariaLabel: "A tiny seed putting down a root and opening two leaves",
        frames: narrow
          ? ["          ·", "          │", "         \\│/", "        \\ │ /"]
          : [
              "                    ·",
              "                    │",
              "                   \\│/",
              "                  \\ │ /",
            ],
        final: "seed process ................................. two leaves",
      },
      {
        phase: "lamp orbit",
        ariaLabel: "A tiny moth making a calm orbit around a lamp",
        frames: narrow
          ? ["      ·     ◇", "         · ◇", "          ◇ ·", "      ·     ◇"]
          : [
              "            ·             ◇",
              "                  ·       ◇",
              "                        ◇ ·",
              "            ·             ◇",
            ],
        final: "lamp orbit ................................... visitor calm",
      },
    ] as const

    const chosen = context.rng.pick(variants)

    return [
      this.phase(context, chosen.phase),
      ...chosen.frames.map((frame) =>
        this.event(context, frame, {
          kind: "frame",
          reveal: "overwrite",
          tone: "accent",
          holdAfterMs: context.rng.int(120, 180),
          ariaLabel: chosen.ariaLabel,
          ephemeral: true,
        }),
      ),
      this.event(context, chosen.final, {
        reveal: "burst",
        tone: "success",
        ariaLabel: `${chosen.phase} complete`,
        holdAfterMs: 240,
      }),
      this.blank(context),
    ]
  }

  private harmlessAnomaly(context: SnippetContext): BootEvent[] {
    if (!context.rng.chance(0.012)) return []

    const narrative = context.rng.pick(ANOMALIES)
    return [
      this.phase(context, "harmless anomaly"),
      ...narrative.map((text, index) =>
        this.event(context, text, {
          reveal: index === 0 ? "type" : "burst",
          tone: index === 0 ? "warning" : index === 1 ? "normal" : "success",
          charDelayMs: 32,
          holdAfterMs: index === 0 ? 360 : 180,
        }),
      ),
      this.blank(context, 380),
    ]
  }

  private cosmicScene(context: SnippetContext): BootEvent[] {
    const narrow = context.viewport === "narrow"
    // Wide-only ASCII set-pieces: their fixed-width geometry does not survive a
    // 42-column terminal, so narrow viewports skip the heavier scenes.
    const width = narrow ? 46 : 58
    const frameCount = 14

    interface SceneSpec {
      phase: string
      label: string
      ariaLabel: string
      render: (frame: number) => string
      tone: BootTone
      wideOnly?: boolean
    }

    const scenes: readonly SceneSpec[] = [
      {
        phase: "blue marble survey",
        label: "blue marble survey ........................... earth nominal",
        ariaLabel: "An ASCII Earth with a packet quietly orbiting it",
        render: (frame) => renderBlueMarbleFrame(frame),
        tone: "accent",
      },
      {
        phase: "differential garden",
        label: "differential garden .......................... field stable",
        ariaLabel: "A butterfly-shaped vector field breathing in and out",
        render: (frame) => renderButterflyFrame(frame, width),
        tone: "tender",
        wideOnly: true,
      },
      {
        phase: "voronoi dream",
        label: "voronoi dream ................................ cells settled",
        ariaLabel: "A Voronoi diagram slowly drawing its cell boundaries",
        render: (frame) => renderVoronoiFrame(frame, width),
        tone: "normal",
        wideOnly: true,
      },
      {
        phase: "network aurora",
        label: "network aurora ............................... route held",
        ariaLabel: "An aurora of network traffic shimmering above the cache",
        render: (frame) => renderAuroraFrame(frame, width),
        tone: "accent",
        wideOnly: true,
      },
      {
        phase: "ice cathedral",
        label: "ice cathedral ................................ chord resonant",
        ariaLabel: "An ice cathedral holding a single resonant chord",
        render: (frame) => renderCathedralFrame(frame),
        tone: "tender",
      },
    ]

    const eligible = scenes.filter((scene) => !scene.wideOnly || !narrow)
    const scene = context.rng.pick(eligible)
    const events: BootEvent[] = [this.phase(context, scene.phase)]

    for (let frame = 0; frame <= frameCount; frame += 1) {
      events.push(
        this.event(context, scene.render(frame), {
          kind: "frame",
          reveal: "overwrite",
          tone: scene.tone,
          holdAfterMs: context.rng.int(70, 110),
          ariaLabel: scene.ariaLabel,
          ephemeral: true,
        }),
      )
    }

    events.push(
      this.event(context, scene.label, {
        reveal: "burst",
        tone: "success",
        ariaLabel: `${scene.phase} complete`,
        holdAfterMs: 240,
      }),
      this.blank(context),
    )

    return events
  }

  private settlement(context: SnippetContext): BootEvent[] {
    const width = context.viewport === "narrow" ? 42 : 64
    const checksum = mixSeed(this.rootSeed, `settlement:${context.epoch}`)
    const checksumText = `${formatHex(checksum >>> 16, 4)}:${formatHex(checksum & 0xffff, 4)}`
    const nextDelay = context.rng.int(2, 8)

    return [
      this.event(context, context.viewport === "narrow" ? RULE_NARROW : RULE_WIDE, {
        kind: "rule",
        reveal: "instant",
        tone: "muted",
        ariaLabel: "End of maintenance epoch",
      }),
      this.event(
        context,
        statusLine(`epoch ${context.epoch.toString().padStart(4, "0")} checksum`, checksumText, width),
        {
          reveal: "burst",
          tone: "accent",
        },
      ),
      this.event(context, "system nominal; garden awake; no urgent messages", {
        reveal: "type",
        tone: "tender",
        charDelayMs: 25,
        holdAfterMs: 320,
      }),
      this.event(context, `next maintenance window in ${nextDelay} soft ticks`, {
        reveal: "instant",
        tone: "muted",
        holdAfterMs: 620,
      }),
      this.blank(context, 520),
    ]
  }

  /** Build one complete, deterministic maintenance epoch. */
  generateEpoch(epoch: number, viewport: BootViewport = "wide"): BootEvent[] {
    if (!Number.isInteger(epoch) || epoch < 0) {
      throw new RangeError(`Invalid boot epoch: ${epoch}`)
    }

    const sequence = createEventIdFactory(this.rootSeed, epoch)
    const facts = epochFacts(
      new SeededRNG(mixSeed(this.rootSeed, `epoch:${epoch}:facts`)),
    )
    const events: BootEvent[] = []

    if (epoch === 0) {
      events.push(
        ...this.firmwarePrelude(
          this.context(epoch, "firmware", viewport, sequence),
        ),
      )
    }

    events.push(
      ...this.systemChecks(
        this.context(epoch, "checks", viewport, sequence),
        facts,
      ),
      ...this.serviceActivation(
        this.context(epoch, "services", viewport, sequence),
      ),
      ...this.filesystemMounts(
        this.context(epoch, "mounts", viewport, sequence),
      ),
    )

    const planRng = new SeededRNG(
      mixSeed(this.rootSeed, `epoch:${epoch}:plan`),
    )
    const maintenancePhases = planRng.shuffle([
      () => this.memoryTrace(this.context(epoch, "memory", viewport, sequence)),
      () => this.graphMaintenance(this.context(epoch, "graph", viewport, sequence), facts),
      () => this.packetCapture(this.context(epoch, "packets", viewport, sequence), facts),
      () => this.gardenMaintenance(this.context(epoch, "garden", viewport, sequence), facts),
      () => this.latencySurvey(this.context(epoch, "latency", viewport, sequence)),
    ]).slice(0, 3)
    const instrumentPool = [
      () => this.networkMonitor(this.context(epoch, "netwatch", viewport, sequence)),
      () => this.oscilloscope(this.context(epoch, "scope", viewport, sequence)),
      () => this.processMonitor(this.context(epoch, "processes", viewport, sequence)),
      () => this.storageMap(this.context(epoch, "storage-map", viewport, sequence)),
      () => this.spectrumAnalyzer(this.context(epoch, "spectrum", viewport, sequence)),
      () => this.cosmicScene(this.context(epoch, "scene", viewport, sequence)),
    ]
    const instrumentPhases = epoch === 0
      ? instrumentPool.slice(0, 2)
      : planRng.shuffle(instrumentPool).slice(0, 2)
    const middlePhases = planRng.shuffle([
      ...maintenancePhases,
      ...instrumentPhases,
    ])

    for (const buildPhase of middlePhases) {
      events.push(...buildPhase())
    }

    events.push(
      ...this.tinyDaemon(
        this.context(epoch, "mothkeeper", viewport, sequence),
      ),
      ...this.asciiProcess(
        this.context(epoch, "constellation", viewport, sequence),
      ),
      ...this.harmlessAnomaly(
        this.context(epoch, "anomaly", viewport, sequence),
      ),
      ...this.settlement(
        this.context(epoch, "settlement", viewport, sequence),
      ),
    )

    return events
  }

  /** Compatibility helper for tests or transcript previews. */
  generate(count = 100, viewport: BootViewport = "wide"): BootEvent[] {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError(`Invalid event count: ${count}`)
    }

    const events: BootEvent[] = []
    let epoch = 0
    while (events.length < count) {
      events.push(...this.generateEpoch(epoch, viewport))
      epoch += 1
    }
    return events.slice(0, count)
  }
}
