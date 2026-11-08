import { useEffect, useState } from "react"
import { useStore, BG_MODES, BG_META, ROYGBIV_ACCENTS, READER_MEASURE_STEPS, READER_SCALE_STEPS, type BgMode } from "@/store"
import { SITE_DEFAULTS } from "@/config/site-defaults"
import { useFocusTrap } from "@/hooks/useFocusTrap"
import { BG_CONTROLS } from "./bgControls"
import styles from "./ThemePanel.module.scss"

/**
 * Settings: the one place for how the site looks and reads (`\`, or the
 * sliders button in QuickControls).
 *
 * It absorbed the bar's old day/night, accent-dot and background buttons, and
 * its own System / Reader / Dev tabs became three sections on one sheet, so
 * nothing is more than a scroll away. The per-mode sliders (once "Dev") sit
 * behind a disclosure under Background. Everything here is also a prompt
 * command: `theme`, `accent`, `reader`, `bg`.
 *
 * Desktop: a sheet under the bar. Phone: a bottom sheet (it used to be
 * display:none on phones, which left the Theme and Reader buttons dead).
 */

const ACCENT_NAMES = ["Red", "Orange", "Amber", "Green", "Blue", "Indigo", "Violet"]
const HEX_RE = /^#[0-9a-fA-F]{6}$/
const DEFAULT_ACCENT = "#427ab4"

// Survives close/reopen within the visit, so tuning a mode isn't re-expanded each time.
let tuneOpen = false

export function ThemePanel() {
  const isOpen = useStore((s) => s.isThemePanelOpen)
  const close = () => useStore.getState().setThemePanel(false)
  const trapRef = useFocusTrap<HTMLElement>({ active: isOpen, onEscape: close })

  // Click outside closes; the bar's own button toggles, so it is exempt.
  useEffect(() => {
    if (!isOpen) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element
      if (trapRef.current?.contains(target) || target.closest?.("[data-settings-trigger]")) return
      useStore.getState().setThemePanel(false)
    }
    window.addEventListener("pointerdown", onDown)
    return () => window.removeEventListener("pointerdown", onDown)
  }, [isOpen, trapRef])

  if (!isOpen) return null

  return (
    <aside className={styles.sheet} ref={trapRef} role="dialog" aria-label="Settings" data-panel-ignore data-reader-keep>
      <header className={styles.header}>
        <h2 className={styles.title}>Settings</h2>
        <kbd className={styles.kbd} title="Toggle with backslash">\</kbd>
        <button className={styles.closeX} onClick={close} aria-label="Close settings">&times;</button>
      </header>
      <div className={styles.body}>
        <LookSection />
        <ReadingSection />
        <BackgroundSection />
      </div>
      <Footer />
    </aside>
  )
}

function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className={styles.switch} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <span className={styles.switchKnob} />
    </button>
  )
}

function Stepper({ label, value, display, steps, onStep }: {
  label: string
  value: number
  display: string
  steps: readonly number[]
  onStep: (dir: 1 | -1) => void
}) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <div className={styles.stepper}>
        <button onClick={() => onStep(-1)} disabled={value <= steps[0]} aria-label={`${label}: less`}>−</button>
        <output aria-live="polite">{display}</output>
        <button onClick={() => onStep(1)} disabled={value >= steps[steps.length - 1]} aria-label={`${label}: more`}>+</button>
      </div>
    </div>
  )
}

