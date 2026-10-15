/**
 * OG card commit-integrity guard (ROADMAP §28.1).
 *
 * WHY THIS EXISTS: OG images must ship as *committed* artifacts. CF runs
 * `npm run build`, and prebuild only invokes og-gen when `PROCESS_OG=true`,
 * which CF never sets — so a card that isn't in git simply does not exist in
 * production. For a long time `.gitignore` ignored `public/og/` while 178 cards
 * were force-added past it, which meant every *newly generated* card was
 * silently dropped: `git add -A` couldn't see it, nothing warned, and the note
 * deployed with a missing social card. That is precisely the silent failure the
 * project's design law forbids (ROADMAP §9), so it is now asserted here.
 *
 * Two hard checks (fail the build) and one advisory:
 *   1. HARD — no `public/og/` ignore rule may come back. This is the regression
 *      guard on the fix itself; without it the bug is one .gitignore edit away.
 *   2. HARD — every card on disk is tracked by git.
 *   3. ADVISORY — every non-draft content-index entry has a card. Only runs when
 *      public/content-index.json exists (it's prebuild output, and `npm test`
 *      runs before prebuild in `npm run check`). A warning, not a failure:
 *      generating cards needs `PROCESS_OG=true`, so a fresh note legitimately
 *      lacks one until then — but it must be *visible* that prod will ship the
 *      fallback image.
 */
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import assert from "node:assert/strict"
import { ogCardFiles } from "../src/lib/slug"
import { injectMetaTags, absoluteMediaUrl } from "../src/worker/meta"
import { inScope } from "./og-gen"

const ROOT = path.resolve(import.meta.dirname, "..")
const OG_DIR = path.join(ROOT, "public", "og")
const INDEX_PATH = path.join(ROOT, "public", "content-index.json")

let failures = 0

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" })
}

/** True when git would ignore `relPath`. `--no-index` so tracked files still report. */
function isIgnored(relPath: string): boolean {
  try {
    git(["check-ignore", "--no-index", "-q", relPath])
    return true // exit 0 = ignored
  } catch {
    return false // exit 1 = not ignored
  }
}

// ── 1. The ignore rule must not come back ────────────────────────────────────
// Probed via a path that cannot exist, so this tests the *rule*, not the file.
if (isIgnored("public/og/__ignore-probe__.png")) {
  console.error(
    "FAIL public/og/ is gitignored again. Newly generated OG cards will be silently\n" +
    "     dropped from commits and ship as missing social images (CF never sets\n" +
    "     PROCESS_OG, so cards exist in prod only if committed). Remove the rule.",
  )
  failures++
}

// ── 2. Every card on disk must be tracked ────────────────────────────────────
const onDisk = fs.existsSync(OG_DIR)
  ? fs.readdirSync(OG_DIR).filter((f) => /\.(png|jpg)$/.test(f)).sort()
  : []

const tracked = new Set(
  git(["ls-files", "public/og"])
    .split("\n")
    .filter(Boolean)
    .map((p) => path.posix.basename(p)),
)

const untracked = onDisk.filter((f) => !tracked.has(f))
if (untracked.length > 0) {
  console.error(
    `FAIL ${untracked.length} OG card(s) exist on disk but are not tracked by git.\n` +
    "     They will not exist in production. Run: git add public/og\n" +
    untracked.slice(0, 10).map((f) => `       ${f}`).join("\n") +
    (untracked.length > 10 ? `\n       … and ${untracked.length - 10} more` : ""),
  )
  failures++
}

// ── 2b. The manifest must list exactly the cards on disk ─────────────────────
// The Worker only points og:image at cards in public/og/manifest.json; a stale
// manifest would silently fall back to raw images (or point at missing cards).
const manifestPath = path.join(OG_DIR, "manifest.json")
if (fs.existsSync(manifestPath)) {
  const listed = (JSON.parse(fs.readFileSync(manifestPath, "utf8")) as string[]).slice().sort()
  const drift = listed.length !== onDisk.length || listed.some((f, i) => f !== onDisk[i])
  if (drift) {
    console.error(
      "FAIL public/og/manifest.json is out of sync with the cards on disk.\n" +
      "     Regenerate with: PROCESS_OG=true npm run prebuild (og-gen rewrites it).",
    )
    failures++
  }
  if (!tracked.has("manifest.json") && git(["ls-files", "public/og/manifest.json"]).trim() === "") {
    console.error("FAIL public/og/manifest.json is not tracked by git — the Worker can't see it in production.")
    failures++
  }
}

// ── 2c. Meta injection prefers committed cards, and never emits a broken URL ─
{
  const origin = "https://subsurfaces.net"
  const note = { title: "T", image: "Media/Escherpuddle.jpg" }
  const card = ogCardFiles("Writing/Image-Metaphors")[0] // the .jpg photo card
  const withCard = injectMetaTags("<head></head>", note, "Writing/Image-Metaphors", origin, new Set([card]))
  assert.match(withCard, new RegExp(`og:image" content="${origin}/og/${card.replace(/[.&]/g, "\\$&")}"`))
  assert.match(withCard, /og:image:width" content="1200"/)
  const noCard = injectMetaTags("<head></head>", note, "Writing/Image-Metaphors", origin, new Set())
  assert.match(noCard, /og:image" content="https:\/\/subsurfaces\.net\/content\/Media\/Escherpuddle\.jpg"/)
  assert.equal(absoluteMediaUrl("https://x.org/a.jpg", origin), "https://x.org/a.jpg")
  assert.equal(absoluteMediaUrl("/content/Media/a.jpg", origin), `${origin}/content/Media/a.jpg`)
  assert.equal(absoluteMediaUrl("Lancaster (2).jpeg", origin), `${origin}/content/Media/Lancaster%20(2).jpeg`)
  assert.equal(inScope("Wiki/Concepts/Double-Bind", "main"), false)
  assert.equal(inScope("Writing/Image-Metaphors", "main"), true)
  assert.equal(inScope("wiki/about", "wiki"), true)
}

// ── 3. Advisory: index coverage ──────────────────────────────────────────────
// Card naming comes from the shared helper, so this can't drift from the
// generators or the Worker (ROADMAP §28.16).
if (fs.existsSync(INDEX_PATH)) {
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as Record<
    string,
    { draft?: boolean; private?: boolean }
  >
  const missing = Object.entries(index)
    // Cards are generated for the main site only (og-gen --scope=main default);
    // wiki pages fall back to their raw image / the site card by design.
    .filter(([slug, note]) => !note.draft && !note.private && inScope(slug, "main"))
    .filter(([slug]) => !ogCardFiles(slug).some((f) => tracked.has(f)))
    .map(([slug]) => ogCardFiles(slug)[1])

  if (missing.length > 0) {
    console.warn(
      `WARN ${missing.length} published note(s) have no committed OG card — those pages\n` +
      "     will ship the fallback image. Generate with: PROCESS_OG=true npm run prebuild\n" +
      missing.slice(0, 10).map((f) => `       ${f}`).join("\n") +
      (missing.length > 10 ? `\n       … and ${missing.length - 10} more` : ""),
    )
  }
}

if (failures > 0) {
  console.error(`${failures} OG integrity failure(s)`)
  process.exit(1)
}
console.log(`OG cards: ${onDisk.length} on disk, all tracked; public/og/ is not ignored.`)
