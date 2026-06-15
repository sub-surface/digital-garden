/**
 * Seed resolution and validation.
 * Converts URL parameters, localStorage, and random generation into stable 32-bit seeds.
 */

import type { ResolvedSeed } from "./bootTypes"

const NON_ZERO_FALLBACK = 0x6d2b79f5

/**
 * Generate a cryptographically random 32-bit seed.
 */
export function randomSeed(): number {
  const value = new Uint32Array(1)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(value)
  } else {
    // Fallback for older browsers
    value[0] = Math.floor(Math.random() * 0x1_0000_0000)
  }
  return value[0] || NON_ZERO_FALLBACK
}

/**
 * Parse a seed from various input formats.
 */
export function parseSeed(input: string | null): number | null {
  if (!input || input.trim() === "") return null

  const trimmed = input.trim()

  // Try decimal
  if (/^\d+$/.test(trimmed)) {
    const parsed = parseInt(trimmed, 10)
    if (!isNaN(parsed)) {
      return parsed >>> 0
    }
  }

  // Try hex with 0x prefix
  if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
    const parsed = parseInt(trimmed, 16)
    if (!isNaN(parsed)) {
      return parsed >>> 0
    }
  }

  // Try hash a text seed
  if (trimmed && trimmed !== "random") {
    return hashString(trimmed) >>> 0
  }

  return null
}

/**
 * FNV-1a hash for string→number conversion.
 */
export function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * Mix a seed with a label to create a derived, independent seed.
 */
export function mixSeed(seed: number, label: string): number {
  let x = ((seed >>> 0) ^ hashString(label)) >>> 0
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d)
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b)
  x ^= x >>> 16
  return x >>> 0
}

/**
 * Format a seed for display/URL.
 */
export function formatSeed(seed: number): string {
  return `0x${(seed >>> 0).toString(16).toUpperCase().padStart(8, "0")}`
}

/**
 * Resolve the active seed from URL parameters, localStorage, or generate new.
 * Updates the URL with the resolved seed if needed.
 */
export function resolveSeed(): ResolvedSeed {
  const params = new URLSearchParams(window.location.search)
  const seedParam = params.get("seed")

  let resolved: number | null = null
  let source = "unknown"

  // 1. Try URL parameter
  if (seedParam) {
    if (seedParam === "random") {
      resolved = randomSeed()
      source = "generated"
    } else {
      resolved = parseSeed(seedParam)
      if (resolved !== null) {
        source = "url"
      }
    }
  }

  // 2. Try localStorage
  if (resolved === null) {
    const stored = localStorage.getItem("bootSeed")
    if (stored) {
      resolved = parseSeed(stored)
      if (resolved !== null) {
        source = "stored"
      }
    }
  }

  // 3. Generate new
  if (resolved === null) {
    resolved = randomSeed()
    source = "generated"
  }

  // Ensure non-zero
  if (resolved === 0) {
    resolved = NON_ZERO_FALLBACK
    source = "fallback"
  }

  // Normalize to unsigned 32-bit
  resolved = resolved >>> 0

  // Store and update URL if needed
  localStorage.setItem("bootSeed", resolved.toString())
  const display = formatSeed(resolved)
  
  if (source === "generated" || (source === "url" && seedParam !== display)) {
    const newParams = new URLSearchParams(window.location.search)
    newParams.set("seed", display)
    const newUrl = `${window.location.pathname}?${newParams.toString()}`
    window.history.replaceState({}, "", newUrl)
  }

  return {
    source,
    value: resolved,
    display,
  }
}
