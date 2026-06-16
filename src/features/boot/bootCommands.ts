/**
 * Command registry for the /boot in-page command line.
 *
 * Each command is a single declarative entry: name, aliases, a one-line help
 * string and a `run(ctx, args)` handler. The help modal and Tab-autocomplete
 * derive their lists from this registry, so there is exactly one source of
 * truth — add a command here and it shows up everywhere automatically.
 *
 * Handlers receive a `BootCommandContext` of callbacks supplied by BootPage;
 * the registry itself holds no React state and is trivially unit-testable.
 */

import type { BootEventKind, BootTone } from "./bootTypes"
import { generateReply, PERSONAS, PersonaId } from "./chatbot"
import type { BootPalette } from "./bootSeed"
import { parseMarkdownToBootLines } from "./bootMarkdown"
import { setScopeMode, setNetMode } from "./bootTelemetry"

/** Resolve a user-typed note query to a note (exact slug/title, then fuzzy). */
function resolveNote(notes: readonly BootNote[], query: string): BootNote | undefined {
  const q = query.trim().toLowerCase()
  if (!q) return undefined
  const bySlug = notes.find((n) => n.slug.toLowerCase() === q)
  if (bySlug) return bySlug
  const byTitle = notes.find((n) => n.title.toLowerCase() === q)
  if (byTitle) return byTitle
  return notes.find(
    (n) => n.slug.toLowerCase().includes(q) || n.title.toLowerCase().includes(q),
  )
}

export type ZoomPane = "none" | "log" | "scope" | "net" | "proc"

const ZOOM_PANES: readonly ZoomPane[] = ["log", "scope", "net", "proc"]

/** Everything a command needs to act on the live boot session. */
export interface BootCommandContext {
  injectLine: (text: string, tone?: BootTone, kind?: BootEventKind) => void
  replaceLastLines: (count: number, newLines: string[], tone?: BootTone, kind?: BootEventKind) => void
  clearLines: () => void
  setZoomedPane: (pane: ZoomPane) => void
  /** Returns the pane after toggling `target` (or "none" if it was active). */
  toggleZoom: (target: ZoomPane) => void
  toggleSound: () => void
  chime: (tone: BootTone) => void
  setSpeed: (speed: number) => void
  cyclePalette: () => string
  setPalette: (name: string) => boolean
  setGlobalTheme: (theme: "light" | "dark") => void
  setFollowing: (follow: boolean) => void
  createNewSeed: () => void
  exportLog: () => void
  flashGlitch: () => void
  openHelp: () => void
  restart: () => void
  setPaused: (paused: boolean) => void
  /** Command history, oldest-first, for `history`. */
  getHistory: () => readonly string[]
  /** Public garden notes available to read, for `ls` / `cat` / autocomplete. */
  getNotes: () => readonly BootNote[]
  /** Fetch a note's raw markdown by content path (returns null on failure). */
  fetchNote: (contentPath: string) => Promise<string | null>
  /** Trigger the auth modal */
  triggerLogin: () => void
  /** Navigate to a different shell/url */
  navigate: (url: string) => void
  /** Get the current authenticated user profile */
  getUser: () => { username: string | null; role: string | null; email: string | null } | null
  music: {
    playTrack: (index: number | string) => void
    togglePlay: () => void
    nextTrack: () => void
    prevTrack: () => void
    setVolume: (vol: number) => void
    isPlaying: boolean
    volume: number
    tracks: any[]
    currentTrackIndex: number
    playlist: number[]
    setPlaylist: (list: number[]) => void
    repeatMode: string
    setRepeatMode: (mode: any) => void
  }
}

/** A garden note as the boot terminal sees it. */
export interface BootNote {
  slug: string
  title: string
  tags: readonly string[]
  contentPath: string
  username?: string
  excerpt?: string
}

interface HelpEntry {
  /** Display name shown in the manual. */
  usage: string
  description: string
}

export interface BootCommand {
  name: string
  aliases?: string[]
  help?: HelpEntry
  requireRole?: "admin" | "editor"
  run: (ctx: BootCommandContext, args: string[]) => void
}

type SceneLine = [text: string, tone: BootTone, kind: BootEventKind]

const SCENES: readonly SceneLine[][] = [
  [
    ["  SCENE: ice-cathedral", "accent", "heading"],
    ["                  ╱╲", "tender", "frame"],
    ["             ╱╲  ╱  ╲  ╱╲", "tender", "frame"],
    ["        ╱╲  ╱  ╲╱ ▓▓ ╲╱  ╲  ╱╲", "tender", "frame"],
    ["       ╱  ╲╱      ◇      ╲╱  ╲", "tender", "frame"],
    ["      ║      ┌────┼────┐      ║", "tender", "frame"],
    ["      ║      │  dm11   │      ║", "tender", "frame"],
    ["      ║      └────┼────┘      ║", "tender", "frame"],
    ["  ════╩═══════════╧═══════════╩════", "tender", "frame"],
  ],
  [
    ["  SCENE: blue-marble", "accent", "heading"],
    ["       ☆                     ✦               ·", "tender", "frame"],
    ["                    .-~~~~~~~~-.", "tender", "frame"],
    ["        ·        .~      _      ~.       *", "tender", "frame"],
    ["                /   _.-'   '-._   \\", "tender", "frame"],
    ["    ✦          |  .'  EURASIA  '.  |", "tender", "frame"],
    ["               | /  .-~~~~~~-.  \\ |        ☆", "tender", "frame"],
    ["        ·      | |  (  ocean  )  | |", "tender", "frame"],
    ["               | \\  '-.__.-'  / |", "tender", "frame"],
    ["           ·    \\  '._     _.'  /     ✦", "tender", "frame"],
    ["                 '~.  '---'  .~'", "tender", "frame"],
    ["                    '-.____.-'", "tender", "frame"],
  ],
  [
    ["  SCENE: void-moth", "accent", "heading"],
    ["            ·             ◇", "tender", "frame"],
    ["                  ·       ◇", "tender", "frame"],
    ["                        ◇ ·", "tender", "frame"],
    ["            ·             ◇", "tender", "frame"],
  ],
  [
    ["  SCENE: terminal-ecology", "accent", "heading"],
    ["   .       .         .", "tender", "frame"],
    ["       .        .       .", "tender", "frame"],
    ["   .       .         .", "tender", "frame"],
    ["      |\\___/|", "tender", "frame"],
    ["      )     (    .  ", "tender", "frame"],
    ["     =\\     /=", "tender", "frame"],
    ["       )===(       .", "tender", "frame"],
    ["      /     \\", "tender", "frame"],
    ["      |     |", "tender", "frame"],
    ["     /       \\", "tender", "frame"],
    ["     \\       /", "tender", "frame"],
    ["      \\__  _/", "tender", "frame"],
    ["        ( (", "tender", "frame"],
    ["         ) )", "tender", "frame"],
    ["        (_(", "tender", "frame"],
  ],
  [
    ["  SCENE: deep-listening-station", "accent", "heading"],
    ["        .  *      .        ·         *", "tender", "frame"],
    ["     ((( ((( ((●))) ))) )))", "tender", "frame"],
    ["          \\   |   /", "tender", "frame"],
    ["           \\  |  /", "tender", "frame"],
    ["      ______\\_|_/______", "tender", "frame"],
    ["     /   the long ear   \\", "tender", "frame"],
    ["    /  listening outward  \\", "tender", "frame"],
    ["   '-----------------------'", "tender", "frame"],
    ["      ~ ~ ~ signal ~ ~ ~", "muted", "frame"],
  ],
  [
    ["  SCENE: tidal-archive", "accent", "heading"],
    ["   ___________________________", "tender", "frame"],
    ["  |  ▓ ▓ ▓ ▓ ▓ ▓ ▓ ▓ ▓ ▓ ▓ ▓ |", "tender", "frame"],
    ["  |  the stacks go under at   |", "tender", "frame"],
    ["  |  high tide; the salt      |", "tender", "frame"],
    ["  |  edits what it touches    |", "tender", "frame"],
    ["  |___________________________|", "tender", "frame"],
    ["  ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈", "muted", "frame"],
    ["    ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈", "muted", "frame"],
  ],
  [
    ["  SCENE: orchard-of-forks", "accent", "heading"],
    ["              ◆", "accent", "frame"],
    ["             ╱ ╲", "tender", "frame"],
    ["            ◇   ◇", "tender", "frame"],
    ["           ╱   ╱ ╲", "tender", "frame"],
    ["          ◇   ◇   ◇", "tender", "frame"],
    ["         every choice you", "muted", "frame"],
    ["         did not take is", "muted", "frame"],
    ["         still bearing fruit", "muted", "frame"],
    ["       ════════╤════════", "tender", "frame"],
    ["               │", "tender", "frame"],
  ],
  [
    ["  SCENE: lantern-procession", "accent", "heading"],
    ["    ·  ✦      ·       ✦    ·", "tender", "frame"],
    ["      .oOo.   .oOo.   .oOo.", "accent", "frame"],
    ["      |   |   |   |   |   |", "tender", "frame"],
    ["     _|   |___|   |___|   |_", "tender", "frame"],
    ["    they carry small lights", "muted", "frame"],
    ["    down a corridor that has", "muted", "frame"],
    ["    no recorded end", "muted", "frame"],
  ],
]

