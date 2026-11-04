/**
 * FILAMENT simulation worker: one camera, a stack of nested layers, and the
 * compositor that draws them.
 *
 *   web      `layers/web.ts`      the cosmic web, FastPM + the dark-matter sheet
 *   galaxy   `layers/galaxy.ts`   one halo resimulated on the FMM
 *   nucleus  `layers/nucleus.ts`  its black hole, on Schwarzschild geodesics
 *
 * The page sends gestures; the camera (`layers/layer.ts`) moves through the
 * stack, held in whichever frame it has entered. Only the branch under the
 * camera is built — a galaxy as the camera closes in on a halo, a black hole
 * as it closes in on the galaxy's heart — and each is dropped once the camera
 * leaves. Layers crossfade over about an octave of zoom. The clock runs only
 * in the deepest layer on screen: the web stands still while you watch one of
 * its galaxies, and the galaxy while you watch its hole.
 */

import { COSMOLOGIES } from "./engine/cosmology"
import { Camera, smoothstep, type Anchor, type DrawContext, type Layer, type Stack, type View } from "./layers/layer"
import { WebLayer } from "./layers/web"
import { GALAXY_EXTENT, GalaxyLayer } from "./layers/galaxy"
import { NUCLEUS_EXTENT, NucleusLayer, SGR_A_STAR } from "./layers/nucleus"
import { blend, sprite } from "./render/draw"
import { wrapPeriodic } from "./engine/particle-mesh"
import type { Destination, FromWorker, LevelName, SimParams, SimStats, ToWorker } from "./protocol"

/** Wall-clock seconds between analysis passes while running. */
const ANALYSIS_PERIOD = 0.2
/** A galaxy is built once its halo would fill this much of the screen... */
const GALAXY_BUILD_FILL = 0.06
/** ...and dropped below this, or once the camera has left it. */
const GALAXY_DROP_FILL = 0.025
/** Crossfade from web to galaxy, in galaxy fill. */
const GALAXY_FADE: [number, number] = [0.3, 0.85]
/** A black hole is built once the galaxy is magnified this far about its heart. */
const NUCLEUS_BUILD_FILL = 3
const NUCLEUS_DROP_FILL = 2
/** Crossfade from galaxy to nucleus, in nucleus fill. */
const NUCLEUS_FADE: [number, number] = [0.12, 0.5]
/** Zoom limits where there is nothing deeper to see. */
const WEB_MIN_FILL = 0.4
const WEB_MAX_FILL = 160
const GALAXY_MAX_FILL = 14
/** Closest view of the hole: half the screen spans this many M. */
const NUCLEUS_CLOSEST = 4
/** The view an arrival in the nucleus settles on: the innermost orbits. */
const NUCLEUS_ARRIVAL_HALF = 42
/** Autopilot: e-folds of zoom per second, and how much faster across empty scales. */
const FLIGHT_RATE = 2.4
const GAP_BOOST = 6
/** A black hole's mass as a fraction of its halo's (≈ the M_BH–M_halo relation). */
const BH_FRACTION = 3e-5
const PORTRAIT_SIZE = 192

const ctx = globalThis as unknown as {
  postMessage(msg: FromWorker, transfer?: Transferable[]): void
  addEventListener(type: "message", cb: (e: MessageEvent<ToWorker>) => void): void
}

let params: SimParams | null = null
let accent: [number, number, number] = [0.71, 0.26, 0.3]
let rw = 0
let rh = 0
const pool: ArrayBuffer[] = []
let scheduled = false
let running = false
let faulted = false
let renderRequested = false
let lastTick = 0
let clock = 0

let web: WebLayer | null = null
let galaxy: GalaxyLayer | null = null
let nucleus: NucleusLayer | null = null
/** A galaxy kept after the camera left it, in case it comes straight back. */
let galaxyCache: GalaxyLayer | null = null
/** A black hole with no universe above it: the arcade's GEODESIC entry. */
let lone = false

let galaxyBuf = new Uint32Array(0)
let nucleusBuf = new Uint32Array(0)

/** The camera flying itself: down to a target layer, or back up. */
let autopilot: { dir: 1 | -1; target: LevelName; halo: number } | null = null
/** A deep link waiting for the web to reach its epoch. */
let pendingGoto: Destination | null = null
let probeAt: { x: number; y: number } | null = null
let lastAnalysis = -Infinity
let analysisDirty = true
/** The camera moved: screen-space trails would smear. */
let cameraMoved = false
let limit = ""

