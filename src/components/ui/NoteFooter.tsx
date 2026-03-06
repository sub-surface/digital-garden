import { useStore } from "@/store"
import type { NoteMetadata } from "@/types/content"
import styles from "./NoteFooter.module.scss"
import { lazy, Suspense, useState, useEffect } from "react"

// Lazy load the local graph
const LocalGraph = lazy(() => import("./LocalGraph").then(m => ({ default: m.LocalGraph })))

interface Props {
  slug: string
  meta?: NoteMetadata
}

export function NoteFooter({ slug, meta }: Props) {
  const contentIndex = useStore((s) => s.contentIndex)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 800)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 800)
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  return (
    <footer className={styles.footer}>
      <hr className={styles.divider} />

      <div className={styles.footerGrid}>
        <div className={styles.backlinksSection}>
          <h3>Backlinks</h3>
          {meta?.backlinks && meta.backlinks.length > 0 ? (
            <ul className={styles.backlinksList}>
              {meta.backlinks.map((bl) => (
                <li key={bl}>
                  <a href={`/${bl.replace(/\s+/g, "-")}`} className="internal-link">
                    {contentIndex?.[bl]?.title ?? bl}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>No notes link here yet.</p>
          )}
        </div>

        {/* Local graph only in footer on mobile */}
        {isMobile && (
          <div className={styles.graphSection}>
            <Suspense fallback={<div className={styles.graphLoading}>Initialising radar...</div>}>
              <LocalGraph slug={slug} />
            </Suspense>
          </div>
        )}
      </div>
    </footer>
  )
}
