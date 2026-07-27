import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePhoneViewport } from "@/hooks/usePhoneViewport"
import { PRESETS, type PresetName } from "./presets"
import { formatAge } from "./cosmology"
import {
  FIDELITY_ORDER,
  fidelityProfile,
  type FidelityName,
  type FidelityProfile,
} from "./quality"
import type { FromWorker, SimParams, SimStats, ToWorker, ViewParams } from "./protocol"
import styles from "./FilamentPage.module.scss"

/**
 * FILAMENT — periodic structure formation and isolated N-body worlds.
 *
 * This component owns nothing but chrome. All of the simulation and all of the
 * rasterisation happen in `sim.worker.ts`; the page hands over parameters and
 * blits finished pixel buffers, so however heavy the sim gets it cannot stall
 * the site's main thread. Cosmos uses the periodic solver in `particle-mesh.ts`;
 * isolated worlds use `fmm.ts`; `cosmology.ts` owns the expansion history.
 */

const SPEEDS = [
  { n: 0, label: "❙❙", title: "Pause" },
  { n: 1, label: "▶", title: "Run" },
  { n: 3, label: "▶▶", title: "Run fast — three integration steps per frame" },
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
  const [fidelity, setFidelity] = useState<FidelityName>("auto")
  const [speed, setSpeed] = useState(1)
  const [trails, setTrails] = useState(true)
  const [events, setEvents] = useState(true)
  const [exposure, setExposure] = useState(1)
  const [seed, setSeed] = useState(() => (Math.random() * 0xffffffff) >>> 0)
  const [stats, setStats] = useState<SimStats | null>(null)
  const [fault, setFault] = useState<string | null>(null)
  const [controlsOpen, setControlsOpen] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)

  const profile = useMemo(() => fidelityProfile(fidelity, isPhone), [fidelity, isPhone])
  const info = useMemo(() => PRESETS.find((p) => p.name === preset) ?? PRESETS[0], [preset])

  // The worker is driven from refs, not props: it must not be torn down and
  // rebuilt every time a control moves.
  const viewRef = useRef<ViewParams>({ zoom: 1, panX: 0, panY: 0, autoFit: true })
  const pendingRef = useRef<{ buf: ArrayBuffer; w: number; h: number } | null>(null)
  const statsRef = useRef<SimStats | null>(null)
  /** Internal worker raster; independent from the visible canvas backing store. */
  const geomRef = useRef({ w: 0, h: 0 })
  const displayGeomRef = useRef({ w: 0, h: 0 })
  const profileRef = useRef<FidelityProfile>(profile)
  const pixelBudgetRef = useRef(profile.maxPixels)
  const paintMsRef = useRef(0)
  const costEmaRef = useRef(0)
  const slowSamplesRef = useRef(0)
  const fastSamplesRef = useRef(0)
  const lastScaleAtRef = useRef(0)
  profileRef.current = profile

  const params: SimParams = useMemo(
    () => ({
      preset,
      seed,
      nMass: profile.nMass,
      nTracer: profile.nTracer,
      order: profile.order,
      meshSize: profile.meshSize,
      substeps: speed,
      softening: 1,
      exposure,
      trails: trails ? 0.9 : 0,
      events,
    }),
    [preset, seed, profile, speed, exposure, trails, events],
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
    let displayW = Math.max(2, Math.round(cssW * dpr))
    let displayH = Math.max(2, Math.round(cssH * dpr))
    const displayCap = isPhone ? 1_200_000 : 3_000_000
    const displayOver = (displayW * displayH) / displayCap
    if (displayOver > 1) {
      const k = 1 / Math.sqrt(displayOver)
      displayW = Math.max(2, Math.round(displayW * k))
      displayH = Math.max(2, Math.round(displayH * k))
    }
    if (displayW !== displayGeomRef.current.w || displayH !== displayGeomRef.current.h) {
      displayGeomRef.current = { w: displayW, h: displayH }
      canvas.width = displayW
      canvas.height = displayH
    }

    // The visible canvas stays at display resolution. Only the worker's
    // internal density raster adapts, so changing quality never clears the
    // frame the user is currently looking at.
    let w = displayW
    let h = displayH
    const over = (w * h) / pixelBudgetRef.current
    if (over > 1) {
      const k = 1 / Math.sqrt(over)
      w = Math.max(2, Math.round(w * k))
      h = Math.max(2, Math.round(h * k))
    }
    if (w === geomRef.current.w && h === geomRef.current.h) return
    geomRef.current = { w, h }
    post({ t: "resize", w, h })
  }, [isPhone, post])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [measure])

  useEffect(() => {
    pixelBudgetRef.current = profile.maxPixels
    costEmaRef.current = 0
    slowSamplesRef.current = 0
    fastSamplesRef.current = 0
    lastScaleAtRef.current = performance.now()
    geomRef.current = { w: 0, h: 0 }
    measure()
  }, [measure, profile])

  // --- worker lifecycle ----------------------------------------------------
  useEffect(() => {
    const worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" })
    workerRef.current = worker
    worker.onerror = (e) => {
      const message = e.message || "The simulation worker stopped unexpectedly."
      console.error("[filament] simulation worker failed:", message)
      setFault(message)
    }
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const msg = e.data
      if (msg.t === "fault") {
        setFault(msg.message)
        return
      }
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
    setFault(null)
  }, [preset, seed, profile])

  // --- paint loop -----------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const g = canvas.getContext("2d")
    if (!g) return
    const scratch = document.createElement("canvas")
    const sg = scratch.getContext("2d")
    if (!sg) return
    g.imageSmoothingEnabled = true
    g.imageSmoothingQuality = "high"
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const frame = pendingRef.current
      if (!frame) return
      pendingRef.current = null
      const current = geomRef.current
      if (frame.w === current.w && frame.h === current.h) {
        const started = performance.now()
        if (scratch.width !== frame.w || scratch.height !== frame.h) {
          scratch.width = frame.w
          scratch.height = frame.h
        }
        sg.putImageData(new ImageData(new Uint8ClampedArray(frame.buf), frame.w, frame.h), 0, 0)
        // `copy` replaces transparent pixels too. The old visible frame remains
        // intact until this complete new frame is ready, including across an
        // internal resolution change.
        g.imageSmoothingEnabled = true
        g.imageSmoothingQuality = "high"
        g.globalCompositeOperation = "copy"
        g.drawImage(scratch, 0, 0, canvas.width, canvas.height)
        const elapsed = performance.now() - started
        paintMsRef.current += (elapsed - paintMsRef.current) * 0.12
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

  // Rendering resolution is presentation, not physics. Tune the internal
  // density raster with long hysteresis: a momentary expensive frame should not
  // make resolution oscillate, and the visible canvas never changes size.
  useEffect(() => {
    const id = setInterval(() => {
      const current = statsRef.current
      if (!current) return
      const p = profileRef.current
      const cost = current.drawMs + paintMsRef.current
      costEmaRef.current += (cost - costEmaRef.current) * (costEmaRef.current > 0 ? 0.3 : 1)
      const smoothCost = costEmaRef.current
      let next = pixelBudgetRef.current
      const now = performance.now()

      if (smoothCost > p.targetDrawMs * 1.15) {
        slowSamplesRef.current++
        fastSamplesRef.current = 0
      } else if (smoothCost < p.targetDrawMs * 0.62) {
        fastSamplesRef.current++
        slowSamplesRef.current = 0
      } else {
        slowSamplesRef.current = 0
        fastSamplesRef.current = 0
      }

      const canScale = now - lastScaleAtRef.current > 4_500
      if (canScale && slowSamplesRef.current >= 3) next *= 0.82
      else if (canScale && fastSamplesRef.current >= 5) next *= 1.1
      else return

      next = Math.max(p.minPixels, Math.min(p.maxPixels, Math.round(next)))
      slowSamplesRef.current = 0
      fastSamplesRef.current = 0
      if (Math.abs(next / pixelBudgetRef.current - 1) < 0.06) return
      pixelBudgetRef.current = next
      lastScaleAtRef.current = now
      measure()
    }, 1_500)
    return () => clearInterval(id)
  }, [measure])

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

  // --- pan / zoom -----------------------------------------------------------
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ distance: number; x: number; y: number } | null>(null)
  const pushView = useCallback(() => post({ t: "view", view: viewRef.current }), [post])

  const bufferPixels = useCallback((e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * geomRef.current.w,
      y: ((e.clientY - rect.top) / rect.height) * geomRef.current.h,
      w: geomRef.current.w,
      h: geomRef.current.h,
    }
  }, [])

  const panByClientPixels = useCallback((dx: number, dy: number) => {
    const canvas = canvasRef.current
    const s = statsRef.current
    if (!canvas || !s) return false
    const rect = canvas.getBoundingClientRect()
    const px = geomRef.current.w / rect.width
    const v = viewRef.current
    v.autoFit = false
    v.panX -= (dx * px) / s.scale
    v.panY += (dy * px) / s.scale
    return true
  }, [])

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const s = statsRef.current
      if (!s) return false
      const v = viewRef.current
      v.autoFit = false
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
    viewRef.current = { zoom: 1, panX: 0, panY: 0, autoFit: true }
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
    if (stats.health === "resolution-limit") clock.push("resolution limit")
  }

  const machine = stats
    ? [
        `${stats.solver === "pm" ? "periodic mesh" : "fast multipole"} · ${fmt(stats.particles)} particles`,
        `${fmt(stats.cells)} force cells · level ${stats.depth}`,
        `${geomRef.current.w}×${geomRef.current.h} density raster → ` +
          `${displayGeomRef.current.w}×${displayGeomRef.current.h} display`,
        `${stats.stepMs.toFixed(1)} ms sim · ${stats.drawMs.toFixed(1)} ms draw`,
        `${fmt(stats.speedup)}× fewer interactions than direct`,
        `${(stats.peakCellMass * 100).toFixed(2)}% in densest cell`,
      ]
    : ["warming up…"]

  const replay = () => {
    setFault(null)
    post({ t: "replay" })
  }

  const chooseWorld = (name: PresetName) => {
    setFault(null)
    setPreset(name)
    resetView()
  }

  const chooseFidelity = (name: FidelityName) => {
    setFault(null)
    setFidelity(name)
  }

  const newSeed = () => {
    setFault(null)
    setSeed((Math.random() * 0xffffffff) >>> 0)
  }

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
              onClick={replay}
              title={info.cosmological ? "Back to recombination" : "Restart from the initial conditions"}
              aria-label={info.cosmological ? "Replay from recombination" : "Replay initial conditions"}
            >
              ↺
            </button>
          </div>
        </div>

        {controlsOpen && (
          <section id="filament-options" className={styles.optionsPanel} aria-label="FILAMENT options">
            <div className={styles.controlGrid}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>World</span>
                <div className={styles.segmented} role="group" aria-label="World">
                  {PRESETS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => chooseWorld(p.name)}
                      data-active={p.name === preset || undefined}
                      aria-pressed={p.name === preset}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>Fidelity</span>
                <div className={styles.segmented} role="group" aria-label="Fidelity">
                  {FIDELITY_ORDER.map((name) => {
                    const option = fidelityProfile(name, isPhone)
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => chooseFidelity(name)}
                        data-active={name === fidelity || undefined}
                        aria-pressed={name === fidelity}
                        title={option.description}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <p className={styles.presetBlurb}>{info.blurb}</p>
              <p className={styles.profileNote}>{profile.description}</p>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>Light</span>
                <div className={styles.segmented} role="group" aria-label="Light and accumulation">
                  <button
                    type="button"
                    onClick={() => setEvents((v) => !v)}
                    data-active={events || undefined}
                    aria-pressed={events}
                    title="Quasars, starbursts, and the recombination afterglow"
                  >
                    Events
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrails((t) => !t)}
                    data-active={trails || undefined}
                    aria-pressed={trails}
                  >
                    Trails
                  </button>
                </div>
              </div>

              <label className={styles.rangeField}>
                <span className={styles.fieldLabel}>Brightness</span>
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
                <button type="button" onClick={newSeed}>New seed</button>
                <button type="button" onClick={resetView}>Reset view</button>
                <button
                  type="button"
                  onClick={() => setDiagnosticsOpen((open) => !open)}
                  aria-expanded={diagnosticsOpen}
                >
                  {diagnosticsOpen ? "Hide diagnostics" : "Diagnostics"}
                </button>
              </div>

              {diagnosticsOpen && (
                <div className={styles.machineStats} aria-live="polite">
                  {machine.map((r) => <span key={r}>{r}</span>)}
                </div>
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

      {fault && (
        <div className={styles.faultHud} role="alert">
          <span>{fault}</span>
          <button type="button" onClick={replay}>Restart</button>
        </div>
      )}
    </div>
  )
}