// ---------------------------------------------------------------------------
// The stack
// ---------------------------------------------------------------------------

/** Layers in nesting order: [web, galaxy?, nucleus?], or [nucleus] alone. */
function layers(): Layer[] {
  if (lone) return nucleus ? [nucleus] : []
  const out: Layer[] = []
  if (web) out.push(web)
  if (galaxy) out.push(galaxy)
  if (galaxy && nucleus) out.push(nucleus)
  return out
}

function depthOf(kind: LevelName): number {
  return layers().findIndex((l) => l.kind === kind)
}

/** Size of the hole's unit, M, in the galaxy's unit, the halo radius. */
function holeUnit(): number {
  return nucleus && galaxy ? nucleus.units.kpc / galaxy.units.kpc : 1
}

const stack: Stack = {
  layer: (j) => layers()[j] ?? null,
  anchor: (j): Anchor => {
    const l = layers()[j]
    if (l === galaxy && galaxy) return galaxy.anchor
    if (l === nucleus && galaxy) {
      const c = galaxy.centre()
      return { x: c.x, y: c.y, unit: holeUnit() }
    }
    return { x: 0, y: 0, unit: 1 }
  },
  attached: (j) => j >= 0 && j < layers().length,
  periodic: (j) => !lone && j === 0 && web !== null,
}

const camera = new Camera(stack)

function fillOf(kind: LevelName): number {
  const j = depthOf(kind)
  return j < 0 ? 0 : camera.fill(j, rw, rh)
}

function viewOf(kind: LevelName): View {
  return camera.viewIn(depthOf(kind), rw, rh)
}

/** Crossfade weights of the galaxy and the nucleus. */
function weights(): { g: number; n: number } {
  if (lone) return { g: 0, n: 1 }
  const g = galaxy ? smoothstep(Math.log(GALAXY_FADE[0]), Math.log(GALAXY_FADE[1]), Math.log(fillOf("galaxy"))) : 0
  const n = nucleus && galaxy ? smoothstep(Math.log(NUCLEUS_FADE[0]), Math.log(NUCLEUS_FADE[1]), Math.log(fillOf("nucleus"))) : 0
  return { g, n }
}

/** The deepest layer on screen: the one whose clock runs. */
function deepestVisible(): Layer | null {
  if (lone) return nucleus
  const w = weights()
  // Across the empty scales the galaxy is out of sight: hold it still, so the
  // heart the camera is closing on does not drift away beneath it.
  if (nucleus && (w.n > 0 || fillOf("galaxy") > 8)) return nucleus
  if (w.g > 0 && galaxy) return galaxy
  return web
}

function screenHalf(view: View): number {
  return (0.5 * Math.min(view.w, view.h)) / view.scale
}

/** Build, keep or drop the branch under the camera. */
function manageStack(): void {
  if (lone || !web || !params || rw === 0) return

  // The galaxy.
  if (galaxy) {
    const v = viewOf("galaxy")
    const off = Math.hypot(v.x, v.y) - (Math.hypot(v.w, v.h) * 0.5) / v.scale > GALAXY_EXTENT * 1.3
    const stale = galaxy.epochKey !== web.epochKey
    if (fillOf("galaxy") < GALAXY_DROP_FILL || off || stale) dropGalaxy(stale)
  }
  if (!galaxy && !web.busy && !pendingGoto) {
    const v = camera.viewIn(0, rw, rh)
    const h = web.haloUnder(v.x, v.y, v.scale, autopilot?.halo ?? -1)
    if (h) {
      const fill = (v.scale * h.radius * GALAXY_EXTENT) / (0.5 * Math.min(rw, rh))
      if (fill >= GALAXY_BUILD_FILL) {
        if (galaxyCache && galaxyCache.haloId === h.id && galaxyCache.epochKey === web.epochKey) galaxy = galaxyCache
        else galaxy = new GalaxyLayer(web, h, { budget: Math.max(3000, params.nMass), seed: params.seed, order: params.order })
        galaxyCache = galaxy
        analysisDirty = true
      }
    }
  }

  // The black hole at the galaxy's heart.
  if (galaxy) {
    const v = viewOf("galaxy")
    const c = galaxy.centre()
    const near = Math.hypot(v.x - c.x, v.y - c.y) < Math.max(0.12, 0.8 * screenHalf(v))
    const fill = fillOf("galaxy")
    if (nucleus && (fill < NUCLEUS_DROP_FILL || !near)) dropNucleus()
    else if (!nucleus && fill >= NUCLEUS_BUILD_FILL && near) {
      const mass = Math.min(1e10, Math.max(1e5, galaxy.card.massSun * BH_FRACTION))
      nucleus = new NucleusLayer(mass, galaxy.portrait(PORTRAIT_SIZE, drawContext(0, true)))
      analysisDirty = true
    }
  }
  camera.normalise(rw, rh)
}

