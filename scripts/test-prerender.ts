/**
 * SSG Pre-render unit test (ROADMAP §5 / SSG Pipeline Phase 1).
 * Verifies that emitPrerender accurately generates static HTML fragments
 * with semantic layout containers, titles, metadata, and accessible MathML.
 */
import assert from "node:assert/strict"
import * as fs from "fs"
import * as path from "path"
import { emitPrerender } from "./emit-prerender"
import { prerenderFileName } from "../src/lib/slug"

const TEST_DIR = path.join(import.meta.dirname, "__prerender_test_tmp__")
const CONTENT_DIR = path.join(TEST_DIR, "content")
const PUBLIC_DIR = path.join(TEST_DIR, "public")

try {
  fs.mkdirSync(CONTENT_DIR, { recursive: true })
  fs.mkdirSync(PUBLIC_DIR, { recursive: true })

  // 1. Create mock notes
  const note1 = path.join(CONTENT_DIR, "sample-essay.md")
  fs.writeFileSync(
    note1,
    `---
title: "The Nature of Space"
layout: article
date: 2026-09-12
tags: [philosophy, physics]
quote: "Space is not an empirical concept."
quote-author: "Immanuel Kant"
---

# Section One

Here is an equation: $E = mc^2$.
And a [[Reference Link]].
`,
    "utf-8",
  )

  const note2 = path.join(CONTENT_DIR, "simple-note.md")
  fs.writeFileSync(
    note2,
    `---
title: "Simple Note"
growth: evergreen
---

Simple thought without an epigraph.
`,
    "utf-8",
  )

  const model = {
    files: [note1, note2],
    index: {
      "sample-essay": {
        slug: "sample-essay",
        title: "The Nature of Space",
        layout: "article",
        date: "2026-09-12",
        tags: ["philosophy", "physics"],
        readingTime: 2,
      },
      "simple-note": {
        slug: "simple-note",
        title: "Simple Note",
        growth: "evergreen",
        tags: [],
        readingTime: 1,
      },
    },
  }

  const res = await emitPrerender(model, CONTENT_DIR, PUBLIC_DIR)
  assert.equal(res.count, 2, "Should have pre-rendered 2 mock notes")

  // Verify essay output
  const essayHtmlPath = path.join(PUBLIC_DIR, "prerender", prerenderFileName("sample-essay"))
  assert.ok(fs.existsSync(essayHtmlPath), "Essay HTML file must exist")
  const essayHtml = fs.readFileSync(essayHtmlPath, "utf-8")

  assert.match(essayHtml, /id="prerender-root"/, "Must contain #prerender-root container")
  assert.match(essayHtml, /data-prerender-slug="sample-essay"/, "Must carry data-prerender-slug attribute")
  assert.match(essayHtml, /class="article-layout"/, "Must use article-layout for layout: article")
  assert.match(essayHtml, /class="epigraph-quote">Space is not an empirical concept\.<\/blockquote>/, "Must render epigraph quote")
  assert.match(essayHtml, /class="epigraph-author">— Immanuel Kant<\/cite>/, "Must render epigraph author")
  assert.match(essayHtml, /<h1 class="article-title">The Nature of Space<\/h1>/, "Must render title in header")
  assert.match(essayHtml, /class="katex"/, "Inline math must be compiled to KaTeX")
  assert.match(essayHtml, /class="tag">#philosophy<\/span>/, "Tags must be rendered")

  // Verify note output
  const noteHtmlPath = path.join(PUBLIC_DIR, "prerender", prerenderFileName("simple-note"))
  assert.ok(fs.existsSync(noteHtmlPath), "Note HTML file must exist")
  const noteHtml = fs.readFileSync(noteHtmlPath, "utf-8")

  assert.match(noteHtml, /class="note-layout"/, "Must use note-layout for default notes")
  assert.match(noteHtml, /class="growth-badge">evergreen<\/span>/, "Must render growth badge")
  assert.doesNotMatch(noteHtml, /class="epigraph"/, "Must not render epigraph when not present")

  // Verify manifest
  const manifestPath = path.join(PUBLIC_DIR, "prerender", "manifest.json")
  assert.ok(fs.existsSync(manifestPath), "Manifest must exist")
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
  // Verify Worker edge injection
  const { injectPrerender, getPrerenderFragment } = await import("../src/worker/meta")
  const shellHtml = '<!DOCTYPE html><html><head><title>Test</title></head><body><div id="root"></div></body></html>'
  const injected = injectPrerender(shellHtml, essayHtml)
  assert.match(injected, /<div id="root"><div id="prerender-root"/, "Must inject fragment into #root")
  assert.equal(injectPrerender(shellHtml, null), shellHtml, "Null fragment leaves shell intact")

  // Verify getPrerenderFragment with mock asset fetcher
  const mockAssets = {
    fetch: async (url: string) => {
      if (url.endsWith("sample-essay.html")) {
        return { ok: true, text: async () => essayHtml }
      }
      return { ok: false, status: 404 }
    }
  }
  const fetched = await getPrerenderFragment(mockAssets, "sample-essay")
  assert.equal(fetched, essayHtml, "Worker must fetch and cache prerender fragment")
  const cached = await getPrerenderFragment(mockAssets, "sample-essay")
  assert.equal(cached, essayHtml, "Worker must serve from in-memory cache")
  const missing = await getPrerenderFragment(mockAssets, "non-existent")
  assert.equal(missing, null, "Missing fragment returns null")

  console.log("SSG pre-render test: all checks passed successfully.")
} finally {
  // Clean up mock directory
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
  }
}
