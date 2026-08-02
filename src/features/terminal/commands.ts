/**
 * The curated command set.
 *
 * Replaces bootCommands.ts (1,820 lines, ~60 commands). Four families survive —
 * system, content, music/people, toys — and the split within toys is by nature,
 * not by taste: anything *spatial* (a board, a flock, a grid of cells) already
 * exists as a system page and becomes a launcher, so it opens in a real window
 * with real pixels. Anything *textual* stays here, where a terminal is actually
 * the right medium for it.
 *
 * Dropped with the old chrome: zoom/scope/net/proc/tail/inject/export,
 * pause/resume/restart, sound/speed. They controlled panes and playback that no
 * longer exist.
 */

import type { TerminalCommand, TerminalContext, TerminalNote } from "./types"
import { normalizeSlug } from "@/lib/slug"

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

function matchesPrefix(values: readonly string[], value: string): string[] {
  const q = value.toLowerCase()
  return Array.from(new Set(values.filter((candidate) => candidate.toLowerCase().startsWith(q)))).sort()
}

function noteCompletions(ctx: TerminalContext, value: string): string[] {
  return matchesPrefix(ctx.notes().map((note) => note.slug), value)
}

function findNote(ctx: TerminalContext, query: string): TerminalNote | null {
  const q = normalizeSlug(query)
  const notes = ctx.notes()
  return (
    notes.find((n) => normalizeSlug(n.slug) === q) ??
    notes.find((n) => n.title.toLowerCase() === query.toLowerCase()) ??
    notes.find((n) => normalizeSlug(n.slug).endsWith(`/${q}`)) ??
    notes.find((n) => n.title.toLowerCase().includes(query.toLowerCase())) ??
    null
  )
}

function columns(items: string[], width = 3): string[] {
  const out: string[] = []
  const colWidth = Math.max(...items.map((i) => i.length), 0) + 2
  for (let i = 0; i < items.length; i += width) {
    out.push(
      items
        .slice(i, i + width)
        .map((s) => s.padEnd(colWidth))
        .join("")
        .trimEnd(),
    )
  }
  return out
}

/** `usage: ...` then a blank line, the shape every command uses on bad args. */
function usage(ctx: TerminalContext, cmd: TerminalCommand) {
  ctx.print(`usage: ${cmd.help.usage}`, "warning")
}

// ---------------------------------------------------------------------------
// Programs — spatial toys and games, launched into a real surface.
// This map IS the bridge: one entry gives you a terminal command on the main
// site and a window in the OS, with no per-surface code.
// ---------------------------------------------------------------------------

export const PROGRAMS: Record<string, { slug: string; title: string }> = {
  life: { slug: "hex-life", title: "Hex Life" },
  boids: { slug: "murmuration", title: "Murmuration" },
  sand: { slug: "sandbox", title: "Sandbox" },
  snake: { slug: "snake", title: "Snake" },
  tetris: { slug: "tetris", title: "Tetris" },
  mines: { slug: "hex-mines", title: "Hex Mines" },
  ants: { slug: "ant-farm", title: "Ant Farm" },
  blackjack: { slug: "blackjack", title: "Blackjack" },
  chess: { slug: "chess", title: "Chess" },
  hexo: { slug: "hexo", title: "HeXO" },
  sigil: { slug: "sigil", title: "SIGIL" },
  graph: { slug: "graph", title: "Constellation" },
  arcade: { slug: "arcade", title: "Arcade" },
  shelf: { slug: "bookshelf", title: "Bookshelf" },
}

const programCommands: TerminalCommand[] = Object.entries(PROGRAMS).map(([name, prog]) => ({
  name,
  group: "programs" as const,
  help: { usage: name, description: `Launch ${prog.title}` },
  run: (ctx) => {
    ctx.print(`launching ${prog.title}...`, "accent")
    ctx.open(prog.slug, prog.title)
  },
}))

// ---------------------------------------------------------------------------
// System & session
// ---------------------------------------------------------------------------

