/**
 * The desk's small pure helpers: margin notes on the prose, a line diff for
 * conflicts and history, and the run of days. No DOM; tested by
 * scripts/test-write.ts.
 */

export interface VoiceNote {
  /** Offset into the prose. */
  from: number
  to: number
  kind: "dash" | "repeat" | "spaces" | "link"
  message: string
  /** Replacement text, when there is an obvious one. */
  fix?: string
}

/**
 * Notes in the margin, not rules: em dashes (the logbook uses spaced hyphens),
 * a word written twice, doubled spaces, an empty link.
 */
export function voiceNotes(body: string): VoiceNote[] {
  const notes: VoiceNote[] = []
  // Skip code: fences and inline spans keep whatever they contain.
  const masked = body
    .replace(/```[\s\S]*?```/g, (m) => " ".repeat(m.length))
    .replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length))
  for (const m of masked.matchAll(/[ \t]*[—–][ \t]*/g)) {
    const at = m.index!
    // A dash at a line start is a list or a quote attribution; leave it.
    if (at === 0 || masked[at - 1] === "\n") continue
    notes.push({ from: at, to: at + m[0].length, kind: "dash", message: `"${m[0].trim()}" - the logbook uses a spaced hyphen`, fix: " - " })
  }
  for (const m of masked.matchAll(/\b([\p{L}']+)\s+\1\b/giu)) {
    if (/^(ha|no|so|very|bye|tut|knock|that|had|is)$/i.test(m[1])) continue
    const at = m.index!
    notes.push({ from: at, to: at + m[0].length, kind: "repeat", message: `"${m[1]}" twice`, fix: m[1] })
  }
  for (const m of masked.matchAll(/(?<=\S) {2,}(?=\S)/g)) {
    notes.push({ from: m.index!, to: m.index! + m[0].length, kind: "spaces", message: "doubled space", fix: " " })
  }
  for (const m of masked.matchAll(/\[[^\]]*\]\(\s*\)|\[\[\s*\]\]/g)) {
    notes.push({ from: m.index!, to: m.index! + m[0].length, kind: "link", message: "a link with nowhere to go" })
  }
  return notes.sort((a, b) => a.from - b.from)
}

export type DiffLine = { op: "same" | "add" | "del"; text: string }

/** Line diff (LCS). Notes are short, so the quadratic table is fine; huge inputs fall back to all-changed. */
export function lineDiff(a: string, b: string): DiffLine[] {
  const x = a.split("\n")
  const y = b.split("\n")
  if (x.length * y.length > 4_000_000) return [...x.map((text) => ({ op: "del" as const, text })), ...y.map((text) => ({ op: "add" as const, text }))]
  const n = x.length, m = y.length
  const t = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = x[i] === y[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1])
  const out: DiffLine[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (x[i] === y[j]) { out.push({ op: "same", text: x[i] }); i++; j++ }
    else if (t[i + 1][j] >= t[i][j + 1]) out.push({ op: "del", text: x[i++] })
    else out.push({ op: "add", text: y[j++] })
  }
  while (i < n) out.push({ op: "del", text: x[i++] })
  while (j < m) out.push({ op: "add", text: y[j++] })
  return out
}

/** Consecutive days written, ending at `today` (or yesterday, so the run isn't broken before you start). */
export function runOfDays(days: Iterable<string>, today: string): number {
  const set = new Set(days)
  const step = (iso: string) => new Date(new Date(`${iso}T00:00:00Z`).getTime() - 864e5).toISOString().slice(0, 10)
  let at = set.has(today) ? today : step(today)
  let n = 0
  while (set.has(at)) { n++; at = step(at) }
  return n
}

/** "just now", "4 min ago", "at 14:02". */
export function sinceLabel(at: number, now = Date.now()): string {
  const s = Math.round((now - at) / 1000)
  if (s < 10) return "just now"
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  return `at ${new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
}
