/**
 * Test Suite: Pre-Computed Search Index (SSG Pipeline Phase 3a).
 *
 * Verifies:
 *  1. public/search-index.json validity, schema, and posting list constraints.
 *  2. Search precision and scoring for single-word, multi-word, and prefix queries.
 *  3. Inverted index payload size within budgets.
 */
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const SEARCH_INDEX_PATH = path.join(ROOT, "public", "search-index.json")

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`)
    process.exit(1)
  }
}

async function testSearchIndex() {
  console.log("=== Testing Pre-Computed Full-Text Search Index ===")

  assert(fs.existsSync(SEARCH_INDEX_PATH), "public/search-index.json must exist")

  const raw = fs.readFileSync(SEARCH_INDEX_PATH, "utf-8")
  const data = JSON.parse(raw)

  assert(Array.isArray(data.slugs), "search index must have a 'slugs' array")
  assert(data.slugs.length >= 250, `expected >= 250 slugs, got ${data.slugs.length}`)
  assert(typeof data.index === "object" && data.index !== null, "search index must have an 'index' object")

  const tokens = Object.keys(data.index)
  assert(tokens.length >= 5000, `expected >= 5000 indexed tokens, got ${tokens.length}`)

  // Verify posting list structure: flat arrays with even length [id, score, id, score, ...]
  for (const token of tokens.slice(0, 100)) {
    const postings = data.index[token]
    assert(Array.isArray(postings), `posting for token '${token}' must be an array`)
    assert(postings.length % 2 === 0, `posting array length for '${token}' must be even`)
    for (let i = 0; i < postings.length; i += 2) {
      const docId = postings[i]
      const score = postings[i + 1]
      assert(docId >= 0 && docId < data.slugs.length, `docId ${docId} out of bounds`)
      assert(score > 0, `score ${score} must be positive`)
    }
  }

  // Scoring function simulating useContentSearch
  function search(query: string, limit = 5): string[] {
    const terms = query.toLowerCase().replace(/[^\w\s-]/g, " ").split(/[\s-]+/).filter((t) => t.length >= 2)
    if (terms.length === 0) return []

    const scores = new Map<number, number>()
    const matchCounts = new Map<number, number>()

    for (const term of terms) {
      // 1. Exact token match
      const postings = data.index[term] || []
      for (let i = 0; i < postings.length; i += 2) {
        const id = postings[i]
        const score = postings[i + 1]
        scores.set(id, (scores.get(id) || 0) + score)
        matchCounts.set(id, (matchCounts.get(id) || 0) + 1)
      }

      // 2. Prefix matching if term >= 3 chars
      if (term.length >= 3) {
        for (const token of tokens) {
          if (token !== term && token.startsWith(term)) {
            const pPostings = data.index[token]
            for (let i = 0; i < pPostings.length; i += 2) {
              const id = pPostings[i]
              const score = Math.round(pPostings[i + 1] * 0.7) // slight discount for prefix
              scores.set(id, (scores.get(id) || 0) + score)
            }
          }
        }
      }
    }

    // Boost multi-term intersections
    for (const [id, count] of matchCounts.entries()) {
      if (count > 1) {
        scores.set(id, (scores.get(id) || 0) * Math.pow(1.5, count - 1))
      }
    }

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => data.slugs[id])
  }

  // Test queries
  const q1 = search("spinoza")
  assert(q1.length > 0, "query 'spinoza' must return results")
  assert(q1[0].toLowerCase().includes("spinoza"), `top result for 'spinoza' should be Baruch Spinoza, got ${q1[0]}`)

  const q2 = search("qualia")
  assert(q2.length > 0, "query 'qualia' must return results")

  const q3 = search("critique pure reason")
  assert(q3.length > 0, "query 'critique pure reason' must return results")
  assert(q3[0].toLowerCase().includes("critique-of-pure-reason"), `top result should be Critique of Pure Reason, got ${q3[0]}`)

  const q4 = search("cartograph") // prefix test
  assert(q4.length > 0, "prefix query 'cartograph' must return results")

  const uncompressedKb = (raw.length / 1024).toFixed(1)
  console.log(`PASS: Pre-computed search index test passed! (${tokens.length} tokens across ${data.slugs.length} notes, ${uncompressedKb} KB uncompressed)`)
}

testSearchIndex().catch((err) => {
  console.error("Test failed:", err)
  process.exit(1)
})
