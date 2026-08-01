/**
 * The terminal's command contract.
 *
 * Deliberately much smaller than the old BootCommandContext, which carried
 * zoom panes, telemetry toggles, palette cycling, follow-scroll, log export and
 * playback controls — 25 fields, most of them serving chrome that no longer
 * exists. What remains is what a command actually needs: write output, read the
 * garden, act on the site, and open something.
 */

import type { BootTone } from "@/features/boot/bootTypes"

export type Tone = BootTone

/** Where the terminal is mounted. The only thing commands branch on. */
export type Surface = "page" | "window"

/** A garden note as the terminal sees it. */
export interface TerminalNote {
  slug: string
  title: string
  tags: readonly string[]
  contentPath: string
  folder?: string
  username?: string
  excerpt?: string
}

/**
 * A command that takes over the prompt until the user leaves it — `chat` is the
 * only one so far. While a session is active, input is routed to `onInput`
 * instead of the command table; `exit` and `quit` always end it, so there is no
 * way to get stuck inside one.
 */
export interface TerminalSession {
  /** Replaces the prompt symbol while active, e.g. "deleuze>". */
  prompt: string
  onInput: (line: string, ctx: TerminalContext) => void | Promise<void>
}

export interface TerminalContext {
  /** Where this terminal is running — the one bridge affordance. */
  surface: Surface

  startSession: (session: TerminalSession) => void
  endSession: () => void

  print: (text: string, tone?: Tone) => void
  /** Convenience for multi-line output; blank strings are legal spacers. */
  printLines: (lines: string[], tone?: Tone) => void
  clear: () => void

  history: () => readonly string[]
  notes: () => readonly TerminalNote[]
  fetchNote: (contentPath: string) => Promise<string | null>

  /**
   * Open a garden slug. On the main site this navigates; inside the OS it opens
   * a window and the terminal stays put. Commands never branch on this — that
   * is the entire point of the bridge.
   */
  open: (slug: string, title?: string) => void
  /** Absolute or cross-subdomain navigation. */
  navigate: (url: string) => void
  /** Close the surrounding window. Present only inside the OS. */
  close?: () => void

  user: () => { username: string | null; role: string | null; email: string | null } | null
  requireLogin: () => void

  theme: {
    get: () => "light" | "dark"
    set: (theme: "light" | "dark") => void
  }

  seed: {
    value: number
    display: string
    reseed: () => void
  }

  music: {
    tracks: { title: string }[]
    currentTrackIndex: number
    isPlaying: boolean
    volume: number
    playTrack: (index: number) => void
    togglePlay: () => void
    nextTrack: () => void
    prevTrack: () => void
    setVolume: (v: number) => void
  }
}

export interface CommandHelp {
  usage: string
  description: string
}

export type CommandGroup = "system" | "content" | "music" | "people" | "toys" | "programs"

export interface TerminalCommand {
  name: string
  aliases?: string[]
  group: CommandGroup
  help: CommandHelp
  requireRole?: "admin" | "editor"
  run: (ctx: TerminalContext, args: string[]) => void | Promise<void>
}
