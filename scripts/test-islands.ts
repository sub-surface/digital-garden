/**
 * The note pipeline's contract with the vault:
 *  1. ISLAND_NAMES (build-side, pure data) matches the capitalised keys of
 *     mdxComponents in MDXProvider.tsx (client-side React registry).
 *  2. Every published note renders through renderNoteHtml with zero build
 *     errors: no unknown components, no computed props, no import/export.
 */
import * as fs from "fs"
import * as path from "path"
import assert from "node:assert/strict"
import matter from "gray-matter"
import "../src/lib/pipeline-host-node"
import { renderNoteHtml } from "../src/lib/note-pipeline"
import { literalValue } from "../src/lib/remark-islands"
import { ISLAND_NAMES } from "../src/components/mdx/island-names"

// 1. Registry parity, read from source text (the provider imports SCSS).
const provider = fs.readFileSync("src/components/mdx/MDXProvider.tsx", "utf8")
const block = provider.slice(provider.indexOf("export const mdxComponents"))
const body = block.slice(0, block.indexOf("\n}"))
const keys = [...body.matchAll(/^\s{2}([A-Z][A-Za-z0-9]*)[,:]/gm)].map((m) => m[1]).sort()
assert.deepEqual([...ISLAND_NAMES].sort(), keys, "ISLAND_NAMES must match mdxComponents' component keys")

// 2. Literal evaluation refuses code.
assert.throws(() => literalValue({ type: "CallExpression" }))
assert.throws(() => literalValue({ type: "Identifier", name: "window" }))
assert.deepEqual(literalValue({ type: "ArrayExpression", elements: [{ type: "Literal", value: 1 }] }), [1])

// 3. Problems are visible, and don't leak into the next note (one shared processor).
{
  const bad = await renderNoteHtml('Hello <Nope />\n\n<div className="x">ok</div>')
  assert.equal(bad.errors.length, 1, "unknown component is reported")
  assert.match(bad.html, /note-build-error/, "and shown in-page")
  assert.match(bad.html, /<div class="x">/, "lowercase JSX becomes plain HTML")
  const good = await renderNoteHtml("<Query sort=\"-date\" limit={3} />")
  assert.equal(good.errors.length, 0, "errors do not leak between notes")
  assert.match(good.html, /data-island="Query"/)
  assert.match(good.html, /&#x22;limit&#x22;:3/, "numeric literal props stay numbers")
}

// 4. Safety: wiki contributions land here too, and the client uses innerHTML.
{
  const attacks = [
    '<img src="x.png" onError="alert(1)" />',
    '<a href="javascript:alert(1)">x</a>',
    '<a href=" java	script:alert(1)">x</a>',
    '<div onClick="alert(1)">x</div>',
    '<iframe src="https://evil.example/x"></iframe>',
    '<object data="x.swf"></object>',
    "raw html: <script>alert(1)</script>",
    '<img src="data:text/html,<script>alert(1)</script>" />',
    '<svg><a><animate attributeName="href" to="javascript:alert(1)" /><text>x</text></a></svg>',
    '<svg><foreignObject><img src="x" onerror="alert(1)" /></foreignObject></svg>',
    '<form action="https://evil.example"><button>go</button></form>',
  ]
  for (const attack of attacks) {
    const { html } = await renderNoteHtml(attack)
    assert.doesNotMatch(html, /\son[a-z]+=|javascript:|<script|<object|<animate|<foreignobject|<form|evil\.example|data:text/i, `neutralised: ${attack} -> ${html}`)
  }
  const kept = await renderNoteHtml(
    "[home](/garden) [web](https://example.org) ![p](/content/Media/a.png) [play](music:Hello)\n\n" +
      "![](https://www.youtube.com/watch?v=dQw4w9WgXcQ)",
  )
  assert.match(kept.html, /href="\/garden"/)
  assert.match(kept.html, /href="https:\/\/example\.org"/)
  assert.match(kept.html, /href="music:Hello"/)
  assert.match(kept.html, /youtube-nocookie\.com\/embed/, "allow-listed video embeds survive")
}

// 5. The whole corpus renders cleanly.
const EXCLUDED = new Set(["private", "templates", ".obsidian", "Misc"])
const files: string[] = []
;(function walk(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED.has(entry.name)) continue
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p)
    else if (/\.mdx?$/.test(entry.name)) files.push(p)
  }
})("content")

const problems: string[] = []
let rendered = 0
for (const file of files) {
  const { content, data } = matter(fs.readFileSync(file, "utf8"))
  if (data.private) continue
  if (/[\\/]Daily[\\/]/.test(file) && data.public !== true) continue // opt-in folder, as in prebuild
  try {
    const { errors } = await renderNoteHtml(content)
    if (errors.length) problems.push(`${file}: ${errors.join(" | ")}`)
    rendered++
  } catch (err) {
    problems.push(`${file}: ${(err as Error).message.split("\n")[0]}`)
  }
}
assert.equal(problems.length, 0, `notes with build errors:\n${problems.join("\n")}`)
console.log(`Islands: registry in parity; ${rendered} notes render through the one pipeline with no errors.`)