function LookSection() {
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const accentBase = useStore((s) => s.accentBase)
  const setAccentBase = useStore((s) => s.setAccentBase)
  const [hex, setHex] = useState("")
  const applyHex = () => {
    const v = hex.trim()
    if (HEX_RE.test(v)) {
      setAccentBase(v)
      setHex("")
    }
  }

  return (
    <section className={styles.section} aria-labelledby="settings-look">
      <h3 id="settings-look">Look</h3>
      <div className={styles.row}>
        <span className={styles.rowLabel}>Theme</span>
        <Segmented
          label="Theme"
          value={theme}
          onChange={setTheme}
          options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]}
        />
      </div>
      <div className={styles.row}>
        <span className={styles.rowLabel}>Accent</span>
        <div className={styles.swatches} role="radiogroup" aria-label="Accent colour">
          {ROYGBIV_ACCENTS.map((color, i) => (
            <button
              key={color}
              role="radio"
              aria-checked={accentBase.toLowerCase() === color}
              aria-label={ACCENT_NAMES[i]}
              title={ACCENT_NAMES[i]}
              className={styles.swatch}
              style={{ backgroundColor: color }}
              onClick={() => setAccentBase(color)}
            />
          ))}
        </div>
      </div>
      <div className={styles.hexRow}>
        <span className={styles.hexSwatch} style={{ backgroundColor: HEX_RE.test(hex) ? hex : accentBase }} />
        <input
          className={styles.hexInput}
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyHex()
          }}
          placeholder={accentBase}
          spellCheck={false}
          aria-label="Custom accent, as a hex colour"
        />
        <button className={styles.textBtn} onClick={applyHex} disabled={!HEX_RE.test(hex)}>set</button>
      </div>
    </section>
  )
}

function ReadingSection() {
  const isReaderMode = useStore((s) => s.isReaderMode)
  const toggleReaderMode = useStore((s) => s.toggleReaderMode)
  const readerMeasureCh = useStore((s) => s.readerMeasureCh)
  const readerScale = useStore((s) => s.readerScale)
  const cycleReaderMeasure = useStore((s) => s.cycleReaderMeasure)
  const cycleReaderScale = useStore((s) => s.cycleReaderScale)

  return (
    <section className={styles.section} aria-labelledby="settings-reading">
      <h3 id="settings-reading">Reading</h3>
      <div className={styles.row}>
        <span className={styles.rowLabel}>
          Reader mode <kbd className={styles.kbd}>F</kbd>
        </span>
        <Switch on={isReaderMode} onChange={toggleReaderMode} label="Reader mode" />
      </div>
      <Stepper label="Text size" value={readerScale} display={`${Math.round(readerScale * 100)}%`} steps={READER_SCALE_STEPS} onStep={cycleReaderScale} />
      <Stepper label="Line length" value={readerMeasureCh} display={`${readerMeasureCh}ch`} steps={READER_MEASURE_STEPS} onStep={cycleReaderMeasure} />
      <p className={styles.note}>
        {isReaderMode
          ? "Size and length apply now. Keys while reading: − + size, [ ] length."
          : "Size and length apply in reader mode, which hides everything but the text."}
      </p>
    </section>
  )
}

function BackgroundSection() {
  const bgMode = useStore((s) => s.bgMode)
  const setBgMode = useStore((s) => s.setBgMode)
  const bgStyle = useStore((s) => s.bgStyle)
  const setBgStyle = useStore((s) => s.setBgStyle)
  const bgOpacity = useStore((s) => s.bgOpacity)
  const setBgOpacity = useStore((s) => s.setBgOpacity)
  const visible = bgStyle !== "off"

  return (
    <section className={styles.section} aria-labelledby="settings-bg">
      <h3 id="settings-bg">Background</h3>
      <div className={styles.row}>
        <span className={styles.rowLabel} title="B cycles the modes">
          Animated <kbd className={styles.kbd}>B</kbd>
        </span>
        <Switch on={visible} onChange={(on) => setBgStyle(on ? "vectors" : "off")} label="Animated background" />
      </div>
      <div className={styles.row} data-disabled={!visible || undefined}>
        <span className={styles.rowLabel}>Intensity</span>
        <input
          type="range" min={0} max={1} step={0.01} value={bgOpacity}
          onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
          className={styles.slider}
          aria-label="Background intensity"
          disabled={!visible}
        />
        <output className={styles.value}>{Math.round(bgOpacity * 100)}%</output>
      </div>
      <div className={styles.modes} role="radiogroup" aria-label="Background mode" data-disabled={!visible || undefined}>
        {BG_MODES.map((m) => (
          <button
            key={m}
            role="radio"
            aria-checked={bgMode === m}
            className={styles.mode}
            onClick={() => {
              setBgMode(m as BgMode)
              if (!visible) setBgStyle("vectors")
            }}
            title={BG_META[m]?.desc}
          >
            {BG_META[m]?.label ?? m}
          </button>
        ))}
      </div>
      <p className={styles.note}>{BG_META[bgMode]?.desc ?? "A page-scoped board."}</p>
      <Tuning mode={bgMode} />
    </section>
  )
}