function dropNucleus(): void {
  const j = depthOf("nucleus")
  if (j >= 0 && camera.depth >= j) camera.moveTo(j - 1, rw, rh)
  nucleus = null
  analysisDirty = true
}

function dropGalaxy(forget: boolean): void {
  dropNucleus()
  const j = depthOf("galaxy")
  if (j >= 0 && camera.depth >= j) camera.moveTo(j - 1, rw, rh)
  galaxy = null
  if (forget) galaxyCache = null
  analysisDirty = true
}

// ---------------------------------------------------------------------------
// The camera
// ---------------------------------------------------------------------------

/** Where the camera is drawn while zooming in: the next anchor down, if any. */
function pullTarget(): { x: number; y: number; strength: number } | null {
  const kind = stack.layer(camera.depth)?.kind
  if (kind === "web" && web) {
    const v = camera.viewIn(camera.depth, rw, rh)
    const h = galaxy
      ? { x: galaxy.anchor.x, y: galaxy.anchor.y, radius: galaxy.anchor.unit }
      : web.haloUnder(v.x, v.y, v.scale, autopilot?.halo ?? -1)
    if (!h) return null
    const fill = (v.scale * h.radius * GALAXY_EXTENT) / (0.5 * Math.min(rw, rh))
    const strength = smoothstep(Math.log(0.04), Math.log(0.5), Math.log(fill))
    return { x: v.x + wrapPeriodic(h.x - v.x, 1), y: v.y + wrapPeriodic(h.y - v.y, 1), strength }
  }
  if (kind === "galaxy" && galaxy) {
    const c = galaxy.centre()
    return { x: c.x, y: c.y, strength: smoothstep(Math.log(1.6), Math.log(6), Math.log(fillOf("galaxy"))) }
  }
  if (kind === "nucleus" && nucleus && !lone) {
    // Arriving among the S-stars, settle on the hole; deeper in, pan freely.
    return { x: 0, y: 0, strength: 1 - smoothstep(Math.log(2), Math.log(20), Math.log(fillOf("nucleus"))) }
  }
  return null
}

/** True between the galaxy's finest structure and the hole's widest orbits. */
function inGap(): boolean {
  if (!galaxy || stack.layer(camera.depth)?.kind !== "galaxy") return false
  return fillOf("galaxy") > 8 && (!nucleus || fillOf("nucleus") < 0.3)
}

/**
 * Zoom about raster point (px, py). Zooming in near a halo, or into a galaxy,
 * draws the camera toward what lies beneath, so a descent stays on course;
 * across the empty scales between a galaxy and its hole it moves faster.
 */
function zoomCamera(pxIn: number, pyIn: number, factorIn: number): void {
  let px = pxIn
  let py = pyIn
  const factor = inGap() ? Math.pow(factorIn, GAP_BOOST) : factorIn
  if (factor > 1) {
    const pull = pullTarget()
    if (pull && pull.strength > 0) {
      const k = Math.min(1, pull.strength * (1 - 1 / factor) * 2.2)
      camera.x += (pull.x - camera.x) * k
      camera.y += (pull.y - camera.y) * k
      // Zoom about a point that slides to the screen centre as the pull takes hold.
      px += (rw * 0.5 - px) * pull.strength
      py += (rh * 0.5 - py) * pull.strength
    }
  }
  camera.zoomAt(px, py, factor, rw, rh)
  manageStack()
  clampZoom()
  cameraMoved = true
}

