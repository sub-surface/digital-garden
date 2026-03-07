import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import satori from "satori"
import { Resvg } from "@resvg/resvg-js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.resolve(__dirname, "../public")
const OG_DIR = path.join(PUBLIC_DIR, "og")

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
    
    // Create directory for nested slugs if needed (though we flatten names here)
    const svg = await satori(
      {
        type: 'div',
        props: {
          style: {
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'center',
            backgroundColor: '#0a0a0a',
            backgroundImage: 'radial-gradient(circle at 25px 25px, #1a1a1a 2%, transparent 0%)',
            backgroundSize: '50px 50px',
            padding: '80px',
            fontFamily: 'IBMPlexMono',
            borderLeft: '12px solid #b4424c', // Default accent
          },
          children: [
            {
              type: 'div',
              props: {
                style: {
                  fontSize: 24,
                  color: '#b4424c',
                  marginBottom: '20px',
                  textTransform: 'uppercase',
                  letterSpacing: '4px',
                },
                children: 'Sub-Surface Territories',
              },
            },
            {
              type: 'div',
              props: {
                style: {
                  fontSize: 72,
                  fontWeight: 700,
                  color: '#ffffff',
                  marginBottom: '24px',
                  lineHeight: 1.1,
                },
                children: note.title,
              },
            },
            {
              type: 'div',
              props: {
                style: {
                  fontSize: 28,
                  color: '#888888',
                  maxWidth: '800px',
                  lineHeight: 1.4,
                },
                children: note.description || note.excerpt || '',
              },
            },
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  marginTop: 'auto',
                  gap: '12px',
                },
                children: (note.tags || []).map((t: string) => ({
                  type: 'span',
                  props: {
                    style: {
                      fontSize: 20,
                      color: '#666',
                      border: '1px solid #333',
                      padding: '4px 12px',
                      borderRadius: '4px',
                    },
                    children: `#${t}`,
                  },
                })),
              },
            },
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
