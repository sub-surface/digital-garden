import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import satori from "satori"
import { Resvg } from "@resvg/resvg-js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.resolve(__dirname, "../public")
const OG_DIR = path.join(PUBLIC_DIR, "og")

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
  
  // Load font
  const fontData = await fetch("https://github.com/google/fonts/raw/main/ofl/ibmplexmono/IBMPlexMono-Medium.ttf").then(res => res.arrayBuffer())

  for (const slug in index) {
    const note = index[slug]
    const outPath = path.join(OG_DIR, `${slug.replace(/\//g, "-")}.png`)

    const thumbnail: string | null = note.image || note.cover || note.poster || null

    // Resolve relative image paths to absolute file URLs
    let thumbnailUrl: string | null = null
    if (thumbnail) {
      if (thumbnail.startsWith("http")) {
        thumbnailUrl = thumbnail
      } else {
        // Local path e.g. /content/Media/... → public/content/Media/...
        const localPath = path.join(path.resolve(__dirname, "../public"), thumbnail.replace(/^\//, ""))
        if (fs.existsSync(localPath)) {
          thumbnailUrl = `file://${localPath.replace(/\\/g, "/")}`
        }
      }
    }

    const textMaxWidth = thumbnailUrl ? '680px' : '900px'

    const svg = await satori(
      {
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
            fontFamily: 'IBMPlexMono',
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
                      style: { fontSize: thumbnailUrl ? 56 : 72, fontWeight: 700, color: '#ffffff', marginBottom: '24px', lineHeight: 1.1, maxWidth: textMaxWidth },
                      children: note.title,
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
                      children: (note.tags || []).slice(0, 4).map((t: string) => ({
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
      },
      {
        width: 1200,
        height: 630,
        fonts: [
          {
            name: 'IBMPlexMono',
            data: fontData,
            weight: 500,
            style: 'normal',
          },
        ],
      }
    )

    const resvg = new Resvg(svg)
    const pngData = resvg.render()
    const pngBuffer = pngData.asPng()

    fs.writeFileSync(outPath, pngBuffer)
  }

  console.log(`Successfully generated ${Object.keys(index).length} OG images in public/og/`)
}

main().catch(console.error)