const system: TerminalCommand[] = [
  {
    name: "help",
    aliases: ["?", "man"],
    group: "system",
    help: { usage: "help [command]", description: "List commands, or explain one" },
    complete: (_ctx, value) => matchesPrefix(COMMAND_NAMES, value),
    run: (ctx, args) => {
      if (args[0]) {
        const cmd = lookup(args[0])
        if (!cmd) return ctx.print(`help: no such command '${args[0]}'`, "error")
        ctx.print(`  ${cmd.help.usage}`, "accent")
        ctx.print(`  ${cmd.help.description}`)
        if (cmd.aliases?.length) ctx.print(`  aliases: ${cmd.aliases.join(", ")}`, "muted")
        return
      }

      const groups: [string, string][] = [
        ["system", "session"],
        ["content", "the garden"],
        ["music", "music"],
        ["people", "people"],
        ["toys", "toys"],
        ["programs", "programs"],
      ]

      for (const [group, label] of groups) {
        const names = COMMANDS.filter((c) => c.group === group).map((c) => c.name)
        if (!names.length) continue
        ctx.print("")
        ctx.print(`  ${label}`, "accent")
        ctx.printLines(columns(names, 5).map((l) => `    ${l}`), "muted")
      }
      ctx.print("")
      ctx.print("  `help <command>` for detail.", "muted")
    },
  },
  {
    name: "exit",
    aliases: ["quit", "logout"],
    group: "system",
    help: { usage: "exit", description: "Close this terminal" },
    run: (ctx) => {
      if (ctx.close) return ctx.close()
      ctx.print("exit: nothing to close — this terminal is the whole screen.", "muted")
      ctx.print("`site os` or `site garden` to go somewhere else.", "muted")
    },
  },
  {
    name: "clear",
    aliases: ["cls"],
    group: "system",
    help: { usage: "clear", description: "Clear the screen" },
    run: (ctx) => ctx.clear(),
  },
  {
    name: "whoami",
    group: "system",
    help: { usage: "whoami", description: "Show the current session identity" },
    run: (ctx) => {
      const user = ctx.user()
      if (!user?.username) {
        ctx.print("guest", "muted")
        ctx.print("`login` to identify yourself.", "muted")
        return
      }
      ctx.print(user.username, "accent")
      if (user.role) ctx.print(`role: ${user.role}`, "muted")
    },
  },
  {
    name: "neofetch",
    group: "system",
    help: { usage: "neofetch", description: "System summary" },
    run: (ctx) => {
      const notes = ctx.notes()
      const tags = new Set(notes.flatMap((n) => n.tags))
      const user = ctx.user()
      ctx.printLines(
        [
          "",
          `      ▄▄▄▄▄       ${user?.username ?? "guest"}@subsurfaces`,
          "     █     █      ───────────────────────",
          `     █  ▄  █      shell    ${ctx.surface === "window" ? "SUBSURFACES 95" : "terminal"}`,
          `      ▀▀▀▀▀       notes    ${notes.length}`,
          `        █         tags     ${tags.size}`,
          `      ▀▀▀▀▀       theme    ${ctx.theme.get()}`,
          `                  seed     ${ctx.seed.display}`,
          `                  tracks   ${ctx.music.tracks.length}`,
          "",
        ],
        "accent",
      )
    },
  },
  {
    name: "date",
    aliases: ["time"],
    group: "system",
    help: { usage: "date", description: "Current date and time" },
    run: (ctx) => ctx.print(new Date().toString()),
  },
  {
    name: "history",
    group: "system",
    help: { usage: "history", description: "Commands entered this session" },
    run: (ctx) => {
      const h = ctx.history()
      if (!h.length) return ctx.print("(empty)", "muted")
      ctx.printLines(h.map((cmd, i) => `  ${String(i + 1).padStart(3)}  ${cmd}`), "muted")
    },
  },
  {
    name: "theme",
    group: "system",
    help: { usage: "theme [light|dark]", description: "Get or set the site theme" },
    complete: (_ctx, value) => matchesPrefix(["light", "dark"], value),
    run: (ctx, args) => {
      const arg = args[0]?.toLowerCase()
      if (!arg) return ctx.print(ctx.theme.get())
      if (arg !== "light" && arg !== "dark") {
        return ctx.print("theme: expected 'light' or 'dark'", "error")
      }
      ctx.theme.set(arg)
      ctx.print(`theme set to ${arg}`, "success")
    },
  },
  {
    name: "seed",
    group: "system",
    help: { usage: "seed [new]", description: "Show the session seed, or generate one" },
    complete: (_ctx, value) => matchesPrefix(["new"], value),
    run: (ctx, args) => {
      if (args[0] === "new") {
        ctx.seed.reseed()
        return ctx.print("reseeding...", "accent")
      }
      ctx.print(ctx.seed.display, "accent")
      ctx.print("append ?seed=<value> to any terminal URL to reproduce a session.", "muted")
    },
  },
  {
    name: "status",
    group: "system",
    help: { usage: "status", description: "Session and content status" },
    run: (ctx) => {
      const notes = ctx.notes()
      ctx.printLines([
        `  surface   ${ctx.surface === "window" ? "windowed (SUBSURFACES 95)" : ctx.surface === "overlay" ? "garden overlay" : "fullscreen"}`,
        `  notes     ${notes.length} indexed`,
        `  identity  ${ctx.user()?.username ?? "guest"}`,
        `  seed      ${ctx.seed.display}`,
        `  audio     ${ctx.music.isPlaying ? "playing" : "idle"}`,
      ])
    },
  },
]

