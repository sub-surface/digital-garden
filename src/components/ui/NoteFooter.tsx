import { useStore } from "@/store"
import { LocalGraph } from "./LocalGraph"
import type { NoteMetadata } from "@/types/content"
import styles from "./NoteFooter.module.scss"

interface Props {
  slug: string
  meta?: NoteMetadata
}

export function NoteFooter({ slug, meta }: Props) {
  const contentIndex = useStore((s) => s.contentIndex)

  return (
    <footer className={styles.footer}>
      <hr className={styles.divider} />
      
      <div className={styles.columns}>
        <div className={styles.backlinksSection}>
          <h3>Backlinks</h3>
          {meta?.backlinks && meta.backlinks.length > 0 ? (
            <ul className={styles.backlinksList}>
              {meta.backlinks.map((bl) => (
                <li key={bl}>
                  <a href={`/${bl}`} className="internal-link">
                    {contentIndex?.[bl]?.title ?? bl}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>No notes link here yet.</p>
          )}
        </div>

        <div className={styles.graphSection}>
          <LocalGraph slug={slug} />
        </div>
      </div>
    </footer>
  )
}
