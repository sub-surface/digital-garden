/**
 * Note OG cards → public/og/<ogCardBase(slug)>.{jpg,png} (committed; CF never runs this).
 * Photo cards are JPEG (PNG photos run 600–800 KB each); typographic cards stay PNG.
 *
 *   PROCESS_OG=true npm run prebuild          main site, cached (the normal path)
 *   tsx scripts/og-gen.ts --scope=wiki         wiki pages only   (or --scope=all)
 *   tsx scripts/og-gen.ts --only=Writing/Image-Metaphors,Photography --out=scratch/og
 *                                              preview specific cards elsewhere,
 *                                              without touching cache or public/og
 *   tsx scripts/og-gen.ts --force              ignore the cache
 *
 * Scope defaults to `main` (OG_SCOPE env also accepted): wiki pages are skipped.
 * Layouts live in og-card.ts. After a real run, public/og/manifest.json lists
 * every card on disk; the Worker only points og:image at cards in that list.
 */
import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"
import { fileURLToPath } from "url"
import { generateSystemCards, loadOgFonts } from "./og-system"
import { renderOgCard, type OgCardInput } from "./og-card"
import { ogCardBase, ogCardFiles } from "../src/lib/slug"
import { isPlateCard } from "../src/lib/og"
import { dailyIso, isDailySlug } from "../src/lib/daily"
import { renderDailyCard, renderDailyPlate } from "./og-daily"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.resolve(__dirname, "../public")
const ROOT = path.resolve(__dirname, "..")
const OG_DIR = path.join(PUBLIC_DIR, "og")
const CACHE_PATH = path.join(OG_DIR, ".cache.json")
export const OG_MANIFEST = "manifest.json"
const OG_RENDER_VERSION = "cards-v2"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IndexNote = Record<string, any>

// ── CLI ──────────────────────────────────────────────────────────────────────
type Scope = "main" | "wiki" | "all"
function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return undefined
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "true"
}
const scope = (arg("scope") ?? process.env.OG_SCOPE ?? "main") as Scope
if (!["main", "wiki", "all"].includes(scope)) {
  console.error(`Unknown --scope=${scope} (expected main | wiki | all)`)
  process.exit(1)
}
const only = arg("only")?.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
const outDir = arg("out") ? path.resolve(ROOT, arg("out")!) : null
const force = arg("force") === "true"
const isPreview = Boolean(outDir)

export function inScope(slug: string, s: Scope): boolean {
  const wiki = slug.toLowerCase().startsWith("wiki/")
  return s === "all" || (s === "wiki" ? wiki : !wiki)
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function hashNote(slug: string, note: IndexNote): string {
  const relevant = JSON.stringify({
    renderVersion: OG_RENDER_VERSION,
    title: note.title,
    description: note.description,
    excerpt: note.excerpt,
    type: note.type,
    date: note.date,
    readingTime: note.readingTime,
    image: note.image,
    ogLayout: note.ogLayout,
    // Only present for the notes they apply to, so adding a layout never
    // invalidates every other card's cache entry.
    daily: isDailySlug(slug) ? { v: 2, tags: note.tags, motif: note.ogMotif, almanac: note.ogAlmanac } : undefined,
    plate: isPlateCard(slug, note) ? 1 : undefined,
  })
  return crypto.createHash("md5").update(relevant).digest("hex")
}

function cleanDescription(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")   // [text](url) → text
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2") // [[slug|label]] → label
    .replace(/\[\[([^\]]+)\]\]/g, "$1")          // [[slug]] → slug
    .replace(/\[(\^[^\]]+)\]/g, "")              // footnote refs [^1]
    .replace(/\\([\[\]])/g, "$1")                // unescape \[ \]
    .replace(/[*_`~]+/g, "")                     // bold/italic/code/strikethrough
    .replace(/^#+\s+/gm, "")                     // headings
    .replace(/^>\s+/gm, "")                      // blockquotes
    .replace(/\s+/g, " ")                        // collapse whitespace
    .trim()
}

const KIND: Record<string, string> = {
  essay: "Essay", book: "Book", movie: "Film", chatter: "Profile", philosopher: "Philosopher", music: "Track",
}
function kindOf(slug: string, note: IndexNote): string {
  const t = String(note.type ?? "").toLowerCase()
  if (KIND[t]) return KIND[t]
  if (slug.toLowerCase().startsWith("writing/")) return "Essay"
  if (slug.toLowerCase().startsWith("wiki/")) return "Wiki"
  return note.layout === "article" ? "Article" : "Note"
}

// satori only decodes PNG/JPEG reliably, and only from data: URIs we control.
const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" }

/** Frontmatter image fields range from "Media/x.jpg" to "/content/Media/x.jpg" to our own full URLs. */
function localPathForImage(t: string): string | null {
  const ownMedia = t.match(/^https?:\/\/(?:www\.)?subsurfaces\.net(\/.*)$/i)
  const rel = ownMedia ? ownMedia[1] : t.startsWith("http") ? null : t
  if (rel === null) return null
  let stripped = decodeURI(rel).replace(/^\//, "")
  if (/^(content\/)?Media\//i.test(stripped)) stripped = stripped.replace(/^(content\/)?Media\//i, "")
  // Media lives in content/Media (source of truth); public/content/Media is a prebuild copy.
  return path.join(ROOT, "content", "Media", stripped)
}

function sniffMime(buf: Buffer): string | null {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png"
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg"
  return null
}

const remoteCache = new Map<string, string | null>()
async function imageDataUri(src: string | undefined): Promise<string | null> {
  if (!src) return null
  const local = localPathForImage(src)
  if (local) {
    const mime = MIME[path.extname(local).toLowerCase()]
    if (!mime || !fs.existsSync(local)) return null
    return `data:${mime};base64,${fs.readFileSync(local).toString("base64")}`
  }
  // Remote image (e.g. Wikimedia): fetch once at generation time. The card is a
  // committed artifact, so this never runs in CI or production.
  if (remoteCache.has(src)) return remoteCache.get(src)!
  let uri: string | null = null
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "subsurfaces-og/2 (https://subsurfaces.net)" } })
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      const mime = sniffMime(buf)
      if (mime) uri = `data:${mime};base64,${buf.toString("base64")}`
    }
  } catch (err) {
    console.warn(`  ⚠ couldn't fetch remote image ${src}: ${err instanceof Error ? err.message : err}`)
  }
  remoteCache.set(src, uri)
  return uri
}

