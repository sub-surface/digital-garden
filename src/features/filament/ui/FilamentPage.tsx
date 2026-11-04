import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePhoneViewport } from "@/hooks/usePhoneViewport"
import { useProgramHost } from "@/components/ui/games/ProgramHostContext"
import { DARK_MATTER, type DarkMatter } from "../engine/ics"
import { COSMOLOGIES, formatAge, type CosmologyName } from "../engine/cosmology"
import { FIDELITY_ORDER, fidelityProfile, type FidelityName, type FidelityProfile } from "./quality"
import { lensesFor, type Rgb } from "../render/palettes"
import { InstrumentPanel } from "./Instruments"
import { Breadcrumb, Legend, ProbeTip, ScaleBar, scaleFactorAlong, Timeline } from "./Hud"
import type {
  Destination,
  FromWorker,
  Instruments,
  LensName,
  LevelName,
  ProbeReading,
  SimParams,
  SimStats,
  ToWorker,
} from "../protocol"
import styles from "./FilamentPage.module.scss"

/**
 * FILAMENT — from the cosmic web down to a black hole, in one continuous zoom.
 *
 * This component owns nothing but chrome. The simulation, the camera and the
 * rasteriser live in `sim.worker.ts`; the page sends gestures and blits
 * finished pixel buffers, so however heavy the sim gets it cannot stall the
 * site's main thread. See `layers/layer.ts` for how the zoom nests.
 */

const SPEEDS = [
  { n: 0, label: "❙❙", title: "Pause (space)" },
  { n: 1, label: "▶", title: "Run (space)" },
  { n: 3, label: "▶▶", title: "Run fast" },
]

const COSMOLOGY_ORDER: CosmologyName[] = ["planck", "eds", "open", "vacuum"]

