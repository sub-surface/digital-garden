import React from "react"
import styles from "./ChuckleRating.module.scss"

interface Props {
  /** Size on the aura scale, 1 to 5. */
  size: 1 | 2 | 3 | 4 | 5
  /** Optional custom label, defaults to "Size N Chuckle". */
  label?: string
  /** The specific emote or reaction count, e.g. "KEKW × 6". */
  react?: string
}

/**
 * The aura reaction scale — coined in Vol III when a laugh was officially
 * filed as "approximately a size 2 chuckle."
 *
 *   <ChuckleRating size={2} react="KEKW × 4" />
 *   <ChuckleRating size={4} label="Room meltdown" react="OMEGALUL × 14" />
 */
export function ChuckleRating({ size, label, react }: Props) {
  const displayLabel = label || `Size ${size} Chuckle`

  return (
    <div className={styles.badge} role="status" aria-label={`Reaction measurement: ${displayLabel}`}>
      <div className={styles.meter} aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`${styles.pip} ${i <= size ? styles.active : ""}`}
          />
        ))}
      </div>
      <span className={styles.label}>{displayLabel}</span>
      {react && <span className={styles.react}>{react}</span>}
    </div>
  )
}
