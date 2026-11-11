/**
 * OG cards for daily notes (the logbook): a date-seeded drawing, 1200×630.
 *
 * Every card is three layers, all a function of the date:
 *   wash    — a soft seasonal ground (rust in autumn, blue-grey in winter…)
 *   motif   — an ink drawing, a cousin of one of the site's backgrounds
 *   almanac — the quiet facts of that day: moon, daylight, place in the year
 *
 * The date picks the motif. A tag can narrow the choice to a family
 * (`games` → isometric or board): the first tag in the note's frontmatter that
 * names a family wins, and the date picks the member. See TAG_MOTIFS, the key.
 *
 * Preview without touching public/og:
 *   tsx scripts/og-daily.ts --out scratch/og-daily            (one card per motif)
 */
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import satori from "satori"
import { Resvg } from "@resvg/resvg-js"
import jpeg from "jpeg-js"
import { OG_FONT_FAMILY, loadOgFonts, type OgFontData } from "./og-system"
import { MOTIF_NAMES, dailyArt, dailyCardLayout, dailyCardTree, type DailyCardInput } from "../src/lib/daily-art"

// The drawing itself lives in src/lib/daily-art.ts (pure, shared with the browser's /write desk).
export { TAG_MOTIFS, MOTIFS, MOTIF_NAMES, motifFor, dailyArt, type DailyArt, type DailyArtOptions, type DailyCardInput } from "../src/lib/daily-art"

const W = 1200
const H = 630

export async function renderDailyCard(card: DailyCardInput, fonts: OgFontData): Promise<{ buffer: Buffer; ext: "jpg" }> {
  const layout = dailyCardLayout(card)
  const ground = new Resvg(layout.art.svg).render().asPng()
  const tree = dailyCardTree(layout, `data:image/png;base64,${ground.toString("base64")}`)
  const svg = await satori(tree, {
    width: W, height: H,
    fonts: [
      { name: OG_FONT_FAMILY, data: fonts.regular, weight: 400, style: "normal" },
      { name: OG_FONT_FAMILY, data: fonts.semibold, weight: 600, style: "normal" },
    ],
  })
  const r = new Resvg(svg).render()
  return { buffer: jpeg.encode({ data: Buffer.from(r.pixels), width: r.width, height: r.height }, 88).data, ext: "jpg" }
}

/** The drawing alone (no title, no scrim): the plate shown on the note itself and in the logbook. */
export function renderDailyPlate(card: Pick<DailyCardInput, "iso" | "tags" | "motif" | "almanac">): Buffer {
  const art = dailyArt(card.iso, { tags: card.tags, motif: card.motif, almanac: card.almanac })
  const r = new Resvg(art.svg).render()
  return jpeg.encode({ data: Buffer.from(r.pixels), width: r.width, height: r.height }, 86).data
}

// ── preview: one card per motif ──
async function preview(outArg: string) {
  const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", outArg)
  fs.mkdirSync(out, { recursive: true })
  const fonts = await loadOgFonts()
  let i = 0
  for (const motif of MOTIF_NAMES) {
    // spread the previews across the year so every season and almanac guise shows up
    const iso = new Date(Date.UTC(2026, 0, 9) + i++ * 26 * 864e5).toISOString().slice(0, 10)
    const { buffer } = await renderDailyCard({ iso, title: motif, description: `A preview of the ${motif} motif, as drawn for ${iso}.`, motif }, fonts)
    fs.writeFileSync(path.join(out, `${motif}.jpg`), buffer)
    fs.writeFileSync(path.join(out, `${motif}-plate.jpg`), renderDailyPlate({ iso, motif }))
    console.log(`  ${motif}  ${iso}  ${(buffer.length / 1024).toFixed(0)} KB`)
  }
}
if (process.argv[1] && /^og-daily\.[cm]?[jt]s$/.test(path.basename(process.argv[1]))) {
  const outArg = process.argv.find((a) => a.startsWith("--out="))?.slice(6) ?? process.argv[process.argv.indexOf("--out") + 1]
  if (!outArg || outArg.startsWith("--")) { console.error("usage: tsx scripts/og-daily.ts --out <dir>"); process.exit(1) }
  preview(outArg).catch((err) => { console.error(err); process.exit(1) })
}
