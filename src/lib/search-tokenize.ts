/**
 * The ONE tokenizer for full-text search. The build-time index
 * (scripts/emit-search-index.ts) and the query side (useContentSearch) must
 * split text identically or terms silently miss, so both import this.
 *
 * Unicode-aware and diacritic-folding: the old ASCII `[^\w\s-]` turned
 * "Žižek" into "i ek" and "café" into "caf", which hurt a philosophy corpus.
 * Folding means "zizek", "Zizek" and "Žižek" all reach the same postings.
 *
 * Dependency-free: imported by Node (prebuild) and the browser bundle.
 */
export function tokenizeSearchText(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length >= 2 && w.length <= 30)
}
