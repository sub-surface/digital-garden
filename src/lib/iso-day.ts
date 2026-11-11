/**
 * `YYYY-MM-DD` days: validation, the writer's local today, stepping.
 * Tiny and dependency-free on purpose: the dock's `jot` command imports it,
 * and daily-source.ts (which pulls in the yaml parser) must stay off the
 * main chunk.
 */

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && ISO_RE.test(s) && !isNaN(new Date(`${s}T00:00:00Z`).getTime())
}

/** Today's date where the writer is (local, not UTC: a note written at 00:30 belongs to the new day). */
export function localIso(at = new Date()): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`
}

export function shiftIso(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 864e5).toISOString().slice(0, 10)
}
