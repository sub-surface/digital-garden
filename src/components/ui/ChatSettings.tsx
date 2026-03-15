import { useState, useEffect, useRef } from "react"
import styles from "./ChatSettings.module.scss"

const PRESET_COLORS = [
  "#e05555", "#e08a55", "#e0c855", "#6dbf6d", "#55b4e0",
  "#7c6de0", "#c86de0", "#e06d9e", "#55e0c8", "#e0e0e0",
  "#b4424c", "#b48242", "#8fb442", "#42b464", "#4282b4",
  "#6442b4", "#b44282", "#42b4b4", "#b4b442", "#8a8a8a",
]

interface Props {
  currentColor: string | null
  onSave: (color: string | null) => void
  onClose: () => void
}

export function ChatSettings({ currentColor, onSave, onClose }: Props) {
  const [color, setColor] = useState(currentColor ?? "")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", handleMouseDown)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleMouseDown)
      document.removeEventListener("keydown", handleKey)
    }
  }, [onClose])

  function handleSelect(hex: string) {
    setColor(hex)
    onSave(hex)
  }

  function handleReset() {
    setColor("")
    onSave(null)
  }

  function handleHexSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = color.trim()
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      onSave(trimmed)
    }
  }

  return (
    <div className={styles.settings} ref={ref}>
      <div className={styles.header}>name colour</div>

      <div className={styles.swatchGrid}>
        {PRESET_COLORS.map((hex) => (
          <button
            key={hex}
            className={`${styles.swatch} ${color === hex ? styles.swatchActive : ""}`}
            style={{ backgroundColor: hex }}
            onClick={() => handleSelect(hex)}
            title={hex}
            type="button"
          />
        ))}
      </div>

      <form className={styles.hexRow} onSubmit={handleHexSubmit}>
        <input
          className={styles.hexInput}
          type="text"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          placeholder="#RRGGBB"
          maxLength={7}
          autoComplete="off"
        />
        {color && (
          <span className={styles.preview} style={{ color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : undefined }}>
            preview
          </span>
        )}
      </form>

      <button className={styles.resetBtn} onClick={handleReset} type="button">
        reset to default
      </button>
    </div>
  )
}
