import assert from "node:assert/strict"
import { canFound, canStack, deal, type Card } from "../src/features/os/solitaireLogic"
import { parseFeed } from "../src/worker/widgets"
import { handleRestores, validRestoreSlug } from "../src/worker/restores"
import type { RouteCtx } from "../src/worker/types"
import {
  insertNext,
  migrateQueue,
  moveQueueItem,
  queueIndexAfterMove,
  queueIndexAfterRemoval,
  shuffleQueue,
} from "../src/components/ui/music/musicQueue"
import {
  createPaintDocument,
  floodPaint,
  normalizePaintDocument,
  paintLine,
  paintPixel,
  parsePaintDocument,
  serializePaintDocument,
} from "../src/features/os/paintModel"
import {
  actOnPetri,
  createPetri,
  normalizePetri,
  petriMood,
  petriStage,
  petriTemperament,
  settlePetri,
} from "../src/features/os/petriModel"

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
assert(canFound(card("clubs", 1), undefined, "clubs"))
assert(!canFound(card("hearts", 1), undefined, "clubs"), "an ace cannot enter another suit's empty foundation")
assert(canFound(card("clubs", 2), card("clubs", 1)))
assert(!canFound(card("spades", 2), card("clubs", 1)))

const queueTracks = [{ slug: "alpha" }, { slug: "beta" }, { slug: "gamma" }]
assert.deepEqual(migrateQueue([2, 0, 2, 99, "missing"], queueTracks), ["gamma", "alpha", "gamma"])
assert.deepEqual(migrateQueue(["beta", "beta"], queueTracks), ["beta", "beta"], "queues preserve repeats")
assert.deepEqual(insertNext(["alpha", "gamma"], 0, "beta"), ["alpha", "beta", "gamma"])
assert.deepEqual(insertNext(["alpha"], -1, "beta"), ["beta", "alpha"])
assert.deepEqual(moveQueueItem(["alpha", "beta", "gamma"], 0, 2), ["beta", "gamma", "alpha"])
assert.equal(queueIndexAfterMove(1, 0, 2), 0)
assert.equal(queueIndexAfterMove(0, 0, 2), 2)
assert.equal(queueIndexAfterRemoval(2, 0), 1)
assert.equal(queueIndexAfterRemoval(1, 1), -1)
assert.deepEqual(shuffleQueue(["alpha", "beta", "gamma"], () => 0), ["beta", "gamma", "alpha"])

let picture = createPaintDocument(8, 8)
picture = paintLine(picture, { x: 3, y: 0 }, { x: 3, y: 7 }, "#111")
picture = floodPaint(picture, { x: 0, y: 0 }, "#b4424c")
assert.equal(picture.pixels[2], "#b4424c")
assert.equal(picture.pixels[3], "#111111", "fill must stop at a painted boundary")
assert.equal(picture.pixels[4], "")
picture = paintPixel(picture, { x: 1, y: 7 }, "#fff", true)
assert.equal(picture.pixels[7 * 8 + 1], "#ffffff")
assert.equal(picture.pixels[7 * 8 + 6], "#ffffff", "mirror mode paints the opposite cell")
assert.deepEqual(parsePaintDocument(serializePaintDocument(picture)), picture)
const hostilePicture = normalizePaintDocument({ width: 999, height: 1, pixels: ["red", "#abc"] })
assert.equal(hostilePicture.width, 64)
assert.equal(hostilePicture.height, 8)
assert.deepEqual(hostilePicture.pixels.slice(0, 2), ["", "#aabbcc"])

const hatchTime = Date.UTC(2026, 7, 2, 12)
const mote = createPetri(hatchTime, 7)
assert.equal(petriTemperament(mote), petriTemperament(createPetri(hatchTime, 7)))
const later = settlePetri(mote, hatchTime + 10 * 60 * 60 * 1_000)
assert(later.needs.fullness < mote.needs.fullness)
assert.equal(settlePetri(mote, hatchTime + 60 * 24 * 60 * 60 * 1_000).needs.fullness, 5, "a neglected pet rests but never dies")
const fed = actOnPetri(later, "feed", hatchTime + 11 * 60 * 60 * 1_000)
assert(fed.needs.fullness > later.needs.fullness)
assert.equal(fed.nonce, later.nonce + 1)
assert.equal(petriStage(mote), "spore")
assert.equal(petriMood({ ...mote, needs: { ...mote.needs, fullness: 6 } }), "peckish")
const recoveredPet = normalizePetri({ ...mote, name: "x".repeat(100), needs: { fullness: -1, joy: 200 } }, hatchTime)
assert.equal(recoveredPet.name.length, 20)
assert.equal(recoveredPet.needs.fullness, 5)
assert.equal(recoveredPet.needs.joy, 100)

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

console.log("OS rules: solitaire, media queues, Paint, Petri, feeds, and graceful restore detection pass.")