/** Resolve any CSS colour (hex, rgb(), oklch(), …) to 0–1 RGB. */
function readAccent(): Rgb {
  const fallback: Rgb = [0.71, 0.26, 0.3]
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

const fmtMyr = (myr: number) => (myr >= 1000 ? `${(myr / 1000).toFixed(2)} Gyr` : `${myr.toFixed(0)} Myr`)

/** Seconds as the most readable unit, out to years. */
function fmtSpan(s: number): string {
  if (s < 120) return `${s.toFixed(1)} s`
  if (s < 7200) return `${(s / 60).toFixed(1)} min`
  if (s < 172800) return `${(s / 3600).toFixed(1)} h`
  if (s < 3.156e7 * 2) return `${(s / 86400).toFixed(1)} days`
  const yr = s / 3.156e7
  if (yr < 1e4) return `${yr.toFixed(1)} yr`
  return yr < 1e7 ? `${(yr / 1e3).toFixed(1)} kyr` : `${(yr / 1e6).toFixed(1)} Myr`
}

/** A deep link, read once: `?seed=…&z=…&halo=…&level=nucleus`. */
function readLink(): { seed: number | null; destination: Destination | null; lone: boolean } {
  if (typeof window === "undefined") return { seed: null, destination: null, lone: false }
  const q = new URLSearchParams(window.location.search)
  const num = (k: string) => {
    const v = q.get(k)
    const n = v === null ? NaN : Number(v)
    return Number.isFinite(n) ? n : null
  }
  const halo = num("halo")
  const nucleus = q.get("level") === "nucleus"
  return {
    seed: num("seed"),
    destination: halo !== null ? { z: num("z") ?? 0, halo, nucleus } : null,
    // A black hole with no halo named: the arcade's GEODESIC, on its own.
    lone: nucleus && halo === null,
  }
}

export function FilamentPage() {
  const programHost = useProgramHost()
  const isPhone = usePhoneViewport()
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const workerRef = useRef<Worker | null>(null)

  const [fidelity, setFidelity] = useState<FidelityName>("auto")
  const [speed, setSpeed] = useState(1)
  const [trails, setTrails] = useState(true)
  const [events, setEvents] = useState(true)
  const [exposure, setExposure] = useState(1)
  const [lens, setLens] = useState<LensName>("density")
  const [cosmology, setCosmology] = useState<CosmologyName>("planck")
  const [darkMatter, setDarkMatter] = useState<DarkMatter>("cold")
  const [amplitude, setAmplitude] = useState(1)
  const [amplitudeDraft, setAmplitudeDraft] = useState(1)
  const linkRef = useRef(readLink())
  const [lone, setLone] = useState(linkRef.current.lone)
  const [seed, setSeed] = useState(() => linkRef.current.seed ?? (Math.random() * 0xffffffff) >>> 0)
  const [stats, setStats] = useState<SimStats | null>(null)
  const [instruments, setInstruments] = useState<Instruments | null>(null)
  const [probe, setProbe] = useState<{ reading: ProbeReading; x: number; y: number } | null>(null)
  const [fault, setFault] = useState<string | null>(null)
  const [controlsOpen, setControlsOpen] = useState(false)
  const [instrumentsOpen, setInstrumentsOpen] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [accent, setAccent] = useState<Rgb>(() => readAccent())

  const profile = useMemo(() => fidelityProfile(fidelity, isPhone), [fidelity, isPhone])
  const level: LevelName = stats?.level ?? (lone ? "nucleus" : "web")
  const inWeb = level === "web"
  const lenses = useMemo(() => lensesFor(level), [level])
  // A lens this level cannot read falls back to the level's own first lens.
  const activeLens: LensName = lenses.some((l) => l.name === lens) ? lens : (lenses[0]?.name ?? "density")
  const cosmo = COSMOLOGIES[cosmology]

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
  const probeClientRef = useRef<{ x: number; y: number } | null>(null)
  profileRef.current = profile

  // The worker's lens is whatever the user picked; each layer reads what it
  // can, so the choice survives a trip down and back up.
  const params: SimParams = useMemo(
    () => ({
      seed,
      nMass: profile.nMass,
      order: profile.order,
      grid: profile.grid,
      meshSize: profile.meshSize,
      substeps: speed,
      exposure,
      trails: trails ? 0.9 : 0,
      events,
      lens,
      cosmology,
      darkMatter,
      amplitude,
      instruments: instrumentsOpen,
    }),
    [seed, profile, speed, exposure, trails, events, lens, cosmology, darkMatter, amplitude, instrumentsOpen],
  )
  const paramsRef = useRef(params)
  paramsRef.current = params

  const post = useCallback((msg: ToWorker, transfer?: Transferable[]) => {
    workerRef.current?.postMessage(msg, transfer ?? [])
  }, [])

  // --- sizing ---------------------------------------------------------------
  // A freshly created worker knows nothing about the canvas and must be told:
  // `geomRef` survives a StrictMode remount, so re-measure explicitly.
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
    // Only the worker's internal raster adapts; the visible canvas keeps its size.
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
    const worker = new Worker(new URL("../sim.worker.ts", import.meta.url), { type: "module" })
    workerRef.current = worker
    worker.onerror = (e) => {
      const message = e.message || "The simulation worker stopped unexpectedly."
      console.error("[filament] simulation worker failed:", message)
      setFault(message)
    }
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const msg = e.data
      switch (msg.t) {
        case "fault":
          setFault(msg.message)
          return
        case "instruments":
          setInstruments(msg.data)
          return
        case "probe": {
          const at = probeClientRef.current
          setProbe(msg.reading && at ? { reading: msg.reading, x: at.x, y: at.y } : null)
          return
        }
        case "frame": {
          // Drop a frame rather than queue it: only the newest is worth painting.
          const stale = pendingRef.current
          if (stale) worker.postMessage({ t: "recycle", buf: stale.buf } satisfies ToWorker, [stale.buf])
          pendingRef.current = { buf: msg.buf, w: msg.w, h: msg.h }
          statsRef.current = msg.stats
          return
        }
      }
    }
    // A deep link is spent only once the world reaches it: in development
    // StrictMode starts and discards a worker first, and the link must survive
    // to reach the real one.
    const link = linkRef.current
    worker.postMessage({
      t: "start",
      params: paramsRef.current,
      accent: readAccent(),
      destination: link.destination ?? undefined,
      lone: link.lone,
    } satisfies ToWorker)
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

  // --- parameter sync -------------------------------------------------------
  useEffect(() => {
    post({ t: "params", params })
  }, [params, post])

  useEffect(() => {
    setFault(null)
    setInstruments(null)
  }, [seed, profile, cosmology, darkMatter, amplitude])

  // A new universe forgets the link that made the last one.
  const firstUniverse = useRef(true)
  useEffect(() => {
    if (firstUniverse.current) {
      firstUniverse.current = false
      return
    }
    linkRef.current = { seed: null, destination: null, lone: false }
  }, [seed, profile, cosmology, darkMatter, amplitude])

  // The amplitude restarts the universe, so commit it once the slider settles.
  useEffect(() => {
    if (amplitudeDraft === amplitude) return
    const id = setTimeout(() => setAmplitude(amplitudeDraft), 350)
    return () => clearTimeout(id)
  }, [amplitudeDraft, amplitude])

  // The instruments belong to one layer; a new layer starts them afresh.
  useEffect(() => setInstruments(null), [level])

  // The address bar always names what is on screen, so a view can be shared.
  const focusId = stats?.focus?.id ?? null
  const focusZ = stats?.focus?.z ?? null
  const moving = !!stats?.moving
  useEffect(() => {
    if (programHost.embedded || typeof window === "undefined" || moving || lone) return
    const q = new URLSearchParams(window.location.search)
    q.set("seed", String(seed))
    const deep = level !== "web" && focusId !== null
    if (deep && focusZ !== null) {
      q.set("z", focusZ.toFixed(3))
      q.set("halo", String(focusId))
    } else {
      q.delete("z")
      q.delete("halo")
    }
    if (level === "nucleus" && deep) q.set("level", "nucleus")
    else q.delete("level")
    const next = `${window.location.pathname}?${q.toString()}${window.location.hash}`
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", next)
    }
  }, [focusId, focusZ, level, lone, moving, programHost.embedded, seed])

  // --- paint loop -----------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const g = canvas.getContext("2d")
    if (!g) return
    const scratch = document.createElement("canvas")
    const sg = scratch.getContext("2d")
    if (!sg) return
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

  // Readout, refreshed a few times a second rather than every frame.
  useEffect(() => {
    const id = setInterval(() => setStats(statsRef.current), 200)
    return () => clearInterval(id)
  }, [])

  // Rendering resolution is presentation, not physics: tune the internal
  // raster with long hysteresis so a momentary expensive frame does not make
  // the resolution oscillate.
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
    const obs = new MutationObserver(() => {
      const next = readAccent()
      setAccent((prev) => (prev.every((v, i) => Math.abs(v - next[i]) < 1e-3) ? prev : next))
      post({ t: "accent", accent: next })
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class", "data-theme"] })
    return () => obs.disconnect()
  }, [post])

  // The control surface is non-modal: Escape and a click on the sky close it.
  const controlsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!controlsOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (!controlsRef.current?.contains(e.target as Node)) setControlsOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        setControlsOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [controlsOpen])

  // --- gestures -------------------------------------------------------------
  // Everything is sent in raster pixels; the worker owns the camera.
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ distance: number; x: number; y: number } | null>(null)

  const toRaster = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * geomRef.current.w,
      y: ((clientY - rect.top) / rect.height) * geomRef.current.h,
    }
  }, [])

  const panBy = useCallback(
    (dxClient: number, dyClient: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const k = geomRef.current.w / canvas.getBoundingClientRect().width
      post({ t: "pan", dx: dxClient * k, dy: dyClient * k })
    },
    [post],
  )

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => post({ t: "zoom", at: toRaster(clientX, clientY), factor }),
    [post, toRaster],
  )

  // Wheel is bound natively: React's root wheel listeners are passive, so
  // `preventDefault` there would let the article scroll underneath.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * lines * 0.002))
    }
    canvas.addEventListener("wheel", onWheel, { passive: false })
    return () => canvas.removeEventListener("wheel", onWheel)
  }, [zoomAt])

  // --- probe ---------------------------------------------------------------
  const probeRafRef = useRef(0)
  const sendProbe = useCallback(
    (clientX: number, clientY: number) => {
      const root = rootRef.current
      if (!root) return
      const r = root.getBoundingClientRect()
      probeClientRef.current = { x: clientX - r.left, y: clientY - r.top }
      if (probeRafRef.current) return
      probeRafRef.current = requestAnimationFrame(() => {
        probeRafRef.current = 0
        const at = probeClientRef.current
        if (!at) return
        post({ t: "probe", at: toRaster(at.x + r.left, at.y + r.top) })
      })
    },
    [post, toRaster],
  )
  const stopProbe = useCallback(() => {
    if (!probeClientRef.current) return
    probeClientRef.current = null
    setProbe(null)
    post({ t: "probe", at: null })
  }, [post])
  useEffect(() => () => cancelAnimationFrame(probeRafRef.current), [])

  /** Where a single-pointer press began, to tell a click from a drag. */
  const pressRef = useRef<{ x: number; y: number; t: number } | null>(null)

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      pressRef.current = pointersRef.current.size === 0 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null
      stopProbe()
      try {
        ;(e.target as Element).setPointerCapture?.(e.pointerId)
      } catch {
        // A pointer that is already gone cannot be captured.
      }
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointersRef.current.size === 1) {
        dragRef.current = { x: e.clientX, y: e.clientY }
        pinchRef.current = null
        return
      }
      const [a, b] = [...pointersRef.current.values()]
      pinchRef.current = { distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      dragRef.current = null
    },
    [stopProbe],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) {
        if (e.pointerType === "mouse" && e.buttons === 0) sendProbe(e.clientX, e.clientY)
        return
      }
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointersRef.current.size >= 2) {
        const [a, b] = [...pointersRef.current.values()]
        const next = { distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const prev = pinchRef.current
        if (prev) {
          panBy(next.x - prev.x, next.y - prev.y)
          zoomAt(next.x, next.y, next.distance / prev.distance)
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
      // At the hole a drag throws a body, released on pointer-up.
      if (statsRef.current?.level === "nucleus") return
      panBy(e.clientX - d.x, e.clientY - d.y)
      dragRef.current = { x: e.clientX, y: e.clientY }
    },
    [panBy, sendProbe, zoomAt],
  )

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      const press = pressRef.current
      pressRef.current = null
      const single = e.type === "pointerup" && press && pointersRef.current.size === 1
      if (single && press) {
        const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y) >= 5
        if (statsRef.current?.level === "nucleus" && moved) {
          post({ t: "launch", from: toRaster(press.x, press.y), to: toRaster(e.clientX, e.clientY) })
        } else if (!moved && performance.now() - press.t < 500) {
          // A click: the worker decides what it hit.
          post({ t: "click", at: toRaster(e.clientX, e.clientY) })
        }
      }
      pointersRef.current.delete(e.pointerId)
      pinchRef.current = null
      const remaining = [...pointersRef.current.values()]
      dragRef.current = remaining.length === 1 ? remaining[0] : null
    },
    [post, toRaster],
  )

  const home = useCallback(() => post({ t: "home" }), [post])
  const ascend = useCallback((to?: LevelName) => post({ t: "ascend", to }), [post])

  const cycleLens = useCallback(
    (dir: 1 | -1) => {
      const i = lenses.findIndex((l) => l.name === activeLens)
      setLens(lenses[(i + dir + lenses.length) % lenses.length].name)
    },
    [lenses, activeLens],
  )

  const togglePause = useCallback(() => setSpeed((s) => (s === 0 ? 1 : 0)), [])

  /** Scrub the web's history; the worker replays from its nearest snapshot. */
  const seek = useCallback((a: number) => post({ t: "seek", a }), [post])

  const stepTime = useCallback(
    (df: number) => {
      const s = statsRef.current
      if (!s || s.level !== "web" || !s.cosmological) return
      const f = Math.log(s.a / (1 / 1101)) / Math.log(1101)
      seek(scaleFactorAlong(f + df))
    },
    [seek],
  )

  /** Save what is on screen as a PNG. */
  const saveImage = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `filament-${seed}-${statsRef.current?.level ?? "web"}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    }, "image/png")
  }, [seed])

  const onCanvasKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const r = canvas.getBoundingClientRect()
      switch (e.key) {
        case "ArrowLeft":
          panBy(36, 0)
          break
        case "ArrowRight":
          panBy(-36, 0)
          break
        case "ArrowUp":
          panBy(0, 36)
          break
        case "ArrowDown":
          panBy(0, -36)
          break
        case "+":
        case "=":
          zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25)
          break
        case "-":
          zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.25)
          break
        case "0":
        case "Home":
          home()
          break
        default:
          return
      }
      e.preventDefault()
    },
    [home, panBy, zoomAt],
  )

  // Simulation-wide keys. Letters avoid the site's global hotkeys (f, b, m, r, /, \).
  const onRootKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement
      if (target.closest("input, textarea, select, [contenteditable]")) return
      if (e.key === "Escape" && level !== "web" && !lone) {
        e.preventDefault()
        ascend()
      } else if (e.key === " " && target.tagName !== "BUTTON") {
        e.preventDefault()
        togglePause()
      } else if (e.key === "[" || e.key === "]") {
        e.preventDefault()
        stepTime(e.key === "]" ? 0.04 : -0.04)
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault()
        saveImage()
      } else if (e.key === "i" || e.key === "I") {
        e.preventDefault()
        setInstrumentsOpen((o) => !o)
      } else if (e.key === "l") {
        e.preventDefault()
        cycleLens(1)
      } else if (e.key === "L") {
        e.preventDefault()
        cycleLens(-1)
      }
    },
    [ascend, cycleLens, level, lone, saveImage, stepTime, togglePause],
  )

  // --- readout --------------------------------------------------------------
  // The clock shown is the one that is running: the deepest layer on screen.
  const clock: string[] = []
  if (stats) {
    if (stats.running === "nucleus") {
      clock.push(`t = ${fmtSpan(stats.holeTime * stats.holeSeconds)} at the hole`)
      clock.push(`${stats.particles} bodies`)
    } else if (stats.running === "galaxy") {
      clock.push(`t = ${fmtMyr(stats.galaxyTime * stats.galaxyMyr)} in the galaxy`)
    } else if (stats.cosmological) {
      clock.push(stats.done ? "z = 0 · today" : `z = ${fmtZ(stats.z)}`)
      clock.push(formatAge(stats.time))
      if (stats.epoch && !stats.done) clock.push(stats.epoch)
      clock.push(`D = ${stats.growth.toFixed(3)}`)
    }
    if (stats.running !== "web" && stats.cosmological) clock.push(`the web holds still at z = ${fmtZ(stats.z)}`)
    if (stats.moving && stats.running === "web" && !stats.focus) clock.push("running the universe on…")
    if (stats.quasars > 0 && activeLens === "density") clock.push(`${stats.quasars} quasar${stats.quasars > 1 ? "s" : ""}`)
  }

  const machine = stats
    ? [
        `${stats.solver === "pm" ? "periodic mesh" : stats.solver === "fmm" ? "fast multipole" : "geodesic integrator"} · ${fmt(stats.particles)} ${stats.solver === "geodesic" ? "bodies" : "particles"}`,
        `${fmt(stats.cells)} force cells · level ${stats.depth}`,
        `${geomRef.current.w}×${geomRef.current.h} raster → ${displayGeomRef.current.w}×${displayGeomRef.current.h} display`,
        `${stats.stepMs.toFixed(1)} ms sim · ${stats.drawMs.toFixed(1)} ms draw · ${stats.analysisMs.toFixed(1)} ms analysis`,
        `layers built: ${stats.stack.join(" › ")}`,
        `${fmt(stats.speedup)}× fewer interactions than direct`,
      ]
    : ["warming up…"]

  const cssPerKpc = (() => {
    const canvas = canvasRef.current
    if (!stats || !canvas || !geomRef.current.w || !(stats.kpcPerPx > 0)) return 0
    return canvas.clientWidth / geomRef.current.w / stats.kpcPerPx
  })()

  const replay = () => {
    setFault(null)
    setInstruments(null)
    post({ t: "replay" })
  }

  const newSeed = () => {
    setFault(null)
    setLone(false)
    setSeed((Math.random() * 0xffffffff) >>> 0)
  }

  const lensInfo = lenses.find((l) => l.name === activeLens) ?? lenses[0]
  const dmInfo = DARK_MATTER.find((d) => d.name === darkMatter) ?? DARK_MATTER[0]
  const timeline = !!stats?.cosmological

  const hint = stats?.limit
    ? stats.limit
    : level === "nucleus"
      ? "click to place an orbit or select a body · drag to throw · scroll to zoom · esc climbs out"
      : level === "galaxy"
        ? "scroll into its heart for the black hole, or click it · drag to pan · esc climbs out · L lens"
        : "scroll into a ringed halo, or click one, to descend · drag the timeline to scrub · [ ] step time · L lens"

  return (
    <div
      ref={rootRef}
      className={styles.simulation}
      data-fullbleed
      data-embedded={programHost.embedded || undefined}
      data-instruments={instrumentsOpen || undefined}
      data-timeline={timeline || undefined}
      onKeyDown={onRootKeyDown}
    >
      <canvas
        ref={canvasRef}
        className={styles.stage}
        tabIndex={0}
        aria-label="A continuous zoom from the cosmic web to a black hole. Drag or use arrow keys to pan; scroll, pinch, or use plus and minus to zoom; click a halo to descend into it. Space pauses, L changes lens, I opens the instruments, Escape climbs a level."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={stopProbe}
        onKeyDown={onCanvasKeyDown}
        onDoubleClick={home}
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
            <button type="button" onClick={replay} title="Back to recombination" aria-label="Replay from recombination">
              ↺
            </button>
            <button type="button" onClick={saveImage} title="Save this view as a PNG (P)" aria-label="Save image">
              ⤓
            </button>
          </div>

          <Breadcrumb
            stack={stats?.stack ?? (lone ? ["nucleus"] : ["web"])}
            level={level}
            focus={stats?.focus ?? null}
            holeMass={stats?.holeMass ?? null}
            lone={lone}
            moving={moving}
            onAscend={ascend}
          />
        </div>

        {controlsOpen && (
          <section id="filament-options" className={styles.optionsPanel} aria-label="FILAMENT options">
            <div className={styles.controlGrid}>
              <p className={styles.presetBlurb}>
                From recombination to now, and from the web down to a black hole. A comoving patch 180 Mpc across on a
                real ΛCDM clock; zoom into any ringed halo and it is resimulated as a galaxy, its heart holds a black
                hole. Time runs only in the deepest layer on screen.
              </p>

              <div className={styles.universeGroup}>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Universe</span>
                  <div className={styles.segmented} role="group" aria-label="Background cosmology">
                    {COSMOLOGY_ORDER.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setCosmology(name)}
                        data-active={name === cosmology || undefined}
                        aria-pressed={name === cosmology}
                      >
                        {COSMOLOGIES[name].label}
                      </button>
                    ))}
                  </div>
                  <p className={styles.fieldNote}>
                    {cosmo.blurb}{" "}
                    <span className={styles.figures}>
                      Ω<sub>m</sub> {cosmo.omegaM} · Ω<sub>Λ</sub> {cosmo.omegaL}
                    </span>
                  </p>
                </div>

                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Dark matter</span>
                  <div className={styles.segmented} role="group" aria-label="Dark matter species">
                    {DARK_MATTER.map((d) => (
                      <button
                        key={d.name}
                        type="button"
                        onClick={() => setDarkMatter(d.name)}
                        data-active={d.name === darkMatter || undefined}
                        aria-pressed={d.name === darkMatter}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <p className={styles.fieldNote}>{dmInfo.blurb} Same seed, same phases: switch species to compare.</p>
                </div>

                <label className={styles.rangeField}>
                  <span
                    className={styles.fieldLabel}
                    title="σ₈: rms linear density contrast today in circles 8 Mpc across. Our universe: 0.81"
                  >
                    Clumpiness σ₈
                  </span>
                  <input
                    type="range"
                    min="0.4"
                    max="2"
                    step="0.05"
                    value={amplitudeDraft}
                    onChange={(e) => setAmplitudeDraft(Number(e.currentTarget.value))}
                  />
                  <output>{amplitudeDraft.toFixed(2)}</output>
                </label>
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
                        onClick={() => setFidelity(name)}
                        data-active={name === fidelity || undefined}
                        aria-pressed={name === fidelity}
                        title={option.description}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
                <p className={styles.profileNote}>{profile.description}</p>
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>Light</span>
                <div className={styles.segmented} role="group" aria-label="Light and accumulation">
                  <button
                    type="button"
                    onClick={() => setEvents((v) => !v)}
                    data-active={events || undefined}
                    aria-pressed={events}
                    title="Halo rings, quasars, starbursts, and the recombination afterglow"
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
                <button type="button" onClick={newSeed}>New universe</button>
                <button type="button" onClick={home}>Frame this layer</button>
                <button type="button" onClick={() => setDiagnosticsOpen((open) => !open)} aria-expanded={diagnosticsOpen}>
                  {diagnosticsOpen ? "Hide diagnostics" : "Diagnostics"}
                </button>
              </div>

              {diagnosticsOpen && (
                <div className={styles.machineStats} aria-live="polite">
                  {machine.map((r) => <span key={r}>{r}</span>)}
                  <span>seed {seed.toString(16).padStart(8, "0")}</span>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      <div className={styles.lensBar} data-panel-ignore>
        {lenses.length > 1 && (
          <div className={styles.segmented} role="group" aria-label="Lens">
            {lenses.map((l) => (
              <button
                key={l.name}
                type="button"
                onClick={() => setLens(l.name)}
                data-active={l.name === activeLens || undefined}
                aria-pressed={l.name === activeLens}
                title={l.description}
              >
                {l.label}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className={styles.instrumentsTrigger}
          onClick={() => setInstrumentsOpen((o) => !o)}
          aria-expanded={instrumentsOpen}
          aria-controls="filament-instruments"
          title="Measurements (I)"
        >
          Instruments <span aria-hidden="true">{instrumentsOpen ? "−" : "+"}</span>
        </button>
      </div>

      {instrumentsOpen && (
        <aside id="filament-instruments" className={styles.instrumentsPanel} aria-label="Instruments" data-panel-ignore>
          {lensInfo && (
            <p className={styles.lensNote}>
              <span className={styles.fieldLabel}>{lensInfo.label}</span> {lensInfo.description}
            </p>
          )}
          <InstrumentPanel data={instruments} accent={accent} />
        </aside>
      )}

      <div className={styles.bottomLeft}>
        <div className={styles.clockHud} aria-live="polite">
          {(clock.length > 0 ? clock : ["seeding the early universe…"]).map((c) => <span key={c}>{c}</span>)}
        </div>
      </div>

      <div className={styles.bottomRight}>
        {level !== "nucleus" && <Legend lens={activeLens} accent={accent} />}
        <ScaleBar cssPerWorld={cssPerKpc} kpcPerWorld={1} comoving={!!stats?.comoving} />
      </div>

      {timeline && stats && (
        <div className={styles.timelineSlot} data-frozen={!inWeb || undefined}>
          <Timeline cosmology={cosmo} a={stats.a} onSeek={inWeb ? seek : () => {}} />
        </div>
      )}

      <div className={styles.gestureHint} aria-hidden="true">
        {hint}
      </div>

      {probe && <ProbeTip reading={probe.reading} x={probe.x} y={probe.y} />}

      {fault && (
        <div className={styles.faultHud} role="alert">
          <span>{fault}</span>
          <button type="button" onClick={replay}>Restart</button>
        </div>
      )}
    </div>
  )
}
