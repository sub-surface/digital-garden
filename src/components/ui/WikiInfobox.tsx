import { useState } from "react"
import styles from "./WikiInfobox.module.scss"

interface Props {
  type: "chatter" | "philosopher"
  data: Record<string, any>
}

/**
 * Resolves the avatar path. 
 * If it's a subsurfaces.net/Media/ URL, maps it to local /content/Media/.
 * If it's a full external URL, keeps it.
 * If it's just a filename, assumes it's in /content/Media/.
 */
function resolveAvatarPath(path?: string): string | undefined {
  if (!path) return undefined
  
  // Map remote production URLs to local assets for testing
  if (path.includes("subsurfaces.net/Media/")) {
    const filename = path.split("/Media/").pop()
    return `/content/Media/${filename}`
  }

  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("/")) {
    return path
  }
  
  // Remove possible leading [[ ]] from wikilink-style images if they leaked in
  const cleanPath = path.replace(/[\[\]]/g, "")
  return `/content/Media/${cleanPath}`
}

export function WikiInfobox({ type, data }: Props) {
  const [expanded, setExpanded] = useState(false)
  const {
    title,
    image,
    username,
    pronouns,
    tradition,
    aos,
    influences,
    born,
    died,
    school,
    main_interests,
    notable_ideas
  } = data

  const avatar = resolveAvatarPath(image || data.avatar)

  return (
    <aside className={styles.infobox} data-type={type} data-panel-ignore>
      {expanded && avatar && (
        <div className={styles.lightbox} onClick={() => setExpanded(false)}>
          <img src={avatar} alt={title} className={styles.lightboxImg} />
        </div>
      )}
      <div className={styles.header}>
        {avatar && (
          <div
            className={styles.avatarWrap}
            onClick={() => setExpanded(true)}
            title="Click to expand"
          >
            <img src={avatar} alt={title} className={styles.avatar} onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }} />
          </div>
        )}
        <div className={styles.titleWrap}>
          <div className={styles.typeLabel}>{type}</div>
          <h2 className={styles.title}>{title}</h2>
          {username && <div className={styles.username}>@{username}</div>}
        </div>
      </div>

      <div className={styles.content}>
        {pronouns && <div className={styles.row}><span className={styles.label}>Pronouns</span><span className={styles.value}>{pronouns}</span></div>}
        
        {type === "chatter" && (
          <>
            {tradition && <div className={styles.row}><span className={styles.label}>Tradition</span><span className={styles.value}>{tradition}</span></div>}
            {aos && (
              <div className={styles.section}>
                <div className={styles.label}>Areas of Specialization</div>
                <div className={styles.textValue}>{aos}</div>
              </div>
            )}
            {influences && (
              <div className={styles.section}>
                <div className={styles.label}>Influences</div>
                <div className={styles.textValue}>{influences}</div>
              </div>
            )}
          </>
        )}

        {type === "philosopher" && (
          <>
            {born && <div className={styles.row}><span className={styles.label}>Born</span><span className={styles.value}>{born}</span></div>}
            {died && <div className={styles.row}><span className={styles.label}>Died</span><span className={styles.value}>{died}</span></div>}
            {school && <div className={styles.row}><span className={styles.label}>School</span><span className={styles.value}>{school}</span></div>}
            {main_interests && (
              <div className={styles.section}>
                <div className={styles.label}>Interests</div>
                <div className={styles.textValue}>{main_interests}</div>
              </div>
            )}
            {notable_ideas && (
              <div className={styles.section}>
                <div className={styles.label}>Notable Ideas</div>
                <div className={styles.textValue}>{notable_ideas}</div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