// ---------------------------------------------------------------------------
// Content — the garden
// ---------------------------------------------------------------------------

const content: TerminalCommand[] = [
  {
    name: "ls",
    aliases: ["dir"],
    group: "content",
    help: { usage: "ls [folder]", description: "List notes, or the contents of a folder" },
    complete: (ctx, value) =>
      matchesPrefix(
        ctx.notes().flatMap((note) => {
          const parts = (note.folder ?? "").split("/").filter(Boolean)
          return parts.map((_, index) => parts.slice(0, index + 1).join("/"))
        }),
        value,
      ),
    run: (ctx, args) => {
      const notes = ctx.notes()
      const folder = args[0]?.replace(/\/+$/, "").toLowerCase()

      if (!folder) {
        const folders = new Set<string>()
        const loose: string[] = []
        for (const n of notes) {
          if (n.folder) folders.add(n.folder.split("/")[0])
          else loose.push(n.slug)
        }
        ctx.print(`${folders.size} folder(s), ${loose.length} loose note(s)`, "muted")
        ctx.printLines(
          columns(Array.from(folders).sort().map((f) => `${f}/`), 4).map((l) => `  ${l}`),
          "accent",
        )
        if (loose.length) ctx.printLines(columns(loose.sort(), 3).map((l) => `  ${l}`))
        return
      }

      const inFolder = notes.filter((n) => (n.folder ?? "").toLowerCase().startsWith(folder))
      if (!inFolder.length) return ctx.print(`ls: '${args[0]}' not found`, "error")
      ctx.print(`${inFolder.length} note(s) in ${args[0]}`, "muted")
      ctx.printLines(inFolder.map((n) => `  ${n.slug}`).sort())
    },
  },
  {
    name: "cat",
    aliases: ["read", "less"],
    group: "content",
    help: { usage: "cat <note>", description: "Print a note into the terminal" },
    complete: noteCompletions,
    run: async (ctx, args) => {
      if (!args.length) return usage(ctx, content[1])
      const note = findNote(ctx, args.join(" "))
      if (!note) return ctx.print(`cat: '${args.join(" ")}': no such note`, "error")

      ctx.print(`── ${note.title} ──`, "accent")
      const raw = await ctx.fetchNote(note.contentPath)
      if (raw === null) {
        // House law: failure is visible and specific.
        ctx.print(`cat: could not read ${note.contentPath}`, "error")
        return
      }
      const { parseMarkdownToBootLines } = await import("@/features/boot/bootMarkdown")
      const { lines, truncated } = parseMarkdownToBootLines(raw, 160)
      for (const line of lines) ctx.print(line.text, line.tone)
      if (truncated) {
        ctx.print("")
        ctx.print(`  ... truncated. \`open ${note.slug}\` to read it properly.`, "muted")
      }
    },
  },
  {
    name: "open",
    aliases: ["o"],
    group: "content",
    complete: noteCompletions,
    help: { usage: "open <note>", description: "Open a note — a window in the OS, a page on the site" },
    run: (ctx, args) => {
      if (!args.length) return usage(ctx, content[2])
      const note = findNote(ctx, args.join(" "))
      if (!note) return ctx.print(`open: '${args.join(" ")}': no such note`, "error")
      ctx.print(`opening ${note.title}...`, "accent")
      ctx.open(note.slug, note.title)
    },
  },
  {
    name: "find",
    aliases: ["search", "grep"],
    group: "content",
    help: { usage: "find <query>", description: "Search titles, slugs and excerpts" },
    run: (ctx, args) => {
      if (!args.length) return usage(ctx, content[3])
      const q = args.join(" ").toLowerCase()
      const hits = ctx
        .notes()
        .filter(
          (n) =>
            n.title.toLowerCase().includes(q) ||
            n.slug.toLowerCase().includes(q) ||
            (n.excerpt ?? "").toLowerCase().includes(q),
        )
        .slice(0, 24)

      if (!hits.length) return ctx.print(`no matches for '${args.join(" ")}'`, "muted")
      ctx.print(`${hits.length} match(es)`, "muted")
      ctx.printLines(hits.map((n) => `  ${n.slug.padEnd(38)} ${n.title}`))
    },
  },
  {
    name: "tags",
    group: "content",
    help: { usage: "tags [tag]", description: "List all tags, or notes under one" },
    complete: (ctx, value) => matchesPrefix(ctx.notes().flatMap((note) => note.tags), value),
    run: (ctx, args) => {
      const notes = ctx.notes()
      if (!args[0]) {
        const counts = new Map<string, number>()
        for (const n of notes) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
        const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
        ctx.print(`${sorted.length} tag(s)`, "muted")
        ctx.printLines(columns(sorted.map(([t, c]) => `${t}(${c})`), 4).map((l) => `  ${l}`))
        return
      }
      const tag = args[0].replace(/^#/, "").toLowerCase()
      const hits = notes.filter((n) => n.tags.some((t) => t.toLowerCase() === tag))
      if (!hits.length) return ctx.print(`no notes tagged '${tag}'`, "muted")
      ctx.printLines(hits.map((n) => `  ${n.slug.padEnd(38)} ${n.title}`))
    },
  },
  {
    name: "random",
    aliases: ["lucky"],
    group: "content",
    help: { usage: "random", description: "Open a note at random" },
    run: (ctx) => {
      const notes = ctx.notes()
      if (!notes.length) return ctx.print("index is empty", "error")
      const note = pick(notes)
      ctx.print(`→ ${note.title}`, "accent")
      ctx.open(note.slug, note.title)
    },
  },
  {
    name: "site",
    aliases: ["www", "garden"],
    group: "content",
    complete: (_ctx, value) => matchesPrefix(["garden", "wiki", "chat", "os"], value),
    help: { usage: "site [wiki|chat|os]", description: "Leave for another surface" },
    run: (ctx, args) => {
      const target = args[0]?.toLowerCase() ?? "main"
      const urls: Record<string, string> = {
        main: "https://subsurfaces.net",
        garden: "https://subsurfaces.net",
        wiki: "https://wiki.subsurfaces.net",
        chat: "https://chat.subsurfaces.net",
        os: "https://os.subsurfaces.net",
      }
      const url = urls[target]
      if (!url) return ctx.print(`site: unknown surface '${target}'`, "error")
      ctx.print(`→ ${url}`, "accent")
      ctx.navigate(url)
    },
  },
]

// ---------------------------------------------------------------------------
// Music & people
// ---------------------------------------------------------------------------

const music: TerminalCommand[] = [
  {
    name: "play",
    group: "music",
    help: { usage: "play [track]", description: "Play a track, or resume" },
    complete: (ctx, value) => matchesPrefix(ctx.music.tracks.map((track) => track.title), value),
    run: (ctx, args) => {
      const { tracks } = ctx.music
      if (!tracks.length) return ctx.print("no tracks loaded", "error")
      if (!args.length) {
        ctx.music.togglePlay()
        return ctx.print(ctx.music.isPlaying ? "paused" : "playing", "accent")
      }
      const q = args.join(" ").toLowerCase()
      const idx = tracks.findIndex((t) => t.title.toLowerCase().includes(q))
      if (idx === -1) return ctx.print(`play: no track matching '${args.join(" ")}'`, "error")
      ctx.music.playTrack(idx)
      ctx.print(`♪ ${tracks[idx].title}`, "accent")
    },
  },
  {
    name: "tracks",
    aliases: ["playlist"],
    group: "music",
    help: { usage: "tracks", description: "List the library" },
    run: (ctx) => {
      const { tracks, currentTrackIndex } = ctx.music
      if (!tracks.length) return ctx.print("no tracks loaded", "muted")
      ctx.printLines(
        tracks.map(
          (t, i) => `  ${i === currentTrackIndex ? "▸" : " "} ${String(i + 1).padStart(2)}. ${t.title}`,
        ),
      )
    },
  },
  {
    name: "next",
    group: "music",
    help: { usage: "next", description: "Skip forward" },
    run: (ctx) => {
      ctx.music.nextTrack()
      ctx.print("▸▸", "muted")
    },
  },
  {
    name: "prev",
    group: "music",
    help: { usage: "prev", description: "Skip back" },
    run: (ctx) => {
      ctx.music.prevTrack()
      ctx.print("◂◂", "muted")
    },
  },
  {
    name: "volume",
    aliases: ["vol"],
    group: "music",
    help: { usage: "volume [0-100]", description: "Get or set output volume" },
    run: (ctx, args) => {
      if (!args[0]) return ctx.print(`${Math.round(ctx.music.volume * 100)}%`)
      const n = Number(args[0])
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return ctx.print("volume: expected 0-100", "error")
      }
      ctx.music.setVolume(n / 100)
      ctx.print(`volume ${n}%`, "success")
    },
  },
]