/** Hold the zoom inside what there is to see. */
function clampZoom(): void {
  limit = ""
  const kind = stack.layer(camera.depth)?.kind
  const fill = camera.fill(camera.depth, rw, rh)
  const hold = (f: number, why: string) => {
    camera.zoomAt(rw * 0.5, rh * 0.5, f / fill, rw, rh)
    limit = why
  }
  if (kind === "web") {
    if (fill < WEB_MIN_FILL) hold(WEB_MIN_FILL, "")
    else if (!galaxy && fill > WEB_MAX_FILL) hold(WEB_MAX_FILL, "No halo here: zoom into a ringed one to go deeper")
  } else if (kind === "galaxy" && !nucleus && fill > GALAXY_MAX_FILL) {
    hold(GALAXY_MAX_FILL, "Aim at the galaxy's heart to reach its black hole")
  } else if (kind === "nucleus") {
    const max = NUCLEUS_EXTENT / NUCLEUS_CLOSEST
    if (fill > max) hold(max, "")
    else if (lone && fill < 0.15) hold(0.15, "This black hole has no universe around it")
  }
}

/** Frame the camera's layer whole. */
function home(): void {
  const l = stack.layer(camera.depth)
  if (!l) return
  if (l === galaxy && galaxy) {
    const c = galaxy.centre()
    camera.x = c.x
    camera.y = c.y
  } else if (l === nucleus) {
    camera.x = 0
    camera.y = 0
  }
  camera.scale = (0.5 * Math.min(rw, rh)) / l.extent
  manageStack()
  cameraMoved = true
}

