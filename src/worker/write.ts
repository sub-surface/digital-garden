/**
 * /api/write/* — the owner's writing desk for daily notes (the /write page).
 *
 * Writing and publishing are separate on purpose. Every push to master is a
 * Cloudflare deploy, so typing goes to a draft in D1 (binding DESK_DB, schema
 * docs/migrations/d1/) with snapshots in `daily_revisions`, images wait in a
 * private R2 bucket (DESK_MEDIA), and only "Commit" touches GitHub: ONE commit
 * holding the note, the images it uses, its OG card + plate (drawn in the
 * browser, because CF never runs PROCESS_OG) and the updated card manifest.
 *
 * Security model:
 *  - Every route is admin-only (the dispatcher enforces `auth: "admin"`), except
 *    the font proxy, which serves two fixed public files and takes no input.
 *  - Nothing is publicly readable before commit: images are served only through
 *    the admin route below (the page fetches them with its token, as blobs).
 *  - Every repo path is built here from a validated date or a sanitised name
 *    ([a-z0-9-] + an extension chosen from the sniffed type), so a commit can
 *    only touch content/Daily/<date>.md, content/Media/daily-*.<img>,
 *    public/og/<that day>.jpg, public/og/art/<that day>.jpg and the card manifest.
 *  - A draft remembers the blob sha of the repo file it started from. Commit
 *    refuses (409, with the repo's version) if master has moved that file since,
 *    e.g. an Obsidian edit pushed from the laptop.
 */
import type { RouteCtx } from "./types"
import { CONTENT_REPO, ghApi, jsonResponse, readJson, upstreamError } from "./lib"
import { appendJot, dailyRepoPath, dailySlugFor, fullTitle, isIsoDate, parseDaily, scaffoldDaily, serializeDaily } from "../lib/daily-source"
import { ogCardBase } from "../lib/slug"

const MAX_SOURCE = 200_000
const MAX_IMAGE = 15 * 1024 * 1024
const MAX_CARD_B64 = 3 * 1024 * 1024
/** A snapshot at most this often while typing, and at most this many kept per day. */
const REVISION_EVERY_MS = 10 * 60_000
const REVISIONS_KEPT = 100
/** Names this module generates; anything else is never read or written. */
const MEDIA_NAME = /^daily-[a-z0-9-]{1,60}\.(png|jpg|gif|webp|avif)$/

interface DraftRow {
  iso: string
  source: string
  base_sha: string | null
  media: string[]
  updated_at: string
  committed_at: string | null
  committed_sha: string | null
}

// ── encoding ──
function bytesBase64(bytes: Uint8Array): string {
  let bin = ""
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
function base64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\s+/g, ""))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}
const ghPath = (p: string) => p.split("/").map(encodeURIComponent).join("/")
const now = () => new Date().toISOString()

// ── storage ──
class Unconfigured extends Error {}
function db(ctx: RouteCtx): D1Database {
  if (!ctx.env.DESK_DB) throw new Unconfigured("DESK_DB")
  return ctx.env.DESK_DB
}
function bucket(ctx: RouteCtx): R2Bucket {
  if (!ctx.env.DESK_MEDIA) throw new Unconfigured("DESK_MEDIA")
  return ctx.env.DESK_MEDIA
}
const mediaKey = (iso: string, name: string) => `${iso}/${name}`

async function getDraft(ctx: RouteCtx, iso: string): Promise<DraftRow | null> {
  const row = await db(ctx).prepare("SELECT * FROM daily_drafts WHERE iso = ?").bind(iso).first<Omit<DraftRow, "media"> & { media: string }>()
  if (!row) return null
  let media: string[] = []
  try { media = (JSON.parse(row.media) as unknown[]).filter((m): m is string => typeof m === "string" && MEDIA_NAME.test(m)) } catch { /* treat as none */ }
  return { ...row, media }
}

const DRAFT_COLUMNS = new Set(["source", "base_sha", "media", "updated_at", "committed_at", "committed_sha"])

