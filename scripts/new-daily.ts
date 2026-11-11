/**
 * Scaffold a public daily note (a logbook entry).
 *
 *   npm run daily -- "p(doom), from the garage"
 *   npm run daily -- "cryptids in FRACTRAN" --tags=math,fractran --date=2026-11-01 --publish
 *
 * Writes content/Daily/DD-MM-YY.md with the frontmatter filled in. The note
 * holds only frontmatter and prose: navigation, calendar, almanac and threads
 * are added at build time, and the OG card is drawn from the date and tags.
 * Starts as `public: false` (unpublished) unless --publish is given.
 */
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import { almanac, almanacLines } from "../src/lib/daily"
import { motifFor, TAG_MOTIFS } from "./og-daily"

const args = process.argv.slice(2)
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const title = args.filter((a) => !a.startsWith("--")).join(" ").trim()
if (!title) {
  console.error('usage: npm run daily -- "a short title" [--tags=games,pdoom] [--date=YYYY-MM-DD] [--publish]')
  console.error(`tags that choose the card's drawing: ${Object.keys(TAG_MOTIFS).join(", ")}`)
  process.exit(1)
}

const now = new Date()
const iso = flag("date") ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || isNaN(new Date(`${iso}T00:00:00Z`).getTime())) {
  console.error(`--date must be YYYY-MM-DD (got "${iso}")`)
  process.exit(1)
}
const [y, m, d] = iso.split("-")
const tags = ["daily", ...(flag("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean)]
const publish = args.includes("--publish")

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../content/Daily", `${d}-${m}-${y.slice(2)}.md`)
if (fs.existsSync(file)) {
  console.error(`${path.relative(process.cwd(), file)} already exists; not overwriting it.`)
  process.exit(1)
}

const day = new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })
const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
fs.writeFileSync(file, [
  "---",
  `title: ${quote(`${day}: ${title}`)}`,
  `date: ${iso}`,
  "description: ",
  "tags:",
  ...tags.map((t) => `  - ${t}`),
  `public: ${publish}`,
  "---",
  "",
  "",
].join("\n"))

console.log(`wrote ${path.relative(process.cwd(), file)}${publish ? "" : "  (public: false; set it to true to publish)"}`)
console.log(`  card: ${motifFor(iso, tags)}  ·  ${almanacLines(almanac(iso))[0].replace(/\s+/g, " ")}`)
console.log("  next: write a one-line description, then PROCESS_OG=true npm run prebuild to draw the card")
