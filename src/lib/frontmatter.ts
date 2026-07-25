/**
 * YAML frontmatter stripping — shared by the MDX build pipeline
 * (`remark-wikilinks.ts`, resolving note-embed bodies) and the wiki editor's live
 * preview (`WikiMarkdownEditor.tsx`). ROADMAP §28.9.
 *
 * Must stay dependency-free: imported from a remark plugin that runs inside the
 * Vite build as well as from browser code. Deliberately NOT put in
 * `src/lib/markdown.ts`, which pulls in the whole `unified()` stack.
 *
 * The two copies this replaces were NOT equivalent, and the difference was a
 * latent bug rather than style drift:
 *   remark-wikilinks had  /^---[\s\S]*?---\n?/     (closing fence unanchored)
 *   the wiki editor had   /^---\n[\s\S]*?\n---\n?/ (closing fence at line start)
 * The unanchored form stops at the first `---` *anywhere*, including inside a
 * YAML value — so frontmatter containing e.g. `title: Bateson---Mind` matched
 * early and the strip ate the opening lines of the note body. The anchored form
 * is the correct one and is what survives here.
 */

/** Remove a leading `---\n … \n---` YAML frontmatter block, if present. */
export function stripFrontmatter(src: string): string {
  const match = src.match(/^---\n[\s\S]*?\n---\n?/)
  return match ? src.slice(match[0].length) : src
}