/** Insert or update the given columns (others are left alone). */
async function putDraft(ctx: RouteCtx, iso: string, cols: Partial<Omit<DraftRow, "iso">>): Promise<string> {
  const at = cols.updated_at ?? now()
  const set: Record<string, unknown> = { ...cols, updated_at: at }
  if (set.media) set.media = JSON.stringify(set.media)
  // Column names are interpolated, so only ever these.
  const keys = Object.keys(set).filter((k) => DRAFT_COLUMNS.has(k))
  await db(ctx).prepare(
    `INSERT INTO daily_drafts (iso, ${keys.join(", ")}) VALUES (?, ${keys.map(() => "?").join(", ")})
     ON CONFLICT (iso) DO UPDATE SET ${keys.map((k) => `${k} = excluded.${k}`).join(", ")}`,
  ).bind(iso, ...keys.map((k) => set[k] ?? null)).run()
  return at
}

/** Snapshot `source` unless an identical or recent one exists (or `force`); keep the newest REVISIONS_KEPT. */
async function snapshot(ctx: RouteCtx, iso: string, source: string, force = false): Promise<void> {
  try {
    const d = db(ctx)
    if (!force) {
      const last = await d.prepare("SELECT created_at, source FROM daily_revisions WHERE iso = ? ORDER BY created_at DESC LIMIT 1").bind(iso).first<{ created_at: string; source: string }>()
      if (last && (last.source === source || Date.now() - Date.parse(last.created_at) < REVISION_EVERY_MS)) return
    }
    await d.batch([
      d.prepare("INSERT INTO daily_revisions (iso, source, created_at) VALUES (?, ?, ?)").bind(iso, source, now()),
      d.prepare("DELETE FROM daily_revisions WHERE iso = ? AND id NOT IN (SELECT id FROM daily_revisions WHERE iso = ? ORDER BY created_at DESC LIMIT ?)").bind(iso, iso, REVISIONS_KEPT),
    ])
  } catch (e) {
    // History is a convenience; a failed snapshot must not fail the save it rides on.
    console.error("[write] snapshot failed:", e)
  }
}

/** The note as it is on master: source + blob sha, or null when there is no file. */
async function repoNote(ctx: RouteCtx, iso: string, ref = "master"): Promise<{ source: string; sha: string } | null | Response> {
  const res = await ghApi(ctx.env)(`${CONTENT_REPO}/contents/${ghPath(dailyRepoPath(iso))}?ref=${ref}`, "GET")
  if (res.status === 404) return null
  if (!res.ok) return upstreamError("daily repo read", res, "Could not read the note from GitHub")
  const file = await res.json<{ content: string; sha: string }>()
  return { source: base64Utf8(file.content), sha: file.sha }
}

function isoFrom(ctx: RouteCtx): string | null {
  const iso = ctx.match[1]
  return isIsoDate(iso) ? iso : null
}

/** Storage not bound (fresh checkout, binding missing in wrangler.toml): say so plainly. */
function guarded(handler: (ctx: RouteCtx) => Promise<Response>) {
  return async (ctx: RouteCtx): Promise<Response> => {
    try {
      return await handler(ctx)
    } catch (e) {
      if (e instanceof Unconfigured) return jsonResponse({ error: `The desk's storage isn't set up (${e.message} binding missing).` }, 503)
      throw e
    }
  }
}

// ── handlers ──

/** GET /api/write/day/:iso → { draft, repo } (either may be null). */
export const handleWriteDayGet = guarded(async (ctx) => {
  const iso = isoFrom(ctx)
  if (!iso) return jsonResponse({ error: "Bad date" }, 400)
  const [draft, repo] = await Promise.all([getDraft(ctx, iso), repoNote(ctx, iso)])
  if (repo instanceof Response) return repo
  return jsonResponse({ iso, slug: dailySlugFor(iso), draft, repo })
})

/** PUT /api/write/day/:iso { source, baseSha } → { updated_at }. The autosave. */
export const handleWriteDayPut = guarded(async (ctx) => {
  const iso = isoFrom(ctx)
  if (!iso) return jsonResponse({ error: "Bad date" }, 400)
  const body = await readJson<{ source: string; baseSha: string | null }>(ctx.request)
  if (body instanceof Response) return body
  if (typeof body.source !== "string") return jsonResponse({ error: "Missing source" }, 400)
  if (body.source.length > MAX_SOURCE) return jsonResponse({ error: "Note too long" }, 413)
  const baseSha = typeof body.baseSha === "string" && /^[0-9a-f]{40}$/.test(body.baseSha) ? body.baseSha : null
  const updated_at = await putDraft(ctx, iso, { source: body.source, base_sha: baseSha })
  ctx.waitUntil(snapshot(ctx, iso, body.source))
  return jsonResponse({ updated_at })
})

