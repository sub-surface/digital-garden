import assert from "node:assert/strict"
import { canFound, canStack, deal, type Card } from "../src/features/os/solitaireLogic"
import { parseFeed } from "../src/worker/widgets"
import { handleRestores, validRestoreSlug } from "../src/worker/restores"
import type { RouteCtx } from "../src/worker/types"

const first = deal(0xc7ab2c90)
const repeat = deal(0xc7ab2c90)
assert.deepEqual(first, repeat, "seeded deals must be reproducible")
assert.equal(first.stock.length, 24)
assert.deepEqual(first.tableau.map((pile) => pile.length), [1, 2, 3, 4, 5, 6, 7])
assert.equal(new Set([...first.stock, ...first.tableau.flat()].map((card) => card.id)).size, 52)
assert(first.tableau.every((pile) => pile.at(-1)?.faceUp), "each tableau tail starts face-up")

const card = (suit: Card["suit"], rank: Card["rank"]): Card => ({ id: `${suit}-${rank}`, suit, rank, faceUp: true })
assert(canStack(card("hearts", 12), card("clubs", 13)))
assert(!canStack(card("diamonds", 12), card("hearts", 13)))
assert(canStack(card("spades", 13)))
assert(canFound(card("clubs", 1)))
assert(canFound(card("clubs", 2), card("clubs", 1)))
assert(!canFound(card("spades", 2), card("clubs", 1)))

const feed = parseFeed(`
  <rss><channel><item><title><![CDATA[A &amp; B]]></title><link>https://example.com/a</link><pubDate>today</pubDate></item>
  <item><title>Unsafe</title><link>javascript:alert(1)</link></item></channel></rss>
`)
assert.deepEqual(feed, [{ title: "A & B", link: "https://example.com/a", publishedAt: "today" }])

assert(validRestoreSlug("notes/recovered-disk"))
assert(!validRestoreSlug("https://example.com"))
assert(!validRestoreSlug("../secret"))

const originalFetch = globalThis.fetch
globalThis.fetch = (async () => new Response(JSON.stringify({
  code: "PGRST205",
  message: "Could not find the table 'public.os_restores' in the schema cache",
}), { status: 404, headers: { "Content-Type": "application/json" } })) as typeof fetch
try {
  const response = await handleRestores({
    request: new Request("https://os.subsurfaces.net/api/os/restores"),
    env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_KEY: "test" },
    auth: { id: "reader-1" },
  } as RouteCtx)
  assert.equal(response.status, 200, "an unapplied optional migration must not become a console 500")
  assert.deepEqual(await response.json(), { restores: [], available: false })
} finally {
  globalThis.fetch = originalFetch
}

console.log("OS rules: solitaire, feeds, and graceful restore capability detection pass.")