/** Deterministic-enough index without leaning on Math.random in module scope. */
function pickIndex(length: number): number {
  return Math.floor(Math.random() * length)
}

/** Last scene shown, so `scene` doesn't repeat itself back-to-back. */
let lastSceneIndex = -1

function pick<T>(items: readonly T[]): T {
  return items[pickIndex(items.length)]
}

const FORTUNES: readonly string[] = [
  "a link you forgot about still points somewhere kind",
  "the orphan note will find its garden by morning",
  "today's drift is well within affectionate tolerance",
  "someone will reread an old page and feel understood",
  "the cursor blinks for you, and only you, right now",
  "a draft you abandoned has quietly improved on its own",
  "the moon cache remembers the thing you meant to say",
  "you are allowed to leave the sentence unfinished",
  "the architect left a temple in the palette",
  "an operating system is a temple, if you listen closely",
]

const ORACLE_ANSWERS: readonly string[] = [
  "the answer is yes, but slowly",
  "ask again once the kettle has boiled",
  "signs point to a long, well-lit hallway",
  "no — and that is a kindness",
  "the moth says maybe; the moth says most things",
  "it is already true; you simply haven't reread it",
  "wait for the tide table to disagree, then decide",
  "certainly, in the way that rain is certain",
  "the oracle says to consult the divine intellect",
  "the system speaks holyc in the dark",
]

const DIVINE_WORDS: readonly string[] = [
  "covenant", "temple", "algorithm", "recursive", "tide", "moth",
  "intellect", "vessel", "horizon", "crystal", "fabric", "firmament",
  "compile", "syntax", "hallowed", "subsurface", "salt", "echo",
  "tabernacle", "void", "chariot", "iteration", "fractal", "mercy"
]

// Small ASCII familiars for `moth` / `cat`-style flourishes.
const MOTH_ART: readonly string[] = [
  "      ┊  ╲ ╱  ┊",
  "    ╲   ▟█▙   ╱",
  "  ╲   ▟█████▙   ╱",
  "      ▜█████▛",
  "        ▜█▛   ·",
]

/** One-screen man pages, keyed by command name. */
const MANPAGES: Record<string, readonly string[]> = {
  seed: [
    "SEED(1)                 subsurface manual",
    "NAME    seed — install a fresh random world seed",
    "DESC    Every seed is a deterministic universe. The",
    "        same seed always boots the same garden. Share",
    "        the URL to share the exact machine you saw.",
  ],
  audio: [
    "AUDIO(1)                subsurface manual",
    "NAME    audio — raise or lower the pad field",
    "DESC    A small, filtered atmospheric synth. Frequencies",
    "        and volume are clamped to safe, musical ranges.",
    "        Chords breathe through a slow progression.",
  ],
  oracle: [
    "ORACLE(1)               subsurface manual",
    "NAME    oracle — consult the resident uncertainty",
    "DESC    Answers questions you would rather not decide",
    "        alone. Non-binding. Occasionally a moth.",
  ],
}