/** DELETE /api/write/day/:iso — throw the draft away, back to master's copy (a snapshot is kept). */
export const handleWriteDayDelete = guarded(async (ctx) => {
  const iso = isoFrom(ctx)
  if (!iso) return jsonResponse({ error: "Bad date" }, 400)
  const draft = await getDraft(ctx, iso)
  if (!draft) return jsonResponse({ ok: true })
  await snapshot(ctx, iso, draft.source, true)
  const repo = await repoNote(ctx, iso)
  if (repo instanceof Response) return repo
  await putDraft(ctx, iso, { source: repo?.source ?? "", base_sha: repo?.sha ?? null, updated_at: draft.committed_at ?? new Date(0).toISOString() })
  return jsonResponse({ ok: true })
})

/** GET /api/write/days → every draft's state, for the calendar. */
export const handleWriteDays = guarded(async (ctx) => {
  const { results } = await db(ctx).prepare("SELECT iso, updated_at, committed_at FROM daily_drafts WHERE source != '' ORDER BY iso DESC LIMIT 400").all()
  return jsonResponse({ days: results })
})

/** GET /api/write/day/:iso/revisions → newest first. */
export const handleWriteRevisions = guarded(async (ctx) => {
  const iso = isoFrom(ctx)
  if (!iso) return jsonResponse({ error: "Bad date" }, 400)
  const { results } = await db(ctx).prepare("SELECT id, created_at, source FROM daily_revisions WHERE iso = ? ORDER BY created_at DESC LIMIT 60").bind(iso).all()
  return jsonResponse({ revisions: results })
})

/**
 * POST /api/write/jot { iso, text, stamp } — add a paragraph to a day's draft
 * without opening the desk (the dock prompt's `jot`). Starts the draft from
 * the repo's note, or a fresh scaffold, when there isn't one.
 */
export const handleWriteJot = guarded(async (ctx) => {
  const body = await readJson<{ iso: string; text: string; stamp: string }>(ctx.request)
  if (body instanceof Response) return body
  if (!isIsoDate(body.iso)) return jsonResponse({ error: "Bad date" }, 400)
  const text = typeof body.text === "string" ? body.text.trim() : ""
  if (!text) return jsonResponse({ error: "Nothing to jot" }, 400)
  if (text.length > 10_000) return jsonResponse({ error: "That's more than a jot" }, 413)
  const iso = body.iso
  const draft = await getDraft(ctx, iso)
  let source = draft?.source || undefined
  let baseSha = draft?.base_sha ?? null
  if (!source) {
    const repo = await repoNote(ctx, iso)
    if (repo instanceof Response) return repo
    source = repo?.source
    baseSha = repo?.sha ?? null
  }
  const doc = source ? parseDaily(source, iso) : scaffoldDaily(iso)
  // The client sends its local "HH:MM" (the Worker doesn't know the writer's clock).
  const stamp = typeof body.stamp === "string" && /^\d{2}:\d{2}$/.test(body.stamp) ? body.stamp : null
  doc.body = appendJot(doc.body, stamp ? `**${stamp}** ${text}` : text)
  const next = serializeDaily(doc, source)
  if (next.length > MAX_SOURCE) return jsonResponse({ error: "Note too long" }, 413)
  const updated_at = await putDraft(ctx, iso, { source: next, base_sha: baseSha })
  ctx.waitUntil(snapshot(ctx, iso, next))
  return jsonResponse({ iso, fresh: !source, updated_at })
})

