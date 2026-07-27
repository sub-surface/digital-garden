import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePhoneViewport } from "@/hooks/usePhoneViewport"
import { PRESETS, type PresetName } from "./presets"
import { formatAge } from "./cosmology"
import type { FromWorker, SimParams, SimStats, ToWorker, ViewParams } from "./protocol"
import styles from "./FilamentPage.module.scss"

/**
 * FILAMENT — structure formation under the Fast Multipole Method.
 *
 * This component owns nothing but chrome. All of the simulation and all of the
 * rasterisation happen in `sim.worker.ts`; the page hands over parameters and
 * blits finished pixel buffers, so however heavy the sim gets it cannot stall
 * the site's main thread. See `fmm.ts` for the algorithm and `cosmology.ts` for
 * the expansion history.
 */

/** Cap on the render buffer, so a fullscreen 2× display cannot blow the budget. */
const MAX_PIXELS = 1_200_000

/**
 * Two species, because they cost wildly different amounts. A massive particle
 * pays for a multipole and a near-field sum; a tracer only reads the local
 * expansion its leaf already computed, for roughly a tenth of the price. So the
 * mass count sets the dynamics and the tracer count sets how much of the
 * structure you can actually see.
 */
const SCALES = [
  { key: "s", label: "6k · 30k", nMass: 6_000, nTracer: 30_000 },
  { key: "m", label: "20k · 100k", nMass: 20_000, nTracer: 100_000 },
  { key: "l", label: "45k · 250k", nMass: 45_000, nTracer: 250_000 },
  { key: "xl", label: "100k · 600k", nMass: 100_000, nTracer: 600_000 },
]

const ORDERS = [
  { p: 3, label: "fast" },
  { p: 5, label: "balanced" },
  { p: 8, label: "exact" },
]

const SPEEDS = [
  { n: 0, label: "❙❙", title: "Pause" },
  { n: 1, label: "▶", title: "Run" },
  { n: 3, label: "▶▶", title: "Run fast — three integration steps per frame" },
]

type ControlTab = "world" | "view" | "solver"

const CONTROL_TABS: { id: ControlTab; label: string }[] = [
  { id: "world", label: "World" },
  { id: "view", label: "View" },
  { id: "solver", label: "Solver" },
]

/** Resolve any CSS colour (hex, rgb(), oklch(), …) to 0–1 RGB. */
function readAccent(): [number, number, number] {
  const fallback: [number, number, number] = [0.71, 0.26, 0.3]
  if (typeof document === "undefined") return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim()
  if (!value) return fallback
  try {
    const c = document.createElement("canvas")
    c.width = c.height = 1
    const g = c.getContext("2d", { willReadFrequently: true })
    if (!g) return fallback
    g.fillStyle = value
    g.fillRect(0, 0, 1, 1)
    const d = g.getImageData(0, 0, 1, 1).data
    return [d[0] / 255, d[1] / 255, d[2] / 255]
  } catch {
    return fallback
  }
}

