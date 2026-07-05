import { useEffect, useState } from "react"
import type { Plate } from "@/lib/composer/types"
import { generate } from "@/lib/composer/generate"
import { renderSVG } from "@/lib/composer/render/svg"
import styles from "./ContactSheet.module.scss"

/**
 * Contact sheet — render N seeds as thumbnails in a grid; click one to open it.
 *
 * Performance: thumbnails are generated in small chunks across animation frames
 * (so opening never stalls the main thread) and each is a single browser-
 * rasterized `<img>` data-URI — not thousands of live SVG nodes. Results are
 * memoised per (baseSeed, palette, ratio) so reopening is instant.
 */
const COUNT = 24
const CHUNK = 3

type Thumb = { seed: number; src: string }
const cache = new Map<string, Thumb[]>()

export function ContactSheet({ plate, baseSeed, onPick, onClose }: { plate: Plate; baseSeed: number; onPick: (seed: number) => void; onClose: () => void }) {
  const cacheKey = `${baseSeed}:${plate.palette.id}:${plate.ratio.join("x")}`
  const [thumbs, setThumbs] = useState<Thumb[]>(() => cache.get(cacheKey) ?? [])

  useEffect(() => {
    const cached = cache.get(cacheKey)
    if (cached && cached.length === COUNT) {
      setThumbs(cached)
      return
    }
    let cancelled = false
    const acc: Thumb[] = []
    let i = 0
    let raf = 0
    const step = () => {
      if (cancelled) return
      const end = Math.min(i + CHUNK, COUNT)
      for (; i < end; i++) {
        const seed = baseSeed + i
        const p = generate({ seed: `plate-${seed}`, palette: plate.palette, ratio: plate.ratio, era: "hi-res" })
        acc.push({ seed, src: `data:image/svg+xml,${encodeURIComponent(renderSVG(p, { standalone: true }))}` })
      }
      setThumbs([...acc])
      if (i < COUNT) raf = requestAnimationFrame(step)
      else {
        cache.set(cacheKey, acc)
        if (cache.size > 4) cache.delete(cache.keys().next().value!)
      }
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [cacheKey, baseSeed, plate.palette, plate.ratio])

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <span>
            Contact sheet — seeds {baseSeed}–{baseSeed + COUNT - 1}
            {thumbs.length < COUNT ? ` · ${thumbs.length}/${COUNT}` : ""}
          </span>
          <button onClick={onClose} aria-label="Close contact sheet">✕</button>
        </div>
        <div className={styles.grid}>
          {Array.from({ length: COUNT }, (_, idx) => {
            const seed = baseSeed + idx
            const thumb = thumbs[idx]
            return (
              <button key={seed} className={styles.cell} onClick={() => onPick(seed)} title={`plate-${seed}`}>
                {thumb ? <img className={styles.thumbImg} src={thumb.src} alt={`plate ${seed}`} loading="lazy" /> : <div className={styles.skeleton} />}
                <span className={styles.seedNo}>{seed}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