export function writeManifest(): string[] {
  const cards = fs.readdirSync(OG_DIR).filter((f) => /\.(png|jpg)$/.test(f)).sort()
  fs.writeFileSync(path.join(OG_DIR, OG_MANIFEST), JSON.stringify(cards, null, 0) + "\n")
  return cards
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const target = outDir ?? OG_DIR
  fs.mkdirSync(target, { recursive: true })

  const index: Record<string, IndexNote> = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, "content-index.json"), "utf-8"))
  const cache: Record<string, string> = !isPreview && fs.existsSync(CACHE_PATH)
    ? JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"))
    : {}

  const candidates = Object.keys(index).filter((slug) =>
    only ? only.includes(slug.toLowerCase()) : inScope(slug, scope),
  )
  const slugsToGenerate = candidates.filter((slug) =>
    isPreview || force || cache[slug] !== hashNote(slug, index[slug]) ||
      !ogCardFiles(slug).some((f) => fs.existsSync(path.join(OG_DIR, f))) ||
      (isDailySlug(slug) && !fs.existsSync(path.join(OG_DIR, "art", `${ogCardBase(slug)}.jpg`))),
  )

  console.log(`Generating OG cards (scope: ${only ? "--only" : scope}${isPreview ? `, preview → ${path.relative(ROOT, target)}` : ""})`)
  console.log(`  ${slugsToGenerate.length} to generate, ${candidates.length - slugsToGenerate.length} cached`)

  const fonts = await loadOgFonts()

  // System pages (arcade, graph, chess…) have bespoke procedural cards.
  if (!isPreview && !only && scope !== "wiki") {
    const systemCount = await generateSystemCards(fonts)
    console.log(`  ${systemCount} system-page card(s) generated`)
  }

  let generated = 0
  for (const slug of slugsToGenerate) {
    const note = index[slug]
    try {
      const card: OgCardInput = {
        // Coerce: YAML parses `title: 2048` as a number, and satori needs strings.
        title: String(note.title ?? slug),
        description: cleanDescription(String(note.description || note.excerpt || "")),
        kind: kindOf(slug, note),
        date: note.date,
        readingTime: note.readingTime,
        image: await imageDataUri(note.image || note.cover || note.poster),
        layout: note.ogLayout ?? (isPlateCard(slug, note) ? "plate" : undefined),
        tags: Array.isArray(note.tags) ? note.tags.map(String) : [],
      }
      // Daily notes get a date-seeded drawing instead (scripts/og-daily.ts).
      const iso = isDailySlug(slug) ? dailyIso(note.date) : null
      const { buffer, ext } = iso
        ? await renderDailyCard({ iso, title: card.title, description: card.description, tags: card.tags, motif: note.ogMotif, almanac: note.ogAlmanac }, fonts)
        : await renderOgCard(card, fonts)
      if (iso) {
        // The drawing alone, for the note's own page and the logbook (public/og/art/, committed like the cards).
        fs.mkdirSync(path.join(target, "art"), { recursive: true })
        fs.writeFileSync(path.join(target, "art", `${ogCardBase(slug)}.jpg`), renderDailyPlate({ iso, tags: card.tags, motif: note.ogMotif, almanac: note.ogAlmanac }))
      }
      // Remove the other format so a note never has two cards (image added/removed).
      for (const stale of ogCardFiles(slug)) {
        const p = path.join(target, stale)
        if (!stale.endsWith(`.${ext}`) && fs.existsSync(p)) fs.unlinkSync(p)
      }
      fs.writeFileSync(path.join(target, `${ogCardBase(slug)}.${ext}`), buffer)
      if (!isPreview) cache[slug] = hashNote(slug, note)
      generated += 1
    } catch (err) {
      // One bad note (unsupported style, undecodable image) must not abort the run.
      console.warn(`  ⚠ skipped OG for "${slug}": ${err instanceof Error ? err.message : err}`)
    }
  }

  if (!isPreview) {
    for (const slug of Object.keys(cache)) if (!index[slug]) delete cache[slug]
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2))
    const cards = writeManifest()
    console.log(`  manifest: ${cards.length} card(s) listed in public/og/${OG_MANIFEST}`)
  }
  const skipped = slugsToGenerate.length - generated
  console.log(`Generated ${generated} card(s)${skipped ? ` (${skipped} skipped)` : ""}.`)
}

// Only run when executed directly (test-og imports inScope/writeManifest).
// (Basename match: tsx/Windows can differ in drive-letter case from import.meta.url.)
if (process.argv[1] && /^og-gen\.[cm]?[jt]s$/.test(path.basename(process.argv[1]))) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
