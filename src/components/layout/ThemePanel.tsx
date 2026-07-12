import { useStore, BG_MODES, type BgMode } from "@/store"
import { SITE_DEFAULTS } from "@/config/site-defaults"
import styles from "./ThemePanel.module.scss"
import { useState } from "react"
import { useFocusTrap } from "@/hooks/useFocusTrap"

const ACCENTS = [
  { name: "Red", color: "#b4424c" },
  { name: "Orange", color: "#b47a42" },
  { name: "Amber", color: "#b49442" },
  { name: "Green", color: "#42b464" },
  { name: "Blue", color: "#427ab4" },
  { name: "Indigo", color: "#424cb4" },
  { name: "Violet", color: "#8a42b4" },
]

// One-line description per ambient mode, shown in the System-tab picker.
const BG_META: Record<string, { label: string; desc: string }> = {
  murmuration: { label: "Murmuration", desc: "A flock that flees your cursor" },
  graph: { label: "Graph", desc: "The knowledge graph, drifting" },
  vectors: { label: "Vectors", desc: "A flow field of little arrows" },
  dots: { label: "Dots", desc: "A living constellation lattice" },
  terminal: { label: "Terminal", desc: "Glyph rain and boot pops" },
  chamber: { label: "Chamber", desc: "Bubble-chamber particle tracks" },
  schematic: { label: "Schematic", desc: "Blueprint leader lines" },
  isometric: { label: "Isometric", desc: "Wireframe cubes, cursor parallax" },
  orrery: { label: "Orrery", desc: "Nested astrolabe rings" },
  "plate-scan": { label: "Plate-scan", desc: "Dithered still, scanline sweep" },
}

interface Ctrl { key: string; label: string; min: number; max: number; step: number }

