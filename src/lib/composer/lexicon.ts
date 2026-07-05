/**
 * Lexicon — a small generative vocabulary that dresses anchors and apparatus and
 * carries the mood far more than any single motif: roman numerals, greek letters,
 * catalog codes, invented SI-ish units, plate numbers, pseudo-coordinates, short
 * captions. Themed per armature vibe so `cartographic` plates read survey-ish and
 * `mystical` plates read grimoire-ish.
 *
 * (On-screen/raster label text renders with the mono `text` prim; the Hershey
 * single-stroke path — plotter-correct — arrives with the plotter export in M5.
 * Asemic captions use the per-seed alphabet, also M5.)
 */

import type { Rng } from "./types"
import { ri, pick, chance } from "./rng"

const GREEK = "αβγδεζηθλμνξπρστφχψω".split("")
const GREEK_UP = "ΓΔΘΛΞΠΣΦΨΩ".split("")
const UNIT_SYM = ["kп", "Δs", "grd", "kт", "∮", "ourab", "vln", "℧", "qr", "æ"]

// Themed prefixes for catalog codes.
const PREFIX: Record<string, string[]> = {
  mystical: ["SIG.", "ARC.", "GRIM.", "OP.", "SEAL"],
  occult: ["SIG.", "ARC.", "OP.", "HEX.", "SEAL"],
  astronomical: ["OBS.", "MAG.", "DECL.", "R.A.", "EPH."],
  cartographic: ["SHT.", "SECT.", "SURV.", "QUAD.", "MER."],
  schematic: ["FIG.", "REF.", "ASSY.", "PART", "REV."],
  manuscript: ["FOL.", "GATH.", "RUB.", "CAP.", "MS."],
}

// Themed caption word pools.
const WORDS: Record<string, string[]> = {
  mystical: ["sub rosa", "anno", "opus magnum", "solve et coagula", "per speculum", "arcanum"],
  occult: ["sub rosa", "sigillum", "vinculum", "nox", "per umbram", "clavis"],
  astronomical: ["ad astra", "declination", "meridian", "aphelion", "syzygy", "ecliptic"],
  cartographic: ["surveyed", "rectified", "triangulated", "datum", "true north", "sounded"],
  schematic: ["assembled", "tolerance", "exploded", "cf. plate", "nominal", "revised"],
  manuscript: ["scriptum", "illuminatum", "in folio", "colophon", "explicit", "quire"],
}

const DEFAULT_VIBE = "schematic"

function vibeKey(vibe: string[] | undefined): string {
  if (vibe) for (const v of vibe) if (PREFIX[v]) return v
  return DEFAULT_VIBE
}

export function romanNumeral(n: number): string {
  if (n <= 0) return "N"
  const table: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ]
  let out = ""
  let v = n
  for (const [val, sym] of table) {
    while (v >= val) {
      out += sym
      v -= val
    }
  }
  return out
}

export function greekLetter(rng: Rng, upper = false): string {
  return pick(rng, upper ? GREEK_UP : GREEK)
}

export function plateNumber(rng: Rng): string {
  return `PL. ${romanNumeral(ri(rng, 1, 88))}`
}

export function catalogCode(rng: Rng, vibe?: string[]): string {
  const prefix = pick(rng, PREFIX[vibeKey(vibe)])
  const num = chance(rng, 0.6) ? romanNumeral(ri(rng, 1, 40)) : String(ri(rng, 1, 99))
  const suffix = chance(rng, 0.5) ? `·${pick(rng, "abcdfgh".split(""))}${chance(rng, 0.3) ? String(ri(rng, 1, 9)) : ""}` : ""
  return `${prefix} ${num}${suffix}`
}

export function unit(rng: Rng): string {
  const val = (ri(rng, 1, 99) / 10).toFixed(1)
  return `${val} ${pick(rng, UNIT_SYM)}`
}

export function coord(rng: Rng): string {
  const lat = `${ri(rng, 0, 89)}°${String(ri(rng, 0, 59)).padStart(2, "0")}′${pick(rng, ["N", "S"])}`
  const lon = `${ri(rng, 0, 179)}°${String(ri(rng, 0, 59)).padStart(2, "0")}′${pick(rng, ["E", "W"])}`
  return `${lat} ${lon}`
}

export function caption(rng: Rng, vibe?: string[]): string {
  const pool = WORDS[vibeKey(vibe)]
  const a = pick(rng, pool)
  return chance(rng, 0.5) ? `${a} · ${pick(rng, pool)}` : a
}

export function legendEntries(rng: Rng, n: number, vibe?: string[]): { key: string; term: string }[] {
  const out: { key: string; term: string }[] = []
  for (let i = 0; i < n; i++) {
    out.push({
      key: chance(rng, 0.5) ? romanNumeral(i + 1) : String(i + 1),
      term: chance(rng, 0.4) ? `${greekLetter(rng, true)}·${unit(rng)}` : catalogCode(rng, vibe),
    })
  }
  return out
}
