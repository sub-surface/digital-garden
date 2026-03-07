import { useStore } from "@/store"
import styles from "./ThemePanel.module.scss"
import { useState } from "react"

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
  const [activeTab, setActiveTab] = useState<"system" | "dev">("system")
  const isOpen = useStore((s) => s.isThemePanelOpen)
  const close = () => useStore.getState().setThemePanel(false)
  
  const theme = useStore((s) => s.theme)
  const setTheme = (t: "light" | "dark") => useStore.getState().setTheme(t)
  
  const accentBase = useStore((s) => s.accentBase)
  const setAccentBase = useStore((s) => s.setAccentBase)
  
  const bgMode = useStore((s) => s.bgMode)
  const setBgMode = useStore((s) => s.setBgMode)
  
  const bgStyle = useStore((s) => s.bgStyle)
  const setBgStyle = useStore((s) => s.setBgStyle)
  
  const isReaderMode = useStore((s) => s.isReaderMode)
  const toggleReaderMode = useStore((s) => s.toggleReaderMode)

  const config = useStore((s) => s.config)
  const updateConfig = useStore((s) => s.updateConfig)

  if (!isOpen) return null

  const handleCopyCommit = () => {
    const data = JSON.stringify(config, null, 2)
    navigator.clipboard.writeText(data)
    alert("Commit data copied to clipboard! Paste it into the CLI to save permanently.")
  }

  return (
    <aside className={styles.floatingPanel}>
      <header className={styles.header}>
        <div className={styles.tabs}>
          <button 
            className={styles.tabBtn} 
            data-active={activeTab === "system"} 
            onClick={() => setActiveTab("system")}
          >
            System
          </button>
          <button 
            className={styles.tabBtn} 
            data-active={activeTab === "dev"} 
            onClick={() => setActiveTab("dev")}
          >
            Dev
          </button>
        </div>
        <button className={styles.closeX} onClick={close}>&times;</button>
      </header>

      {activeTab === "system" ? (
        <div className={styles.tabContent}>
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
              {(["graph", "vectors", "dots", "terminal"] as const).map((m) => (
                <button 
                  key={m}
                  className={styles.textLink} 
                  data-active={bgMode === m} 
                  onClick={() => setBgMode(m)}
                >
                  {m === "graph" ? "Graph [Default]" : m}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.tabContent}>
          <div className={styles.scrollSection}>
            <div className={styles.section}>
              <h3>Vectors</h3>
              <Slider label="Speed" value={config.backgrounds.vectors.speed} min={0.01} max={0.5} step={0.001} onChange={v => updateConfig(c => { c.backgrounds.vectors.speed = v })} />
              <Slider label="Scale" value={config.backgrounds.vectors.scale} min={0.0001} max={0.005} step={0.0001} onChange={v => updateConfig(c => { c.backgrounds.vectors.scale = v })} />
              <Slider label="Density" value={config.backgrounds.vectors.step} min={20} max={100} step={1} onChange={v => updateConfig(c => { c.backgrounds.vectors.step = v })} />
            </div>

            <div className={styles.section}>
              <h3>Dots</h3>
              <Slider label="Opacity" value={config.backgrounds.dots.opacity} min={0.01} max={1} step={0.01} onChange={v => updateConfig(c => { c.backgrounds.dots.opacity = v })} />
              <Slider label="Min Size" value={config.backgrounds.dots.minSize} min={0.5} max={10} step={0.5} onChange={v => updateConfig(c => { c.backgrounds.dots.minSize = v })} />
              <Slider label="Max Size" value={config.backgrounds.dots.maxSize} min={1} max={20} step={0.5} onChange={v => updateConfig(c => { c.backgrounds.dots.maxSize = v })} />
            </div>

            <div className={styles.section}>
              <h3>Terminal</h3>
              <Slider label="Opacity" value={config.backgrounds.terminal.opacity} min={0.01} max={1} step={0.01} onChange={v => updateConfig(c => { c.backgrounds.terminal.opacity = v })} />
              <Slider label="Step" value={config.backgrounds.terminal.step} min={10} max={100} step={1} onChange={v => updateConfig(c => { c.backgrounds.terminal.step = v })} />
            </div>

            <div className={styles.section}>
              <h3>Graph View</h3>
              <Slider label="Link Opacity" value={config.backgrounds.graph.linkOpacity} min={0.01} max={0.2} step={0.01} onChange={v => updateConfig(c => { c.backgrounds.graph.linkOpacity = v })} />
              <Slider label="Node Size" value={config.backgrounds.graph.nodeSize} min={1} max={10} step={0.5} onChange={v => updateConfig(c => { c.backgrounds.graph.nodeSize = v })} />
              <Slider label="Drift" value={config.backgrounds.graph.drift} min={0} max={2} step={0.1} onChange={v => updateConfig(c => { c.backgrounds.graph.drift = v })} />
            </div>
          </div>

          <div className={styles.section} style={{ marginTop: 'auto', paddingBottom: '1rem' }}>
            <button className={styles.primaryBtn} onClick={handleCopyCommit}>
              Copy Commit Data
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}

function Slider({ label, value, min, max, step, onChange }: { label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void }) {
  return (
    <div className={styles.sliderGroup}>
      <div className={styles.sliderLabel}>
        <span>{label}</span>
        <span>{value.toFixed(value < 1 ? 3 : 1)}</span>
      </div>
      <input 
        type="range" 
        min={min} 
        max={max} 
        step={step} 
        value={value} 
        onChange={(e) => onChange(parseFloat(e.target.value))} 
        className={styles.slider}
      />
    </div>
  )
}

