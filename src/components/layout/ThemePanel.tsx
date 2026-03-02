import { useStore } from "@/store"
import styles from "./ThemePanel.module.scss"

const ACCENTS = [
  { name: "Red", color: "#b4424c" },
  { name: "Orange", color: "#b47a42" },
  { name: "Amber", color: "#b49442" },
  { name: "Green", color: "#42b464" },
  { name: "Blue", color: "#427ab4" },
  { name: "Indigo", color: "#424cb4" },
  { name: "Violet", color: "#8a42b4" },
]

export function ThemePanel() {
  const isOpen = useStore((s) => s.isThemePanelOpen)
  const close = () => useStore.getState().setThemePanel(false)
  
  const theme = useStore((s) => s.theme)
  const setTheme = (t: "light" | "dark") => useStore.getState().setTheme(t)
  
  const palette = useStore((s) => s.palette)
  const setPalette = useStore((s) => s.setPalette)
  
  const accentBase = useStore((s) => s.accentBase)
  const setAccentBase = useStore((s) => s.setAccentBase)
  
  const bgMode = useStore((s) => s.bgMode)
  const setBgMode = useStore((s) => s.setBgMode)
  
  const bgStyle = useStore((s) => s.bgStyle)
  const setBgStyle = useStore((s) => s.setBgStyle)
  
  const isReaderMode = useStore((s) => s.isReaderMode)
  const toggleReaderMode = useStore((s) => s.toggleReaderMode)

  if (!isOpen) return null

  return (
    <aside className={styles.floatingPanel}>
      <header className={styles.header}>
        <h3>System</h3>
        <button className={styles.closeX} onClick={close}>&times;</button>
      </header>

      <div className={styles.section}>
        <div className={styles.miniGrid}>
          <button 
            className={styles.miniOption} 
            data-active={theme === "dark"} 
            onClick={() => setTheme("dark")}
          >
            Dark
          </button>
          <button 
            className={styles.miniOption} 
            data-active={theme === "light"} 
            onClick={() => setTheme("light")}
          >
            Light
          </button>
        </div>
      </div>

      <div className={styles.section}>
        <h3>Accent</h3>
        <div className={styles.accentGrid}>
          {ACCENTS.map((a) => (
            <button
              key={a.color}
              className={styles.accentOption}
              style={{ backgroundColor: a.color }}
              data-active={accentBase === a.color}
              onClick={() => setAccentBase(a.color)}
              title={a.name}
            />
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <h3>Palette</h3>
        <div className={styles.paletteGrid}>
          {(["mono", "complimentary"] as const).map((p) => (
            <button 
              key={p}
              className={styles.paletteOption} 
              data-active={palette === p} 
              onClick={() => setPalette(p)}
              title={p}
            >
              <PaletteIcon type={p} />
              <span style={{ marginLeft: '8px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{p}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <h3>Background</h3>
        <div className={styles.miniGrid}>
          <button 
            className={styles.miniOption} 
            data-active={bgStyle !== "off"} 
            onClick={() => setBgStyle(bgStyle === "off" ? "vectors" : "off")}
          >
            {bgStyle === "off" ? "Hidden" : "Visible"}
          </button>
          <button 
            className={styles.miniOption} 
            data-active={isReaderMode} 
            onClick={toggleReaderMode}
          >
            Reader
          </button>
        </div>
        <div className={styles.scrollSelect}>
          {(["simplex", "dots", "network", "terminal", "chess"] as const).map((m) => (
            <button 
              key={m}
              className={styles.textLink} 
              data-active={bgMode === m} 
              onClick={() => setBgMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}

function PaletteIcon({ type }: { type: "mono" | "complimentary" }) {
  if (type === "mono") {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="7" fill="currentColor" stroke="currentColor" strokeWidth="1" />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 16 16">
      <path d="M 8,8 L 8,1 A 7,7 0 0 1 14.06,11.5 Z" fill="var(--color-primary)" />
      <path d="M 8,8 L 14.06,11.5 A 7,7 0 0 1 1.94,11.5 Z" fill="var(--color-secondary)" />
      <path d="M 8,8 L 1.94,11.5 A 7,7 0 0 1 8,1 Z" fill="var(--color-tertiary)" />
    </svg>
  )
}
