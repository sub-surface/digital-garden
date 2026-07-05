/**
 * Apparatus (composer) core invariants — the pure pipeline must be deterministic
 * and well-formed for every seed. Runs the grammar → layout → realize → render
 * pipeline over many seeds and checks:
 *  - determinism: same (seed, salt) → byte-identical IR and identical SVG
 *  - slot-fill validity: every node's motif is registered; per-slot counts are
 *    within the armature's declared bounds; boxes stay inside the plate
 *  - anchor resolution: every node has finite anchors inside plate-space 0..1
 *  - pens are semantic: re-skinning the palette preserves geometry exactly
 *  - render + structural round-trip don't throw and are stable
 */
import { generate } from "../src/lib/composer/generate"
import { renderSVG } from "../src/lib/composer/render/svg"
import { MOTIFS } from "../src/lib/composer/motifs"
import { getArmature } from "../src/lib/composer/armatures"
import { PALETTES } from "../src/lib/composer/pens"
import { ERAS, eraPaletteRGB } from "../src/lib/composer/eras"
import { ditherToPalette, hexToRgb, type DitherMethod } from "../src/lib/composer/render/dither"
import { encodePlate, decodePlate } from "../src/lib/composer/serialize"
import { PEN_ROLES, type Plate } from "../src/lib/composer/types"

let failures = 0
const fail = (msg: string) => {
  console.error(`FAIL ${msg}`)
  failures++
}

const MOTIF_KEYS = new Set(MOTIFS.map((m) => m.key))
const ROLES = new Set(PEN_ROLES)
const MARGIN_EPS = 1e-6
const inUnit = (v: number) => Number.isFinite(v) && v >= -MARGIN_EPS && v <= 1 + MARGIN_EPS

const SEEDS = 400

for (let s = 0; s < SEEDS; s++) {
  const seed = `plate-${s}`
  const salt = s % 4
  const plate = generate({ seed, salt })

  // 1. Determinism — identical IR + SVG on regeneration.
  const again = generate({ seed, salt })
  if (JSON.stringify(plate) !== JSON.stringify(again)) fail(`${seed}: IR not deterministic`)
  if (renderSVG(plate) !== renderSVG(again)) fail(`${seed}: SVG not deterministic`)

  // 2. Slot-fill validity.
  const armature = getArmature(plate.archetype)
  if (!armature) {
    fail(`${seed}: unknown archetype ${plate.archetype}`)
    continue
  }
  const perSlot = new Map<string, number>()
  for (const node of plate.nodes) {
    if (!MOTIF_KEYS.has(node.motif)) fail(`${seed}: unregistered motif ${node.motif}`)
    if (!ROLES.has(node.penRole)) fail(`${seed}: bad penRole ${node.penRole}`)
    if (!(node.seed > 0)) fail(`${seed}: node ${node.id} has no sub-seed`)
    const { x, y, w, h } = node.box
    if (!(inUnit(x) && inUnit(y) && inUnit(x + w) && inUnit(y + h) && w > 0 && h > 0)) {
      fail(`${seed}: node ${node.id} box out of plate: ${JSON.stringify(node.box)}`)
    }
    const slotId = node.id.replace(/-\d+$/, "")
    perSlot.set(slotId, (perSlot.get(slotId) ?? 0) + 1)

    // 3. Anchor resolution.
    if (!Array.isArray(node.anchors)) fail(`${seed}: node ${node.id} anchors not an array`)
    for (const a of node.anchors) {
      if (!inUnit(a.x) || !inUnit(a.y)) fail(`${seed}: node ${node.id} anchor ${a.id} off-plate (${a.x},${a.y})`)
    }
  }
  for (const slot of armature.slots) {
    const count = perSlot.get(slot.id) ?? 0
    if (count < slot.count[0] || count > slot.count[1]) {
      fail(`${seed}: slot ${slot.id} filled ${count}, expected ${slot.count[0]}..${slot.count[1]}`)
    }
  }

  // 5. Render + structural round-trip.
  const svg = renderSVG(plate)
  if (!svg.startsWith("<svg") || svg.length < 100) fail(`${seed}: SVG looks empty`)
  const round = JSON.parse(JSON.stringify(plate)) as Plate
  if (JSON.stringify(round) !== JSON.stringify(plate)) fail(`${seed}: JSON round-trip drift`)
}

