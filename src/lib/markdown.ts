import { parse as parseYaml } from "yaml"
import { splitFrontmatter } from "./frontmatter"
import { renderNoteHtml } from "./note-pipeline"

/**
 * Parse a note into frontmatter + HTML, through THE note pipeline
 * (src/lib/note-pipeline.ts). Build-time only: prerender and tests.
 *
 * Frontmatter goes through `yaml` (what the retired MDX build used),
 * not gray-matter: gray-matter's js-yaml turns `date: 2026-01-01` into a Date,
 * which would change every date a page displays.
 */
export interface ParsedNote {
  frontmatter: Record<string, unknown>
  html: string
  errors: string[]
}

export async function parseMarkdown(source: string): Promise<ParsedNote> {
  const { yaml, body } = splitFrontmatter(source)
  const frontmatter = (yaml ? parseYaml(yaml) : null) ?? {}
  const { html, errors } = await renderNoteHtml(body)
  return { frontmatter, html, errors }
}
