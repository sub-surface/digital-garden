/**
 * OG card layouts for notes (1200×630, satori → resvg).
 *
 * Three layouts:
 *   split — text column left, the note's header image full-height right (default
 *           when a note has an image; the "Substack card" shape)
 *   bleed — the image fills the card under a left-weighted scrim (opt in with
 *           `og-layout: bleed` in frontmatter)
 *   text  — typographic card for notes without an image
 *
 * Kept free of I/O: og-gen.ts resolves fonts and images and hands them in, so the
 * same renderer serves the full run and `--only` previews.
 */
import satori from "satori"
import { Resvg } from "@resvg/resvg-js"
import jpeg from "jpeg-js"
import { OG_FONT_FAMILY, type OgFontData } from "./og-system"

export const OG_WIDTH = 1200
export const OG_HEIGHT = 630

const BG = "#0a0a0a"
const INK = "#f2efe8"
const DIM = "#a8a6a0"
const FAINT = "#6e6c68"
const ACCENT = "#427ab4"
const ACCENT_SOFT = "#7ba7d6"

export type OgLayout = "split" | "bleed" | "text"

export interface OgCardInput {
  title: string
  description: string
  /** "Essay", "Note", "Book"… shown in the meta line. */
  kind: string
  date?: string
  readingTime?: number
  /** data: URI of a decodable raster (png/jpeg), or null for a text card. */
  image: string | null
  layout?: OgLayout
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any
const el = (type: string, style: Record<string, unknown>, children?: Node[] | string | Node): Node =>
  ({ type, props: { style, ...(children !== undefined ? { children } : {}) } })

/** Shorten on a word boundary; satori has no reliable multi-line clamp. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(" ")
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:—–-]+$/, "")}…`
}

/** Long titles step down so they never need more than ~3 lines. */
function titleSize(title: string, narrow: boolean): number {
  const n = title.length
  if (narrow) return n > 70 ? 44 : n > 48 ? 50 : n > 28 ? 58 : 66
  return n > 90 ? 52 : n > 60 ? 60 : n > 36 ? 70 : 80
}

export function formatOgDate(raw?: string): string | null {
  if (!raw) return null
  const d = new Date(raw)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
}

function metaLine(card: OgCardInput): string {
  return [
    card.kind,
    formatOgDate(card.date),
    card.readingTime ? `${card.readingTime} min read` : null,
  ].filter(Boolean).join("  ·  ")
}

/** The text column every layout shares. */
function textColumn(card: OgCardInput, opts: { width: number; narrow: boolean; descMax: number }): Node {
  const title = clip(card.title, 110)
  const desc = card.description ? clip(card.description, opts.descMax) : ""
  return el("div", {
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    width: opts.width,
    height: "100%",
    padding: "64px 56px 56px 72px",
  }, [
    // Masthead
    el("div", { display: "flex", alignItems: "center", gap: 14 }, [
      el("div", { width: 10, height: 10, backgroundColor: ACCENT }),
      el("div", { fontSize: 19, letterSpacing: 5, textTransform: "uppercase", color: ACCENT_SOFT }, "Sub-Surface Territories"),
    ]),
    // Title + description
    el("div", { display: "flex", flexDirection: "column" }, [
      el("div", {
        fontSize: titleSize(title, opts.narrow),
        fontWeight: 600,
        color: INK,
        lineHeight: 1.06,
        letterSpacing: -0.5,
      }, title),
      ...(desc ? [el("div", {
        marginTop: 26,
        fontSize: opts.narrow ? 25 : 28,
        lineHeight: 1.38,
        color: DIM,
      }, desc)] : []),
    ]),
    // Footer
    el("div", { display: "flex", flexDirection: "column", gap: 10 }, [
      el("div", { width: 56, height: 2, backgroundColor: ACCENT }),
      el("div", { display: "flex", justifyContent: "space-between", fontSize: 20, color: FAINT }, [
        el("div", {}, metaLine(card)),
        ...(opts.narrow ? [] : [el("div", {}, "subsurfaces.net")]),
      ]),
    ]),
  ])
}

function splitLayout(card: OgCardInput): Node {
  const imageWidth = 520
  return el("div", { display: "flex", width: "100%", height: "100%", backgroundColor: BG }, [
    textColumn(card, { width: OG_WIDTH - imageWidth, narrow: true, descMax: 150 }),
    el("div", { display: "flex", position: "relative", width: imageWidth, height: OG_HEIGHT }, [
      { type: "img", props: { src: card.image, width: imageWidth, height: OG_HEIGHT, style: { width: imageWidth, height: OG_HEIGHT, objectFit: "cover" } } },
      // Soft seam so the photograph meets the text column without a hard edge
      el("div", {
        position: "absolute", left: 0, top: 0, width: 90, height: OG_HEIGHT,
        backgroundImage: `linear-gradient(to right, ${BG}, rgba(10,10,10,0))`,
      }),
    ]),
  ])
}

function bleedLayout(card: OgCardInput): Node {
  return el("div", { display: "flex", position: "relative", width: "100%", height: "100%", backgroundColor: BG }, [
    { type: "img", props: { src: card.image, width: OG_WIDTH, height: OG_HEIGHT, style: { position: "absolute", left: 0, top: 0, width: OG_WIDTH, height: OG_HEIGHT, objectFit: "cover" } } },
    el("div", {
      position: "absolute", left: 0, top: 0, width: OG_WIDTH, height: OG_HEIGHT,
      backgroundImage: "linear-gradient(to right, rgba(10,10,10,0.94) 0%, rgba(10,10,10,0.82) 42%, rgba(10,10,10,0.15) 100%)",
    }),
    el("div", { display: "flex", position: "relative", width: "100%", height: "100%" }, [
      textColumn(card, { width: 760, narrow: true, descMax: 170 }),
    ]),
  ])
}

function textLayout(card: OgCardInput): Node {
  return el("div", {
    display: "flex",
    width: "100%",
    height: "100%",
    backgroundColor: BG,
    backgroundImage: "radial-gradient(circle at 25px 25px, #181818 2%, transparent 0%)",
    backgroundSize: "50px 50px",
    borderLeft: `10px solid ${ACCENT}`,
  }, [
    textColumn(card, { width: OG_WIDTH - 10, narrow: false, descMax: 220 }),
  ])
}

export interface RenderedCard {
  buffer: Buffer
  /** "jpg" for photo cards (PNG photos run 600–800 KB), "png" for typographic ones. */
  ext: "jpg" | "png"
}

const JPEG_QUALITY = 86

export async function renderOgCard(card: OgCardInput, fonts: OgFontData): Promise<RenderedCard> {
  const layout: OgLayout = card.image ? (card.layout === "bleed" ? "bleed" : "split") : "text"
  const tree = layout === "split" ? splitLayout(card) : layout === "bleed" ? bleedLayout(card) : textLayout(card)
  const svg = await satori(
    el("div", { display: "flex", width: "100%", height: "100%", fontFamily: OG_FONT_FAMILY }, [tree]),
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      fonts: [
        { name: OG_FONT_FAMILY, data: fonts.regular, weight: 400, style: "normal" },
        { name: OG_FONT_FAMILY, data: fonts.semibold, weight: 600, style: "normal" },
      ],
    },
  )
  const rendered = new Resvg(svg).render()
  if (layout === "text") return { buffer: rendered.asPng(), ext: "png" }
  const { data } = jpeg.encode(
    { data: Buffer.from(rendered.pixels), width: rendered.width, height: rendered.height },
    JPEG_QUALITY,
  )
  return { buffer: data, ext: "jpg" }
}
