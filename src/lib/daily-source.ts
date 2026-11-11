/**
 * A daily note as source: frontmatter fields + prose, read and written without
 * disturbing anything else in the file.
 *
 * Shared by the /write desk (browser), the Worker's /api/write handlers (jot,
 * commit) and scripts/new-daily.ts, so a note scaffolded on the command line
 * and one started in the browser are the same file. Frontmatter is edited
 * through yaml's Document API: keys the desk doesn't know about, comments and
 * quoting survive a round trip, and only fields that changed are rewritten.
 *
 * Pure: no DOM, no Node.
 */
import { parseDocument, isSeq, type Document } from "yaml"
import { splitFrontmatter } from "./frontmatter"
export { isIsoDate, localIso, shiftIso } from "./iso-day"

export interface DailyFields {
  /** Without the "11 November: " prefix (added from the date). */
  headline: string
  description: string
  tags: string[]
  public: boolean
  /** Frontmatter `og-motif`; "" = let the date and tags choose. */
  ogMotif: string
  /** Frontmatter `og-almanac`; "" or "classic". */
  ogAlmanac: string
}

export interface DailyDoc {
  iso: string
  fields: DailyFields
  body: string
}

/** `2026-11-11` → `11-11-26.md` (the vault's naming). */
export function dailyFileName(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}-${m}-${y.slice(2)}.md`
}

export function dailyRepoPath(iso: string): string {
  return `content/Daily/${dailyFileName(iso)}`
}

/** The slug the published note will have: `Daily/11-11-26`. */
export function dailySlugFor(iso: string): string {
  return `Daily/${dailyFileName(iso).replace(/\.md$/, "")}`
}

/** "11 November" for a date. */
export function dayName(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })
}

export function fullTitle(iso: string, headline: string): string {
  return headline.trim() ? `${dayName(iso)}: ${headline.trim()}` : dayName(iso)
}

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v))

function fieldsOf(doc: Document): DailyFields {
  const tags = doc.get("tags")
  const tagList = isSeq(tags) ? tags.items.map((t) => str((t as { value?: unknown })?.value ?? t)) : []
  return {
    headline: str(doc.get("title")).replace(/^\s*\d{1,2}\s+[A-Za-z]+\s*:\s*/, "").replace(/^\s*\d{1,2}\s+[A-Za-z]+\s*$/, ""),
    description: str(doc.get("description")).trim(),
    tags: tagList.filter(Boolean),
    public: doc.get("public") === true,
    ogMotif: str(doc.get("og-motif")),
    ogAlmanac: str(doc.get("og-almanac")),
  }
}

export function parseDaily(source: string, iso: string): DailyDoc {
  const { yaml, body } = splitFrontmatter(source)
  const doc = parseDocument(yaml ?? "")
  return { iso, fields: fieldsOf(doc), body: body.replace(/^\r?\n/, "") }
}

/**
 * Write `next` over `source`: frontmatter fields that changed are set, the
 * rest of the file (unknown keys, comments, formatting) is kept. With no
 * `source`, a fresh note in the shape scripts/new-daily.ts writes.
 */
export function serializeDaily(next: DailyDoc, source?: string): string {
  const { yaml } = source ? splitFrontmatter(source) : { yaml: null }
  const doc = parseDocument(yaml ?? "")
  const was = fieldsOf(doc)
  const f = next.fields
  const fresh = !yaml

  const title = fullTitle(next.iso, f.headline)
  if (fresh || title !== fullTitle(next.iso, was.headline) || !doc.has("title")) doc.set("title", title)
  if (fresh || !doc.has("date")) doc.set("date", next.iso)
  if (fresh || f.description !== was.description) doc.set("description", f.description)
  if (fresh || f.tags.join("\n") !== was.tags.join("\n")) {
    const seq = doc.createNode(f.tags)
    seq.flow = f.tags.length === 0
    doc.set("tags", seq)
  }
  if (fresh || f.public !== was.public) doc.set("public", f.public)
  for (const [key, value, old] of [["og-motif", f.ogMotif, was.ogMotif], ["og-almanac", f.ogAlmanac, was.ogAlmanac]] as const) {
    if (value === old) continue
    if (value) doc.set(key, value)
    else doc.delete(key)
  }

  // Title always quoted, like the scaffolder writes it (a colon is inside).
  const titleNode = doc.get("title", true) as { type?: string } | undefined
  if (titleNode && typeof titleNode === "object") titleNode.type = "QUOTE_DOUBLE"

  const head = doc.toString({ lineWidth: 0, indentSeq: true }).trimEnd()
  const body = next.body.replace(/^\s*\n/, "").trimEnd()
  return `---\n${head}\n---\n\n${body}${body ? "\n" : ""}`
}

/** A new day: the scaffolder's defaults. */
export function scaffoldDaily(iso: string, headline = "", tags: string[] = []): DailyDoc {
  return {
    iso,
    fields: { headline, description: "", tags: ["daily", ...tags.filter((t) => t && t !== "daily")], public: false, ogMotif: "", ogAlmanac: "" },
    body: "",
  }
}

/** Add a paragraph to the end of the prose. `stamp` prefixes the local time in bold. */
export function appendJot(body: string, text: string, stamp?: Date): string {
  const t = text.trim()
  if (!t) return body
  const time = stamp
    ? `**${String(stamp.getHours()).padStart(2, "0")}:${String(stamp.getMinutes()).padStart(2, "0")}** `
    : ""
  const head = body.trimEnd()
  return `${head}${head ? "\n\n" : ""}${time}${t}\n`
}

/** Words in the prose, ignoring markdown punctuation, links' targets and components. */
export function proseWords(body: string): number {
  const text = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[\[[^\]]*\]\]/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length
}
