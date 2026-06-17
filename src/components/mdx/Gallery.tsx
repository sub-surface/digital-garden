import styles from "./MDXComponents.module.scss"
import { useStore } from "@/store"

interface GalleryProps {
  images: {
    src: string
    alt?: string
    caption?: string
  }[]
  columns?: number
}

export function Gallery({ images, columns = 2 }: GalleryProps) {
  const imageDimensions = useStore((s) => s.imageDimensions)

  return (
    <div className={styles.gallery} style={{ "--columns": columns } as any}>
      {images.map((img, i) => {
        const dims = imageDimensions?.[img.src]
        return (
          <figure key={i} className={styles.figure}>
            <img 
              src={img.src} 
              alt={img.alt || `Gallery image ${i + 1}`} 
              width={dims?.width}
              height={dims?.height}
            />
            {img.caption && <figcaption className={styles.caption}>{img.caption}</figcaption>}
          </figure>
        )
      })}
    </div>
  )
}
