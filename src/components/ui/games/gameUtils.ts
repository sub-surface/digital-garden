/**
 * Small input + persistence helpers shared by the arcade games.
 */

/** True when the event target is somewhere the user is typing (field, select, contenteditable). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable
}

/**
 * Window-level game key handlers must not steal keystrokes meant for a text
 * field (the OS shell hosts terminals/chat beside games) or browser chords
 * (Ctrl+S, Ctrl+F, Cmd+D ...). Call first thing in every `keydown` handler.
 */
export function ignoreGameKey(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)
}

/** Read a persisted non-negative integer; falls back when missing, corrupt, or storage is blocked. */
export function readStoredInt(key: string, fallback = 0): number {
  try {
    const v = parseInt(localStorage.getItem(key) ?? "", 10)
    return Number.isFinite(v) ? v : fallback
  } catch {
    return fallback
  }
}

/** Persist a value; silently ignores blocked/full storage (a high score is never worth a crash). */
export function writeStored(key: string, value: string | number): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    /* storage unavailable (private mode, sandboxed iframe) */
  }
}
