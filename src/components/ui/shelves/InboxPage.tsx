import { useEffect, useMemo, useState } from "react"
import { useStore } from "@/store"
import { useRandomNote, isLandableNote } from "@/hooks/useRandomNote"
import { loadBrokenLinks } from "@/lib/content-loader"
import type { NoteMetadata, BrokenLinksManifest } from "@/types/content"
import styles from "./InboxPage.module.scss"

const COLLECTION_TYPES = new Set(["book", "movie", "music"])

type Flag = "untagged" | "orphaned" | "draft" | "broken"

const FILTERS: { key: "all" | Flag; label: string }[] = [
  { key: "all", label: "All" },
  { key: "untagged", label: "Untagged" },
  { key: "orphaned", label: "Orphaned" },
  { key: "draft", label: "Draft" },
  { key: "broken", label: "Broken links" },
]

/** Personal garden notes only — excludes collections (book/movie/music), the
 * collaborative wiki, and system/shelf pages (already handled by isLandableNote). */
function isPersonalNote(slug: string, meta: NoteMetadata): boolean {
  if (!isLandableNote(slug, meta)) return false
  if (COLLECTION_TYPES.has(meta.type ?? "")) return false
  const s = slug.toLowerCase()
  if (s === "wiki" || s.startsWith("wiki/")) return false
  return true
}

/** Saved external articles — reference material, not a thread of yours to grow. */
const isReference = (slug: string) => slug.toLowerCase().startsWith("clippings/")

/** Heuristic only — never guesses "actual"; that's always a human call. */
function suggestGrowth(meta: NoteMetadata): "larval" | "becoming" | null {
  const backlinks = meta.backlinks.length
  const readingTime = meta.readingTime ?? 0
  if (backlinks === 0 && readingTime <= 1) return "larval"
  if (readingTime <= 3) return "becoming"
  return null
}

function glyphFor(stage: string | undefined): string {
  if (stage === "actual") return "●"
  if (stage === "becoming") return "◐"
  if (stage === "larval") return "○"
  return "–"
}

interface InboxEntry {
  slug: string
  meta: NoteMetadata
  flags: Flag[]
  suggestion: "larval" | "becoming" | null
  brokenTargets: string[]
  reference: boolean
}

export function InboxPage() {
  const contentIndex = useStore((s) => s.contentIndex)
  const [brokenLinks, setBrokenLinks] = useState<BrokenLinksManifest | null>(null)
  const [filter, setFilter] = useState<"all" | Flag>("all")

  useEffect(() => {
    loadBrokenLinks()
      .then(setBrokenLinks)
      .catch(() => setBrokenLinks({ total: 0, bySlug: {} }))
  }, [])

  const { entries, taggedCount, personalCount } = useMemo(() => {
    if (!contentIndex) return { entries: [] as InboxEntry[], taggedCount: 0, personalCount: 0 }

    let tagged = 0
    let personal = 0
    const out: InboxEntry[] = []

    for (const [slug, meta] of Object.entries(contentIndex)) {
      if (!isPersonalNote(slug, meta)) continue
      const reference = isReference(slug)

      if (!reference) {
        personal++
        if (meta.growth) tagged++
      }

      const flags: Flag[] = []
      if (!meta.growth && !reference) flags.push("untagged")
      if (meta.backlinks.length === 0) flags.push("orphaned")
      if (meta.draft) flags.push("draft")
      const brokenTargets = brokenLinks?.bySlug[slug] ?? []
      if (brokenTargets.length > 0) flags.push("broken")

      if (flags.length === 0) continue

      out.push({
        slug,
        meta,
        flags,
        brokenTargets,
        reference,
        suggestion: !meta.growth && !reference ? suggestGrowth(meta) : null,
      })
    }

    out.sort((a, b) => a.meta.title.localeCompare(b.meta.title))
    return { entries: out, taggedCount: tagged, personalCount: personal }
  }, [contentIndex, brokenLinks])

  const visible = useMemo(
    () => (filter === "all" ? entries : entries.filter((e) => e.flags.includes(filter))),
    [entries, filter],
  )
  const visibleSlugs = useMemo(() => visible.map((e) => e.slug), [visible])
  const pullThread = useRandomNote(visibleSlugs)

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: entries.length }
    for (const f of ["untagged", "orphaned", "draft", "broken"] as Flag[]) {
      c[f] = entries.filter((e) => e.flags.includes(f)).length
    }
    return c
  }, [entries])

  if (!contentIndex) return <div>Loading index...</div>

  const coveragePct = personalCount > 0 ? Math.round((taggedCount / personalCount) * 100) : 0

  return (
    <div className={styles.inboxContainer}>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <h1>Inbox</h1>
          <button className={styles.pullButton} onClick={pullThread} disabled={visibleSlugs.length === 0}>
            Pull a thread
          </button>
        </div>
        <p>Loose threads, tallied.</p>
      </header>

      <div className={styles.coverage}>
        <span>{taggedCount} / {personalCount} notes carry a growth stage</span>
        <div className={styles.coverageBar}>
          <div className={styles.coverageFill} style={{ width: `${coveragePct}%` }} />
        </div>
      </div>

      <div className={styles.filters}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`${styles.pill} ${filter === f.key ? styles.pillActive : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label} · {counts[f.key] ?? 0}
          </button>
        ))}
      </div>

      <div className={styles.legend}>○ larval · ◐ becoming · ● actual · – unclear, needs a read</div>

      <ul className={styles.list}>
        {visible.length === 0 && <li className={styles.empty}>Nothing here — the garden's caught up.</li>}
        {visible.map((entry) => (
          <li key={entry.slug} className={styles.row}>
            <span className={styles.glyph}>{glyphFor(entry.meta.growth ?? entry.suggestion ?? undefined)}</span>
            <a href={`/${entry.slug}`} className={`internal-link ${styles.rowMain}`}>
              <span className={styles.rowTitle}>{entry.meta.title}</span>
              <span className={styles.rowMeta}>
                {entry.meta.readingTime ?? 1} min · {entry.meta.backlinks.length} backlinks
                {entry.meta.tags.length > 0 ? ` · ${entry.meta.tags.join(", ")}` : ""}
              </span>
            </a>
            <div className={styles.badges}>
              {entry.flags.includes("broken") && (
                <span className={`${styles.badge} ${styles.badgeBroken}`}>
                  {entry.brokenTargets.length} broken link{entry.brokenTargets.length === 1 ? "" : "s"}
                </span>
              )}
              {entry.flags.includes("draft") && <span className={`${styles.badge} ${styles.badgeDraft}`}>draft</span>}
              {entry.flags.includes("orphaned") && (
                <span className={`${styles.badge} ${styles.badgeOrphan}`}>orphaned</span>
              )}
              {entry.reference ? (
                <span className={styles.hint}>exempt — reference</span>
              ) : entry.suggestion ? (
                <span className={styles.hint}>suggests: {entry.suggestion}</span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
