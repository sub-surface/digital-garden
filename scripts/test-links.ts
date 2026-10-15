/**
 * Missing-page markers (remark-wikilinks `isMissingTarget`).
 *
 * A wikilink to a page that doesn't exist renders as a visibly provisional link
 * (`missing-link`, `data-missing`, `data-no-preview`) instead of looking like
 * every other link and 404ing on click. Resolution must agree with prebuild's
 * broken-link report, so these run against the real content index.
 */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { parseMarkdown } from "../src/lib/markdown"
import { isMissingTarget } from "../src/lib/remark-wikilinks"

const ROOT = path.resolve(import.meta.dirname, "..")
const indexPath = path.join(ROOT, "public", "content-index.json")

if (!fs.existsSync(indexPath)) {
  console.log("Missing-page markers: skipped (no content index; run prebuild first).")
  process.exit(0)
}

const map = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "slug-map.json"), "utf8")) as Record<string, string>

// Existing notes, aliases-by-basename, system pages and routes are not missing.
assert.equal(isMissingTarget("Roland Barthes", map), false)
assert.equal(isMissingTarget("Chess", map), false)
assert.equal(isMissingTarget("tags/thoughts", map), false)
assert.equal(isMissingTarget("folder/Writing", map), false)
// A page nobody has written is.
assert.equal(isMissingTarget("Definitely Not A Page 4f2c", map), true)

const { html } = await parseMarkdown("[[Definitely Not A Page 4f2c]] and [[Roland Barthes]]\n")
assert.match(html, /class="internal-link missing-link" data-missing="true" data-no-preview="true"/)
assert.match(html, /<a href="\/Roland-Barthes" class="internal-link">/)

// Every link prebuild reports as broken is marked missing in the page.
const broken = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "broken-links.json"), "utf8")) as {
  bySlug: Record<string, string[]>
}
const sample = Object.values(broken.bySlug).flat().filter((l) => !/\.(png|jpe?g|gif|webp|svg|mp3|mp4|wav|pdf)$/i.test(l)).slice(0, 25)
for (const raw of sample) {
  assert.equal(isMissingTarget(raw, map), true, `prebuild calls [[${raw}]] broken but the page wouldn't mark it`)
}

console.log(`Missing-page markers: agree with prebuild on ${sample.length} sampled broken links.`)