/** Magic bytes for each accepted type. SVG is deliberately not accepted: it can carry script. */
const IMAGE_TYPES: Record<string, { ext: string; sniff: (b: Uint8Array) => boolean }> = (() => {
  const at = (b: Uint8Array, i: number, v: number[]) => v.every((x, k) => b[i + k] === x)
  const ascii = (b: Uint8Array, i: number, s: string) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0))
  return {
    "image/png": { ext: "png", sniff: (b) => at(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
    "image/jpeg": { ext: "jpg", sniff: (b) => at(b, 0, [0xff, 0xd8, 0xff]) },
    "image/gif": { ext: "gif", sniff: (b) => ascii(b, 0, "GIF87a") || ascii(b, 0, "GIF89a") },
    "image/webp": { ext: "webp", sniff: (b) => ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP") },
    "image/avif": { ext: "avif", sniff: (b) => ascii(b, 4, "ftyp") && (ascii(b, 8, "avif") || ascii(b, 8, "avis")) },
  }
})()
const TYPE_OF_EXT: Record<string, string> = Object.fromEntries(Object.entries(IMAGE_TYPES).map(([mime, t]) => [t.ext, mime]))

/**
 * POST /api/write/media?iso=…&name=… (raw image body) → { name }.
 * Held in R2 until commit copies it into content/Media/. Names are lowercase
 * (CF static assets are case-sensitive) and never collide with a vault file.
 */
export const handleWriteMedia = guarded(async (ctx) => {
  const iso = ctx.url.searchParams.get("iso")
  if (!isIsoDate(iso)) return jsonResponse({ error: "Bad date" }, 400)
  const mime = (ctx.request.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase()
  const type = IMAGE_TYPES[mime]
  if (!type) return jsonResponse({ error: "Images only (png, jpg, gif, webp, avif)" }, 415)
  const declared = Number(ctx.request.headers.get("Content-Length") ?? 0)
  if (declared > MAX_IMAGE) return jsonResponse({ error: "Image over 15 MB" }, 413)
  const bytes = new Uint8Array(await ctx.request.arrayBuffer())
  if (!bytes.length) return jsonResponse({ error: "Empty file" }, 400)
  if (bytes.length > MAX_IMAGE) return jsonResponse({ error: "Image over 15 MB" }, 413)
  // The file is published under this extension, so the bytes must match it.
  if (!type.sniff(bytes)) return jsonResponse({ error: "That file isn't the image it claims to be" }, 415)

  const draft = await getDraft(ctx, iso)
  const stem = (ctx.url.searchParams.get("name") ?? "image").replace(/\.[a-z0-9]+$/i, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/^daily-?/, "").slice(0, 40) || "image"
  const base = `daily-${stem}`
  const taken = new Set(draft?.media ?? [])
  let name = `${base}.${type.ext}`
  for (let n = 2; ; n++) {
    if (n > 50) return jsonResponse({ error: "Too many images with that name" }, 409)
    if (!taken.has(name)) {
      const exists = await ghApi(ctx.env)(`${CONTENT_REPO}/contents/${ghPath(`content/Media/${name}`)}?ref=master`, "GET")
      if (exists.status === 404) break
      if (!exists.ok) return upstreamError("media name check", exists, "Could not check the media folder")
    }
    name = `${base}-${n}.${type.ext}`
  }

  await bucket(ctx).put(mediaKey(iso, name), bytes, { httpMetadata: { contentType: mime } })
  await putDraft(ctx, iso, { media: [...taken, name], ...(draft ? {} : { source: "" }) })
  return jsonResponse({ name })
})

/** GET /api/write/media/:iso/:name — an image waiting for commit (admin only; never public). */
export const handleWriteMediaGet = guarded(async (ctx) => {
  const iso = ctx.match[1]
  const name = ctx.match[2]
  if (!isIsoDate(iso) || !MEDIA_NAME.test(name)) return jsonResponse({ error: "Not found" }, 404)
  const obj = await bucket(ctx).get(mediaKey(iso, name))
  if (!obj) return jsonResponse({ error: "Not found" }, 404)
  return new Response(obj.body, {
    headers: {
      // Type from our own extension map, never from stored metadata.
      "Content-Type": TYPE_OF_EXT[name.split(".").pop()!] ?? "application/octet-stream",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
    },
  })
})

/** Media the source actually uses: `![[name]]`, `![](name)`, `Media/name`. */
function referencedMedia(source: string, media: string[]): string[] {
  return media.filter((name) => {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    return new RegExp(`(\\[\\[(Media/)?${esc}(\\|[^\\]]*)?\\]\\]|\\]\\((/content/)?(Media/)?${esc}\\))`, "i").test(source)
  })
}

class Conflict { constructor(readonly repo: { source: string; sha: string } | null) {} }

/**
 * POST /api/write/commit { iso, source, baseSha, card, plate } → { commit, url, sha }.
 * `card` / `plate` are base64 JPEGs drawn by the browser (optional: without them
 * the note ships with no card until a local `PROCESS_OG=true npm run prebuild`).
 */
export const handleWriteCommit = guarded(async (ctx) => {
  const body = await readJson<{ iso: string; source: string; baseSha: string | null; card: string; plate: string }>(ctx.request)
  if (body instanceof Response) return body
  if (!isIsoDate(body.iso)) return jsonResponse({ error: "Bad date" }, 400)
  if (typeof body.source !== "string" || !body.source.trim()) return jsonResponse({ error: "Nothing to commit" }, 400)
  if (body.source.length > MAX_SOURCE) return jsonResponse({ error: "Note too long" }, 413)
  for (const k of ["card", "plate"] as const) {
    const v = body[k]
    // base64 of a JPEG always starts "/9j/" (FF D8 FF): anything else isn't the card.
    if (v !== undefined && (typeof v !== "string" || v.length > MAX_CARD_B64 || !/^\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(v))) {
      return jsonResponse({ error: `Bad ${k} image` }, 400)
    }
  }
  const iso = body.iso
  const source = body.source
  const baseSha = typeof body.baseSha === "string" && /^[0-9a-f]{40}$/.test(body.baseSha) ? body.baseSha : null

  const draft = await getDraft(ctx, iso)
  const media = referencedMedia(source, draft?.media ?? [])
  const fields = parseDaily(source, iso).fields

  const gh = ghApi(ctx.env)
  const ok = async <T,>(res: Response, label: string): Promise<T> => {
    if (!res.ok) throw new Error(`${label}: ${res.status} ${(await res.text()).slice(0, 200)}`)
    return res.json<T>()
  }
  const blob = async (content: string, encoding: "base64" | "utf-8") =>
    (await ok<{ sha: string }>(await gh(`${CONTENT_REPO}/git/blobs`, "POST", { content, encoding }), "blob")).sha

  try {
    // Images and cards don't depend on master, so upload them once, outside the retry.
    const mediaBlobs: { path: string; sha: string }[] = []
    for (const name of media) {
      const obj = await bucket(ctx).get(mediaKey(iso, name))
      if (!obj) return jsonResponse({ error: `${name} is missing from the desk's storage` }, 409)
      mediaBlobs.push({ path: `content/Media/${name}`, sha: await blob(bytesBase64(new Uint8Array(await obj.arrayBuffer())), "base64") })
    }
    const cardName = ogCardBase(dailySlugFor(iso))
    const cardBlobs: { path: string; sha: string }[] = []
    if (body.card) cardBlobs.push({ path: `public/og/${cardName}.jpg`, sha: await blob(body.card, "base64") })
    if (body.plate) cardBlobs.push({ path: `public/og/art/${cardName}.jpg`, sha: await blob(body.plate, "base64") })
    const noteSha = await blob(source, "utf-8")

    const attempt = async () => {
      const ref = await ok<{ object: { sha: string } }>(await gh(`${CONTENT_REPO}/git/ref/heads/master`, "GET"), "ref")
      const head = ref.object.sha
      const repo = await repoNote(ctx, iso, head)
      if (repo instanceof Response) throw new Error("could not read the note on master")
      if ((repo?.sha ?? null) !== baseSha && repo?.sha !== noteSha) throw new Conflict(repo)
      const commit = await ok<{ tree: { sha: string } }>(await gh(`${CONTENT_REPO}/git/commits/${head}`, "GET"), "head commit")

      const tree: { path: string; mode: "100644"; type: "blob"; sha: string | null }[] = [
        { path: dailyRepoPath(iso), mode: "100644", type: "blob", sha: noteSha },
        ...[...mediaBlobs, ...cardBlobs].map((b) => ({ ...b, mode: "100644" as const, type: "blob" as const })),
      ]
      if (body.card) {
        // The Worker serves og:image only for cards in the manifest (src/worker/meta.ts).
        const man = await ok<{ content: string }>(await gh(`${CONTENT_REPO}/contents/public/og/manifest.json?ref=${head}`, "GET"), "og manifest")
        const cards = new Set<string>(JSON.parse(base64Utf8(man.content)) as string[])
        if (cards.has(`${cardName}.png`)) {
          cards.delete(`${cardName}.png`)
          tree.push({ path: `public/og/${cardName}.png`, mode: "100644", type: "blob", sha: null })
        }
        cards.add(`${cardName}.jpg`)
        // Same shape as scripts/og-gen.ts writeManifest().
        tree.push({ path: "public/og/manifest.json", mode: "100644", type: "blob", sha: await blob(JSON.stringify([...cards].sort(), null, 0) + "\n", "utf-8") })
      }
      const newTree = await ok<{ sha: string }>(await gh(`${CONTENT_REPO}/git/trees`, "POST", { base_tree: commit.tree.sha, tree }), "tree")
      const title = `${fields.public ? "daily" : "daily (unpublished)"}: ${fullTitle(iso, fields.headline)}`
      const made = await ok<{ sha: string; html_url: string }>(await gh(`${CONTENT_REPO}/git/commits`, "POST", {
        message: `${title}\n\nWritten at /write.${media.length ? ` Images: ${media.join(", ")}.` : ""}`,
        tree: newTree.sha,
        parents: [head],
      }), "commit")
      // Fast-forward only: never rewrites anything pushed meanwhile.
      const upd = await gh(`${CONTENT_REPO}/git/refs/heads/master`, "PATCH", { sha: made.sha, force: false })
      if (upd.status === 422) return null // master moved under us: try again
      await ok(upd, "update ref")
      return made
    }

    const made = (await attempt()) ?? (await attempt())
    if (!made) return jsonResponse({ error: "master kept moving; try again" }, 409)
    const committed_at = now()
    try {
      await putDraft(ctx, iso, { source, base_sha: noteSha, committed_at, committed_sha: made.sha })
    } catch (e) {
      console.error("[write] committed but draft bookkeeping failed:", e)
    }
    ctx.waitUntil(snapshot(ctx, iso, source, true))
    return jsonResponse({ commit: made.sha, url: made.html_url, sha: noteSha, committed_at, images: media })
  } catch (e) {
    if (e instanceof Conflict) {
      return jsonResponse({ error: "The note changed on master since this draft began", conflict: true, repo: e.repo }, 409)
    }
    if (e instanceof Unconfigured) throw e
    console.error("[write] commit failed:", e)
    return jsonResponse({ error: `Commit failed: ${e instanceof Error ? e.message : String(e)}` }, 502)
  }
})

const FONTS: Record<string, string> = {
  regular: "https://raw.githubusercontent.com/octaviopardo/EBGaramond12/master/fonts/ttf/EBGaramond-Regular.ttf",
  semibold: "https://raw.githubusercontent.com/octaviopardo/EBGaramond12/master/fonts/ttf/EBGaramond-SemiBold.ttf",
}

/** GET /api/write/font/:weight — the OG card font, same files as scripts/og-system.ts. */
export async function handleWriteFont(ctx: RouteCtx): Promise<Response> {
  const src = FONTS[ctx.match[1]]
  if (!src) return jsonResponse({ error: "Unknown font" }, 404)
  const cache = (globalThis as unknown as { caches?: { default: Cache } }).caches?.default
  // Keyed on the fixed upstream URL, so no request detail can vary the cache.
  const key = new Request(src)
  const hit = await cache?.match(key)
  if (hit) return hit
  const res = await fetch(src)
  if (!res.ok) return upstreamError("card font", res, "Could not load the card font", 502)
  const out = new Response(res.body, { headers: { "Content-Type": "font/ttf", "Cache-Control": "public, max-age=31536000, immutable" } })
  if (cache) ctx.waitUntil(cache.put(key, out.clone()))
  return out
}
