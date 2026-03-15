import { useState, useEffect, useRef, type RefObject } from "react"
import { createPortal } from "react-dom"
import styles from "./ChatSettings.module.scss"

const PRESET_COLORS = [
  "#e05555", "#e08a55", "#e0c855", "#6dbf6d", "#55b4e0",
  "#7c6de0", "#c86de0", "#e06d9e", "#55e0c8", "#e0e0e0",
  "#b4424c", "#b48242", "#8fb442", "#42b464", "#4282b4",
  "#6442b4", "#b44282", "#42b4b4", "#b4b442", "#8a8a8a",
]

interface StonkConfigRow {
  key: string
  value: number
}

interface Props {
  anchorRef: RefObject<HTMLElement | null>
  currentColor: string | null
  onSave: (color: string | null) => void
  onClose: () => void
  isAdmin?: boolean
  accessToken?: string
}

export function ChatSettings({ anchorRef, currentColor, onSave, onClose, isAdmin, accessToken }: Props) {
  const [color, setColor] = useState(currentColor ?? "")
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const [stonkConfig, setStonkConfig] = useState<StonkConfigRow[]>([])
  const [stonkLoading, setStonkLoading] = useState(false)

  // Load stonk config for admins
  useEffect(() => {
    if (!isAdmin || !accessToken) return
    setStonkLoading(true)
    fetch("/api/admin/stonk-config", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: StonkConfigRow[]) => setStonkConfig(data))
      .catch(() => {})
      .finally(() => setStonkLoading(false))
  }, [isAdmin, accessToken])

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      })
    }
  }, [anchorRef])

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

  return createPortal(
    <div
      className={styles.settings}
      ref={ref}
      style={pos ? { top: pos.top, right: pos.right } : { visibility: "hidden" }}
    >
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

      {isAdmin && accessToken && (
        <>
          <div className={styles.divider} />
          <div className={styles.header}>stonk config</div>
          {stonkLoading ? (
            <div className={styles.stonkLoading}>loading...</div>
          ) : (
            <div className={styles.stonkTable}>
              {stonkConfig.map((row) => (
                <div key={row.key} className={styles.stonkRow}>
                  {row.key === "stonks_enabled" ? (
                    <>
                      <span className={styles.stonkKey}>{row.key}</span>
                      <button
                        className={`${styles.stonkToggle} ${row.value ? styles.stonkToggleOn : ""}`}
                        onClick={() => {
                          const newVal = row.value ? 0 : 1
                          setStonkConfig(prev => prev.map(r => r.key === row.key ? { ...r, value: newVal } : r))
                          fetch("/api/admin/stonk-config", {
                            method: "PUT",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
                            body: JSON.stringify({ key: row.key, value: newVal }),
                          }).catch(() => {
                            setStonkConfig(prev => prev.map(r => r.key === row.key ? { ...r, value: row.value } : r))
                          })
                        }}
                        type="button"
                      >
                        {row.value ? "on" : "off"}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={styles.stonkKey}>{row.key}</span>
                      <input
                        className={styles.stonkInput}
                        type="number"
                        value={row.value}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10)
                          if (isNaN(val)) return
                          setStonkConfig(prev => prev.map(r => r.key === row.key ? { ...r, value: val } : r))
                        }}
                        onBlur={() => {
                          fetch("/api/admin/stonk-config", {
                            method: "PUT",
                            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
                            body: JSON.stringify({ key: row.key, value: row.value }),
                          }).catch(() => {})
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                        }}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>,
    document.body
  )
}