const people: TerminalCommand[] = [
  {
    name: "login",
    group: "people",
    help: { usage: "login", description: "Identify yourself" },
    run: (ctx) => {
      if (ctx.user()?.username) return ctx.print(`already ${ctx.user()!.username}`, "muted")
      ctx.print("opening sign-in...", "accent")
      ctx.requireLogin()
    },
  },
  {
    name: "whois",
    group: "people",
    help: { usage: "whois <username>", description: "Look up a garden profile" },
    run: (ctx, args) => {
      if (!args.length) return ctx.print("usage: whois <username>", "warning")
      const name = args[0].replace(/^@/, "")
      ctx.print(`→ /user/${name}`, "accent")
      ctx.navigate(`https://subsurfaces.net/user/${encodeURIComponent(name)}`)
    },
  },
  {
    name: "edit",
    group: "people",
    help: { usage: "edit <note>", description: "Open a note in the wiki editor" },
    complete: noteCompletions,
    run: (ctx, args) => {
      if (!args.length) return ctx.print("usage: edit <note>", "warning")
      const note = findNote(ctx, args.join(" "))
      const slug = note?.slug ?? normalizeSlug(args.join(" "))
      ctx.navigate(`https://wiki.subsurfaces.net/edit/${slug}`)
    },
  },
  {
    name: "new",
    group: "people",
    help: { usage: "new", description: "Create a wiki page" },
    requireRole: "editor",
    run: (ctx) => ctx.navigate("https://wiki.subsurfaces.net/new"),
  },
  {
    name: "admin",
    group: "people",
    help: { usage: "admin", description: "Open the owner dashboard" },
    requireRole: "admin",
    run: (ctx) => ctx.navigate("https://wiki.subsurfaces.net/admin"),
  },
]

