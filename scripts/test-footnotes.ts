import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkRehype from "remark-rehype"
import rehypeStringify from "rehype-stringify"
import assert from "node:assert/strict"
import { rehypeSidenotes } from "../src/lib/rehype-sidenotes.js"

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSidenotes)
  .use(rehypeStringify)

const markdown = `
Testing footnotes here[^1] and another one[^2].

[^1]: First footnote content with a [link](https://google.com).
[^2]: Second footnote content.
`

async function run() {
  const result = await processor.process(markdown)
  const html = String(result)
  const sidenoteNumbers = Array.from(html.matchAll(/<aside class="sidenote" data-number="([^"]+)"/g))
    .map((match) => match[1])

  assert.deepEqual(
    sidenoteNumbers,
    ["1", "2"],
    "sidenotes should render in the same order as their footnote references",
  )

  console.log("Footnote sidenote order is stable.")
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
