/**
 * Layout classification — exercises the real shared module (src/lib/layout.ts),
 * the single source of truth NoteRenderer and usePanelClick both call into
 * (see ROADMAP §19/§21, docs/archive/specs/2026-07-12-classify-layout-nav-reader-spec.md).
 */
import assert from "node:assert"
import { classifyLayout } from "../src/lib/layout"
import { SYSTEM_PAGE_META } from "../src/config/system-pages-meta"

let failures = 0

function check(label: string, actual: unknown, expected: unknown) {
  try {
    assert.deepStrictEqual(actual, expected)
  } catch {
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    failures++
  }
}

// Explicit frontmatter layout override wins over everything else.
check("layout override: article", classifyLayout("hex-life", { layout: "article" }), "article")
check("layout override: note", classifyLayout("wiki/foo", { layout: "note" }), "note")
check("layout override: game", classifyLayout("some-note", { layout: "game" }), "game")

// Special content types
check("type book", classifyLayout("Movies/Fargo", { type: "book" }), "article")
check("type movie", classifyLayout("Movies/Fargo", { type: "movie" }), "article")
check("type chatter", classifyLayout("wiki/some-chatter", { type: "chatter" }), "article")
check("type philosopher", classifyLayout("wiki/kant", { type: "philosopher" }), "article")
check("type other -> note", classifyLayout("some-note", { type: "music" }), "note")

// Slug prefixes
check("wiki root", classifyLayout("wiki"), "article")
check("wiki prefix", classifyLayout("wiki/about"), "article")
check("writing prefix", classifyLayout("writing/some-essay"), "article")
check("case-insensitive wiki prefix", classifyLayout("Wiki/About"), "article")

// A known system slug per layout kind
check("system game slug", classifyLayout("hex-life"), "game")
check("system article slug", classifyLayout("arcade"), "article")
check("system slug case-insensitive", classifyLayout("Hex-Life"), "game")

// Unknown slug -> note
check("unknown slug -> note", classifyLayout("some/random/note"), "note")

// Frontmatter/type takes priority over a system-page slug match (defensive —
// shouldn't happen in practice, but the rule order must hold).
check("explicit type beats system slug", classifyLayout("arcade", { type: "book" }), "article")

// SYSTEM_PAGE_META and the component map in system-pages.ts must have
// identical key sets — exercised at runtime too (see system-pages.ts's dev
// parity check), but assert it here so CI catches drift without a browser.
const { SYSTEM_PAGES } = await import("../src/config/system-pages")
const metaKeys = Object.keys(SYSTEM_PAGE_META).sort()
const pageKeys = Object.keys(SYSTEM_PAGES).sort()
check("SYSTEM_PAGE_META / SYSTEM_PAGES key parity", pageKeys, metaKeys)

if (failures > 0) {
  console.error(`${failures} layout test failure(s)`)
  process.exit(1)
}
console.log("Layout classification: all checks passed against src/lib/layout.ts.")