// ---------------------------------------------------------------------------
// Toys — text-native only. Anything with a board or a field is in PROGRAMS.
// ---------------------------------------------------------------------------

const FORTUNES = [
  "The index is not the thing. The index is never the thing.",
  "You have more drafts than readers. This is the correct ratio.",
  "Everything you are avoiding is one file.",
  "A garden is someone caring, currently.",
  "The photograph outlived the reason for taking it.",
  "You will reread this in four years and understand it differently.",
  "Nothing is lost. It is all just unaddressed.",
  "The format outlives the reader.",
  "Write it in the dumbest possible format.",
  "Half of what you know, you were told by someone who was guessing.",
]

const ORACLE = [
  "Yes, but not for the reason you think.",
  "No. Ask again when you have written it down.",
  "The question is malformed. Try a smaller one.",
  "Already true. You have not checked.",
  "Not yet.",
  "It depends entirely on the thing you left out.",
  "Signs point to: read it again.",
  "Certainly. Certainty is cheap.",
]

const toys: TerminalCommand[] = [
  {
    name: "fortune",
    group: "toys",
    help: { usage: "fortune", description: "One line, from the compost" },
    run: (ctx) => ctx.print(`  ${pick(FORTUNES)}`, "tender"),
  },
  {
    name: "oracle",
    aliases: ["8ball"],
    group: "toys",
    help: { usage: "oracle <question>", description: "Consult the machine" },
    run: (ctx, args) => {
      if (!args.length) return ctx.print("oracle: ask something", "warning")
      ctx.print(`  ? ${args.join(" ")}`, "muted")
      ctx.print(`  ${pick(ORACLE)}`, "accent")
    },
  },
  {
    name: "roll",
    group: "toys",
    help: { usage: "roll [NdM]", description: "Roll dice, e.g. 2d6" },
    run: (ctx, args) => {
      const spec = args[0] ?? "1d6"
      const m = spec.match(/^(\d{1,2})?d(\d{1,3})$/i)
      if (!m) return ctx.print("roll: expected NdM, e.g. 2d6", "error")
      const count = Math.min(Number(m[1] ?? 1), 20)
      const sides = Math.max(2, Number(m[2]))
      const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides))
      const total = rolls.reduce((a, b) => a + b, 0)
      ctx.print(`  ${rolls.join(" + ")}${count > 1 ? ` = ${total}` : ""}`, "accent")
    },
  },
  {
    name: "moth",
    group: "toys",
    help: { usage: "moth", description: "A moth passes through" },
    run: async (ctx) => {
      const width = 46
      const frames = 6
      for (let i = 0; i < frames; i++) {
        const x = Math.floor((i / (frames - 1)) * (width - 4))
        const wings = i % 2 === 0 ? "\\|/" : "/|\\"
        const line = `${" ".repeat(x)}${wings}`
        if (i === 0) ctx.print(line, "tender")
        else ctx.replaceLastLines(1, [line], i === frames - 1 ? "muted" : "tender")
        await wait(120)
      }
    },
  },
  {
    name: "maze",
    group: "toys",
    help: { usage: "maze [width]", description: "Generate a maze" },
    run: async (ctx, args) => {
      // Ten PRINT. The whole program, and still the best ratio of line count to
      // output in the history of the form.
      const w = Math.max(8, Math.min(Number(args[0]) || 40, 78))
      for (let row = 0; row < 12; row++) {
        let line = "  "
        for (let col = 0; col < w; col++) line += Math.random() < 0.5 ? "╱" : "╲"
        ctx.print(line, "accent")
        await wait(45)
      }
    },
  },
  {
    name: "matrix",
    group: "toys",
    help: { usage: "matrix", description: "Glyph rain, briefly" },
    run: async (ctx) => {
      const glyphs = "アイウエオカキクケコサシスセソ0123456789"
      for (let row = 0; row < 10; row++) {
        let line = "  "
        for (let col = 0; col < 48; col++) {
          line += Math.random() < 0.28 ? glyphs[Math.floor(Math.random() * glyphs.length)] : " "
        }
        ctx.print(line, row < 3 ? "success" : row < 7 ? "accent" : "muted")
        await wait(70)
      }
    },
  },
  {
    name: "grow",
    group: "toys",
    help: { usage: "grow", description: "Something grows" },
    run: async (ctx) => {
      const stages = [
        "  .",
        "  |",
        "  |,",
        " \\|/",
        " \\|/,",
        " ,\\|/",
        " ,\\|/.",
        "  \\|/",
        "   |",
        "  _|_",
      ]
      for (let i = 0; i < stages.length; i++) {
        const tone = i < 3 ? "muted" : i < 7 ? "success" : "tender"
        if (i === 0) ctx.print(stages[i], tone)
        else ctx.replaceLastLines(1, [stages[i]], tone)
        await wait(110)
      }
    },
  },
  {
    name: "bsod",
    aliases: ["crash"],
    group: "toys",
    help: { usage: "bsod", description: "Cause a fatal exception" },
    run: (ctx) => {
      if (ctx.surface !== "window") {
        ctx.print("bsod: requires SUBSURFACES 95 (os.subsurfaces.net)", "error")
        return
      }
      ctx.print("causing a fatal exception...", "warning")
      window.dispatchEvent(new CustomEvent("os:bsod"))
    },
  },
  {
    name: "holyc",
    group: "toys",
    help: { usage: "holyc", description: "An offering" },
    run: (ctx) => {
      ctx.printLines(
        [
          '  "God said: I am the wind."',
          "",
          "  An idiot admires complexity.",
          "  A genius admires simplicity.",
          "",
          "  — Terry A. Davis, 1969–2018",
        ],
        "tender",
      )
    },
  },
]

