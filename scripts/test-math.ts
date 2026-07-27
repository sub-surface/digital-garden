import assert from "node:assert/strict"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import remarkRehype from "remark-rehype"
import rehypeRaw from "rehype-raw"
import rehypeKatex from "rehype-katex"
import rehypeStringify from "rehype-stringify"
import { parseMarkdown } from "../src/lib/markdown"
import { remarkSidenotes } from "../src/lib/remark-sidenotes"

const { html } = await parseMarkdown(String.raw`
Inline math: $u(r) = \sqrt{r}$.

$$
\mathbb{E}[u(R)] = \frac{u(0) + u(100)}{2}
$$
`)

assert.match(html, /class="katex"/, "inline math should render through KaTeX")
assert.match(html, /class="katex-display"/, "display math should render through KaTeX")
assert.match(html, /<math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML"/, "math should include accessible MathML")
assert.doesNotMatch(html, />\s*\$\$/, "display delimiters should not leak into rendered HTML")

const currency = await parseMarkdown("A secure box contains $1,000.")
assert.match(currency.html, /\$1,000/, "an unmatched currency dollar should remain text")
assert.doesNotMatch(currency.html, /class="katex"/, "an unmatched currency dollar must not become math")

const articleHtml = String(
  await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkSidenotes)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeKatex)
    .use(rehypeStringify)
    .process(String.raw`
Jensen's inequality has a compact form.[^jensen]

[^jensen]: For concave $u$, $u(\mathbb{E}[R]) \geq \mathbb{E}[u(R)]$.
`),
)

assert.match(articleHtml, /<aside class="sidenote"/, "article footnotes should become sidenotes")
assert.match(articleHtml, /<aside[\s\S]*?class="katex"/, "math inside article sidenotes should render through KaTeX")

const malformed = await unified()
  .use(remarkParse)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeKatex)
  .use(rehypeStringify)
  .process(String.raw`Broken math stays visible: $\notARealCommand{x}$.`)

assert.ok(malformed.messages.length > 0, "malformed math should produce a build-visible message")
assert.match(
  String(malformed),
  /mathcolor="#cc0000"|class="katex-error"/,
  "malformed math should render a visible error fallback instead of disappearing",
)

console.log("Math rendering handles inline math, display math, sidenotes, accessibility, errors, and currency text.")