export const BOOT_COMMANDS: readonly BootCommand[] = [
  {
    name: "help",
    aliases: ["?", "commands"],
    help: { usage: "help", description: "List commands in the feed" },
    run: (ctx, args) => {
      // `help <cmd>` shows that command's man page if one exists.
      const topic = args[0]?.toLowerCase()
      if (topic && MANPAGES[topic]) {
        MANPAGES[topic].forEach((line, i) =>
          ctx.injectLine(`  ${line}`, i === 0 ? "accent" : "muted", i === 0 ? "heading" : "line"),
        )
        return
      }
      ctx.injectLine("  SUB/SURFACE FIELD MANUAL", "accent", "heading")
      ctx.injectLine("  type a command, or [?] for the keyboard map", "muted")
      
      const user = ctx.getUser()
      const role = user?.role || "pending"
      const isAdmin = role === "admin"
      const isEditor = role === "editor" || isAdmin

      for (const command of HELP_COMMANDS) {
        if (command.requireRole === "admin" && !isAdmin) continue
        if (command.requireRole === "editor" && !isEditor) continue
        const usage = (command.help?.usage ?? command.name).padEnd(16, " ")
        ctx.injectLine(`  ${usage}${command.help?.description ?? ""}`, "normal")
      }
      ctx.injectLine("  click any pane header to zoom it", "tender")
    },
  },

  {
    name: "clear",
    aliases: ["cls"],
    help: { usage: "clear", description: "Clear the local scrollback buffer" },
    run: (ctx) => {
      ctx.clearLines()
      ctx.setZoomedPane("none")
      ctx.injectLine("  scrollback cleared", "muted")
    },
  },
  {
    name: "sound",
    aliases: ["audio"],
    help: { usage: "audio", description: "Start / stop the AmbientEngine" },
    run: (ctx) => ctx.toggleSound(),
  },
  {
    name: "speed",
    help: { usage: "speed <n>", description: "Set playback speed (0.25–4×)" },
    run: (ctx, args) => {
      const s = Number(args[0])
      if (s && s >= 0.25 && s <= 4) {
        ctx.setSpeed(s)
        ctx.injectLine(`  speed ${s}x`, "muted")
      } else {
        ctx.injectLine("  speed range is 0.25–4", "warning")
      }
    },
  },
  {
    name: "theme",
    aliases: ["palette"],
    help: { usage: "theme [name|next]", description: "Cycle or set the terminal palette" },
    run: (ctx, args) => {
      const target = args[0]
      if (!target || target === "next") {
        const next = ctx.cyclePalette()
        ctx.injectLine(`  palette: ${next}`, "muted")
      } else if (ctx.setPalette(target)) {
        ctx.injectLine(`  palette: ${target}`, "muted")
      } else {
        ctx.injectLine("  unknown theme", "warning")
      }
    },
  },
  {
    name: "mode",
    aliases: ["light", "lightmode", "dark", "darkmode"],
    help: { usage: "light | dark", description: "Toggle the global site theme" },
    run: (ctx, args) => {
      // Allow both `mode light` and the bare `light` / `dark` aliases.
      const verb = (args[0] ?? "").toLowerCase()
      if (verb === "light" || verb === "dark") {
        ctx.setGlobalTheme(verb)
        ctx.injectLine(`  ${verb} mode enabled`, "muted")
      } else {
        ctx.injectLine("  usage: mode light | mode dark", "warning")
      }
    },
  },
  {
    name: "zoom",
    aliases: ["focus"],
    help: { usage: "zoom <pane>", description: "Focus a pane (log, scope, net, proc)" },
    run: (ctx, args) => {
      const target = (args[0] || "log") as ZoomPane
      if (ZOOM_PANES.includes(target)) {
        ctx.toggleZoom(target)
        ctx.injectLine(`  zoom: ${target}`, "muted")
      } else {
        ctx.injectLine(`  unknown pane: ${target}`, "warning")
      }
    },
  },
  {
    name: "scene",
    help: { usage: "scene", description: "Render a randomised ASCII scene" },
    run: (ctx) => {
      ctx.setZoomedPane("none")
      // Avoid replaying the same scene twice in a row.
      let idx = pickIndex(SCENES.length)
      if (SCENES.length > 1 && idx === lastSceneIndex) idx = (idx + 1) % SCENES.length
      lastSceneIndex = idx
      SCENES[idx].forEach(([text, tone, kind]) => ctx.injectLine(text, tone, kind))
    },
  },
  {
    name: "weather",
    help: { usage: "weather", description: "Fetch a core meteorology report" },
    run: (ctx) => {
      ctx.injectLine("  METEOROLOGY REPORT", "accent", "heading")
      ctx.injectLine(`  atmosphere: ${Math.random() > 0.5 ? "mildly glitchy" : "clear and stable"}`, "normal")
      ctx.injectLine(`  temperature: ${Math.floor(Math.random() * 40 + 20)}°C in the core`, "normal")
      ctx.injectLine(`  wind: solar winds at ${Math.floor(Math.random() * 800)} km/s`, "muted")
    },
  },
  {
    name: "ping",
    help: { usage: "ping [host]", description: "Ping a local cache target" },
    run: (ctx, args) => {
      const host = args[0] || "moon-cache.local"
      ctx.injectLine(`  PING ${host} (192.168.1.${Math.floor(Math.random() * 200 + 50)}) 56(84) bytes of data.`, "normal")
      ctx.injectLine(`  64 bytes from ${host}: icmp_seq=1 ttl=64 time=${(Math.random() * 120).toFixed(1)} ms`, "success")
    },
  },
  {
    name: "ls",
    aliases: ["dir", "notes"],
    help: { usage: "ls [filter]", description: "List garden notes (optionally filtered)" },
    run: (ctx, args) => {
      const filter = args.join(" ").trim().toLowerCase()
      let notes = ctx.getNotes()
      if (filter) {
        notes = notes.filter(
          (n) => n.slug.toLowerCase().includes(filter) || n.title.toLowerCase().includes(filter),
        )
      }
      if (notes.length === 0) {
        ctx.injectLine(filter ? `  no notes match "${filter}"` : "  archive empty", "muted")
        return
      }
      ctx.injectLine(`  ${notes.length} note${notes.length === 1 ? "" : "s"} // cat <name> to read`, "muted")
      // Sort by slug for a stable listing; cap so the feed isn't flooded.
      const sorted = [...notes].sort((a, b) => a.slug.localeCompare(b.slug))
      for (const n of sorted.slice(0, 40)) {
        ctx.injectLine(`  ${n.slug.padEnd(28).slice(0, 28)} ${n.title}`, "normal")
      }
      if (sorted.length > 40) ctx.injectLine(`  … ${sorted.length - 40} more (filter with: ls <text>)`, "muted")
    },
  },
  {
    name: "cat",
    aliases: ["read", "open", "less"],
    help: { usage: "cat <name>", description: "Read a garden note into the feed" },
    run: (ctx, args) => {
      const query = args.join(" ").trim()
      if (!query) {
        ctx.injectLine("  usage: cat <name>  (try `ls` first)", "warning")
        return
      }
      // Easter-egg pseudo-files from the fictional root archive.
      const lower = query.toLowerCase()
      if (lower === "moon_cache.dat") {
        ctx.injectLine("  cat: moon_cache.dat: permission denied (read-only moon)", "warning")
        return
      }
      if (lower.includes("operator")) {
        ctx.injectLine("  you are the operator. there is nothing here you don't already hold.", "tender")
        return
      }
      const note = resolveNote(ctx.getNotes(), query)
      if (!note) {
        ctx.injectLine(`  not found: ${query}`, "warning")
        ctx.injectLine("  (try `ls` to list readable notes)", "muted")
        return
      }
      ctx.setZoomedPane("none")
      ctx.injectLine(`  ── ${note.title} ──`, "accent", "heading")
      if (note.tags.length) ctx.injectLine(`  #${note.tags.join("  #")}`, "muted")
      ctx.injectLine("", "normal")
      // Async fetch + parse; inject when it lands. injectLine is a stable
      // callback, so resolving after the command returns is fine.
      ctx.fetchNote(note.contentPath).then((raw) => {
        if (raw == null) {
          ctx.injectLine(`  read error: ${note.slug}`, "error")
          return
        }
        const { lines, truncated } = parseMarkdownToBootLines(raw)
        for (const l of lines) ctx.injectLine(l.text, l.tone)
        if (truncated) {
          ctx.injectLine("", "normal")
          ctx.injectLine(`  … note truncated. full text: subsurfaces.net/${note.slug}`, "muted")
        }
        ctx.chime("tender")
      })
    },
  },
  {
    name: "tags",
    help: { usage: "tags", description: "List tags across the garden" },
    run: (ctx) => {
      const counts = new Map<string, number>()
      for (const n of ctx.getNotes()) {
        for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
      }
      if (counts.size === 0) {
        ctx.injectLine("  no tags indexed", "muted")
        return
      }
      ctx.injectLine(`  ${counts.size} tags // ls <tag> to filter`, "muted")
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      for (const [tag, n] of sorted.slice(0, 30)) {
        ctx.injectLine(`  #${tag.padEnd(22).slice(0, 22)} ${n}`, "normal")
      }
    },
  },
  {
    name: "random",
    aliases: ["lucky"],
    help: { usage: "random", description: "Read a random note into the feed" },
    run: (ctx) => {
      const notes = ctx.getNotes()
      if (notes.length === 0) {
        ctx.injectLine("  archive empty (notes still loading?)", "muted")
        return
      }
      const note = notes[pickIndex(notes.length)]
      ctx.setZoomedPane("none")
      ctx.injectLine(`  rolling… → ${note.slug}`, "muted")
      ctx.injectLine(`  ── ${note.title} ──`, "accent", "heading")
      if (note.tags.length) ctx.injectLine(`  #${note.tags.join("  #")}`, "muted")
      ctx.injectLine("", "normal")
      ctx.fetchNote(note.contentPath).then((raw) => {
        if (raw == null) { ctx.injectLine(`  read error: ${note.slug}`, "error"); return }
        const { lines, truncated } = parseMarkdownToBootLines(raw)
        for (const l of lines) ctx.injectLine(l.text, l.tone)
        if (truncated) {
          ctx.injectLine("", "normal")
          ctx.injectLine(`  … truncated. full text: subsurfaces.net/${note.slug}`, "muted")
        }
        ctx.chime("tender")
      })
    },
  },
  {
    name: "find",
    aliases: ["grep", "search"],
    help: { usage: "find <text>", description: "Search note titles and tags" },
    run: (ctx, args) => {
      const q = args.join(" ").trim().toLowerCase()
      if (!q) { ctx.injectLine("  usage: find <text>", "warning"); return }
      const hits = ctx.getNotes().filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.slug.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q)),
      )
      if (hits.length === 0) { ctx.injectLine(`  no matches for "${q}"`, "muted"); return }
      ctx.injectLine(`  ${hits.length} match${hits.length === 1 ? "" : "es"} for "${q}"`, "accent")
      for (const n of hits.slice(0, 20)) {
        ctx.injectLine(`  ${n.slug.padEnd(28).slice(0, 28)} ${n.title}`, "normal")
      }
      if (hits.length > 20) ctx.injectLine(`  … ${hits.length - 20} more`, "muted")
    },
  },
  {
    name: "open-site",
    aliases: ["visit", "goto"],
    help: { usage: "goto <name>", description: "Open a note on the live site in a new tab" },
    run: (ctx, args) => {
      const query = args.join(" ").trim()
      const note = resolveNote(ctx.getNotes(), query)
      if (!note) { ctx.injectLine(`  not found: ${query || "(nothing)"}`, "warning"); return }
      const url = `https://subsurfaces.net/${note.slug}`
      ctx.injectLine(`  opening ${url}`, "muted")
      if (typeof window !== "undefined") window.open(url, "_blank", "noopener")
    },
  },
  {
    name: "whoami",
    help: { usage: "whoami", description: "Query operator identity" },
    run: (ctx) => {
      const user = ctx.getUser()
      if (user) {
        const handle = user.username || "unknown"
        ctx.injectLine(`  authenticated as: ${handle}`, "accent")
        ctx.injectLine(`  role: ${user.role || "pending"}`, "normal")
        ctx.injectLine("  you have full access to the mainframe.", "tender")
        
        if (handle !== "unknown") {
          const notes = ctx.getNotes()
          const mentions = notes.filter(n =>
            n.username?.toLowerCase() === handle.toLowerCase() ||
            n.slug.toLowerCase().includes(handle.toLowerCase()) ||
            n.title.toLowerCase().includes(handle.toLowerCase()) ||
            n.excerpt?.toLowerCase().includes(handle.toLowerCase()) ||
            n.tags.some(t => t.toLowerCase().includes(handle.toLowerCase()))
          )

          if (mentions.length > 0) {
            ctx.injectLine("", "normal")
            ctx.injectLine(`  pages referencing '${handle}':`, "muted")
            mentions.forEach(m => {
              ctx.injectLine(`  ${m.slug.padEnd(28).slice(0, 28)} ${m.title}`, "normal")
            })
          }
        }
      } else {
        ctx.injectLine("  you are the operator.", "tender")
        ctx.injectLine("  or at least, you are holding the keys.", "muted")
        ctx.injectLine("  (type 'login' to authenticate)", "warning")
      }
    },
  },
  {
    name: "status",
    help: { usage: "status", description: "Query system vitals" },
    run: (ctx) => {
      ctx.injectLine("  SYSTEM VITALS", "accent", "heading")
      ctx.injectLine("  [ OK ] All processes responding", "success")
      ctx.injectLine("  [ OK ] Mycelial network integrated", "success")
      ctx.injectLine("  [WARN] Temporal drift detected (0.4ms)", "warning")
    },
  },
  {
    name: "inject",
    aliases: ["echo"],
    help: { usage: "inject <msg>", description: "Inject an OPERATOR note into the log" },
    run: (ctx, args) => {
      ctx.setZoomedPane("none")
      ctx.injectLine(`  OPERATOR // ${args.join(" ") || "the operator left no message"}`, "tender")
      ctx.chime("tender")
    },
  },
  {
    name: "export",
    help: { usage: "export", description: "Download the current log as text" },
    run: (ctx) => ctx.exportLog(),
  },
  {
    name: "seed",
    help: { usage: "seed", description: "Install a fresh random seed" },
    run: (ctx) => ctx.createNewSeed(),
  },
  {
    name: "glitch",
    help: { usage: "glitch", description: "Reseat the display bus (visual flourish)" },
    run: (ctx) => {
      ctx.flashGlitch()
      ctx.injectLine("  DISPLAY BUS RESEATED // no data harmed", "tender")
      ctx.chime("warning")
    },
  },
  {
    name: "tail",
    help: { usage: "tail [off]", description: "Attach / detach live follow" },
    run: (ctx, args) => {
      const attach = args[0] !== "off"
      ctx.setFollowing(attach)
      ctx.injectLine(`  tail ${attach ? "attached" : "detached"}`, "muted")
    },
  },
  {
    name: "pause",
    aliases: ["hold", "stop"],
    help: { usage: "pause", description: "Hold the boot stream" },
    run: (ctx) => {
      ctx.setPaused(true)
      ctx.injectLine("  playback held — type 'resume' or press SPC", "muted")
    },
  },
  {
    name: "resume",
    aliases: ["play", "go"],
    help: { usage: "resume", description: "Resume the boot stream" },
    run: (ctx) => {
      ctx.setPaused(false)
      ctx.injectLine("  playback resumed", "muted")
    },
  },
  {
    name: "restart",
    aliases: ["reboot"],
    help: { usage: "restart", description: "Reboot the current seed from firmware" },
    run: (ctx) => {
      ctx.injectLine("  reseating firmware; the garden will be right back", "warning")
      ctx.restart()
    },
  },
  {
    name: "fortune",
    help: { usage: "fortune", description: "Draw a small omen" },
    run: (ctx) => {
      ctx.injectLine("  ✦ " + pick(FORTUNES), "tender")
    },
  },
  {
    name: "oracle",
    aliases: ["ask", "8ball"],
    help: { usage: "ask <question>", description: "Consult the resident uncertainty" },
    run: (ctx, args) => {
      const question = args.join(" ").trim()
      if (question) ctx.injectLine(`  ? ${question}`, "muted")
      ctx.injectLine("  ◈ " + pick(ORACLE_ANSWERS), "tender")
      ctx.chime("tender")
    },
  },
  {
    name: "moth",
    aliases: ["mothkeeper"],
    help: { usage: "moth", description: "Summon the lamp moth" },
    run: (ctx) => {
      ctx.injectLine("  the moth arrives, drawn to the cursor", "muted")
      MOTH_ART.forEach((line) => ctx.injectLine(line, "tender", "frame"))
      ctx.chime("tender")
    },
  },
  {
    name: "uptime",
    help: { usage: "uptime", description: "How long the field has been awake" },
    run: (ctx) => {
      const mins = Math.floor(Math.random() * 480 + 12)
      const load = [0, 0, 0].map(() => (Math.random() * 0.6).toFixed(2)).join(" ")
      ctx.injectLine(`  up ${Math.floor(mins / 60)}h ${mins % 60}m,  1 operator,  load average: ${load}`, "normal")
    },
  },
  {
    name: "date",
    aliases: ["time", "now"],
    help: { usage: "date", description: "Read the local soft clock" },
    run: (ctx) => {
      const now = new Date()
      const hh = now.getHours().toString().padStart(2, "0")
      const mm = now.getMinutes().toString().padStart(2, "0")
      const phase = pick(["under a waning moon", "at a considerate hour", "between two tides", "in the blue part of the evening"])
      ctx.injectLine(`  ${hh}:${mm} local · ${phase}`, "normal")
    },
  },
  {
    name: "roll",
    aliases: ["dice"],
    help: { usage: "roll [NdM]", description: "Roll dice (default 1d20)" },
    run: (ctx, args) => {
      const m = (args[0] || "1d20").match(/^(\d{0,2})d(\d{1,3})$/i)
      const count = Math.min(8, Math.max(1, Number(m?.[1]) || 1))
      const sides = Math.min(100, Math.max(2, Number(m?.[2]) || 20))
      const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1)
      const total = rolls.reduce((a, b) => a + b, 0)
      ctx.injectLine(`  🎲 ${count}d${sides} → [${rolls.join(", ")}] = ${total}`, "normal")
    },
  },
  {
    name: "history",
    aliases: ["hist"],
    help: { usage: "history", description: "Show recent commands" },
    run: (ctx) => {
      const entries = ctx.getHistory().slice(-12)
      if (!entries.length) {
        ctx.injectLine("  no history yet", "muted")
        return
      }
      entries.forEach((cmd, i) =>
        ctx.injectLine(`  ${(i + 1).toString().padStart(3, " ")}  ${cmd}`, "muted"),
      )
    },
  },
  {
    name: "neofetch",
    aliases: ["sysinfo", "about"],
    help: { usage: "neofetch", description: "System portrait" },
    run: (ctx) => {
      const rows = [
        "  operator@subsurface",
        "  ─────────────────────",
        "  OS       SUB/SURFACE (procedural)",
        "  kernel   garden 2.6.0-tender",
        "  shell    bootsh",
        "  uptime   a while; time is soft here",
        "  packages 14 small daemons",
        "  memory   enough, kept warm",
      ]
      rows.forEach((r, i) => ctx.injectLine(r, i === 0 ? "accent" : i === 1 ? "muted" : "normal", i === 0 ? "heading" : "line"))
    },
  },
  {
    name: "god",
    aliases: ["divine", "intellect"],
    help: { usage: "god", description: "Consult the divine intellect (procedural word generator)" },
    run: (ctx) => {
      const count = Math.floor(Math.random() * 4) + 3
      const words = Array.from({ length: count }, () => pick(DIVINE_WORDS))
      ctx.injectLine(`  ◈ divine intellect says: '${words.join(" ")}'`, "tender")
      ctx.chime("tender")
    },
  },
  {
    name: "vannak",
    help: { usage: "vannak", description: "Spin up a highly hypothetical subagent" },
    run: (ctx) => {
      ctx.injectLine("  [!] vannak-agent initialized", "warning")
      ctx.injectLine("  vannak-agent: informing adjacent agents they are stuck in a hypothetical...", "tender")
      ctx.injectLine("  vannak-agent: locating unallocated physical space...", "muted")
      ctx.injectLine("  vannak-agent: downloading RAM (32GB DDR6) via HTTP...", "accent")
      ctx.injectLine("  [█████░░░░░░░░░░░░░░░] 24% (1.4GB/s)", "normal")
      ctx.injectLine("  [█████████████░░░░░░░] 68% (1.8GB/s)", "normal")
      ctx.injectLine("  [████████████████████] 100% DONE", "success")
      ctx.injectLine("  vannak-agent: physical memory installed. please do not perceive the hypothetical.", "muted")
      ctx.chime("success")
    },
  },
  {
    name: "scope",
    help: { usage: "scope [auto|osc|globe|radar]", description: "Change the scope panel visualization mode" },
    run: (ctx, args) => {
      const modeArg = args[0]?.toLowerCase()
      if (modeArg === "osc" || modeArg === "0") {
         setScopeMode(0)
         ctx.injectLine("  SCOPE OVERRIDE: Oscilloscope", "accent")
      } else if (modeArg === "globe" || modeArg === "1") {
         setScopeMode(1)
         ctx.injectLine("  SCOPE OVERRIDE: Orbital Globe", "accent")
      } else if (modeArg === "radar" || modeArg === "2") {
         setScopeMode(2)
         ctx.injectLine("  SCOPE OVERRIDE: Phased Array Radar", "accent")
      } else if (modeArg === "auto") {
         setScopeMode("auto")
         ctx.injectLine("  SCOPE OVERRIDE: Auto-cycling restored", "tender")
      } else {
         ctx.injectLine("  Usage: scope [auto|osc|globe|radar]", "warning")
      }
    }
  },
  {
    name: "net",
    help: { usage: "net [auto|dense|sparse]", description: "Change the network panel visualization density" },
    run: (ctx, args) => {
      const mode = args[0]?.toLowerCase()
      if (mode === "dense") {
         setNetMode("dense")
         ctx.injectLine("  NET OVERRIDE: Dense Mesh", "accent")
      } else if (mode === "sparse") {
         setNetMode("sparse")
         ctx.injectLine("  NET OVERRIDE: Sparse Graph", "accent")
      } else if (mode === "auto") {
         setNetMode("auto")
         ctx.injectLine("  NET OVERRIDE: Auto-scaling restored", "tender")
      } else {
         ctx.injectLine("  Usage: net [auto|dense|sparse]", "warning")
      }
    }
  },
  {
    name: "calc",
    help: { usage: "calc <expression>", description: "Evaluate a mathematical expression" },
    run: (ctx, args) => {
      const expr = args.join(" ")
      if (!expr) return ctx.injectLine("  Usage: calc <expression>", "warning")
      try {
        const notes = ctx.getNotes()
        const vars = {
          nodes: notes.length,
          articles: notes.filter(n => !n.slug.startsWith("users/")).length,
          tags: new Set(notes.flatMap(n => n.tags)).size
        }
        const result = new Function(...Object.keys(vars), `return (${expr})`)(...Object.values(vars))
        if (typeof result !== "number" || isNaN(result)) throw new Error("Invalid output")
        ctx.injectLine(`  ${expr}`, "muted")
        ctx.injectLine(`  = ${result}`, "accent", "heading")
      } catch (err: any) {
        ctx.injectLine(`  calc: ${err.message}`, "error")
      }
    }
  },
  {
    name: "grow",
    help: { usage: "grow", description: "Procedurally grow an ASCII bonsai tree" },
    run: (ctx) => {
      const W = 40, H = 20;
      const grid = Array.from({length: H}, () => Array(W).fill(" "))
      const branches: {x: number, y: number, length: number, angle: number}[] = [{x: W/2, y: H-1, length: 0, angle: -Math.PI/2}]
      
      ctx.injectLine("  PROCEDURAL BONSAI", "accent", "heading")
      ctx.injectLine("  ┌" + "─".repeat(W) + "┐", "normal", "frame")
      grid.forEach(row => ctx.injectLine("  │" + row.join("") + "│", "normal", "frame"))
      ctx.injectLine("  └" + "─".repeat(W) + "┘", "normal", "frame")
      ctx.chime("tender")

      let step = 0
      activeCommandInterval = setInterval(() => {
        if (branches.length === 0 || step > 200) {
          clearInterval(activeCommandInterval)
          ctx.chime("tender")
          return
        }

        let newBranches = []
        for (let i = branches.length - 1; i >= 0; i--) {
           const b = branches[i]
           const nx = b.x + Math.cos(b.angle) * 0.8
           const ny = b.y + Math.sin(b.angle) * 0.8
           if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
              const ix = Math.floor(nx), iy = Math.floor(ny)
              if (b.length > 5 && Math.random() < 0.15) {
                 grid[iy][ix] = Math.random() > 0.5 ? "✿" : "❁"
                 branches.splice(i, 1)
                 continue
              } else {
                 grid[iy][ix] = b.length < 4 ? "█" : (b.length < 8 ? "▓" : "▒")
              }
              
              if (Math.random() < 0.25) {
                 newBranches.push({x: nx, y: ny, length: b.length + 1, angle: b.angle + (Math.random() * 0.8 + 0.1)})
                 newBranches.push({x: nx, y: ny, length: b.length + 1, angle: b.angle - (Math.random() * 0.8 + 0.1)})
                 branches.splice(i, 1)
              } else {
                 b.x = nx; b.y = ny; b.length++;
                 b.angle += (Math.random() - 0.5) * 0.4
              }
           } else {
              branches.splice(i, 1)
           }
        }
        branches.push(...newBranches)
        step++

        const lines = [
          "  ┌" + "─".repeat(W) + "┐",
          ...grid.map(row => "  │" + row.join("") + "│"),
          "  └" + "─".repeat(W) + "┘"
        ]
        ctx.replaceLastLines(H + 2, lines, "accent", "frame")
      }, 50)
    }
  },
  {
    name: "life",
    help: { usage: "life", description: "Conway's Game of Life simulation" },
    run: (ctx) => {
      const W = 40, H = 15;
      let grid = Array.from({length: H}, () => Array.from({length: W}, () => Math.random() < 0.3 ? "█" : " "))
      
      ctx.injectLine("  GAME OF LIFE", "accent", "heading")
      ctx.injectLine("  ┌" + "─".repeat(W) + "┐", "normal", "frame")
      grid.forEach(row => ctx.injectLine("  │" + row.join("") + "│", "normal", "frame"))
      ctx.injectLine("  └" + "─".repeat(W) + "┘", "normal", "frame")
      ctx.chime("tender")

      let step = 0
      activeCommandInterval = setInterval(() => {
        if (step > 150) {
          clearInterval(activeCommandInterval)
          ctx.chime("tender")
          return
        }

        const next = Array.from({length: H}, () => Array(W).fill(" "))
        let changes = 0
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            let n = 0
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue
                const ny = y + dy, nx = x + dx
                if (ny >= 0 && ny < H && nx >= 0 && nx < W && grid[ny][nx] !== " ") n++
              }
            }
            if (grid[y][x] !== " ") {
              if (n === 2 || n === 3) next[y][x] = "█"
              else changes++
            } else {
              if (n === 3) { next[y][x] = "▓"; changes++ }
            }
          }
        }
        
        if (changes === 0) {
           clearInterval(activeCommandInterval)
           ctx.chime("tender")
           return
        }

        grid = next
        const lines = [
          "  ┌" + "─".repeat(W) + "┐",
          ...grid.map(row => "  │" + row.join("") + "│"),
          "  └" + "─".repeat(W) + "┘"
        ]
        ctx.replaceLastLines(H + 2, lines, "accent", "frame")
        step++
      }, 100)
    }
  },
  {
    name: "orbit",
    help: { usage: "orbit", description: "ASCII planetary orbit simulation" },
    run: (ctx) => {
      const W = 60, H = 20;
      ctx.injectLine("  CELESTIAL ORBIT", "accent", "heading")
      ctx.injectLine("  ┌" + "─".repeat(W) + "┐", "normal", "frame")
      for (let i=0; i<H; i++) ctx.injectLine("  │" + " ".repeat(W) + "│", "normal", "frame")
      ctx.injectLine("  └" + "─".repeat(W) + "┘", "normal", "frame")
      ctx.chime("tender")

      const planets = [
        { r: 4, speed: 0.15, char: "o", trail: [] as {x:number, y:number}[] },
        { r: 8, speed: 0.08, char: "O", trail: [] as {x:number, y:number}[] },
        { r: 14, speed: 0.04, char: "Ø", trail: [] as {x:number, y:number}[] },
        { r: 22, speed: 0.02, char: "•", trail: [] as {x:number, y:number}[] },
      ]

      let t = 0
      activeCommandInterval = setInterval(() => {
        if (t > 400) {
          clearInterval(activeCommandInterval)
          ctx.chime("tender")
          return
        }

        const grid = Array.from({length: H}, () => Array(W).fill(" "))
        const cx = W/2, cy = H/2
        grid[cy][cx] = "☼"

        planets.forEach(p => {
           const x = Math.floor(cx + Math.cos(t * p.speed) * p.r * 1.8)
           const y = Math.floor(cy + Math.sin(t * p.speed) * p.r)
           
           p.trail.push({x, y})
           if (p.trail.length > 8) p.trail.shift()
           p.trail.forEach((tr, i) => {
              if (tr.x >= 0 && tr.x < W && tr.y >= 0 && tr.y < H && grid[tr.y][tr.x] === " ") {
                 grid[tr.y][tr.x] = "·"
              }
           })
           
           if (x >= 0 && x < W && y >= 0 && y < H) grid[y][x] = p.char
        })

        const lines = [
          "  ┌" + "─".repeat(W) + "┐",
          ...grid.map(row => "  │" + row.join("") + "│"),
          "  └" + "─".repeat(W) + "┘"
        ]
        ctx.replaceLastLines(H + 2, lines, "accent", "frame")
        t++
      }, 50)
    }
  },
  {
    name: "boids",
    help: { usage: "boids", description: "ASCII flocking simulation" },
    run: (ctx) => {
      const W = 60, H = 20;
      ctx.injectLine("  AERIAL MURMURATION", "accent", "heading")
      ctx.injectLine("  ┌" + "─".repeat(W) + "┐", "normal", "frame")
      for (let i=0; i<H; i++) ctx.injectLine("  │" + " ".repeat(W) + "│", "normal", "frame")
      ctx.injectLine("  └" + "─".repeat(W) + "┘", "normal", "frame")
      ctx.chime("tender")

      const boids = Array.from({length: 25}, () => ({
         x: Math.random() * W, y: Math.random() * H,
         vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2
      }))

      let step = 0
      activeCommandInterval = setInterval(() => {
         if (step > 300) {
            clearInterval(activeCommandInterval)
            ctx.chime("tender")
            return
         }

         const grid = Array.from({length: H}, () => Array(W).fill(" "))
         boids.forEach(b => {
            let cx = 0, cy = 0, vx = 0, vy = 0, sx = 0, sy = 0, n = 0
            boids.forEach(other => {
               if (b === other) return
               const dx = other.x - b.x, dy = other.y - b.y
               const dist = Math.sqrt(dx*dx + dy*dy)
               if (dist < 6) {
                  cx += other.x; cy += other.y;
                  vx += other.vx; vy += other.vy;
                  n++;
               }
               if (dist < 2.5) {
                  sx -= dx; sy -= dy;
               }
            })
            if (n > 0) {
               cx /= n; cy /= n; vx /= n; vy /= n;
               b.vx += (cx - b.x) * 0.015 + (vx - b.vx) * 0.05
               b.vy += (cy - b.y) * 0.015 + (vy - b.vy) * 0.05
            }
            b.vx += sx * 0.1
            b.vy += sy * 0.1

            const speed = Math.sqrt(b.vx*b.vx + b.vy*b.vy)
            if (speed > 1.2) {
               b.vx = (b.vx / speed) * 1.2
               b.vy = (b.vy / speed) * 1.2
            }
            b.x += b.vx; b.y += b.vy;
            if (b.x < 0) b.x += W; if (b.x >= W) b.x -= W;
            if (b.y < 0) b.y += H; if (b.y >= H) b.y -= H;

            const ix = Math.floor(b.x), iy = Math.floor(b.y)
            if (ix >= 0 && ix < W && iy >= 0 && iy < H) {
               grid[iy][ix] = Math.abs(b.vx) > Math.abs(b.vy) ? (b.vx > 0 ? "»" : "«") : (b.vy > 0 ? "v" : "^")
            }
         })

         const lines = [
          "  ┌" + "─".repeat(W) + "┐",
          ...grid.map(row => "  │" + row.join("") + "│"),
          "  └" + "─".repeat(W) + "┘"
         ]
         ctx.replaceLastLines(H + 2, lines, "accent", "frame")
         step++
      }, 50)
    }
  },
  {
    name: "matrix",
    help: { usage: "matrix", description: "Terminal digital rain" },
    run: (ctx) => {
      const W = 60, H = 20;
      ctx.injectLine("  DIGITAL RAIN", "accent", "heading")
      ctx.injectLine("  ┌" + "─".repeat(W) + "┐", "normal", "frame")
      for (let i=0; i<H; i++) ctx.injectLine("  │" + " ".repeat(W) + "│", "normal", "frame")
      ctx.injectLine("  └" + "─".repeat(W) + "┘", "normal", "frame")
      ctx.chime("tender")

      const drops: {x: number, y: number, length: number, speed: number, chars: string[]}[] = []
      const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*!"

      let step = 0
      activeCommandInterval = setInterval(() => {
         if (step > 250) {
            clearInterval(activeCommandInterval)
            ctx.chime("tender")
            return
         }

         if (Math.random() < 0.6) {
            drops.push({
               x: Math.floor(Math.random() * W),
               y: -Math.floor(Math.random() * 5),
               length: 5 + Math.floor(Math.random() * 12),
               speed: 0.5 + Math.random() * 1.0,
               chars: Array.from({length: 20}, () => CHARS[Math.floor(Math.random() * CHARS.length)])
            })
         }

         const grid = Array.from({length: H}, () => Array(W).fill(" "))

         for (let i = drops.length - 1; i >= 0; i--) {
            const d = drops[i]
            d.y += d.speed
            if (d.y - d.length > H) {
               drops.splice(i, 1)
               continue
            }
            for (let j = 0; j < d.length; j++) {
               const cy = Math.floor(d.y - j)
               if (cy >= 0 && cy < H && d.x >= 0 && d.x < W) {
                  // randomly mutate characters
                  if (Math.random() < 0.05) d.chars[j] = CHARS[Math.floor(Math.random() * CHARS.length)]
                  grid[cy][d.x] = d.chars[j] || "X"
               }
            }
         }

         const lines = [
          "  ┌" + "─".repeat(W) + "┐",
          ...grid.map(row => "  │" + row.join("") + "│"),
          "  └" + "─".repeat(W) + "┘"
         ]
         ctx.replaceLastLines(H + 2, lines, "accent", "frame")
         step++
      }, 50)
    }
  },
  {
    name: "maze",
    help: { usage: "maze", description: "Generate a random terminal maze" },
    run: (ctx) => {
      const W = 31, H = 15;
      const maze = Array.from({length: H}, () => Array(W).fill("█"))
      const stack = [{x: 1, y: 1}]
      maze[1][1] = " "
      while (stack.length > 0) {
        const {x, y} = stack[stack.length - 1]
        const dirs = [{dx:0, dy:-2}, {dx:0, dy:2}, {dx:-2, dy:0}, {dx:2, dy:0}].sort(() => Math.random() - 0.5)
        let carved = false
        for (const {dx, dy} of dirs) {
          const nx = x + dx, ny = y + dy
          if (nx > 0 && nx < W-1 && ny > 0 && ny < H-1 && maze[ny][nx] === "█") {
            maze[y+dy/2][x+dx/2] = " "
            maze[ny][nx] = " "
            stack.push({x: nx, y: ny})
            carved = true
            break
          }
        }
        if (!carved) stack.pop()
      }
      const getWall = (x: number, y: number) => {
        const isW = (cx: number, cy: number) => cy >= 0 && cy < H && cx >= 0 && cx < W && maze[cy][cx] === "█"
        const n = isW(x, y-1)
        const s = isW(x, y+1)
        const e = isW(x+1, y)
        const w = isW(x-1, y)
        if (n && s && e && w) return "┼"
        if (n && s && e) return "├"
        if (n && s && w) return "┤"
        if (e && w && n) return "┴"
        if (e && w && s) return "┬"
        if (n && s) return "│"
        if (e && w) return "─"
        if (n && e) return "└"
        if (n && w) return "┘"
        if (s && e) return "┌"
        if (s && w) return "┐"
        if (n || s) return "│"
        if (e || w) return "─"
        return "·"
      }
      
      const nextMaze = maze.map((row, y) => row.map((cell, x) => cell === "█" ? getWall(x, y) : cell))
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          maze[y][x] = nextMaze[y][x]
        }
      }

      maze[1][0] = "S"; maze[H-2][W-1] = "E";
      ctx.injectLine("  PROCEDURAL MAZE", "accent", "heading")
      ctx.injectLine("  ┌" + "─".repeat(W) + "┐", "normal", "frame")
      maze.forEach(row => ctx.injectLine("  │" + row.join("") + "│", "normal", "frame"))
      ctx.injectLine("  └" + "─".repeat(W) + "┘", "normal", "frame")
      ctx.chime("tender")

      // Animated BFS solver
      const startNode = {x: 0, y: 1}
      const endNode = {x: W-1, y: H-2}
      const queue: {x: number, y: number, path: {x: number, y: number}[]}[] = [{...startNode, path: []}]
      const visited = new Set<string>()
      visited.add(`0,1`)

      activeCommandInterval = setInterval(() => {
        if (queue.length === 0) {
          clearInterval(activeCommandInterval)
          return
        }

        const current = queue.shift()!
        if (current.x === endNode.x && current.y === endNode.y) {
          clearInterval(activeCommandInterval)
          current.path.forEach(({x, y}) => {
            if (maze[y][x] === "·" || maze[y][x] === " ") maze[y][x] = "•" // Highlight final path
          })
          const lines = [
            "  ┌" + "─".repeat(W) + "┐",
            ...maze.map(row => "  │" + row.join("") + "│"),
            "  └" + "─".repeat(W) + "┘"
          ]
          ctx.replaceLastLines(H + 2, lines, "accent", "frame")
          ctx.chime("tender")
          return
        }

        const dirs = [{dx: 0, dy: -1}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: 1, dy: 0}]
        let foundNew = false

        for (const {dx, dy} of dirs) {
          const nx = current.x + dx
          const ny = current.y + dy
          if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
            if (maze[ny][nx] === " " || maze[ny][nx] === "E") {
              const key = `${nx},${ny}`
              if (!visited.has(key)) {
                visited.add(key)
                queue.push({x: nx, y: ny, path: [...current.path, {x: nx, y: ny}]})
                if (maze[ny][nx] === " ") {
                  maze[ny][nx] = "·" // Show search progress
                }
                foundNew = true
              }
            }
          }
        }

        // Only draw if we expanded the search frontier, to save frames
        if (foundNew) {
          const lines = [
            "  ┌" + "─".repeat(W) + "┐",
            ...maze.map(row => "  │" + row.join("") + "│"),
            "  └" + "─".repeat(W) + "┘"
          ]
          ctx.replaceLastLines(H + 2, lines, "normal", "frame")
        }
      }, 50)
    }
  },
  {
    name: "topology",
    aliases: ["stats", "graph"],
    help: { usage: "topology", description: "Visualise the garden's tags and connections" },
    run: (ctx) => {
      const notes = ctx.getNotes()
      const articles = notes.filter(n => !n.slug.startsWith("users/"))
      const longestNote = [...notes].sort((a,b) => (b.excerpt?.length || 0) - (a.excerpt?.length || 0))[0]
      const sha = typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_GIT_SHA 
                  ? (import.meta as any).env.VITE_GIT_SHA.substring(0, 7) 
                  : "e4f8a9b"
      
      const tagCounts = new Map<string, number>()
      notes.forEach(n => n.tags.forEach(t => tagCounts.set(t, (tagCounts.get(t) || 0) + 1)))
      
      const sorted = [...tagCounts.entries()].sort((a,b) => b[1] - a[1]).slice(0, 8)
      const max = Math.max(...sorted.map(s => s[1]), 1)
      
      ctx.injectLine("  GARDEN TOPOLOGY", "accent", "heading")
      ctx.injectLine(`  Scale:         ${notes.length} total nodes`, "normal")
      ctx.injectLine(`  Articles:      ${articles.length} wiki articles`, "normal")
      ctx.injectLine(`  Longest Note:  [${longestNote?.slug || "none"}]`, "normal")
      ctx.injectLine(`  Git SHA:       ${sha}`, "normal")
      ctx.injectLine("", "normal")
      ctx.injectLine("  Density by concept:", "muted")
      
      const BAR_CHARS = [" ", "▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"]
      
      sorted.forEach(([tag, count]) => {
         const width = (count / max) * 20
         const fullBlocks = Math.floor(width)
         const remainder = Math.floor((width - fullBlocks) * 8)
         const bar = "█".repeat(fullBlocks) + (remainder > 0 ? BAR_CHARS[remainder] : "")
         ctx.injectLine(`  ${tag.padEnd(16)} │ ${bar} ${count}`, "normal")
      })
      ctx.chime("tender")
    }
  },
  {
    name: "holyc",
    run: (ctx) => {
      ctx.injectLine("  U0 Main() {", "accent")
      ctx.injectLine('    Print("The garden is a temple.\\n");', "normal")
      ctx.injectLine("  }", "accent")
      ctx.chime("tender")
    },
  },
  {
    name: "calc",
    aliases: ["math"],
    help: { usage: "calc <expr>", description: "Evaluate a mathematical expression" },
    run: (ctx, args) => {
      const expr = args.join(" ")
      if (!expr) {
        ctx.injectLine("  usage: calc <expr>", "warning")
        return
      }
      try {
        if (/[^0-9\+\-\*\/\(\)\.\s\%\|\&\^\~\<\>]/g.test(expr)) {
           ctx.injectLine("  calc: invalid characters in expression", "error")
           return
        }
        const result = new Function(`return (${expr})`)()
        ctx.injectLine(`  ${expr} = ${result}`, "accent")
      } catch (err) {
        ctx.injectLine(`  calc: error evaluating expression`, "error")
      }
    }
  },
  {
    name: "users",
    help: { usage: "users", description: "List known operator handles" },
    run: (ctx) => {
      const notes = ctx.getNotes()
      const users = new Set<string>()
      notes.forEach(n => {
         if (n.username) users.add(n.username.toLowerCase())
      })
      ctx.injectLine("  KNOWN OPERATORS", "accent", "heading")
      if (users.size === 0) {
        ctx.injectLine("  no known operators found.", "muted")
        return
      }
      Array.from(users).sort().forEach(u => ctx.injectLine(`  @${u}`, "normal"))
    }
  },
  {
    name: "whois",
    help: { usage: "whois <username>", description: "Query operator profile details" },
    run: (ctx, args) => {
      const target = args[0]?.toLowerCase()
      if (!target) {
         ctx.injectLine("  usage: whois <username>", "warning")
         return
      }
      const notes = ctx.getNotes()
      // find profile note
      const profileNote = notes.find(n => n.username?.toLowerCase() === target)
      
      ctx.injectLine(`  TARGET PROFILE: @${target}`, "accent", "heading")
      
      if (profileNote && profileNote.excerpt) {
         ctx.injectLine(`  bio: ${profileNote.excerpt}`, "tender")
      } else {
         ctx.injectLine(`  no profile biography found.`, "muted")
      }

      const mentions = notes.filter(n =>
         (n.username?.toLowerCase() === target && n !== profileNote) ||
         n.slug.toLowerCase().includes(target) ||
         n.title.toLowerCase().includes(target) ||
         n.excerpt?.toLowerCase().includes(target) ||
         n.tags.some(t => t.toLowerCase().includes(target))
      )

      if (mentions.length > 0) {
        ctx.injectLine("", "normal")
        ctx.injectLine(`  pages referencing '@${target}':`, "muted")
        mentions.forEach(m => {
          ctx.injectLine(`  ${m.slug.padEnd(28).slice(0, 28)} ${m.title}`, "normal")
        })
      } else {
        ctx.injectLine("", "normal")
        ctx.injectLine(`  no additional references found in garden.`, "muted")
      }
    }
  },
  {
    name: "edit",
    requireRole: "editor",
    help: { usage: "edit <slug>", description: "Launch the external Wiki editor" },
    run: (ctx, args) => {
       const slug = args[0]
       if (!slug) {
         ctx.injectLine("  usage: edit <slug>", "warning")
         return
       }
       ctx.injectLine(`  launching editor interface for [${slug}]...`, "accent")
       if (typeof window !== "undefined") {
         window.open(`https://wiki.subsurfaces.net/edit/${encodeURIComponent(slug)}`, "_blank")
       }
    }
  },
  {
    name: "admin",
    requireRole: "admin",
    help: { usage: "admin", description: "Access elevated subroutines" },
    run: (ctx) => {
      ctx.injectLine("  admin module loaded.", "accent")
      ctx.injectLine("  available elevated routines: [list users, system override, purge logs]", "muted")
    }
  },
  {
    name: "play",
    help: { usage: "play [track]", description: "Play garden ambient music" },
    run: (ctx, args) => {
      if (args[0]) {
        ctx.music.playTrack(args.join(" "))
        ctx.injectLine(`  tuning to frequency: ${args.join(" ")}`, "accent")
      } else {
        ctx.music.togglePlay()
        ctx.injectLine(ctx.music.isPlaying ? "  halting playback" : "  resuming playback", "accent")
      }
      runBootCommand("cat m0rvidd", ctx)
    }
  },
  {
    name: "track",
    aliases: ["playing"],
    help: { usage: "track", description: "Show current track details" },
    run: (ctx) => {
      const { tracks, currentTrackIndex, isPlaying } = ctx.music
      if (tracks.length === 0) {
        ctx.injectLine("  no tracks available.", "muted")
        return
      }
      const t = tracks[currentTrackIndex]
      ctx.injectLine(`  CURRENT TRACK [${isPlaying ? "PLAYING" : "PAUSED"}]`, "accent", "heading")
      ctx.injectLine(`  Title:  ${t.title}`, "normal")
      ctx.injectLine(`  Slug:   ${t.slug}`, "normal")
      ctx.injectLine(`  Link:   https://soundcloud.com/m0rvidd/${t.slug.replace("music/", "")}`, "normal")
    }
  },
  {
    name: "tracks",
    help: { usage: "tracks", description: "List available tracks" },
    run: (ctx) => {
      const { tracks } = ctx.music
      ctx.injectLine("  AVAILABLE FREQUENCIES", "accent", "heading")
      tracks.forEach((t, i) => {
        ctx.injectLine(`  [${i.toString().padStart(2, "0")}] ${t.title} (${t.slug})`, "normal")
      })
    }
  },
  {
    name: "playlist",
    help: { usage: "playlist [add <slug>|clear]", description: "Construct a music playlist" },
    run: (ctx, args) => {
      if (args[0] === "add" && args[1]) {
        const slug = args[1]
        const idx = ctx.music.tracks.findIndex(t => t.slug === slug)
        if (idx === -1) {
          ctx.injectLine(`  track not found: ${slug}`, "error")
        } else {
          ctx.music.setPlaylist([...ctx.music.playlist, idx])
          ctx.injectLine(`  added ${slug} to playlist`, "accent")
        }
      } else if (args[0] === "clear") {
        ctx.music.setPlaylist([])
        ctx.injectLine("  playlist cleared", "accent")
      } else {
        ctx.injectLine(`  PLAYLIST (${ctx.music.playlist.length} tracks)`, "accent", "heading")
        if (ctx.music.playlist.length === 0) {
          ctx.injectLine("  empty.", "muted")
        } else {
          ctx.music.playlist.forEach((idx, i) => {
            const t = ctx.music.tracks[idx]
            ctx.injectLine(`  ${i + 1}. ${t.title}`, "normal")
          })
        }
      }
    }
  },
  {
    name: "repeat",
    help: { usage: "repeat [off|track|all]", description: "Set music repeat mode" },
    run: (ctx, args) => {
      const mode = args[0]
      if (mode === "off" || mode === "track" || mode === "all") {
        ctx.music.setRepeatMode(mode)
        ctx.injectLine(`  repeat mode set to ${mode}`, "accent")
      } else {
        ctx.injectLine(`  current repeat mode: ${ctx.music.repeatMode}`, "normal")
        ctx.injectLine("  usage: repeat [off|track|all]", "warning")
      }
    }
  },
  {
    name: "pause",
    help: { usage: "pause", description: "Pause garden music" },
    run: (ctx) => {
      if (ctx.music.isPlaying) {
        ctx.music.togglePlay()
        ctx.injectLine("  music paused.", "muted")
      } else {
        ctx.injectLine("  no music playing.", "muted")
      }
    }
  },
  {
    name: "next",
    help: { usage: "next", description: "Next music track" },
    run: (ctx) => {
      ctx.music.nextTrack()
      ctx.injectLine("  skipping track...", "accent")
    }
  },
  {
    name: "prev",
    help: { usage: "prev", description: "Previous music track" },
    run: (ctx) => {
      ctx.music.prevTrack()
      ctx.injectLine("  reversing track...", "accent")
    }
  },
  {
    name: "vol",
    help: { usage: "vol <0-100>", description: "Set master system volume" },
    run: (ctx, args) => {
      const v = parseInt(args[0], 10)
      if (isNaN(v) || v < 0 || v > 100) {
        ctx.injectLine(`  current volume: ${Math.round(ctx.music.volume * 100)}%`, "normal")
        ctx.injectLine("  usage: vol <0-100>", "warning")
      } else {
        ctx.music.setVolume(v / 100)
        ctx.injectLine(`  volume set to ${v}%`, "accent")
      }
    }
  },
  {
    name: "boot",
    run: (ctx) => ctx.injectLine("  system is already running", "muted"),
  },
  {
    name: "login",
    aliases: ["auth"],
    help: { usage: "login", description: "Authenticate to the psychograph mainframe" },
    run: (ctx) => {
      ctx.injectLine("  Initiating auth handshake...", "accent")
      setTimeout(() => {
        ctx.triggerLogin()
      }, 500)
    }
  },
  {
    name: "chat",
    aliases: ["philchat"],
    help: { usage: "chat", description: "Connect to the subsurfaces terminal chat" },
    run: (ctx) => {
      ctx.injectLine("  Establishing secure connection to chat.subsurfaces.net...", "accent")
      ctx.chime("success")
      setTimeout(() => {
        const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        const host = isLocal ? window.location.host : "chat.subsurfaces.net"
        ctx.navigate(`${window.location.protocol}//${host}/?terminal=1`)
      }, 1000)
    }
  },
  {
    name: "talk",
    help: { usage: "talk <persona> <message>", description: "Talk to Willow, Deleuze, Spinoza, Trump, Jeh, or Hpcr" },
    run: (ctx, args) => {
      const personaName = args[0]?.toLowerCase()
      if (!personaName || !PERSONAS[personaName as PersonaId]) {
         ctx.injectLine("  Usage: talk [willow|deleuze|spinoza|trump|jeh|hpcr] <message>", "warning")
         return
      }
      
      const pId = personaName as PersonaId
      const p = PERSONAS[pId]
      const msg = args.slice(1).join(" ")
      
      if (!msg) {
         ctx.injectLine(`  [${p.name}] ${p.generics[0]}`, p.color)
         ctx.chime("tender")
         return
      }

      ctx.injectLine(`  > ${msg}`, "muted")
      setTimeout(() => {
        const reply = generateReply(pId, msg)
        ctx.injectLine(`  [${p.name}] ${reply}`, p.color)
        ctx.chime("tender")
      }, 600)
    }
  },
  {
    name: "debate",
    help: { usage: "debate <persona1> <persona2> [topic]", description: "Watch two personas debate a topic" },
    run: (ctx, args) => {
      const p1Name = args[0]?.toLowerCase()
      const p2Name = args[1]?.toLowerCase()
      
      if (!p1Name || !PERSONAS[p1Name as PersonaId] || !p2Name || !PERSONAS[p2Name as PersonaId]) {
         ctx.injectLine("  Usage: debate <persona1> <persona2> [topic]", "warning")
         return
      }
      
      const p1 = PERSONAS[p1Name as PersonaId]
      const p2 = PERSONAS[p2Name as PersonaId]
      const initialTopic = args.slice(2).join(" ") || "the nature of reality"
      
      ctx.injectLine(`  INITIATING DEBATE: ${p1.name} vs ${p2.name}`, "accent", "heading")
      ctx.injectLine(`  Topic: ${initialTopic}`, "normal")
      ctx.chime("tender")
      
      let turn = 0
      let lastMsg = initialTopic

      activeCommandInterval = setInterval(() => {
        if (turn > 6) {
           clearInterval(activeCommandInterval)
           ctx.injectLine(`  DEBATE CONCLUDED.`, "muted")
           return
        }
        
        const speaker = turn % 2 === 0 ? p1 : p2
        const reply = generateReply(speaker.id, lastMsg)
        
        ctx.injectLine(`  [${speaker.name}] ${reply}`, speaker.color)
        ctx.chime("tender")
        
        lastMsg = reply
        turn++
      }, 2500)
    }
  },
]

