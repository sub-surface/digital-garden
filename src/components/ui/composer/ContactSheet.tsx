import { useMemo } from "react"
import type { Plate } from "@/lib/composer/types"
import { generate } from "@/lib/composer/generate"
import { renderSVG } from "@/lib/composer/render/svg"
import styles from "./ContactSheet.module.scss"

/**
 * Contact sheet — render N seeds as vector thumbnails in a grid; click one to
 * open it in the editor. This is how you actually curate a generative system
 * (and it feeds the print-store "generate a grid, pick the sellable ones" flow).
 * Thumbnails render vector (era-independent) for speed; each seed picks its own
 * armature for variety, sharing the current palette + ratio.
 */
const COUNT = 24

export function ContactSheet({ plate, baseSeed, onPick, onClose }: { plate: Plate; baseSeed: number; onPick: (seed: number) => void; onClose: () => void }) {
  const thumbs = useMemo(() => {
    const out: { seed: number; svg: string }[] = []
    for (let i = 0; i < COUNT; i++) {
      const seed = baseSeed + i
      const p = generate({ seed: `plate-${seed}`, palette: plate.palette, ratio: plate.ratio, era: "hi-res" })
      out.push({ seed, svg: renderSVG(p) })
    }
    return out
  }, [baseSeed, plate.palette, plate.ratio])

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <span>Contact sheet — seeds {baseSeed}–{baseSeed + COUNT - 1}</span>
          <button onClick={onClose} aria-label="Close contact sheet">✕</button>
        </div>
        <div className={styles.grid}>
          {thumbs.map((t) => (
            <button key={t.seed} className={styles.cell} onClick={() => onPick(t.seed)} title={`plate-${t.seed}`}>
              <div className={styles.thumb} dangerouslySetInnerHTML={{ __html: t.svg }} />
              <span className={styles.seedNo}>{t.seed}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
