import styles from "./MDXComponents.module.scss"

interface GalleryProps {
  images: {
    src: string
    alt?: string
    caption?: string
  }[]
  columns?: number
}

export function Gallery({ images, columns = 2 }: GalleryProps) {
  return (
    <div className={styles.gallery} style={{ "--columns": columns } as any}>
      {images.map((img, i) => (
        <figure key={i} className={styles.figure}>
          <img src={img.src} alt={img.alt || `Gallery image ${i + 1}`} />
          {img.caption && <figcaption className={styles.caption}>{img.caption}</figcaption>}
        </figure>
      ))}
    </div>
  )
}
