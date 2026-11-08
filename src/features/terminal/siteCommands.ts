/**
 * Commands that act on the site around the prompt: the look of the page, the
 * reader, the note you are on. Every QuickControls action has a command here,
 * so the bar is a shortcut for the prompt rather than a second interface.
 *
 * They read and write the store directly. That is fine for the dock and the
 * /terminal page, which live inside a garden shell; the OS has its own desktop
 * and never sees these (`only`).
 */

import { BG_MODES, BG_META, ROYGBIV_ACCENTS, useStore } from "@/store"
import { HOTKEY_GROUPS, hotkeysForShell, type Shell } from "@/config/hotkeys"
import type { TerminalCommand, TerminalContext } from "./types"

const ACCENT_NAMES = ["red", "orange", "amber", "green", "blue", "indigo", "violet"] as const

function prefix(values: readonly string[], value: string): string[] {
  const q = value.toLowerCase()
  return values.filter((v) => v.toLowerCase().startsWith(q))
}

/** The note the reader is on, if any. */
function currentNote() {
  const { activeGraphSlug, contentIndex } = useStore.getState()
  if (!activeGraphSlug || !contentIndex) return null
  const key = activeGraphSlug.toLowerCase()
  const entry = contentIndex[activeGraphSlug] ?? Object.values(contentIndex).find((n) => n.slug.toLowerCase() === key)
  return entry ?? null
}

/** h2–h4 of the article on screen, read from the DOM (it is already rendered). */
function headings(): { id: string; text: string; level: number }[] {
  const root = document.getElementById("main-content")
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>("h2[id], h3[id], h4[id]")).map((el) => ({
    id: el.id,
    text: (el.textContent ?? "").trim(),
    level: Number(el.tagName[1]),
  }))
}

async function copy(ctx: TerminalContext, text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    ctx.print(`copied ${what}: ${text}`, "success")
  } catch {
    ctx.print(`could not reach the clipboard. ${what}: ${text}`, "warning")
  }
}

function noNote(ctx: TerminalContext) {
  ctx.print("no note open here.", "muted")
}

function shellOf(): Shell {
  const host = typeof window === "undefined" ? "" : window.location.hostname
  if (host.startsWith("wiki.")) return "wiki"
  if (host.startsWith("chat.")) return "chat"
  return "main"
}

