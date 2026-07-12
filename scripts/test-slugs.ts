/**
 * Slug semantics — exercises the actual shared module (src/lib/slug.ts), not a
 * simulation of it. This module exists specifically because the SPA, the
 * Worker, and prebuild.ts used to reimplement slugification independently and
 * drifted; a test that doesn't import the real functions can't catch that
 * again.
 */
import assert from "node:assert"
import { normalizeSlug, slugifyPath, slugFromPathname, buildSlugResolver } from "../src/lib/slug"

let failures = 0

function check(label: string, actual: unknown, expected: unknown) {
  try {
    assert.deepStrictEqual(actual, expected)
  } catch {
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    failures++
  }
}

// slugifyPath — content-relative file path -> slug
check("slugifyPath basic", slugifyPath("Movies/2001 A Space Odyssey.md"), "Movies/2001-A-Space-Odyssey")
check("slugifyPath mdx", slugifyPath("folder/note name.mdx"), "folder/note-name")
check("slugifyPath index", slugifyPath("Folder/My Note/index.md"), "Folder/My-Note")
check("slugifyPath backslashes", slugifyPath("Movies\\Fargo.md"), "Movies/Fargo")
check("slugifyPath multiple spaces", slugifyPath("Multiple   Spaces.md"), "Multiple-Spaces")

// normalizeSlug — raw user/link input -> slug form
check("normalizeSlug spaces", normalizeSlug("a place I'll always call home"), "a-place-I'll-always-call-home")
check("normalizeSlug trailing slash", normalizeSlug("folder/note/"), "folder/note")
check("normalizeSlug trims", normalizeSlug("  Folder/Note  "), "Folder/Note")

// slugFromPathname — URL pathname -> slug
check("slugFromPathname root", slugFromPathname("/"), "index")
check("slugFromPathname encoded", slugFromPathname("/Folder/My%20Note/"), "Folder/My-Note")

// buildSlugResolver — case-insensitive resolution + basename fallback + collisions
const resolver = buildSlugResolver(["Movies/Fargo", "Movies/Se7en", "Books/Fargo"])
check("resolver exact", resolver.resolve("Movies/Fargo"), "Movies/Fargo")
check("resolver case-insensitive", resolver.resolve("movies/fargo"), "Movies/Fargo")
check("resolver unknown", resolver.resolve("Movies/Nope"), null)
if (!resolver.collisions.has("fargo")) {
  console.error("FAIL resolver collisions: expected a 'fargo' collision between Movies/Fargo and Books/Fargo")
  failures++
}

if (failures > 0) {
  console.error(`${failures} slug test failure(s)`)
  process.exit(1)
}
console.log("Slug semantics: all checks passed against src/lib/slug.ts.")