// 4. Pens are semantic — re-skinning the palette must not move any geometry.
for (let s = 0; s < 60; s++) {
  const base = generate({ seed: `skin-${s}`, salt: 0, paletteId: PALETTES[0].id })
  const reskin = generate({ seed: `skin-${s}`, salt: 0, paletteId: PALETTES[1].id })
  const geom = (p: Plate) => JSON.stringify({ nodes: p.nodes, apparatus: p.apparatus, connectors: p.connectors })
  if (geom(base) !== geom(reskin)) fail(`skin-${s}: palette change altered geometry`)
  if (base.palette.id === reskin.palette.id) fail(`skin-${s}: palette did not change`)
}

// 8. Forcing an archetype pins it.
const forced = generate({ seed: "forced", salt: 0, archetype: "centered-radial" })
if (forced.archetype !== "centered-radial") fail("archetype override ignored")

// 8c. Permalink round-trip — decode(encode(p)) reproduces the plate exactly.
for (let s = 0; s < 80; s++) {
  const p = generate({ seed: `code-${s}`, salt: s % 3, ratio: s % 2 ? [4, 5] : [1, 1] })
  const back = decodePlate(encodePlate(p))
  if (!back) fail(`code-${s}: decode returned null`)
  else if (JSON.stringify(back) !== JSON.stringify(p)) fail(`code-${s}: permalink round-trip drift`)
}
if (decodePlate("not a real code") !== null) fail("decode should reject garbage")

// 8b. Lock preservation — a locked node survives regeneration verbatim, and the
// rest re-roll (the "pin the good bits, shake the rest" contract).
for (let s = 0; s < 40; s++) {
  const base = generate({ seed: `lock-${s}`, salt: 0 })
  const locked = { ...base.nodes[0], locked: true }
  // Regeneration pins the archetype so locked slots still exist (a new salt can
  // otherwise pick a different armature).
  const regen = generate({ seed: `lock-${s}`, salt: 1, archetype: base.archetype, keep: { nodes: [locked] } })
  const found = regen.nodes.find((n) => n.id === locked.id)
  if (!found) fail(`lock-${s}: locked node vanished after regenerate`)
  else if (JSON.stringify(found.box) !== JSON.stringify(locked.box) || found.seed !== locked.seed) {
    fail(`lock-${s}: locked node not preserved verbatim`)
  }
  // every fresh node must still sit inside the plate
  for (const n of regen.nodes) {
    if (!(inUnit(n.box.x) && inUnit(n.box.y) && inUnit(n.box.x + n.box.w) && inUnit(n.box.y + n.box.h))) {
      fail(`lock-${s}: regenerated node ${n.id} escaped the plate`)
      break
    }
  }
}

// 9. Era registry is well-formed; dither maps every pixel onto the device palette.
const methods: DitherMethod[] = ["none", "bayer2", "bayer4", "bayer8", "atkinson", "floyd", "bluenoise"]
for (const era of ERAS) {
  if (era.resolution <= 0) fail(`era ${era.id}: bad resolution`)
  if (!era.vector && era.palette.length < 2) fail(`era ${era.id}: device era needs ≥2 colours`)
  for (const hex of era.palette) {
    const [r, g, b] = hexToRgb(hex)
    if (![r, g, b].every((v) => v >= 0 && v <= 255)) fail(`era ${era.id}: bad hex ${hex}`)
  }
}
for (const method of methods) {
  for (const pal of [ERAS[1], ERAS[4]]) {
    // gradient buffer → dither → assert closure onto the palette
    const w = 24
    const h = 24
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      const v = (i % w) * (255 / w)
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v
      data[i * 4 + 3] = 255
    }
    const rgb = eraPaletteRGB(pal)
    ditherToPalette(data, w, h, rgb, method)
    const set = new Set(rgb.map((c) => c.join(",")))
    for (let i = 0; i < w * h; i++) {
      const key = `${data[i * 4]},${data[i * 4 + 1]},${data[i * 4 + 2]}`
      if (!set.has(key)) {
        fail(`dither ${method}/${pal.id}: pixel ${key} not in palette`)
        break
      }
    }
  }
}

if (failures > 0) {
  console.error(`${failures} composer core failure(s)`)
  process.exit(1)
}
console.log(`Apparatus core: ${SEEDS} plates — deterministic IR + SVG, valid slots/boxes/anchors, semantic pens.`)
