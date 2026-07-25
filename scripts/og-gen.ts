import * as fs from "fs"
import * as path from "path"
import * as crypto from "crypto"
import { fileURLToPath } from "url"
import satori from "satori"
import { Resvg } from "@resvg/resvg-js"
import { generateSystemCards, loadOgFonts, OG_FONT_FAMILY } from "./og-system"
import { ogCardName } from "../src/lib/slug"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.resolve(__dirname, "../public")
const OG_DIR = path.join(PUBLIC_DIR, "og")
const CACHE_PATH = path.join(OG_DIR, ".cache.json")
const OG_RENDER_VERSION = "eb-garamond-v1"

function hashNote(note: Record<string, unknown>): string {
  const relevant = JSON.stringify({
    renderVersion: OG_RENDER_VERSION,
    title: note.title,
    description: note.description,
    excerpt: note.excerpt,
    tags: note.tags,
    image: note.image,
    cover: note.cover,
    poster: note.poster,
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

async function main() {
  console.log("Generating OG images...")

  if (!fs.existsSync(OG_DIR)) {
    fs.mkdirSync(OG_DIR, { recursive: true })
  }

  const index = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, "content-index.json"), "utf-8"))

  // Load cache
  const cache: Record<string, string> = fs.existsSync(CACHE_PATH)
    ? JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"))
    : {}

  // Determine which slugs need (re)generation
  const slugsToGenerate = Object.keys(index).filter((slug) => {
    const hash = hashNote(index[slug])
    const outPath = path.join(OG_DIR, ogCardName(slug))
    return cache[slug] !== hash || !fs.existsSync(outPath)
  })

  console.log(`  ${slugsToGenerate.length} note image(s) to generate (${Object.keys(index).length - slugsToGenerate.length} cached)`)

  // Load font (shared with the system-page cards below)
  const fontData = await loadOgFonts()

  // System / custom pages (arcade, graph, chess, …) aren't in content-index.json,
  // so they never get a note card — generate their bespoke procedural cards here.
  const systemCount = await generateSystemCards(fontData)
  console.log(`  ${systemCount} system-page card(s) generated`)

  if (slugsToGenerate.length === 0) {
    console.log("Note OG images up to date.")
    return
  }

  let generated = 0
  for (const slug of slugsToGenerate) {
    const note = index[slug]
    const outPath = path.join(OG_DIR, ogCardName(slug))

    // Coerce to strings: a purely-numeric frontmatter title (e.g. "2048") parses
    // as a number, and satori chokes on a non-string text child. Tags likewise.
    const title = String(note.title ?? slug)
    const tags: string[] = Array.isArray(note.tags) ? note.tags.map((t: unknown) => String(t)) : []

    const thumbnail: string | null = note.image || note.cover || note.poster || null

    // satori only accepts data: or http(s) image sources (not file://) and only
    // raster formats it can decode (PNG/JPEG/WebP — not SVG/GIF). Inline anything
    // we host as a base64 data URI: that covers /content/Media paths AND our own
    // https://subsurfaces.net/Media/... URLs (which have local copies), so we
    // never depend on a live fetch. Truly-external http(s) URLs pass through and
    // degrade to a text-only card if satori can't load them (see retry below).
    const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }
    function localPathForThumb(t: string): string | null {
      // Normalise our own URLs / bare /Media paths / bare filenames to a public/
      // file path. Frontmatter image fields range from "/content/Media/x.png" to
      // "/Media/x.png" to a full subsurfaces.net URL to just "Lancaster (2).jpeg".
      const ownMedia = t.match(/^https?:\/\/(?:www\.)?subsurfaces\.net(\/.*)$/i)
      const rel = ownMedia ? ownMedia[1] : t.startsWith("http") ? null : t
      if (rel === null) return null
      let stripped = rel.replace(/^\//, "")
      if (/^Media\//i.test(stripped)) stripped = stripped.replace(/^Media\//i, "content/Media/")
      else if (!stripped.startsWith("content/")) stripped = `content/Media/${stripped}`
      return path.join(path.resolve(__dirname, "../public"), stripped)
    }

    let thumbnailUrl: string | null = null
    if (thumbnail) {
      const localPath = localPathForThumb(thumbnail)
      if (localPath) {
        const ext = path.extname(localPath).toLowerCase()
        if (MIME[ext] && fs.existsSync(localPath)) {
          thumbnailUrl = `data:${MIME[ext]};base64,${fs.readFileSync(localPath).toString("base64")}`
        }
      }
      // Truly-external thumbnails (not ours) are left out: satori's fetch can't
      // reliably decode arbitrary remote images (and CI shouldn't depend on the
      // network), so the card renders text-only rather than failing.
    }

    const textMaxWidth = thumbnailUrl ? '680px' : '900px'

    try {
    const svg = await satori(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({
        type: 'div',
        props: {
          style: {
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'stretch',
            backgroundColor: '#0a0a0a',
            backgroundImage: 'radial-gradient(circle at 25px 25px, #1a1a1a 2%, transparent 0%)',
            backgroundSize: '50px 50px',
            fontFamily: OG_FONT_FAMILY,
            borderLeft: '12px solid #427ab4',
          },
          children: [
            // Left: text content
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  padding: '80px',
                  flex: 1,
                },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: { fontSize: 24, color: '#427ab4', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '4px' },
                      children: 'Sub-Surface Territories',
                    },
                  },
                  {
                    type: 'div',
                    props: {
                      style: { fontSize: thumbnailUrl ? 56 : 72, fontWeight: 600, color: '#ffffff', marginBottom: '24px', lineHeight: 1.1, maxWidth: textMaxWidth },
                      children: title,
                    },
                  },
                  {
                    type: 'div',
                    props: {
                      style: { fontSize: 26, color: '#888888', maxWidth: textMaxWidth, lineHeight: 1.4 },
                      children: cleanDescription(note.description || note.excerpt || ''),
                    },
                  },
                  {
                    type: 'div',
                    props: {
                      style: { display: 'flex', marginTop: '40px', gap: '12px' },
                      children: tags.slice(0, 4).map((t: string) => ({
                        type: 'span',
                        props: {
                          style: { fontSize: 20, color: '#666', border: '1px solid #333', padding: '4px 12px', borderRadius: '4px' },
                          children: `#${t}`,
                        },
                      })),
                    },
                  },
                ],
              },
            },
            // Right: thumbnail image (only if available)
            ...(thumbnailUrl ? [{
              type: 'div' as const,
              props: {
                style: {
                  width: '340px',
                  display: 'flex',
                  alignItems: 'stretch',
                  overflow: 'hidden',
                },
                children: [{
                  type: 'img' as const,
                  props: {
                    src: thumbnailUrl,
                    style: { width: '340px', height: '630px', objectFit: 'cover' },
                  },
                }],
              },
            }] : []),
          ],
        },
      }) as any,
      {
        width: 1200,
        height: 630,
        fonts: [
          {
            name: OG_FONT_FAMILY,
            data: fontData.regular,
            weight: 400,
            style: 'normal',
          },
          {
            name: OG_FONT_FAMILY,
            data: fontData.semibold,
            weight: 600,
            style: 'normal',
          },
        ],
      }
    )

    const resvg = new Resvg(svg)
    const pngData = resvg.render()
    const pngBuffer = pngData.asPng()

    fs.writeFileSync(outPath, pngBuffer)
    cache[slug] = hashNote(note)
    generated += 1
    } catch (err) {
      // One bad note (unsupported style, unreachable remote image) must not abort
      // the whole run — log and carry on so every other card still generates.
      console.warn(`  ⚠ skipped OG for "${slug}": ${err instanceof Error ? err.message : err}`)
    }
  }

  // Prune stale cache entries for deleted slugs
  for (const slug of Object.keys(cache)) {
    if (!index[slug]) delete cache[slug]
  }

  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2))
  const skipped = slugsToGenerate.length - generated
  console.log(`Successfully generated ${generated} note OG image(s) in public/og/${skipped > 0 ? ` (${skipped} skipped)` : ""}`)
}

main().catch(console.error)
