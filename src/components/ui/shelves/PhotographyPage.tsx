import { useState, useEffect } from "react"
import { ImageLightbox } from "@/components/ui/reader/ImageLightbox"
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
          <ImageLightbox
            src={photoSrc(photo.file)}
            alt={photo.caption ?? photo.file}
            caption={photo.caption}
            positionLabel={`${(lightboxIndex ?? 0) + 1} / ${activeAlbum.photos.length}`}
            onPrevious={lightboxIndex !== null && lightboxIndex > 0
              ? () => setLightboxIndex((index) => Math.max((index ?? 0) - 1, 0))
              : undefined}
            onNext={lightboxIndex !== null && lightboxIndex < activeAlbum.photos.length - 1
              ? () => setLightboxIndex((index) => Math.min((index ?? 0) + 1, activeAlbum.photos.length - 1))
              : undefined}
            onClose={() => setLightboxIndex(null)}
          />
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
