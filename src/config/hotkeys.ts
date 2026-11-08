/**
 * The keyboard-shortcut registry: what the prompt's `keys` command (also `?`)
 * lists. `useHotkeys` dispatches the bindings by hand, so when you add or
 * change one, change it in both places.
 *
 * `key` is the value matched in the keydown handler (already lowercased there).
 * `keys` is the display form (what `keys` in the prompt shows). `shell` narrows a
 * binding to specific shells; omit for "all shells".
 */
export type Shell = "main" | "wiki" | "chat" | "os"

export interface Hotkey {
  /** Lowercased KeyboardEvent.key this binding matches (handler-side). */
  key: string
  /** Display chips, e.g. ["Ctrl", "K"]. */
  keys: string[]
  /** Human-readable action. */
  label: string
  /** Grouping in the `keys` listing. */
  group: "Navigation" | "Reading" | "Appearance" | "Media" | "Help"
  /** Restrict to these shells; undefined = all. */
  shell?: Shell[]
}

export const HOTKEYS: Hotkey[] = [
  // Help / discovery
  { key: "?", keys: ["?"], label: "This list (in the prompt)", group: "Help" },
  // Navigation
  { key: "p", keys: ["Ctrl", "P"], label: "Prompt: search or run a command", group: "Navigation", shell: ["main", "wiki"] },
  { key: "k", keys: ["Ctrl", "K"], label: "Prompt (same as Ctrl P)", group: "Navigation", shell: ["main", "wiki"] },
  { key: "/", keys: ["/"], label: "Prompt, empty", group: "Navigation", shell: ["main", "wiki"] },
  { key: "c", keys: ["C"], label: "philchat in the dock (not on game pages)", group: "Navigation", shell: ["main", "wiki"] },
  { key: "r", keys: ["R"], label: "Random note", group: "Navigation", shell: ["main", "wiki"] },
  // Reading — size/width keys apply while reader mode is on
  { key: "f", keys: ["F"], label: "Reader mode", group: "Reading", shell: ["main", "wiki"] },
  { key: "=", keys: ["+"], label: "Larger text (reader)", group: "Reading", shell: ["main", "wiki"] },
  { key: "-", keys: ["−"], label: "Smaller text (reader)", group: "Reading", shell: ["main", "wiki"] },
  { key: "]", keys: ["]"], label: "Wider column (reader)", group: "Reading", shell: ["main", "wiki"] },
  { key: "[", keys: ["["], label: "Narrower column (reader)", group: "Reading", shell: ["main", "wiki"] },
  // Appearance
  { key: "\\", keys: ["\\"], label: "Settings", group: "Appearance" },
  { key: "b", keys: ["B"], label: "Cycle background", group: "Appearance", shell: ["main"] },
  // Media
  { key: "m", keys: ["M"], label: "Play / pause music", group: "Media", shell: ["main"] },
  // Universal
  { key: "Escape", keys: ["Esc"], label: "Close the dock or a panel", group: "Help" },
]

/** Display order of the groups. */
export const HOTKEY_GROUPS: Hotkey["group"][] = ["Navigation", "Reading", "Appearance", "Media", "Help"]

/** Hotkeys visible for a given shell. */
export function hotkeysForShell(shell: Shell): Hotkey[] {
  return HOTKEYS.filter((h) => !h.shell || h.shell.includes(shell))
}
