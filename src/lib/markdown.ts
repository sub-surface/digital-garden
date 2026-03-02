import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkFrontmatter from "remark-frontmatter"
import remarkRehype from "remark-rehype"
import rehypeRaw from "rehype-raw"
import rehypeSlug from "rehype-slug"
import rehypeStringify from "rehype-stringify"
import matter from "gray-matter"
import { remarkWikilinks } from "./remark-wikilinks"
import { remarkTelescopic } from "./remark-telescopic"
import { remarkCallouts } from "./remark-callouts"
import { rehypeSidenotes } from "./rehype-sidenotes"

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkGfm)
  .use(remarkWikilinks)
  .use(remarkTelescopic)
  .use(remarkCallouts)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSlug)
  .use(rehypeSidenotes)
  .use(rehypeStringify)

export interface ParsedNote {
  frontmatter: Record<string, unknown>
  html: string
}

export async function parseMarkdown(source: string): Promise<ParsedNote> {
  const { content, data } = matter(source)
  const result = await processor.process(content)
  return {
    frontmatter: data,
    html: String(result),
  }
}
