import { useState, useEffect } from "react"
import { useStore } from "@/store"
import styles from "./Collections.module.scss"

interface Photo {
  src: string
  alt: string
  noteSlug: string
  noteTitle: string
}

export function PhotographyPage() {
  const contentIndex = useStore((s) => s.contentIndex)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null)

  useEffect(() => {
    if (!contentIndex) return

    async function collectPhotos() {
      if (!contentIndex) return
      const photographyNotes = Object.values(contentIndex).filter((n) =>
        n.tags.includes("Photography")
      )

      const collected: Photo[] = []

      for (const note of photographyNotes) {
        try {
          const res = await fetch(`/content/${note.slug}.md`)
          if (!res.ok) continue
          const text = await res.text()
          
          // Match ![[Image.jpg]]
          const regex = /!\[\[([^\]]+)\]\]/g
          let match: RegExpExecArray | null
          while ((match = regex.exec(text)) !== null) {
            const fileName = match[1].trim()
            collected.push({
              src: `/content/Media/${fileName}`,
              alt: fileName,
              noteSlug: note.slug,
              noteTitle: note.title,
            })
          }
        } catch (err) {
          console.error(`Failed to collect photos from ${note.slug}:`, err)
        }
      }

      setPhotos(collected)
      setLoading(false)
    }

    collectPhotos()
  }, [contentIndex])

  if (loading) return <div className={styles.collectionPage}>Loading photos...</div>

  return (
    <div className={styles.collectionPage}>
      <header className={styles.header}>
        <h1>Photography</h1>
        <p>Capturing the world as it is.</p>
      </header>

      <div className={styles.photoGrid}>
        {photos.map((photo, i) => (
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
        ))}
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