// Per-mode dev controls. Schema-driven so adding a mode is one entry here +
// its config block in site-defaults — the panel renders whatever it finds.
const BG_CONTROLS: Record<string, Ctrl[]> = {
  murmuration: [
    { key: "count", label: "Flock size", min: 100, max: 800, step: 10 },
    { key: "maxSpeed", label: "Max speed", min: 1, max: 5, step: 0.1 },
    { key: "cohere", label: "Cohesion", min: 0, max: 0.005, step: 0.0001 },
    { key: "wind", label: "Wind", min: 0, max: 0.2, step: 0.005 },
    { key: "opacity", label: "Opacity", min: 0.05, max: 1, step: 0.01 },
  ],
  chamber: [
    { key: "emitters", label: "Emitters", min: 1, max: 8, step: 1 },
    { key: "maxTracks", label: "Max tracks", min: 20, max: 200, step: 5 },
    { key: "curl", label: "Curl", min: 0, max: 0.2, step: 0.005 },
    { key: "spawnRate", label: "Spawn rate", min: 0.02, max: 0.6, step: 0.01 },
    { key: "glyphChance", label: "Glyphs", min: 0, max: 1, step: 0.05 },
    { key: "opacity", label: "Opacity", min: 0.1, max: 1, step: 0.01 },
  ],
  schematic: [
    { key: "anchors", label: "Anchors", min: 3, max: 20, step: 1 },
    { key: "driftSpeed", label: "Drift speed", min: 0, max: 3, step: 0.1 },
    { key: "opacity", label: "Opacity", min: 0.1, max: 3, step: 0.1 },
  ],
  isometric: [
    { key: "count", label: "Cubes", min: 3, max: 30, step: 1 },
    { key: "spin", label: "Spin", min: 0, max: 3, step: 0.1 },
    { key: "parallax", label: "Parallax", min: 0, max: 3, step: 0.1 },
    { key: "opacity", label: "Opacity", min: 0.1, max: 3, step: 0.1 },
  ],
  orrery: [
    { key: "rings", label: "Rings", min: 2, max: 12, step: 1 },
    { key: "spin", label: "Spin", min: 0, max: 3, step: 0.1 },
    { key: "opacity", label: "Opacity", min: 0.1, max: 3, step: 0.1 },
  ],
  "plate-scan": [
    { key: "panSpeed", label: "Pan speed", min: 0, max: 5, step: 0.1 },
    { key: "scanSpeed", label: "Scan speed", min: 0, max: 5, step: 0.1 },
    { key: "cell", label: "Grain", min: 2, max: 10, step: 1 },
    { key: "opacity", label: "Opacity", min: 0.1, max: 3, step: 0.1 },
  ],
  vectors: [
    { key: "speed", label: "Speed", min: 0.01, max: 0.5, step: 0.001 },
    { key: "scale", label: "Scale", min: 0.0001, max: 0.005, step: 0.0001 },
    { key: "step", label: "Density", min: 20, max: 100, step: 1 },
    { key: "vortex", label: "Vortex", min: 0, max: 2, step: 0.05 },
  ],
  dots: [
    { key: "opacity", label: "Opacity", min: 0.01, max: 1, step: 0.01 },
    { key: "minSize", label: "Min size", min: 0.5, max: 10, step: 0.5 },
    { key: "maxSize", label: "Max size", min: 1, max: 20, step: 0.5 },
    { key: "speed", label: "Speed", min: 0.01, max: 0.3, step: 0.005 },
  ],
  terminal: [
    { key: "opacity", label: "Opacity", min: 0.01, max: 1, step: 0.01 },
    { key: "step", label: "Density", min: 10, max: 100, step: 1 },
    { key: "speed", label: "Speed", min: 0.01, max: 0.3, step: 0.005 },
  ],
  graph: [
    { key: "linkOpacity", label: "Link opacity", min: 0.01, max: 0.2, step: 0.01 },
    { key: "nodeSize", label: "Node size", min: 1, max: 10, step: 0.5 },
    { key: "drift", label: "Drift", min: 0, max: 2, step: 0.1 },
  ],
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function ThemePanel() {
  const [activeTab, setActiveTab] = useState<"system" | "dev" | "reader">("system")
  const [hexInput, setHexInput] = useState("")
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

  const bgOpacity = useStore((s) => s.bgOpacity)
  const setBgOpacity = useStore((s) => s.setBgOpacity)

  const isReaderMode = useStore((s) => s.isReaderMode)
  const toggleReaderMode = useStore((s) => s.toggleReaderMode)
  const readerMeasureCh = useStore((s) => s.readerMeasureCh)
  const readerScale = useStore((s) => s.readerScale)
  const cycleReaderMeasure = useStore((s) => s.cycleReaderMeasure)
  const cycleReaderScale = useStore((s) => s.cycleReaderScale)

  const handleReaderToggle = () => {
    const turningOn = !isReaderMode
    toggleReaderMode()
    if (turningOn) setActiveTab("reader")
  }

  const config = useStore((s) => s.config)
  const updateConfig = useStore((s) => s.updateConfig)

  const trapRef = useFocusTrap<HTMLElement>({ active: isOpen, onEscape: close })

  if (!isOpen) return null

  // Read/write a background param by (mode, key) — dynamic access, keys come
  // from the schema above which mirrors site-defaults.
  const readParam = (mode: string, key: string): number =>
    ((config.backgrounds as any)[mode]?.[key] ?? 0)
  const writeParam = (mode: string, key: string, v: number) =>
    updateConfig((c) => { (c.backgrounds as any)[mode][key] = v })

  const resetMode = (mode: string) =>
    updateConfig((c) => { (c.backgrounds as any)[mode] = { ...(SITE_DEFAULTS.backgrounds as any)[mode] } })

  const randomizeMode = (mode: string) => {
    const ctrls = BG_CONTROLS[mode] ?? []
    updateConfig((c) => {
      for (const ctrl of ctrls) {
        // Bias away from the extremes so results stay pleasant.
        const t = 0.15 + Math.random() * 0.7
        let v = ctrl.min + t * (ctrl.max - ctrl.min)
        if (ctrl.step >= 1) v = Math.round(v)
        ;(c.backgrounds as any)[mode][ctrl.key] = v
      }
    })
  }

  const resetAll = () => updateConfig((c) => {
    c.backgrounds = structuredClone(SITE_DEFAULTS.backgrounds) as any
  })

  const handleCopyCommit = () => {
    navigator.clipboard.writeText(JSON.stringify(config, null, 2))
  }

  const applyHex = () => {
    const v = hexInput.trim()
    if (HEX_RE.test(v)) { setAccentBase(v); setHexInput("") }
  }

  // Dev tab tunes whatever background is live (what-you-see-is-what-you-edit);
  // chess/hexo are page-scoped boards with no ambient params.
  const editMode = bgMode
  const controls = BG_CONTROLS[editMode]

  return (
    <aside className={styles.floatingPanel} ref={trapRef} role="dialog" aria-label="Theme settings">
      <header className={styles.header}>
        <div className={styles.tabs}>
          <button className={styles.tabBtn} data-active={activeTab === "system"} onClick={() => setActiveTab("system")}>
            System
          </button>
          <button className={styles.tabBtn} data-active={activeTab === "dev"} onClick={() => setActiveTab("dev")}>
            Dev
          </button>
          <button className={styles.tabBtn} data-active={activeTab === "reader"} onClick={() => setActiveTab("reader")}>
            Reader
          </button>
        </div>
        <button className={styles.closeX} onClick={close} aria-label="Close settings">&times;</button>
      </header>

      {activeTab === "system" ? (
        <div className={styles.tabContent}>
          <div className={styles.section}>
            <h3>Theme</h3>
            <div className={styles.miniGrid}>
              <button className={styles.miniOption} data-active={theme === "dark"} onClick={() => setTheme("dark")}>Dark</button>
              <button className={styles.miniOption} data-active={theme === "light"} onClick={() => setTheme("light")}>Light</button>
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
                  data-active={accentBase.toLowerCase() === a.color}
                  onClick={() => setAccentBase(a.color)}
                  title={a.name}
                  aria-label={`Accent ${a.name}`}
                />
              ))}
            </div>
            <div className={styles.hexRow}>
              <span className={styles.hexSwatch} style={{ backgroundColor: HEX_RE.test(hexInput) ? hexInput : accentBase }} />
              <input
                className={styles.hexInput}
                value={hexInput}
                onChange={(e) => setHexInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applyHex() }}
                placeholder={accentBase}
                spellCheck={false}
                aria-label="Custom accent hex"
              />
              <button className={styles.hexApply} onClick={applyHex} disabled={!HEX_RE.test(hexInput)}>set</button>
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
              <button className={styles.miniOption} data-active={isReaderMode} onClick={handleReaderToggle}>Reader</button>
            </div>

            <div className={styles.sliderGroup}>
              <div className={styles.sliderLabel}>
                <span>Intensity</span>
                <span>{Math.round(bgOpacity * 100)}%</span>
              </div>
              <input
                type="range" min={0} max={1} step={0.01} value={bgOpacity}
                onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
                className={styles.slider}
                aria-label="Background intensity"
              />
            </div>

            <div className={styles.scrollSelect}>
              {BG_MODES.map((m) => {
                const meta = BG_META[m]
                return (
                  <button
                    key={m}
                    className={styles.modeRow}
                    data-active={bgMode === m}
                    onClick={() => setBgMode(m as BgMode)}
                  >
                    <span className={styles.modeName}>{meta?.label ?? m}{m === "murmuration" ? " ·" : ""}</span>
                    <span className={styles.modeDesc}>{meta?.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : activeTab === "reader" ? (
        <div className={styles.tabContent}>
          <div className={styles.section}>
            <h3>Width</h3>
            <div className={styles.stepperRow}>
              <button className={styles.miniBtn} onClick={() => cycleReaderMeasure(-1)} aria-label="Narrower" title="Narrower">−</button>
              <span className={styles.stepperValue}>{readerMeasureCh}ch</span>
              <button className={styles.miniBtn} onClick={() => cycleReaderMeasure(1)} aria-label="Wider" title="Wider">+</button>
            </div>
          </div>

          <div className={styles.section}>
            <h3>Text size</h3>
            <div className={styles.stepperRow}>
              <button className={styles.miniBtn} onClick={() => cycleReaderScale(-1)} aria-label="Smaller text" title="Smaller">−</button>
              <span className={styles.stepperValue}>{Math.round(readerScale * 100)}%</span>
              <button className={styles.miniBtn} onClick={() => cycleReaderScale(1)} aria-label="Larger text" title="Larger">+</button>
            </div>
          </div>

          {!isReaderMode && (
            <p className={styles.emptyNote}>Reader mode is off — toggle it in the System tab to see these apply.</p>
          )}

          <button className={styles.ghostBtn} onClick={toggleReaderMode}>
            {isReaderMode ? "Exit reader mode" : "Enter reader mode"}
          </button>
        </div>
      ) : (
        <div className={styles.tabContent}>
          <div className={styles.scrollSection}>
            <div className={styles.section}>
              <div className={styles.editHead}>
                <h3>Editing: {BG_META[editMode]?.label ?? editMode}</h3>
                {controls && (
                  <div className={styles.editActions}>
                    <button className={styles.miniBtn} onClick={() => randomizeMode(editMode)} title="Randomize this mode">rand</button>
                    <button className={styles.miniBtn} onClick={() => resetMode(editMode)} title="Reset this mode to defaults">reset</button>
                  </div>
                )}
              </div>

              {controls ? (
                controls.map((ctrl) => (
                  <Slider
                    key={ctrl.key}
                    label={ctrl.label}
                    value={readParam(editMode, ctrl.key)}
                    min={ctrl.min}
                    max={ctrl.max}
                    step={ctrl.step}
                    onChange={(v) => writeParam(editMode, ctrl.key, v)}
                  />
                ))
              ) : (
                <p className={styles.emptyNote}>
                  “{BG_META[editMode]?.label ?? editMode}” is a page-scoped board with no tunable
                  parameters. Pick an ambient mode in the System tab to tune it here.
                </p>
              )}
            </div>

            <div className={styles.section}>
              <h3>Other modes</h3>
              <div className={styles.modeChips}>
                {BG_MODES.filter((m) => m !== editMode).map((m) => (
                  <button key={m} className={styles.modeChip} onClick={() => setBgMode(m as BgMode)}>
                    {BG_META[m]?.label ?? m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.devFooter}>
            <button className={styles.ghostBtn} onClick={resetAll}>Reset all</button>
            <button className={styles.primaryBtn} onClick={handleCopyCommit}>Copy config</button>
          </div>
        </div>
      )}
    </aside>
  )
}

function Slider({ label, value, min, max, step, onChange }: { label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void }) {
  // Show enough precision to read sub-unit steps without a wall of zeros.
  const display = step >= 1 ? value.toFixed(0) : value < 0.01 ? value.toFixed(4) : value.toFixed(step < 0.01 ? 3 : 2)
  return (
    <div className={styles.sliderGroup}>
      <div className={styles.sliderLabel}>
        <span>{label}</span>
        <span>{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className={styles.slider} aria-label={label} />
    </div>
  )
}