function Tuning({ mode }: { mode: string }) {
  const config = useStore((s) => s.config)
  const updateConfig = useStore((s) => s.updateConfig)
  const [open, setOpen] = useState(tuneOpen)
  const [copied, setCopied] = useState(false)
  const controls = BG_CONTROLS[mode]
  if (!controls) return null

  // Keys come from BG_CONTROLS, which mirrors site-defaults (type-enforced there).
  const params = (config.backgrounds as unknown as Record<string, Record<string, number>>)[mode] ?? {}
  const write = (key: string, v: number) =>
    updateConfig((c) => {
      ;(c.backgrounds as unknown as Record<string, Record<string, number>>)[mode][key] = v
    })
  const reset = () =>
    updateConfig((c) => {
      const defaults = SITE_DEFAULTS.backgrounds as unknown as Record<string, Record<string, number>>
      ;(c.backgrounds as unknown as Record<string, Record<string, number>>)[mode] = { ...defaults[mode] }
    })
  const randomize = () =>
    updateConfig((c) => {
      for (const ctrl of controls) {
        // Bias away from the extremes so results stay pleasant.
        const t = 0.15 + Math.random() * 0.7
        let v = ctrl.min + t * (ctrl.max - ctrl.min)
        if (ctrl.step >= 1) v = Math.round(v)
        ;(c.backgrounds as unknown as Record<string, Record<string, number>>)[mode][ctrl.key] = v
      }
    })
  const copy = async () => {
    await navigator.clipboard?.writeText(JSON.stringify(config.backgrounds, null, 2))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <details
      className={styles.tuning}
      open={open}
      onToggle={(e) => {
        tuneOpen = (e.currentTarget as HTMLDetailsElement).open
        setOpen(tuneOpen)
      }}
    >
      <summary>Tune {BG_META[mode]?.label ?? mode}</summary>
      {controls.map((ctrl) => {
        const value = params[ctrl.key] ?? 0
        const display = ctrl.step >= 1 ? value.toFixed(0) : value < 0.01 ? value.toFixed(4) : value.toFixed(ctrl.step < 0.01 ? 3 : 2)
        return (
          <div className={styles.row} key={ctrl.key}>
            <span className={styles.rowLabel}>{ctrl.label}</span>
            <input
              type="range" min={ctrl.min} max={ctrl.max} step={ctrl.step} value={value}
              onChange={(e) => write(ctrl.key, parseFloat(e.target.value))}
              className={styles.slider}
              aria-label={ctrl.label}
            />
            <output className={styles.value}>{display}</output>
          </div>
        )
      })}
      <div className={styles.tuneActions}>
        <button className={styles.textBtn} onClick={randomize}>surprise me</button>
        <button className={styles.textBtn} onClick={reset}>reset</button>
        <button className={styles.textBtn} onClick={() => void copy()}>{copied ? "copied" : "copy config"}</button>
      </div>
    </details>
  )
}

function Footer() {
  const [confirm, setConfirm] = useState(false)
  const resetAll = () => {
    const s = useStore.getState()
    s.setTheme("dark")
    s.setAccentBase(DEFAULT_ACCENT)
    s.setBgMode("murmuration")
    s.setBgStyle("vectors")
    s.setBgOpacity(1)
    s.updateConfig((c) => {
      c.backgrounds = structuredClone(SITE_DEFAULTS.backgrounds) as typeof c.backgrounds
    })
    useStore.setState({ readerScale: 1, readerMeasureCh: 80 })
    setConfirm(false)
  }
  return (
    <footer className={styles.footer}>
      <span className={styles.footerHint}>
        Also in the prompt: <code>theme</code> <code>accent</code> <code>reader</code> <code>bg</code>
      </span>
      {confirm ? (
        <span className={styles.confirm}>
          <button className={styles.textBtn} onClick={resetAll}>reset everything</button>
          <button className={styles.textBtn} onClick={() => setConfirm(false)}>keep</button>
        </span>
      ) : (
        <button className={styles.textBtn} onClick={() => setConfirm(true)}>defaults</button>
      )}
    </footer>
  )
}