// ---------------------------------------------------------------------------
// Interlocutors — the boot chatbot, restored as a proper session.
//
// `chat <who>` takes over the prompt until you `exit`. `debate <a> <b>` puts two
// personas in a room and feeds each one's reply to the other, which is a use the
// original never had and is much funnier than talking to them one at a time.
// ---------------------------------------------------------------------------

const people2: TerminalCommand[] = [
  {
    name: "chat",
    aliases: ["talk", "sysop"],
    group: "people",
    help: { usage: "chat [who]", description: "Talk to somebody. `exit` to leave." },
    run: async (ctx, args) => {
      const { PERSONAS, generateReply } = await import("@/features/boot/chatbot")
      const ids = Object.keys(PERSONAS) as (keyof typeof PERSONAS)[]

      if (!args.length) {
        ctx.print("who would you like to talk to?", "muted")
        ctx.printLines(
          columns(ids.map((id) => PERSONAS[id].name), 4).map((l) => `  ${l}`),
          "accent",
        )
        ctx.print("")
        ctx.print("  chat <name>", "muted")
        return
      }

      const query = args.join(" ").toLowerCase()
      const id = ids.find(
        (k) => k.toLowerCase() === query || PERSONAS[k].name.toLowerCase() === query,
      )
      if (!id) return ctx.print(`chat: nobody here called '${args.join(" ")}'`, "error")

      const persona = PERSONAS[id]
      ctx.print("")
      ctx.print(`— ${persona.name} is listening. \`exit\` to leave. —`, "muted")
      ctx.startSession({
        prompt: `${persona.name.toLowerCase()}>`,
        onInput: (line, c) => {
          c.print(`${persona.name}: ${generateReply(id, line)}`, persona.color)
        },
      })
    },
  },
  {
    name: "debate",
    group: "people",
    help: { usage: "debate <a> <b> [topic]", description: "Put two of them in a room" },
    run: async (ctx, args) => {
      const { PERSONAS, generateReply } = await import("@/features/boot/chatbot")
      const ids = Object.keys(PERSONAS) as (keyof typeof PERSONAS)[]
      const resolve = (q: string) =>
        ids.find((k) => k.toLowerCase() === q.toLowerCase() || PERSONAS[k].name.toLowerCase() === q.toLowerCase())

      if (args.length < 2) {
        ctx.print("usage: debate <a> <b> [topic]", "warning")
        ctx.print(`  e.g. debate deleuze zizek desire`, "muted")
        return
      }

      const a = resolve(args[0])
      const b = resolve(args[1])
      if (!a) return ctx.print(`debate: nobody called '${args[0]}'`, "error")
      if (!b) return ctx.print(`debate: nobody called '${args[1]}'`, "error")
      if (a === b) return ctx.print("debate: they agree.", "muted")

      const topic = args.slice(2).join(" ") || "the difference between things"
      ctx.print("")
      ctx.print(`— ${PERSONAS[a].name} vs ${PERSONAS[b].name}: ${topic} —`, "accent")
      ctx.print("")

      // Each reply becomes the other's next input. Six exchanges is enough to
      // be funny and short enough to stay funny.
      let utterance = topic
      let speaker = a
      for (let turn = 0; turn < 6; turn++) {
        const reply = generateReply(speaker, utterance)
        ctx.print(`${PERSONAS[speaker].name}: ${reply}`, PERSONAS[speaker].color)
        utterance = reply
        speaker = speaker === a ? b : a
        await wait(260)
      }

      ctx.print("")
      ctx.print("— neither conceded —", "muted")
    },
  },
]

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const COMMANDS: readonly TerminalCommand[] = [
  ...system,
  ...content,
  ...music,
  ...people,
  ...people2,
  ...toys,
  ...programCommands,
]

const BY_NAME = new Map<string, TerminalCommand>()
for (const cmd of COMMANDS) {
  BY_NAME.set(cmd.name, cmd)
  for (const alias of cmd.aliases ?? []) BY_NAME.set(alias, cmd)
}

export function lookup(name: string): TerminalCommand | undefined {
  return BY_NAME.get(name.toLowerCase())
}

/** Every name and alias, for tab completion. */
export const COMMAND_NAMES: readonly string[] = Array.from(BY_NAME.keys()).sort()
