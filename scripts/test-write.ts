/**
 * The /write desk's pure parts: the daily-note source round trip (every note in
 * content/Daily survives parse → serialize untouched), the scaffold the CLI and
 * the desk share, jots, and the desk helpers (margin notes, diff, run of days).
 */
import assert from "node:assert/strict"
import * as fs from "fs"
import * as path from "path"
import { appendJot, dailyFileName, dailySlugFor, fullTitle, parseDaily, proseWords, scaffoldDaily, serializeDaily } from "../src/lib/daily-source"
import { isIsoDate, shiftIso } from "../src/lib/iso-day"
import { lineDiff, runOfDays, voiceNotes } from "../src/features/write/desk"
import { dailyCardLayout } from "../src/lib/daily-art"

// ── names ──
assert.equal(dailyFileName("2026-11-01"), "01-11-26.md")
assert.equal(dailySlugFor("2026-11-01"), "Daily/01-11-26")
assert.equal(fullTitle("2026-11-01", "cryptids in FRACTRAN"), "1 November: cryptids in FRACTRAN")
assert.equal(fullTitle("2026-11-01", "  "), "1 November")
assert.ok(isIsoDate("2026-02-28") && !isIsoDate("2026-13-01") && !isIsoDate("26-11-01") && !isIsoDate(null))
assert.equal(shiftIso("2026-03-01", -1), "2026-02-28")

// ── every real note round-trips byte for byte ──
const dir = path.resolve("content/Daily")
let checked = 0
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
  const src = fs.readFileSync(path.join(dir, file), "utf8").replace(/\r\n/g, "\n")
  if (!src.trim()) continue
  const [d, m, y] = file.slice(0, 8).split("-")
  const iso = `20${y}-${m}-${d}`
  assert.equal(serializeDaily(parseDaily(src, iso), src), src, `${file} changed on a round trip`)
  checked++
}
assert.ok(checked > 0, "no daily notes to check")

// ── edits touch only what changed; unknown keys and quoting survive ──
const src = `---
title: "27 October: who are you?"
date: 2026-10-27
description: Pushing neurons - "I am the VW Polo" - but the frame holds.
tags:
  - daily
  - ai
custom: kept # a comment
public: true
---

Day two.
`
const doc = parseDaily(src, "2026-10-27")
assert.deepEqual(doc.fields, { headline: "who are you?", description: 'Pushing neurons - "I am the VW Polo" - but the frame holds.', tags: ["daily", "ai"], public: true, ogMotif: "", ogAlmanac: "" })
doc.fields.tags = ["daily", "ml"]
doc.fields.ogMotif = "network"
const out = serializeDaily(doc, src)
assert.match(out, /custom: kept # a comment/)
assert.match(out, /description: Pushing neurons - "I am the VW Polo" - but the frame holds\./)
assert.match(out, /tags:\n {2}- daily\n {2}- ml\n/)
assert.match(out, /og-motif: network/)
doc.fields.ogMotif = ""
assert.doesNotMatch(serializeDaily(doc, out), /og-motif/)
// A headline with a colon in it stays one quoted title.
doc.fields.headline = "who: are you?"
assert.equal(parseDaily(serializeDaily(doc, src), "2026-10-27").fields.headline, "who: are you?")

// ── the scaffold ──
const fresh = serializeDaily(scaffoldDaily("2026-11-11", "a desk", ["daily", "meta"]))
assert.equal(fresh, '---\ntitle: "11 November: a desk"\ndate: 2026-11-11\ndescription: ""\ntags:\n  - daily\n  - meta\npublic: false\n---\n\n')
assert.equal(serializeDaily(parseDaily(fresh, "2026-11-11"), fresh), fresh)

// ── jots ──
assert.equal(appendJot("", "first"), "first\n")
assert.equal(appendJot("one\n\n\n", "two"), "one\n\ntwo\n")
assert.equal(appendJot("x", "   "), "x")
assert.equal(proseWords("A [[Note|link]] and [text](http://x) ![[pic.png]] `code`'s fine"), 7)

// ── margin notes ──
const notes = voiceNotes("It was the the best — and worst.\n— attribution\n`a — b` ok  fine")
assert.deepEqual(notes.map((n) => n.kind), ["repeat", "dash", "spaces"])
assert.equal(notes[1].fix, " - ")

// ── diff + run ──
assert.deepEqual(lineDiff("a\nb\nc", "a\nc\nd").map((l) => `${l.op}:${l.text}`), ["same:a", "del:b", "same:c", "add:d"])
assert.equal(runOfDays(["2026-11-09", "2026-11-10"], "2026-11-11"), 2)
assert.equal(runOfDays(["2026-11-09", "2026-11-10", "2026-11-11"], "2026-11-11"), 3)
assert.equal(runOfDays(["2026-11-08"], "2026-11-11"), 0)

// ── the card cuts long descriptions at a word ──
const long = dailyCardLayout({ iso: "2026-11-11", title: "11 November: x", description: "word ".repeat(60) })
assert.ok(long.desc.endsWith("…") && long.desc.length <= 150)

console.log(`write desk: ok (${checked} daily notes round-trip)`)