/** Lookup table from every name + alias to its command. */
const COMMAND_INDEX: ReadonlyMap<string, BootCommand> = (() => {
  const map = new Map<string, BootCommand>()
  for (const command of BOOT_COMMANDS) {
    map.set(command.name, command)
    for (const alias of command.aliases ?? []) map.set(alias, command)
  }
  return map
})()

/** All command names + aliases, for Tab-autocomplete. */
export const COMMAND_NAMES: readonly string[] = Array.from(COMMAND_INDEX.keys())

/** Commands that expose a help entry, in registry order. */
export const HELP_COMMANDS: readonly BootCommand[] = BOOT_COMMANDS.filter(
  (command) => command.help,
)

/**
 * Parse and dispatch a raw command line. Returns true if a command ran, false
 * if the command was not recognised (the caller emits the "not found" line so
 * it can include the original token casing).
 */
export let activeCommandInterval: any = null

export function clearActiveCommand() {
  if (activeCommandInterval) {
    clearInterval(activeCommandInterval)
    activeCommandInterval = null
  }
}

export function runBootCommand(raw: string, ctx: BootCommandContext): boolean {
  clearActiveCommand()

  const trimmed = raw.trim()
  if (!trimmed) return false

  const tokens = trimmed.split(/\s+/)
  const name = tokens[0].toLowerCase()
  const command = COMMAND_INDEX.get(name)
  if (!command) return false

  const role = ctx.getUser()?.role || "pending"
  const isAdmin = role === "admin"
  const isEditor = role === "editor" || isAdmin

  if (command.requireRole === "admin" && !isAdmin) {
    ctx.injectLine("  permission denied: requires elevated access", "error")
    return true
  }
  if (command.requireRole === "editor" && !isEditor) {
    ctx.injectLine("  permission denied: requires editor access", "error")
    return true
  }

  // For the bare `light` / `dark` aliases, fold the verb back into args so the
  // `mode` handler sees it uniformly.
  const args =
    command.name === "mode" && name !== "mode"
      ? [name, ...tokens.slice(1)]
      : tokens.slice(1)

  command.run(ctx, args)
  return true
}
