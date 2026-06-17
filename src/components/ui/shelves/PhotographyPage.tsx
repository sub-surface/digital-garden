import { useState, useEffect } from "react"
import styles from "./Collections.module.scss"

interface AlbumPhoto {
  file: string
  caption?: string
}

interface Album {
  slug: string
  title: string
  description?: string
  date?: string
  cover?: string
  photos: AlbumPhoto[]
}

function photoSrc(file: string) {
  return `/content/Media/${file}`
}

export function PhotoAlbums() {
  const [albums, setAlbums] = useState<Album[]>([])
  const [loading, setLoading] = useState(true)
  const [activeAlbum, setActiveAlbum] = useState<Album | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  useEffect(() => {
    fetch("/albums.json")
      .then((r) => r.json())
      .then((data) => { setAlbums(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Lightbox keyboard nav
  useEffect(() => {
    if (lightboxIndex === null || !activeAlbum) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setLightboxIndex(i => Math.min((i ?? 0) + 1, activeAlbum.photos.length - 1))
      if (e.key === "ArrowLeft")  setLightboxIndex(i => Math.max((i ?? 0) - 1, 0))
      if (e.key === "Escape") setLightboxIndex(null)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [lightboxIndex, activeAlbum])

  if (loading) return <div className={styles.albumsLoading}>loading albums...</div>
  if (albums.length === 0) return <p>No albums yet.</p>

  // ── Album drill-in view ──
  if (activeAlbum) {
    const photo = lightboxIndex !== null ? activeAlbum.photos[lightboxIndex] : null
    return (
      <div className={styles.albumView}>
        <button className={styles.albumBack} onClick={() => setActiveAlbum(null)}>
          ← all albums
        </button>
        <div className={styles.albumViewHeader}>
          <h2>{activeAlbum.title}</h2>
          {activeAlbum.description && <p>{activeAlbum.description}</p>}
          {activeAlbum.date && (
            <span className={styles.albumDate}>
              {new Date(activeAlbum.date).toLocaleDateString("en-GB", { year: "numeric", month: "long" })}
            </span>
          )}
        </div>
        <div className={styles.photoGrid}>
          {activeAlbum.photos.map((p, i) => (
            <div key={i} className={styles.photoItem} onClick={() => setLightboxIndex(i)}>
              <img src={photoSrc(p.file)} alt={p.caption ?? p.file} loading="lazy" />
              {p.caption && (
                <div className={styles.photoOverlay}><span>{p.caption}</span></div>
              )}
            </div>
          ))}
        </div>

        {photo && (
          <div className={styles.lightbox} onClick={() => setLightboxIndex(null)}>
            <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
              <img src={photoSrc(photo.file)} alt={photo.caption ?? photo.file} />
              {photo.caption && (
                <div className={styles.lightboxMeta}><p>{photo.caption}</p></div>
              )}
              <div className={styles.lightboxNav}>
                <button
                  disabled={lightboxIndex === 0}
                  onClick={() => setLightboxIndex(i => Math.max((i ?? 0) - 1, 0))}
                >←</button>
                <span>{(lightboxIndex ?? 0) + 1} / {activeAlbum.photos.length}</span>
                <button
                  disabled={lightboxIndex === activeAlbum.photos.length - 1}
                  onClick={() => setLightboxIndex(i => Math.min((i ?? 0) + 1, activeAlbum.photos.length - 1))}
                >→</button>
              </div>
            </div>
            <button className={styles.closeLightbox} onClick={() => setLightboxIndex(null)}>&times;</button>
          </div>
        )}
      </div>
    )
  }

  // ── Album grid ──
  return (
    <div className={styles.albumGrid}>
      {albums.map((album) => (
        <div key={album.slug} className={styles.albumCard} onClick={() => setActiveAlbum(album)}>
          <div className={styles.albumCover}>
            {album.cover
              ? <img src={photoSrc(album.cover)} alt={album.title} loading="lazy" />
              : <div className={styles.albumCoverPlaceholder} />
            }
            <div className={styles.albumCoverOverlay}>
              <span>{album.photos.length} photo{album.photos.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
          <div className={styles.albumMeta}>
            <h3>{album.title}</h3>
            {album.description && <p>{album.description}</p>}
            {album.date && (
              <span className={styles.albumDate}>
                {new Date(album.date).toLocaleDateString("en-GB", { year: "numeric", month: "long" })}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
