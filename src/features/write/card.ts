/**
 * The logbook card and plate, drawn in the browser.
 *
 * Cloudflare never runs PROCESS_OG, so a note committed from the desk has to
 * carry its own card. Same drawing (src/lib/daily-art.ts), same layout and the
 * same satori tree as scripts/og-daily.ts; only the rasteriser differs (a
 * canvas here, resvg there). A later local `PROCESS_OG=true npm run prebuild`
 * redraws it with resvg, and the two agree to within anti-aliasing.
 */
import { DAILY_CARD_FONT, H, W, dailyArt, dailyCardLayout, dailyCardTree, type DailyCardInput } from "@/lib/daily-art"

/** The drawing as a data URL, for <img> previews (no rasterising needed). */
export function plateSvgUrl(card: Pick<DailyCardInput, "iso" | "tags" | "motif" | "almanac">): { url: string; motif: string } {
  const art = dailyArt(card.iso, { tags: card.tags, motif: card.motif, almanac: card.almanac })
  return { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(art.svg)}`, motif: art.motif }
}

async function rasterise(svg: string): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))
  try {
    const img = new Image()
    img.width = W
    img.height = H
    img.src = url
    await img.decode()
    const canvas = document.createElement("canvas")
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("no 2d canvas")
    ctx.drawImage(img, 0, 0, W, H)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

const jpegBase64 = (canvas: HTMLCanvasElement, quality: number) =>
  canvas.toDataURL("image/jpeg", quality).replace(/^data:image\/jpeg;base64,/, "")

let fonts: Promise<{ regular: ArrayBuffer; semibold: ArrayBuffer }> | null = null
function cardFonts() {
  const load = async (w: string) => {
    const res = await fetch(`/api/write/font/${w}`)
    if (!res.ok) throw new Error(`card font ${w}: ${res.status}`)
    return res.arrayBuffer()
  }
  fonts ??= Promise.all([load("regular"), load("semibold")]).then(([regular, semibold]) => ({ regular, semibold }))
  fonts.catch(() => { fonts = null })
  return fonts
}

export interface RenderedCard {
  /** base64 JPEG, 1200x630: the OG card (drawing + title). */
  card: string
  /** base64 JPEG: the drawing alone, shown atop the note and in the logbook. */
  plate: string
  /** Object URL of the card, for showing it before commit. */
  previewUrl: string
}

export async function renderCard(input: DailyCardInput): Promise<RenderedCard> {
  const { default: satori } = await import("satori")
  const [f, plateCanvas] = await Promise.all([
    cardFonts(),
    rasterise(dailyArt(input.iso, { tags: input.tags, motif: input.motif, almanac: input.almanac }).svg),
  ])
  const layout = dailyCardLayout(input)
  const ground = (await rasterise(layout.art.svg)).toDataURL("image/png")
  const svg = await satori(dailyCardTree(layout, ground), {
    width: W,
    height: H,
    fonts: [
      { name: DAILY_CARD_FONT, data: f.regular, weight: 400, style: "normal" },
      { name: DAILY_CARD_FONT, data: f.semibold, weight: 600, style: "normal" },
    ],
  })
  const cardCanvas = await rasterise(svg)
  const blob = await new Promise<Blob | null>((ok) => cardCanvas.toBlob(ok, "image/jpeg", 0.88))
  return {
    card: jpegBase64(cardCanvas, 0.88),
    plate: jpegBase64(plateCanvas, 0.86),
    previewUrl: blob ? URL.createObjectURL(blob) : "",
  }
}
