/**
 * Canonical keyboard-shortcut registry — the single source of truth for global
 * bindings. `useHotkeys` reads `key` to dispatch; the cheat-sheet overlay (`?`)
 * renders `keys` + `label`. Keep the two in sync by editing only this file.
 *
 * `key` is the value matched in the keydown handler (already lowercased there).
 * `keys` is the display form (what the cheat sheet shows). `shell` narrows a
 * binding to specific shells; omit for "all shells".
 */
export type Shell = "main" | "wiki" | "chat"

export interface Hotkey {
  /** Lowercased KeyboardEvent.key this binding matches (handler-side). */
  key: string
  /** Display chips for the cheat sheet, e.g. ["Ctrl", "K"]. */
  keys: string[]
  /** Human-readable action. */
  label: string
  /** Grouping in the cheat sheet. */
  group: "Navigation" | "Appearance" | "Media" | "Help"
  /** Restrict to these shells; undefined = all. */
  shell?: Shell[]
}

export const HOTKEYS: Hotkey[] = [
  // Help / discovery
  { key: "?", keys: ["?"], label: "Keyboard shortcuts", group: "Help" },
  // Navigation
  { key: "k", keys: ["Ctrl", "K"], label: "Search notes", group: "Navigation" },
  { key: "p", keys: ["Ctrl", "P"], label: "Command palette", group: "Navigation" },
  { key: "r", keys: ["R"], label: "Random note", group: "Navigation", shell: ["main", "wiki"] },
  // Appearance
  { key: "\\", keys: ["\\"], label: "Theme panel", group: "Appearance" },
  { key: "b", keys: ["B"], label: "Cycle background", group: "Appearance", shell: ["main"] },
  // Media
  { key: "m", keys: ["M"], label: "Play / pause music", group: "Media", shell: ["main"] },
  // Universal
  { key: "Escape", keys: ["Esc"], label: "Close overlay", group: "Help" },
]

/** Cheat-sheet display order. */
export const HOTKEY_GROUPS: Hotkey["group"][] = ["Navigation", "Appearance", "Media", "Help"]

/** Hotkeys visible for a given shell (for the cheat sheet). */
export function hotkeysForShell(shell: Shell): Hotkey[] {
  return HOTKEYS.filter((h) => !h.shell || h.shell.includes(shell))
}
