/**
 * Seed parsing, persistence and canonical URL helpers.
 */

import type {
  ResolvedSeed,
  ResolvedSeedSource,
} from "./bootTypes"

const STORAGE_KEY = "bootSeed"
const UINT32_MAX = 0xffff_ffff
const NON_ZERO_FALLBACK = 0x6d2b79f5

function hasWindow(): boolean {
  return typeof window !== "undefined"
}

function safeReadStoredSeed(): string | null {
  if (!hasWindow()) return null
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function safeStoreSeed(seed: number): void {
  if (!hasWindow()) return
  try {
    window.localStorage.setItem(STORAGE_KEY, String(seed >>> 0))
  } catch {
    // Storage can be unavailable in private browsing or sandboxed contexts.
  }
}

export function randomSeed(): number {
  const values = new Uint32Array(1)
  const cryptoApi = globalThis.crypto

  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(values)
  } else {
    values[0] = Math.floor(Math.random() * 0x1_0000_0000)
  }

  return values[0] || NON_ZERO_FALLBACK
}

/** Stable FNV-1a hash for human-readable text seeds. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Avalanche a root seed with a label to derive an independent sub-seed. */
export function mixSeed(seed: number, label: string): number {
  let mixed = ((seed >>> 0) ^ hashString(label)) >>> 0
  mixed ^= mixed >>> 16
  mixed = Math.imul(mixed, 0x7feb352d)
  mixed ^= mixed >>> 15
  mixed = Math.imul(mixed, 0x846ca68b)
  mixed ^= mixed >>> 16
  return mixed >>> 0
}

/**
 * Parse decimal, 0x-prefixed hexadecimal, or named text seeds.
 * Numeric inputs outside the unsigned 32-bit range are rejected.
 */
export function parseSeed(input: string | null): number | null {
  if (input === null) return null

  const trimmed = input.trim()
  if (trimmed === "") return null
  if (trimmed.toLowerCase() === "random") return null

  if (/^\d+$/.test(trimmed)) {
    const parsed = Number(trimmed)
    if (
      Number.isSafeInteger(parsed) &&
      parsed >= 0 &&
      parsed <= UINT32_MAX
    ) {
      return parsed >>> 0
    }
    return null
  }

  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    const hexDigits = trimmed.slice(2)
    if (hexDigits.length > 8) return null
    const parsed = Number.parseInt(hexDigits, 16)
    return Number.isFinite(parsed) ? parsed >>> 0 : null
  }

  return hashString(trimmed)
}

export function normalizeSeed(seed: number): number {
  const normalized = seed >>> 0
  return normalized || NON_ZERO_FALLBACK
}

export function formatSeed(seed: number): string {
  return `0x${normalizeSeed(seed)
    .toString(16)
    .toUpperCase()
    .padStart(8, "0")}`
}

function writeCanonicalUrl(
  seed: number,
  historyMode: "replace" | "push" = "replace",
): void {
  if (!hasWindow()) return

  const url = new URL(window.location.href)
  url.searchParams.set("seed", formatSeed(seed))
  const relativeUrl = `${url.pathname}${url.search}${url.hash}`

  try {
    if (historyMode === "push") {
      window.history.pushState({}, "", relativeUrl)
    } else {
      window.history.replaceState({}, "", relativeUrl)
    }
  } catch {
    // The page still works if history mutation is blocked.
  }
}

export function persistResolvedSeed(
  seed: number,
  source: ResolvedSeedSource = "generated",
  historyMode: "replace" | "push" = "replace",
): ResolvedSeed {
  const value = normalizeSeed(seed)
  safeStoreSeed(value)
  writeCanonicalUrl(value, historyMode)
  return { source, value, display: formatSeed(value) }
}

export interface BootPalette {
  name: string
  /** Accent colour applied to the boot terminal for this seed. */
  accent: string
}

/**
 * One of four ambient palettes, chosen deterministically from the seed. Only
 * the terminal accent is recoloured; the OLED-dark base stays constant so the
 * page never clashes with the rest of the site.
 */
export const BOOT_PALETTES: readonly BootPalette[] = [
  { name: "phosphor", accent: "#8ef0a7" },
  { name: "amber", accent: "#ffc66d" },
  { name: "ice", accent: "#8ed7e8" },
  { name: "violet", accent: "#d2a3e8" },
  { name: "temple", accent: "#55ffff" },
]

export function paletteForSeed(seed: number): BootPalette {
  const index = mixSeed(seed, "palette") % BOOT_PALETTES.length
  return BOOT_PALETTES[index]
}

export function canonicalSeedUrl(seed: number): string {
  const display = formatSeed(seed)
  if (!hasWindow()) return `/boot?seed=${encodeURIComponent(display)}`

  const url = new URL(window.location.href)
  url.searchParams.set("seed", display)
  return url.toString()
}

/**
 * Resolve URL -> storage -> generated seed, then canonicalise the URL.
 * An explicit but invalid URL seed generates a fresh seed instead of silently
 * falling back to a previous browser session.
 */
export function resolveSeed(): ResolvedSeed {
  if (!hasWindow()) {
    const value = NON_ZERO_FALLBACK
    return { source: "fallback", value, display: formatSeed(value) }
  }

  const params = new URLSearchParams(window.location.search)
  const hasSeedParam = params.has("seed")
  const seedParam = params.get("seed")

  let source: ResolvedSeedSource
  let value: number | null = null

  if (hasSeedParam) {
    if (seedParam?.trim().toLowerCase() === "random") {
      value = randomSeed()
      source = "generated"
    } else {
      value = parseSeed(seedParam)
      source = value === null ? "generated" : "url"
      if (value === null) value = randomSeed()
    }
  } else {
    const stored = parseSeed(safeReadStoredSeed())
    if (stored !== null) {
      value = stored
      source = "stored"
    } else {
      value = randomSeed()
      source = "generated"
    }
  }

  return persistResolvedSeed(value, source, "replace")
}
