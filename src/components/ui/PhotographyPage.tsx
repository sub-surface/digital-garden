import { useState, useEffect } from "react"
import styles from "./Collections.module.scss"

interface Photo {
  src: string
  alt: string
  noteSlug: string
  noteTitle: string
}

export function PhotographyPage() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null)

  useEffect(() => {
    fetch("/photography.json")
      .then((res) => res.json())
      .then((data) => {
        setPhotos(data)
        setLoading(false)
      })
      .catch((err) => {
        console.error("Failed to load photography manifest:", err)
        setLoading(false)
      })
  }, [])

  if (loading) return <div className={styles.collectionPage}>Loading photos...</div>

  return (
    <div className={styles.collectionPage}>
      <header className={styles.header}>
        <h1>Photography</h1>
        <p>Capturing the world as it is.</p>
      </header>

      <div className={styles.photoGrid}>
        {photos.length === 0 ? (
          <p>No photos found in the garden yet.</p>
        ) : (
          photos.map((photo, i) => (
            <div 
              key={`${photo.src}-${i}`} 
              className={styles.photoItem}
              onClick={() => setSelectedPhoto(photo)}
            >
              <img src={photo.src} alt={photo.alt} loading="lazy" />
              <div className={styles.photoOverlay}>
                <span>{photo.noteTitle}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {selectedPhoto && (
        <div className={styles.lightbox} onClick={() => setSelectedPhoto(null)}>
          <div className={styles.lightboxContent}>
            <img src={selectedPhoto.src} alt={selectedPhoto.alt} />
            <div className={styles.lightboxMeta}>
              <h3>{selectedPhoto.noteTitle}</h3>
              <a href={`/${selectedPhoto.noteSlug}`} onClick={(e) => e.stopPropagation()}>
                View Note →
              </a>
            </div>
          </div>
          <button className={styles.closeLightbox}>&times;</button>
        </div>
      )}
    </div>
  )
}
