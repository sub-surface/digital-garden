/**
 * THE markdown pipeline. One definition of how a note becomes HTML.
 *
 * There used to be two: an MDX build that compiled every note to a JS chunk,
 * and a standalone processor for prerendering. They disagreed (different
 * sidenote plugins, no components on the standalone side), so the page the
 * Worker served was not the page React then rendered. Now there is only this:
 * notes are parsed as MDX (they are MDX, gotcha #10), rendered to HTML at
 * build time, and components become islands the client hydrates.
 *
 * Dependency-free beyond the unified ecosystem: imported by vite.config.ts,
 * prebuild (Node) and tests.
 */

import { unified, type PluggableList } from "unified"
import remarkParse from "remark-parse"
import remarkMdx from "remark-mdx"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import remarkRehype from "remark-rehype"
import rehypeRaw from "rehype-raw"
import rehypeSlug from "rehype-slug"
import rehypeKatex from "rehype-katex"
import rehypeStringify from "rehype-stringify"
import { remarkWikilinks } from "./remark-wikilinks"
import { remarkTelescopic } from "./remark-telescopic"
import { remarkCallouts } from "./remark-callouts"
import { remarkSidenotes } from "./remark-sidenotes"
import { remarkIslands } from "./remark-islands"
import { rehypeImagePaths } from "./rehype-image-paths"
import { ISLAND_NAMES } from "../components/mdx/island-names"
import { visit } from "unist-util-visit"

/**
 * Tag links internal/external (formerly the MDX `a` override, which needed
 * React to run). Internal = site-relative or in-page; everything else is
 * external. Existing classes (e.g. wikilinks') are kept.
 */
export function rehypeLinkClasses() {
  return (tree: any) => {
    visit(tree, "element", (node: any) => {
      if (node.tagName !== "a") return
      const href = String(node.properties?.href ?? "")
      if (!href) return
      const internal = href.startsWith("/") || href.startsWith("#")
      const classes = new Set<string>([].concat(node.properties.className ?? []))
      classes.add(internal ? "internal-link" : "external-link")
      node.properties.className = [...classes]
    })
  }
}

/** Content transforms shared by every renderer, in order. */
export const remarkNotePlugins: PluggableList = [
  remarkGfm,
  remarkMath,
  remarkWikilinks,
  remarkTelescopic,
  remarkCallouts,
  remarkSidenotes,
]

/** Rehype stage, either side of rehype-raw (headings get ids from rehypeSlug
 *  before raw HTML is parsed, as they always have). */
export const rehypeBeforeRaw: PluggableList = [rehypeSlug]
export const rehypeAfterRaw: PluggableList = [rehypeKatex, rehypeImagePaths, rehypeLinkClasses]

export interface RenderedNote {
  html: string
  /** Build problems (unknown component, computed prop…), also shown in-page. */
  errors: string[]
}

/**
 * Render a note's markdown/MDX body (frontmatter allowed) to HTML.
 * Components become `data-island` placeholders for the client to hydrate.
 */
// Built once: constructing the MDX parser per note made prerender ~5x slower.
let processor: ReturnType<typeof buildProcessor> | null = null
function buildProcessor() {
  return unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkIslands, { islands: ISLAND_NAMES })
    .use(remarkNotePlugins)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeBeforeRaw)
    .use(rehypeRaw)
    .use(rehypeAfterRaw)
    .use(rehypeStringify)
    .freeze()
}

export async function renderNoteHtml(source: string): Promise<RenderedNote> {
  processor ??= buildProcessor()
  const file = await processor.process(source)
  return { html: String(file), errors: (file.data.islandErrors as string[] | undefined) ?? [] }
}