/** One frame of the autopilot. */
function fly(dt: number): void {
  const a = autopilot
  if (!a || rw === 0) return
  const step = Math.max(1 / 120, Math.min(0.05, dt))
  const boost = inGap() ? GAP_BOOST : 1
  const kindNow = stack.layer(camera.depth)?.kind
  if (a.dir === 1) {
    const pull = pullTarget()
    const k = 1 - Math.exp(-step * 7)
    if (pull) {
      camera.x += (pull.x - camera.x) * k
      camera.y += (pull.y - camera.y) * k
    } else if (kindNow === "nucleus") {
      camera.x -= camera.x * k
      camera.y -= camera.y * k
    }
    // Stop on arrival: a galaxy framed whole, or a hole's innermost orbits.
    const goal = a.target === "galaxy" ? 1 : NUCLEUS_EXTENT / NUCLEUS_ARRIVAL_HALF
    if (kindNow === a.target && camera.fill(camera.depth, rw, rh) >= goal) {
      autopilot = null
      return
    }
    const before = camera.scale
    camera.zoomAt(rw * 0.5, rh * 0.5, Math.exp(FLIGHT_RATE * step * boost), rw, rh)
    manageStack()
    clampZoom()
    // Held at a limit with nowhere deeper to go: stop rather than hover.
    if (limit && Math.abs(camera.scale / before - 1) < 1e-9) autopilot = null
  } else {
    if (kindNow === a.target && camera.fill(camera.depth, rw, rh) <= 1) {
      autopilot = null
      return
    }
    camera.zoomAt(rw * 0.5, rh * 0.5, Math.exp(-FLIGHT_RATE * step * boost), rw, rh)
    manageStack()
    clampZoom()
    if (limit) autopilot = null
  }
  cameraMoved = true
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function reset(): void {
  const p = params!
  galaxy = null
  galaxyCache = null
  nucleus = null
  autopilot = null
  web = null
  camera.depth = 0
  camera.x = 0
  camera.y = 0
  if (lone) {
    nucleus = new NucleusLayer(SGR_A_STAR, null)
    camera.scale = (0.5 * Math.max(1, Math.min(rw, rh))) / NUCLEUS_ARRIVAL_HALF
  } else {
    web = new WebLayer({
      seed: p.seed,
      grid: p.grid,
      meshSize: p.meshSize,
      ic: { cosmology: COSMOLOGIES[p.cosmology] ?? COSMOLOGIES.planck, darkMatter: p.darkMatter, amplitude: p.amplitude },
    })
    camera.scale = 0.5 * Math.max(1, Math.min(rw, rh))
  }
  clock = 0
  lastTick = 0
  lastAnalysis = -Infinity
  analysisDirty = true
  cameraMoved = true
}

function drawContext(dt: number, fading: boolean): DrawContext {
  const p = params!
  return { lens: p.lens, exposure: p.exposure, accent, events: p.events, trails: p.trails, dt, fading }
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function analyse(advancing: boolean): void {
  const p = params!
  const t0 = performance.now()
  const kind = stack.layer(camera.depth)?.kind
  const wantProbe = probeAt !== null && kind === "web"
  // The web measures itself whenever it is on screen: its hue lenses need it.
  if (web && (kind === "web" || weights().g < 1)) {
    const data = web.analyse(p.lens, advancing, p.instruments && kind === "web", wantProbe)
    if (data) ctx.postMessage({ t: "instruments", data })
  }
  if (galaxy && kind === "galaxy") {
    const data = galaxy.analyse(p.instruments)
    if (data) ctx.postMessage({ t: "instruments", data })
  }
  if (nucleus && kind === "nucleus" && p.instruments) ctx.postMessage({ t: "instruments", data: nucleus.instruments() })
  if (wantProbe) postProbe()
  stats.analysisMs = performance.now() - t0
}

function postProbe(): void {
  if (!probeAt || !web || rw === 0 || stack.layer(camera.depth)?.kind !== "web") {
    ctx.postMessage({ t: "probe", reading: null })
    return
  }
  const v = camera.viewIn(0, rw, rh)
  const x = wrapPeriodic(v.x + (probeAt.x - rw * 0.5) / v.scale, 1)
  const y = wrapPeriodic(v.y + (rh * 0.5 - probeAt.y) / v.scale, 1)
  const was = web.hover
  const reading = web.probe(x, y, v.scale, params!.lens)
  if (web.hover !== was) kick(true)
  ctx.postMessage({ t: "probe", reading })
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render(out: Uint32Array, dt: number): void {
  const w = weights()
  const n = rw * rh
  if (galaxyBuf.length !== n) galaxyBuf = new Uint32Array(n)
  if (nucleusBuf.length !== n) nucleusBuf = new Uint32Array(n)
  if (lone) {
    if (nucleus) nucleus.render(out, camera.viewIn(0, rw, rh), drawContext(dt, false))
    else out.fill(0xff000000)
    return
  }
  let drawn = false
  if (web && w.g < 1) {
    web.render(out, camera.viewIn(0, rw, rh), drawContext(dt, w.g > 0), w.g > 0 && galaxy ? galaxy.haloId : -1)
    drawn = true
  }
  if (galaxy && w.g > 0 && w.n < 1) {
    const v = viewOf("galaxy")
    const target = drawn ? galaxyBuf : out
    galaxy.render(target, v, drawContext(dt, w.g < 1 || w.n > 0))
    // Deep in the core the galaxy's own particles have streamed past; its
    // nucleus is a point of light until the hole resolves.
    const beacon = smoothstep(Math.log(2.5), Math.log(25), Math.log(fillOf("galaxy"))) * (1 - w.n)
    if (beacon > 0) {
      const c = galaxy.centre()
      const sx = rw * 0.5 + (c.x - v.x) * v.scale
      const sy = rh * 0.5 - (c.y - v.y) * v.scale
      sprite({ out: target, w: rw, h: rh }, sx, sy, 3 + 5 * beacon, 255 * beacon, 236 * beacon, 205 * beacon)
    }
    if (drawn) blend(out, galaxyBuf, w.g)
    drawn = true
  }
  if (nucleus && w.n > 0) {
    const target = drawn ? nucleusBuf : out
    nucleus.render(target, viewOf("nucleus"), drawContext(dt, w.n < 1))
    if (drawn) blend(out, nucleusBuf, w.n)
    drawn = true
  }
  if (!drawn) out.fill(0xff000000)
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

const stats: SimStats = {
  stepMs: 0, drawMs: 0, analysisMs: 0, cells: 0, depth: 0, nearPairs: 0, translations: 0, speedup: 1,
  solver: "pm", particles: 0, peakCellMass: 0,
  cosmological: false, a: 1, z: 0, time: 0, growth: 1, epoch: "", done: false, quasars: 0, bursts: 0,
  level: "web", stack: ["web"], running: "web", focus: null, holeMass: null,
  galaxyTime: 0, galaxyMyr: 0, holeTime: 0, holeSeconds: 0,
  kpcPerPx: 0, comoving: true, moving: false, lone: false, limit: "",
}

function reportFault(error: unknown): void {
  faulted = true
  scheduled = false
  const message = error instanceof Error ? error.message : String(error)
  ctx.postMessage({ t: "fault", message: `Simulation paused: ${message}` })
}

function tick(): void {
  try {
    runTick()
  } catch (error) {
    reportFault(error)
  }
}

/** The web has reached today and nothing deeper is on screen: nothing to run. */
function idleWeb(): boolean {
  return !!web && web.finished && deepestVisible() === web
}

function runTick(): void {
  scheduled = false
  if (!running || !params || (!web && !nucleus) || pool.length === 0 || rw === 0) return

  const now = performance.now()
  const flying = autopilot !== null
  const advancing = params.substeps > 0 && !idleWeb()
  const wallDt = lastTick ? Math.min(0.25, (now - lastTick) / 1000) : 1 / 60
  lastTick = advancing || flying || pendingGoto || web?.busy ? now : 0
  const dtSec = advancing ? wallDt : 0
  if (advancing) clock += dtSec
  renderRequested = false

  const t0 = performance.now()
  if (web && web.busy && !pendingGoto) {
    web.catchUp(90)
    analysisDirty = true
  } else if (web && pendingGoto) {
    // Deep link: run the web on to the linked epoch, then fly down.
    const want = 1 / (1 + Math.max(0, pendingGoto.z))
    if (!web.busy && web.cosmos.a < want && !web.cosmos.done) web.seek(want)
    // Nobody is watching the web closely while it fast-forwards: spend the
    // frame on physics, not on pictures.
    if (web.catchUp(350)) {
      if (web.catalogue.length === 0) web.refreshCatalogue()
      const dest = pendingGoto
      const h = web.catalogue.find((k) => k.members.includes(dest.halo)) ?? web.catalogue[0]
      pendingGoto = null
      if (h) {
        camera.moveTo(0, rw, rh)
        camera.x = h.x
        camera.y = h.y
        camera.scale = Math.max(camera.scale, 0.5 * Math.min(rw, rh) * 1.6)
        autopilot = { dir: 1, target: dest.nucleus ? "nucleus" : "galaxy", halo: h.id }
      }
      analysisDirty = true
    }
  } else if (advancing) {
    const layer = deepestVisible()
    // Once a galaxy is built under the camera the web holds still, even before
    // the galaxy fades in: the halo it was cut from must not move on (or be
    // renamed by the next catalogue) while the camera closes in on it.
    const held = layer === web && (galaxy !== null || autopilot?.dir === 1)
    if (layer && !held) layer.step(dtSec, params.substeps, camera.viewIn(depthOf(layer.kind), rw, rh))
  }
  if (flying) fly(wallDt)
  else manageStack()
  const t1 = performance.now()

  if (analysisDirty || (advancing && clock - lastAnalysis >= ANALYSIS_PERIOD)) {
    analysisDirty = false
    lastAnalysis = clock
    analyse(advancing)
  }

  if (cameraMoved) {
    galaxy?.clearTrails()
    cameraMoved = false
  }
  const buf = pool.pop()!
  const out = new Uint32Array(buf)
  const t2 = performance.now()
  render(out, dtSec)
  const t3 = performance.now()

  if (advancing || stats.stepMs === 0) stats.stepMs = t1 - t0
  stats.drawMs = t3 - t2
  fillStats()
  ctx.postMessage({ t: "frame", buf, w: rw, h: rh, stats: { ...stats } }, [buf])
  kick()
}

function fillStats(): void {
  const layer = stack.layer(camera.depth)
  const view = camera.viewIn(camera.depth, rw, rh)
  stats.level = layer?.kind ?? "web"
  stats.stack = layers().map((l) => l.kind)
  stats.running = deepestVisible()?.kind ?? "web"
  stats.focus = galaxy ? galaxy.card : null
  stats.holeMass = nucleus ? nucleus.massSun : null
  stats.galaxyTime = galaxy ? galaxy.uni.time : 0
  stats.galaxyMyr = galaxy ? galaxy.units.myr : 0
  stats.holeTime = nucleus ? nucleus.time : 0
  stats.holeSeconds = nucleus ? nucleus.units.myr * 3.156e13 : 0
  stats.kpcPerPx = layer ? layer.units.kpc / view.scale : 0
  stats.comoving = layer?.kind === "web"
  stats.moving = autopilot !== null || pendingGoto !== null || !!web?.busy
  stats.lone = lone
  stats.limit = limit
  if (web) {
    const c = web.cosmos
    stats.cosmological = true
    stats.a = web.aShow
    stats.z = 1 / web.aShow - 1
    stats.time = c.history.ageAt(web.aShow)
    stats.growth = c.history.growth(web.aShow)
    stats.done = web.finished
    stats.epoch = stats.done ? "today" : c.epochAt(web.aShow)
    stats.quasars = web.events.quasarCount
    stats.bursts = web.events.total
    if (layer === web) {
      const pm = c.pm.stats
      stats.solver = "pm"
      stats.cells = pm.cells
      stats.depth = Math.log2(c.pm.size)
      stats.nearPairs = 0
      stats.translations = pm.fftOps
      stats.speedup = (c.n * (c.n - 1)) / Math.max(1, c.n * 10 + pm.fftOps)
      stats.particles = c.n
      stats.peakCellMass = pm.peakCellMass
    }
  } else {
    stats.cosmological = false
  }
  if (layer === galaxy && galaxy) {
    const u = galaxy.uni
    stats.solver = "fmm"
    stats.cells = u.stats.cells
    stats.depth = u.stats.depth
    stats.nearPairs = u.stats.nearPairs
    stats.translations = u.stats.translations
    stats.speedup = u.stats.speedup
    stats.particles = u.nMass
    stats.peakCellMass = u.stats.peakCellMass
    stats.quasars = galaxy.events.quasarCount
  } else if (layer === nucleus && nucleus) {
    stats.solver = "geodesic"
    stats.particles = nucleus.bodies.length
    stats.cells = 0
    stats.depth = 0
    stats.nearPairs = 0
    stats.translations = 0
    stats.speedup = 1
    stats.peakCellMass = 0
  }
}

function kick(force = false): void {
  if (force) renderRequested = true
  if (scheduled || !running || faulted || pool.length === 0 || rw === 0) return
  const busy = autopilot !== null || pendingGoto !== null || !!web?.busy
  const advancing = (params?.substeps ?? 0) > 0 && !idleWeb()
  if (!renderRequested && !busy && !advancing) return
  scheduled = true
  setTimeout(tick, 0)
}

function resize(w: number, h: number): void {
  if (rw > 0 && rh > 0) {
    // Keep what is on screen: scale with the shorter side.
    camera.scale *= Math.min(w, h) / Math.min(rw, rh)
  } else {
    // The world was set up before the raster had a size.
    const l = stack.layer(camera.depth)
    if (l) camera.scale = (0.5 * Math.min(w, h)) / (l === nucleus ? NUCLEUS_ARRIVAL_HALF : l.extent)
  }
  rw = w
  rh = h
  pool.length = 0
  pool.push(new ArrayBuffer(w * h * 4), new ArrayBuffer(w * h * 4))
  cameraMoved = true
  kick(true)
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

function rasterIn(kind: LevelName, at: { x: number; y: number }): { x: number; y: number; view: View } {
  const view = viewOf(kind)
  return { x: view.x + (at.x - rw * 0.5) / view.scale, y: view.y + (rh * 0.5 - at.y) / view.scale, view }
}

function onClick(at: { x: number; y: number }): void {
  autopilot = null
  const kind = stack.layer(camera.depth)?.kind
  if (kind === "web" && web) {
    const p = rasterIn("web", at)
    const h = web.haloAt(wrapPeriodic(p.x, 1), wrapPeriodic(p.y, 1), p.view.scale)
    if (h) autopilot = { dir: 1, target: "galaxy", halo: h.id }
  } else if (kind === "galaxy" && galaxy) {
    const v = viewOf("galaxy")
    const c = galaxy.centre()
    const sx = rw * 0.5 + (c.x - v.x) * v.scale
    const sy = rh * 0.5 - (c.y - v.y) * v.scale
    if (Math.hypot(at.x - sx, at.y - sy) < Math.max(28, Math.min(rw, rh) * 0.07)) {
      autopilot = { dir: 1, target: "nucleus", halo: galaxy.haloId }
    }
  } else if (kind === "nucleus" && nucleus) {
    const p = rasterIn("nucleus", at)
    const k = nucleus.pick(p.x, p.y, 10 / p.view.scale)
    if (k >= 0) nucleus.selected = k
    else nucleus.launch(p.x, p.y, 0, 0)
    analysisDirty = true
  }
}

ctx.addEventListener("message", (e: MessageEvent<ToWorker>) => {
  const msg = e.data
  try {
    switch (msg.t) {
      case "start":
        params = { ...msg.params }
        accent = msg.accent
        lone = !!msg.lone
        faulted = false
        reset()
        pendingGoto = msg.destination && !lone ? msg.destination : null
        running = true
        ctx.postMessage({ t: "ready" })
        kick(true)
        break

      case "params": {
        if (!params) return
        const prev = params
        params = { ...params, ...msg.params }
        const structural =
          msg.reseed ||
          params.seed !== prev.seed ||
          params.grid !== prev.grid ||
          params.meshSize !== prev.meshSize ||
          params.cosmology !== prev.cosmology ||
          params.darkMatter !== prev.darkMatter ||
          params.amplitude !== prev.amplitude
        if (structural) {
          faulted = false
          reset()
        } else {
          if ((params.nMass !== prev.nMass || params.order !== prev.order) && galaxy) dropGalaxy(true)
          if (params.lens !== prev.lens) {
            galaxy?.clearTrails()
            analysisDirty = true
          }
          if (params.instruments && !prev.instruments) analysisDirty = true
        }
        kick(true)
        break
      }

      case "replay":
        if (params) {
          faulted = false
          reset()
        }
        kick(true)
        break

      case "pan":
        autopilot = null
        camera.pan(msg.dx, msg.dy)
        manageStack()
        cameraMoved = true
        kick(true)
        break

      case "zoom":
        autopilot = null
        zoomCamera(msg.at.x, msg.at.y, msg.factor)
        kick(true)
        break

      case "home":
        autopilot = null
        home()
        kick(true)
        break

      case "accent":
        accent = msg.accent
        kick(true)
        break

      case "probe": {
        const was = probeAt !== null
        probeAt = msg.at
        if (!probeAt) {
          if (web) web.hover = -1
          ctx.postMessage({ t: "probe", reading: null })
          kick(true)
        } else if (!was && web && !web.probeFieldsReady) {
          analysisDirty = true
          kick(true)
        } else postProbe()
        break
      }

      case "click":
        onClick(msg.at)
        kick(true)
        break

      case "launch": {
        if (!nucleus || stack.layer(camera.depth) !== nucleus) break
        const from = rasterIn("nucleus", msg.from)
        const to = rasterIn("nucleus", msg.to)
        const r = Math.max(1, Math.hypot(from.x, from.y))
        // Dragging half the radius throws at the local circular speed.
        nucleus.launch(from.x, from.y, (to.x - from.x) / (0.5 * r), (to.y - from.y) / (0.5 * r))
        analysisDirty = true
        kick(true)
        break
      }

      case "ascend": {
        const here = camera.depth
        const target = msg.to ?? stack.layer(Math.max(0, here - 1))?.kind
        if (target && (depthOf(target) < here || camera.fill(here, rw, rh) > 1)) {
          autopilot = { dir: -1, target, halo: -1 }
        }
        kick(true)
        break
      }

      case "seek":
        if (web && stack.layer(camera.depth) === web) {
          if (galaxy) dropGalaxy(true)
          web.seek(msg.a)
          analysisDirty = true
        }
        kick(true)
        break

      case "goto":
        if (web && !lone) {
          if (galaxy) dropGalaxy(true)
          camera.moveTo(0, rw, rh)
          pendingGoto = msg.destination
        }
        kick(true)
        break

      case "resize":
        if (msg.w > 0 && msg.h > 0 && (msg.w !== rw || msg.h !== rh)) resize(msg.w, msg.h)
        break

      case "recycle":
        if (msg.buf.byteLength === rw * rh * 4) pool.push(msg.buf)
        kick()
        break

      case "stop":
        running = false
        break
    }
  } catch (error) {
    reportFault(error)
  }
})
