import assert from "node:assert/strict"
import "../src/lib/pipeline-host-node.js"
import { renderNoteHtml } from "../src/lib/note-pipeline.js"

// Exercises THE note pipeline (remark-sidenotes), the one published notes use.
// It used to test rehype-sidenotes-runtime, a second implementation no
// published note went through.
const processor = { process: async (md: string) => (await renderNoteHtml(md)).html }

const markdown = `
Testing footnotes here[^1] and another one[^2].

[^1]: First footnote content with a [link](https://google.com).
[^2]: Second footnote content.
`

const namedMarkdown = `
Testing named footnotes[^bateson] and another[^softmax].

[^bateson]: A difference which makes a difference.
[^softmax]: Translation-invariant.
`

async function run() {
  const result = await processor.process(markdown)
  const html = String(result)
  const sidenoteNumbers = Array.from(html.matchAll(/<aside class="sidenote" data-number="([^"]+)"/g))
    .map((match) => match[1])

  assert.deepEqual(
    sidenoteNumbers,
    ["i", "ii"],
    "sidenotes should render as Roman numerals in reference order",
  )

  // Regression: named identifiers (e.g. [^bateson]) must still display as
  // sequential Roman numerals, not the literal identifier text.
  const namedResult = await processor.process(namedMarkdown)
  const namedHtml = String(namedResult)
  const namedSidenoteNumbers = Array.from(
    namedHtml.matchAll(/<aside class="sidenote" data-number="([^"]+)"/g),
  ).map((match) => match[1])

  assert.deepEqual(
    namedSidenoteNumbers,
    ["i", "ii"],
    "named footnote identifiers should still display as sequential Roman numerals",
  )

  console.log("Footnote sidenote order is stable.")
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
