import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkRehype from "remark-rehype"
import rehypeStringify from "rehype-stringify"
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
  console.log("--- HTML Output ---")
  console.log(String(result))
  console.log("-------------------")
}

run().catch(console.error)