const fmt = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`

/** Redshift, rounded the way astronomers actually write it. */
const fmtZ = (z: number) => (z >= 100 ? z.toFixed(0) : z >= 10 ? z.toFixed(1) : z.toFixed(2))

export function FilamentPage() {
  const isPhone = usePhoneViewport()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const workerRef = useRef<Worker | null>(null)

  const [preset, setPreset] = useState<PresetName>("cosmos")
  const [scaleKey, setScaleKey] = useState(() => (isPhone ? "s" : "m"))
  const [order, setOrder] = useState(5)
  const [speed, setSpeed] = useState(1)
  const [trails, setTrails] = useState(true)
  const [events, setEvents] = useState(true)
  const [follow, setFollow] = useState(true)
  const [exposure, setExposure] = useState(1)
  const [seed, setSeed] = useState(() => (Math.random() * 0xffffffff) >>> 0)
  const [stats, setStats] = useState<SimStats | null>(null)
  const [controlsOpen, setControlsOpen] = useState(false)
  const [controlTab, setControlTab] = useState<ControlTab>("world")

  const scale = useMemo(() => SCALES.find((s) => s.key === scaleKey) ?? SCALES[1], [scaleKey])
  const info = useMemo(() => PRESETS.find((p) => p.name === preset) ?? PRESETS[0], [preset])

  // The worker is driven from refs, not props: it must not be torn down and
  // rebuilt every time a control moves.
  const viewRef = useRef<ViewParams>({ zoom: 1, panX: 0, panY: 0, autoFit: true })
  const pendingRef = useRef<{ buf: ArrayBuffer; w: number; h: number } | null>(null)
  const statsRef = useRef<SimStats | null>(null)
  const geomRef = useRef({ w: 0, h: 0 })

  const params: SimParams = useMemo(
    () => ({
      preset,
      seed,
      nMass: scale.nMass,
      nTracer: scale.nTracer,
      order,
      substeps: speed,
      softening: 1,
      exposure,
      trails: trails ? 0.82 : 0,
      events,
    }),
    [preset, seed, scale, order, speed, exposure, trails, events],
  )
  const paramsRef = useRef(params)
  paramsRef.current = params

  const post = useCallback((msg: ToWorker, transfer?: Transferable[]) => {
    workerRef.current?.postMessage(msg, transfer ?? [])
  }, [])

  // --- sizing ---------------------------------------------------------------
  // Hoisted out of its effect because a freshly created worker knows nothing
  // about the canvas and has to be told: `geomRef` is a ref, so it survives a
  // remount (React StrictMode does one on every mount in development), and
  // without an explicit re-measure the new worker would sit forever waiting for
  // a resize that the old one had already consumed.
  const measure = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    if (!cssW || !cssH) return
    const dpr = window.devicePixelRatio || 1
    let w = Math.round(cssW * dpr)
    let h = Math.round(cssH * dpr)
    const over = (w * h) / MAX_PIXELS
    if (over > 1) {
      const k = 1 / Math.sqrt(over)
      w = Math.max(2, Math.round(w * k))
      h = Math.max(2, Math.round(h * k))
    }
    if (w === geomRef.current.w && h === geomRef.current.h) return
    geomRef.current = { w, h }
    canvas.width = w
    canvas.height = h
    post({ t: "resize", w, h })
  }, [post])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [measure])

  // --- worker lifecycle ----------------------------------------------------
  useEffect(() => {
    const worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" })
    workerRef.current = worker
    worker.onerror = (e) => console.error("[filament] simulation worker failed:", e.message || e)
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const msg = e.data
      if (msg.t !== "frame") return
      // Drop a frame rather than queue it: if the page is behind, the newest
      // state is the only one worth painting.
      const stale = pendingRef.current
      if (stale) worker.postMessage({ t: "recycle", buf: stale.buf } satisfies ToWorker, [stale.buf])
      pendingRef.current = { buf: msg.buf, w: msg.w, h: msg.h }
      statsRef.current = msg.stats
    }
    worker.postMessage({
      t: "start",
      params: paramsRef.current,
      view: viewRef.current,
      accent: readAccent(),
    } satisfies ToWorker)
    // Forget any geometry the previous worker was told about, then re-send it.
    geomRef.current = { w: 0, h: 0 }
    measure()
    return () => {
      worker.onmessage = null
      worker.onerror = null
      worker.postMessage({ t: "stop" } satisfies ToWorker)
      worker.terminate()
      workerRef.current = null
      pendingRef.current = null
    }
  }, [measure])

  // --- parameter + view sync ------------------------------------------------
  useEffect(() => {
    post({ t: "params", params })
  }, [params, post])

  useEffect(() => {
    viewRef.current = { ...viewRef.current, autoFit: follow }
    post({ t: "view", view: viewRef.current })
  }, [follow, post])

  // --- paint loop -----------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const g = canvas.getContext("2d")
    if (!g) return
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const frame = pendingRef.current
      if (!frame) return
      pendingRef.current = null
      if (frame.w === canvas.width && frame.h === canvas.height) {
        g.putImageData(new ImageData(new Uint8ClampedArray(frame.buf), frame.w, frame.h), 0, 0)
      }
      post({ t: "recycle", buf: frame.buf }, [frame.buf])
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [post])

  // Readout, refreshed a few times a second rather than every frame — this is
  // a React state update, and the point of the worker was to not do this 60×/s.
  useEffect(() => {
    const id = setInterval(() => setStats(statsRef.current), 200)
    return () => clearInterval(id)
  }, [])

  // Stop integrating while the tab is hidden.
  useEffect(() => {
    const onVis = () => {
      post({ t: "params", params: { substeps: document.hidden ? 0 : paramsRef.current.substeps } })
    }
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [post])

  // Follow the site's accent through theme changes.
  useEffect(() => {
    const obs = new MutationObserver(() => post({ t: "accent", accent: readAccent() }))
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class", "data-theme"],
    })
    return () => obs.disconnect()
  }, [post])

  // The control surface is deliberately non-modal: the universe remains
  // draggable behind it. Escape and a click back on the sky collapse it.
  const controlsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!controlsOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (!controlsRef.current?.contains(e.target as Node)) setControlsOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setControlsOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [controlsOpen])

  const onControlTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, current: ControlTab) => {
      const index = CONTROL_TABS.findIndex((tab) => tab.id === current)
      let next = index
      if (e.key === "ArrowRight") next = (index + 1) % CONTROL_TABS.length
      else if (e.key === "ArrowLeft") next = (index - 1 + CONTROL_TABS.length) % CONTROL_TABS.length
      else if (e.key === "Home") next = 0
      else if (e.key === "End") next = CONTROL_TABS.length - 1
      else return

      e.preventDefault()
      const nextTab = CONTROL_TABS[next].id
      setControlTab(nextTab)
      requestAnimationFrame(() => document.getElementById(`filament-tab-${nextTab}`)?.focus())
    },
    [],
  )

  // --- pan / zoom -----------------------------------------------------------
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ distance: number; x: number; y: number } | null>(null)
  const pushView = useCallback(() => post({ t: "view", view: viewRef.current }), [post])

  const bufferPixels = useCallback((e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
      w: canvas.width,
      h: canvas.height,
    }
  }, [])

  const panByClientPixels = useCallback((dx: number, dy: number) => {
    const canvas = canvasRef.current
    const s = statsRef.current
    if (!canvas || !s) return false
    const rect = canvas.getBoundingClientRect()
    const px = canvas.width / rect.width
    const v = viewRef.current
    v.panX -= (dx * px) / s.scale
    v.panY += (dy * px) / s.scale
    return true
  }, [])

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const s = statsRef.current
      if (!s) return false
      const v = viewRef.current
      const next = Math.max(0.05, Math.min(400, v.zoom * factor))
      const applied = next / v.zoom
      if (Math.abs(applied - 1) < 1e-6) return false
      const b = bufferPixels({ clientX, clientY })
      // Hold the world point beneath the gesture fixed while the scale changes.
      v.panX += ((b.x - b.w / 2) / s.scale) * (1 - 1 / applied)
      v.panY -= ((b.y - b.h / 2) / s.scale) * (1 - 1 / applied)
      v.zoom = next
      return true
    },
    [bufferPixels],
  )

  // Wheel is bound natively rather than through React: React attaches wheel
  // listeners at the root as passive, so `preventDefault` there is a no-op and
  // zooming would scroll the article underneath.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      const s = statsRef.current
      if (!s) return
      e.preventDefault()
      if (zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0016))) pushView()
    }
    canvas.addEventListener("wheel", onWheel, { passive: false })
    return () => canvas.removeEventListener("wheel", onWheel)
  }, [pushView, zoomAt])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointersRef.current.size === 1) {
      dragRef.current = { x: e.clientX, y: e.clientY }
      pinchRef.current = null
      return
    }
    const points = [...pointersRef.current.values()]
    const a = points[0]
    const b = points[1]
    pinchRef.current = {
      distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    }
    dragRef.current = null
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (pointersRef.current.size >= 2) {
        const points = [...pointersRef.current.values()]
        const a = points[0]
        const b = points[1]
        const next = {
          distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
        }
        const prev = pinchRef.current
        if (prev) {
          const panned = panByClientPixels(next.x - prev.x, next.y - prev.y)
          const zoomed = zoomAt(next.x, next.y, next.distance / prev.distance)
          if (panned || zoomed) pushView()
        }
        pinchRef.current = next
        dragRef.current = null
        return
      }

      const d = dragRef.current
      if (!d) {
        dragRef.current = { x: e.clientX, y: e.clientY }
        return
      }
      if (panByClientPixels(e.clientX - d.x, e.clientY - d.y)) pushView()
      dragRef.current = { x: e.clientX, y: e.clientY }
    },
    [panByClientPixels, pushView, zoomAt],
  )

  const endDrag = useCallback((e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId)
    pinchRef.current = null
    const remaining = [...pointersRef.current.values()]
    dragRef.current = remaining.length === 1 ? remaining[0] : null
  }, [])

  const resetView = useCallback(() => {
    viewRef.current = { ...viewRef.current, zoom: 1, panX: 0, panY: 0 }
    pushView()
  }, [pushView])

  const onCanvasKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      let changed = false
      switch (e.key) {
        case "ArrowLeft":
          changed = panByClientPixels(36, 0)
          break
        case "ArrowRight":
          changed = panByClientPixels(-36, 0)
          break
        case "ArrowUp":
          changed = panByClientPixels(0, 36)
          break
        case "ArrowDown":
          changed = panByClientPixels(0, -36)
          break
        case "+":
        case "=": {
          const r = canvas.getBoundingClientRect()
          changed = zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.2)
          break
        }
        case "-": {
          const r = canvas.getBoundingClientRect()
          changed = zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.2)
          break
        }
        case "0":
        case "Home":
          resetView()
          e.preventDefault()
          return
        default:
          return
      }
      if (changed) pushView()
      e.preventDefault()
    },
    [panByClientPixels, pushView, resetView, zoomAt],
  )

  // --- readout --------------------------------------------------------------
  const clock: string[] = []
  if (stats) {
    if (stats.cosmological) {
      clock.push(stats.done ? "z = 0 · today" : `z = ${fmtZ(stats.z)}`)
      clock.push(formatAge(stats.time))
      if (stats.epoch) clock.push(stats.epoch)
    } else {
      clock.push(`t = ${stats.time.toFixed(2)}`)
    }
    if (stats.quasars > 0) clock.push(`${stats.quasars} quasar${stats.quasars > 1 ? "s" : ""}`)
  }

  const machine = stats
    ? [
        `depth ${stats.depth} · ${fmt(stats.cells)} cells`,
        `${stats.stepMs.toFixed(1)} ms sim · ${stats.drawMs.toFixed(1)} ms draw`,
        `${fmt(stats.speedup)}× fewer interactions than direct`,
      ]
    : ["warming up…"]

  return (
    <div className={styles.simulation} data-fullbleed>
      <canvas
        ref={canvasRef}
        className={styles.stage}
        tabIndex={0}
        aria-label="Interactive two-dimensional gravity simulation. Drag or use arrow keys to pan; scroll, pinch, or use plus and minus to zoom."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onCanvasKeyDown}
        onDoubleClick={resetView}
      />

      <div ref={controlsRef} className={styles.controlSurface} data-panel-ignore>
        <div className={styles.toolbar}>
          <button
            className={styles.optionsTrigger}
            type="button"
            onClick={() => setControlsOpen((open) => !open)}
            aria-expanded={controlsOpen}
            aria-controls="filament-options"
          >
            <span>FILAMENT</span>
            <span className={styles.triggerMark} aria-hidden="true">{controlsOpen ? "−" : "+"}</span>
          </button>

          <div className={styles.transport} role="group" aria-label="Simulation playback">
            {SPEEDS.map((s) => (
              <button
                key={s.n}
                type="button"
                onClick={() => setSpeed(s.n)}
                data-active={s.n === speed || undefined}
                title={s.title}
                aria-label={s.title}
                aria-pressed={s.n === speed}
              >
                {s.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => post({ t: "replay" })}
              title={info.cosmological ? "Back to recombination" : "Restart from the initial conditions"}
              aria-label={info.cosmological ? "Replay from recombination" : "Replay initial conditions"}
            >
              ↺
            </button>
          </div>
        </div>

        {controlsOpen && (
          <section id="filament-options" className={styles.optionsPanel} aria-label="FILAMENT options">
            <div className={styles.tabs} role="tablist" aria-label="Option groups">
              {CONTROL_TABS.map((tab) => (
                <button
                  key={tab.id}
                  id={`filament-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={controlTab === tab.id}
                  aria-controls={`filament-panel-${tab.id}`}
                  tabIndex={controlTab === tab.id ? 0 : -1}
                  data-active={controlTab === tab.id || undefined}
                  onClick={() => setControlTab(tab.id)}
                  onKeyDown={(e) => onControlTabKeyDown(e, tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div
              id={`filament-panel-${controlTab}`}
              className={styles.tabPanel}
              role="tabpanel"
              aria-labelledby={`filament-tab-${controlTab}`}
            >
              {controlTab === "world" && (
                <>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Scenario</span>
                    <div className={styles.segmented} role="group" aria-label="Scenario">
                      {PRESETS.map((p) => (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => setPreset(p.name)}
                          data-active={p.name === preset || undefined}
                          aria-pressed={p.name === preset}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className={styles.presetBlurb}>{info.blurb}</p>
                  <div className={styles.actions}>
                    <button type="button" onClick={() => post({ t: "replay" })}>Replay this world</button>
                    <button type="button" onClick={() => setSeed((Math.random() * 0xffffffff) >>> 0)}>
                      New seed
                    </button>
                  </div>
                </>
              )}

              {controlTab === "view" && (
                <>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Layers</span>
                    <div className={styles.segmented} role="group" aria-label="Visible layers">
                      <button
                        type="button"
                        onClick={() => setEvents((v) => !v)}
                        data-active={events || undefined}
                        aria-pressed={events}
                        title="Quasars, starbursts, and the recombination afterglow"
                      >
                        Luminous
                      </button>
                      <button
                        type="button"
                        onClick={() => setTrails((t) => !t)}
                        data-active={trails || undefined}
                        aria-pressed={trails}
                      >
                        Trails
                      </button>
                      <button
                        type="button"
                        onClick={() => setFollow((f) => !f)}
                        data-active={follow || undefined}
                        aria-pressed={follow}
                      >
                        Follow
                      </button>
                    </div>
                  </div>
                  <label className={styles.rangeField}>
                    <span className={styles.fieldLabel}>Exposure</span>
                    <input
                      type="range"
                      min="0.25"
                      max="4"
                      step="0.05"
                      value={exposure}
                      onChange={(e) => setExposure(Number(e.currentTarget.value))}
                    />
                    <output>{exposure.toFixed(2)}</output>
                  </label>
                  <div className={styles.actions}>
                    <button type="button" onClick={resetView}>Reset view</button>
                  </div>
                </>
              )}

              {controlTab === "solver" && (
                <>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Massive · tracers</span>
                    <div className={styles.segmented} role="group" aria-label="Particle count">
                      {SCALES.map((s) => (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => setScaleKey(s.key)}
                          data-active={s.key === scaleKey || undefined}
                          aria-pressed={s.key === scaleKey}
                          title={`${s.nMass.toLocaleString()} massive particles and ${s.nTracer.toLocaleString()} tracers`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Multipole accuracy</span>
                    <div className={styles.segmented} role="group" aria-label="Expansion order">
                      {ORDERS.map((o) => (
                        <button
                          key={o.p}
                          type="button"
                          onClick={() => setOrder(o.p)}
                          data-active={o.p === order || undefined}
                          aria-pressed={o.p === order}
                          title={`Expansion order p = ${o.p}; error falls geometrically as order rises`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={styles.machineStats} aria-live="polite">
                    {machine.map((r) => <span key={r}>{r}</span>)}
                  </div>
                </>
              )}
            </div>
          </section>
        )}
      </div>

      <div className={styles.clockHud} aria-live="polite">
        {(clock.length > 0 ? clock : ["seeding the early universe…"]).map((c) => <span key={c}>{c}</span>)}
      </div>

      <div className={styles.gestureHint} aria-hidden="true">
        drag to pan · scroll or pinch to zoom · double-click to reset
      </div>
    </div>
  )
}
