/**
 * Slug semantics — the single source of truth for how note identifiers are
 * normalised and resolved, shared by the SPA, the Cloudflare Worker, and
 * scripts/prebuild.ts (all three used to reimplement this independently;
 * scripts/test-slugs.mjs exists because they drifted).
 *
 * Rules:
 *  - Slugs are path-shaped (`folder/note-name`), spaces become hyphens.
 *  - Lookup is case-insensitive.
 *  - A bare basename resolves to the first note whose basename matches.
 *
 * Must stay dependency-free: imported from Node (prebuild), Workers, and the
 * browser bundle alike.
 */

/** Normalise raw user/link input into slug form (spaces → hyphens). */
export function normalizeSlug(raw: string): string {
  return raw.trim().replace(/\/$/, "").replace(/\s+/g, "-")
}

/** Slug for a content-relative file path (`Folder/My Note.mdx` → `Folder/My-Note`). */
export function slugifyPath(relPath: string): string {
  return relPath
    .replace(/\\/g, "/")
    .replace(/\.mdx?$/, "")
    .replace(/\/index$/, "")
    .replace(/\s+/g, "-")
}

/** Slug from a URL pathname (`/Folder/My%20Note/` → `Folder/My-Note`, `/` → `index`). */
export function slugFromPathname(pathname: string): string {
  return normalizeSlug(decodeURIComponent(pathname.replace(/^\//, "")) || "index")
}

export interface SlugResolver {
  /** Resolve raw input to a canonical slug, or null. */
  resolve(raw: string): string | null
  /** Basenames that map to more than one slug (ambiguous wikilink targets). */
  collisions: Map<string, string[]>
}

/**
 * Build a resolver over a set of canonical slugs (+ optional aliases).
 * Precomputes lowercase + basename maps so every lookup is O(1) — the Worker
 * calls this on each HTML request and used to scan the whole index.
 */
export function buildSlugResolver(
  slugs: Iterable<string>,
  aliases?: Map<string, string>, // alias (already normalised) → canonical slug
): SlugResolver {
  const byLower = new Map<string, string>()
  const byBasename = new Map<string, string>()
  const collisions = new Map<string, string[]>()

  for (const s of slugs) {
    byLower.set(s.toLowerCase(), s)
    const base = s.split("/").pop()!.toLowerCase()
    const existing = byBasename.get(base)
    if (existing && existing !== s) {
      const list = collisions.get(base) ?? [existing]
      list.push(s)
      collisions.set(base, list)
    } else {
      byBasename.set(base, s)
    }
  }

  if (aliases) {
    for (const [alias, target] of aliases) {
      const key = alias.toLowerCase()
      if (!byLower.has(key)) byLower.set(key, target)
    }
  }

  return {
    resolve(raw: string): string | null {
      const normalized = normalizeSlug(raw)
      const lower = normalized.toLowerCase()
      return byLower.get(lower) ?? byBasename.get(lower) ?? null
    },
    collisions,
  }
}

/**
 * Filename of a note's OG card: `Folder/My Note` → `folder-my-note.png`.
 *
 * LOWERCASING IS LOAD-BEARING (ROADMAP §28.16). The card is a *static asset*, and
 * CF serves those case-sensitively while routes resolve case-insensitively — so
 * building the path from anything but a single canonical casing means the social
 * card 404s for some spellings of the same URL and not others. Two conventions
 * used to coexist: og-gen wrote content-index-key casing (`Abbas.png`) while
 * og-system wrote lowercase system slugs (`arcade.png`), and og-gen's
 * `existsSync` skip-check silently agreed with both on a case-insensitive dev
 * filesystem — so 13 cards were never generated under the name actually requested.
 * All four consumers (og-gen, og-system, the Worker, scripts/test-og.ts) now
 * derive the name here.
 */
export function ogCardName(slug: string): string {
  return `${slug.replace(/\//g, "-").toLowerCase()}.png`
}
