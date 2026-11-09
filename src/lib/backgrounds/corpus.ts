import { loadNote } from "@/lib/note-loader"
import { useStore } from "@/store"

/**
 * Words for the typographic backgrounds (prose, sediment, palimpsest, rivers,
 * cut-up, teletype). Text comes from the same built note JSON the reader uses,
 * stripped to running prose; nothing here blocks a frame: a request returns
 * what is loaded now (or null) and kicks off the load for next time.
 */
export interface NoteText {
  slug: string
  title: string
  date: string
  paragraphs: string[]
  sidenotes: string[]
}

const texts = new Map<string, NoteText | "loading" | "missing">()

const STRIP = [
  "[data-island]", "figure", "pre", "table", "script", "style", "sup", "img",
  ".katex", ".katex-display", ".note-build-error", ".telescopic", "label", "input",
].join(",")

const clean = (s: string) => s.replace(/\s+/g, " ").trim()

function extract(slug: string, html: string, title: string, date: string): NoteText {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html")
  const sidenotes = Array.from(doc.querySelectorAll("aside")).map((a) => clean(a.textContent ?? "")).filter((t) => t.length > 20)
  doc.querySelectorAll("aside").forEach((a) => a.remove())
  doc.querySelectorAll(STRIP).forEach((el) => el.remove())
  const paragraphs = Array.from(doc.querySelectorAll("p, li, blockquote"))
    .filter((el) => !el.querySelector("p, li"))
    .map((el) => clean(el.textContent ?? ""))
    .filter((t) => t.length > 60)
  return { slug, title, date, paragraphs, sidenotes }
}

/** A note's prose if loaded; otherwise null, and it starts loading. */
export function noteText(slug: string): NoteText | null {
  const key = slug.toLowerCase()
  const hit = texts.get(key)
  if (hit && hit !== "loading" && hit !== "missing") return hit
  if (!hit) {
    texts.set(key, "loading")
    const meta = useStore.getState().contentIndex?.[slug]
    loadNote(slug)
      .then((n) => {
        const fm = n.frontmatter as { title?: string; date?: string }
        const t = extract(slug, n.html, meta?.title ?? fm.title ?? slug, String(meta?.date ?? fm.date ?? ""))
        texts.set(key, t.paragraphs.length ? t : "missing")
      })
      .catch(() => texts.set(key, "missing"))
  }
  return null
}

/** True once a note is known to have no prose to offer (images only, a failed load). */
export function isMissing(slug: string): boolean {
  return texts.get(slug.toLowerCase()) === "missing"
}

/** Sentences of running text (for the cut-up). */
export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z"'(])/).map(clean).filter((s) => s.length > 30 && s.length < 220)
}

/** Readable notes in the garden, oldest first (for sediment's strata). */
export function gardenSlugs(): { slug: string; date: string }[] {
  const index = useStore.getState().contentIndex
  if (!index) return []
  return Object.entries(index)
    .filter(([, m]) => !m.system && !m.draft)
    .map(([slug, m]) => ({ slug, date: String(m.date ?? "") }))
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))
}

// A small pool of random notes kept warm for the modes that wander the garden.
const pool: string[] = []
/** A random loaded note other than `exclude`, topping the pool up as it goes. */
export function randomText(exclude?: string): NoteText | null {
  const slugs = gardenSlugs()
  if (slugs.length && pool.length < 6) pool.push(slugs[Math.floor(Math.random() * slugs.length)].slug)
  const ready = pool.map((s) => noteText(s)).filter((t): t is NoteText => !!t && t.slug !== exclude)
  // Rotate the pool slowly so it keeps wandering.
  if (ready.length >= 4 && Math.random() < 0.15) pool.shift()
  return ready.length ? ready[Math.floor(Math.random() * ready.length)] : null
}

/** What the garden says before anything has loaded. */
export const FALLBACK: NoteText = {
  slug: "",
  title: "Sub-Surface Territories",
  date: "",
  paragraphs: [
    "A growing collection of notes on philosophy, technology, and the history of images. A space for thinking in public, or just thinking. Explore with the graph view, or search for topics from the prompt.",
    "Follow the links between notes to discover connections, or just have fun getting lost. These notes are a reflection of current thoughts and interests, and they will evolve over time.",
  ],
  sidenotes: [
    "This site is a work in progress. Don't be surprised if you find some dead ends, partial notes, or stubs.",
  ],
}

/** The note being read, falling back to the home page, then to FALLBACK. */
export function currentText(slug: string): NoteText {
  return noteText(slug || "index") ?? noteText("index") ?? FALLBACK
}