export const SITE_COMMANDS: TerminalCommand[] = [
  {
    name: "here",
    aliases: ["whereami", "pwd"],
    group: "site",
    only: ["dock"],
    help: { usage: "here", description: "About the note you are reading" },
    run: (ctx) => {
      const note = currentNote()
      if (!note) return noNote(ctx)
      ctx.print(note.title, "accent")
      const facts = [
        note.date && `dated ${note.date}`,
        note.readingTime && `${note.readingTime} min read`,
        note.growth && `growth: ${note.growth}`,
      ].filter(Boolean)
      if (facts.length) ctx.print(`  ${facts.join(" · ")}`, "muted")
      if (note.tags?.length) ctx.print(`  ${note.tags.map((t) => `#${t}`).join(" ")}`, "muted")
      ctx.print(`  links out ${note.links?.length ?? 0} · linked from ${note.backlinks?.length ?? 0}`, "muted")
      const hs = headings()
      if (hs.length) ctx.print("  `toc` for its sections, `backlinks` for what points here.", "muted")
    },
  },
  {
    name: "toc",
    aliases: ["contents"],
    group: "site",
    only: ["dock"],
    help: { usage: "toc", description: "Sections of the note on screen" },
    run: (ctx) => {
      const hs = headings()
      if (!hs.length) return ctx.print("this page has no sections.", "muted")
      for (const h of hs) ctx.print(`${"  ".repeat(h.level - 1)}${h.text}`)
      ctx.print("`goto <section>` jumps there (Tab completes).", "muted")
    },
  },
  {
    name: "goto",
    aliases: ["jump"],
    group: "site",
    only: ["dock"],
    help: { usage: "goto <section>", description: "Scroll to a section of this note" },
    complete: (_ctx, value) => prefix(headings().map((h) => h.text), value),
    run: (ctx, args) => {
      const q = args.join(" ").toLowerCase()
      if (!q) return ctx.print("usage: goto <section>", "warning")
      const hs = headings()
      const hit = hs.find((h) => h.text.toLowerCase() === q) ?? hs.find((h) => h.text.toLowerCase().includes(q))
      if (!hit) return ctx.print(`goto: no section matching '${args.join(" ")}'`, "error")
      document.getElementById(hit.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
      ctx.print(`→ ${hit.text}`, "accent")
    },
  },
  {
    name: "top",
    group: "site",
    only: ["dock"],
    help: { usage: "top", description: "Back to the top of the page" },
    run: (ctx) => {
      document.getElementById("main-content")?.scrollTo({ top: 0, behavior: "smooth" })
      ctx.print("↑", "muted")
    },
  },
  {
    name: "backlinks",
    aliases: ["refs"],
    group: "site",
    only: ["dock"],
    help: { usage: "backlinks", description: "Notes that link to this one" },
    run: (ctx) => {
      const note = currentNote()
      if (!note) return noNote(ctx)
      const index = useStore.getState().contentIndex ?? {}
      const refs = (note.backlinks ?? []).map((slug) => index[slug]).filter((n) => n && !n.private)
      if (!refs.length) return ctx.print("nothing links here yet.", "muted")
      for (const ref of refs) ctx.print(`  ${ref!.title}  \`open ${ref!.slug}\``)
    },
  },
  {
    name: "cite",
    aliases: ["wikilink"],
    group: "site",
    only: ["dock"],
    help: { usage: "cite", description: "Copy a [[wikilink]] to this note" },
    run: (ctx) => {
      const note = currentNote()
      if (!note) return noNote(ctx)
      return copy(ctx, `[[${note.title}]]`, "wikilink")
    },
  },
  {
    name: "share",
    aliases: ["link", "url"],
    group: "site",
    only: ["dock"],
    help: { usage: "share", description: "Copy this page's address" },
    run: (ctx) => copy(ctx, window.location.href, "link"),
  },
  {
    name: "bg",
    aliases: ["background"],
    group: "site",
    only: ["dock", "page"],
    help: { usage: "bg [mode|next|off]", description: "Change the background" },
    complete: (_ctx, value) => prefix(["next", "off", "on", ...BG_MODES], value),
    run: (ctx, args) => {
      const store = useStore.getState()
      const arg = args[0]?.toLowerCase()
      if (!arg) {
        ctx.print(`background: ${BG_META[store.bgMode]?.label ?? store.bgMode}`, "accent")
        ctx.print(`  ${BG_MODES.join(" · ")}`, "muted")
        return
      }
      if (arg === "next") {
        store.cycleBgMode()
      } else if (arg === "off") {
        store.setBgStyle("off")
        return ctx.print("background off. `bg on` brings it back.", "muted")
      } else if (arg === "on") {
        store.setBgStyle("vectors")
      } else if ((BG_MODES as readonly string[]).includes(arg)) {
        store.setBgMode(arg as (typeof BG_MODES)[number])
      } else {
        return ctx.print(`bg: no mode '${arg}'`, "error")
      }
      const mode = useStore.getState().bgMode
      ctx.print(`background: ${BG_META[mode]?.label ?? mode} — ${BG_META[mode]?.desc ?? ""}`, "success")
    },
  },
  {
    name: "accent",
    aliases: ["colour", "color"],
    group: "site",
    only: ["dock", "page"],
    help: { usage: "accent [next|red|…|violet]", description: "Change the accent colour" },
    complete: (_ctx, value) => prefix(["next", ...ACCENT_NAMES], value),
    run: (ctx, args) => {
      const store = useStore.getState()
      const arg = args[0]?.toLowerCase()
      if (!arg || arg === "next") store.cycleAccent()
      else {
        const i = ACCENT_NAMES.indexOf(arg as (typeof ACCENT_NAMES)[number])
        if (i === -1) return ctx.print(`accent: expected one of ${ACCENT_NAMES.join(", ")}`, "error")
        store.setAccentBase(ROYGBIV_ACCENTS[i])
      }
      const now = useStore.getState().accentBase
      const name = ACCENT_NAMES[ROYGBIV_ACCENTS.indexOf(now)] ?? now
      ctx.print(`accent: ${name}`, "success")
    },
  },
  {
    name: "reader",
    aliases: ["focus"],
    group: "site",
    only: ["dock"],
    help: { usage: "reader [on|off|bigger|smaller|wider|narrower]", description: "Reader mode and its typography" },
    complete: (_ctx, value) => prefix(["on", "off", "bigger", "smaller", "wider", "narrower"], value),
    run: (ctx, args) => {
      const store = useStore.getState()
      const arg = args[0]?.toLowerCase()
      if (!arg) store.toggleReaderMode()
      else if (arg === "on" || arg === "off") {
        if (store.isReaderMode !== (arg === "on")) store.toggleReaderMode()
      } else if (arg === "bigger") store.cycleReaderScale(1)
      else if (arg === "smaller") store.cycleReaderScale(-1)
      else if (arg === "wider") store.cycleReaderMeasure(1)
      else if (arg === "narrower") store.cycleReaderMeasure(-1)
      else return ctx.print(`reader: unknown option '${arg}'`, "error")
      const s = useStore.getState()
      ctx.print(
        `reader ${s.isReaderMode ? "on" : "off"} · ${Math.round(s.readerScale * 100)}% · ${s.readerMeasureCh}ch`,
        "success",
      )
    },
  },
  {
    name: "look",
    aliases: ["settings", "prefs"],
    group: "site",
    only: ["dock", "page"],
    help: { usage: "look", description: "Open settings: look, reading, background" },
    run: (ctx) => {
      useStore.getState().toggleThemePanel()
      ctx.print("settings toggled (\\ does the same)", "muted")
    },
  },
  {
    name: "player",
    aliases: ["turntable"],
    group: "music",
    only: ["dock"],
    help: { usage: "player", description: "Open the music player" },
    run: (ctx) => {
      if (shellOf() !== "main") return ctx.print("the turntable lives on subsurfaces.net.", "muted")
      const store = useStore.getState()
      store.setIsMusicExpanded(!store.isMusicExpanded)
      ctx.print(store.isMusicExpanded ? "player closed" : "player open", "muted")
    },
  },
  {
    name: "philchat",
    aliases: ["room"],
    group: "people",
    only: ["dock"],
    help: { usage: "philchat", description: "Open philchat in the dock" },
    run: (ctx) => {
      if (shellOf() === "chat") return ctx.print("you are already in philchat.", "muted")
      useStore.getState().openDock("chat")
    },
  },
  {
    name: "keys",
    aliases: ["shortcuts", "hotkeys"],
    group: "system",
    only: ["dock", "page"],
    help: { usage: "keys", description: "Keyboard shortcuts" },
    run: (ctx) => {
      const keys = hotkeysForShell(shellOf())
      for (const group of HOTKEY_GROUPS) {
        const rows = keys.filter((k) => k.group === group)
        if (!rows.length) continue
        ctx.print("")
        ctx.print(`  ${group.toLowerCase()}`, "accent")
        for (const k of rows) ctx.print(`    ${k.keys.join("+").padEnd(9)}${k.label}`, "muted")
      }
      ctx.print("")
      ctx.print("  in the prompt: Tab completes, ↑↓ walk history or suggestions, Esc clears then closes.", "muted")
    },
  },
]
