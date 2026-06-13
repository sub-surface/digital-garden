/**
 * sync-music.ts — SoundCloud is the source of truth for the site's music.
 *
 * Run locally on demand (NOT at deploy time): `npm run sync:music`
 *
 * Pipeline per track:
 *   yt-dlp (download) -> ffmpeg (transcode to ~TARGET_KBPS, extract cover)
 *     -> wrangler r2 object put (upload mp3 + cover) -> public/music.json
 *
 * Incremental: tracks already present in music.json (matched by SoundCloud id)
 * are skipped. Delete an entry from music.json (and re-run) to force a refresh,
 * or pass --force to re-sync everything.
 *
 * Requirements (installed via winget on this machine):
 *   - yt-dlp, ffmpeg, ffprobe   (audio toolchain)
 *   - wrangler, logged in        (`npx wrangler login`) for R2 upload
 *
 * Flags:
 *   --force      re-download/transcode/upload every track
 *   --dry-run    do everything except upload to R2 and write music.json
 *   --limit=N    only process the first N new tracks (handy for testing)
 *   --no-upload  transcode locally but skip R2 (artifacts kept in tmp dir)
 */

import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import { execFileSync, execSync } from "child_process"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const PUBLIC_DIR = path.join(ROOT, "public")
const TMP_DIR = path.join(ROOT, ".music-sync-tmp")
const MANIFEST = path.join(PUBLIC_DIR, "music.json")

// ─── Config ────────────────────────────────────────────────────────────────
const SOUNDCLOUD_URL = "https://soundcloud.com/m0rvidd/tracks"
const ARTIST_DEFAULT = "m0rvidd"
// Size-targeted encoding: pick a bitrate so each track lands near TARGET_MB
// regardless of length, clamped to a quality floor/ceiling.
const TARGET_MB = 5
const MIN_KBPS = 96 // quality floor for long tracks
const MAX_KBPS = 192 // don't bloat short tracks past this
const R2_BUCKET = "subsurfaces-music"
// Public base URL the site uses to stream audio. Set after enabling public
// access on the bucket (r2.dev URL or a custom domain). Falls back to env.
const R2_PUBLIC_BASE =
  process.env.R2_PUBLIC_BASE ||
  "https://pub-1c8f47f651264c60ac3e99705b46795e.r2.dev"
// ───────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const FORCE = args.includes("--force")
const DRY_RUN = args.includes("--dry-run")
const NO_UPLOAD = args.includes("--no-upload") || DRY_RUN
const LIMIT = (() => {
  const a = args.find((x) => x.startsWith("--limit="))
  return a ? parseInt(a.split("=")[1], 10) : Infinity
})()

// Resolve tool paths: prefer PATH, fall back to the winget Links dir.
const WINGET_LINKS = path.join(
  process.env.LOCALAPPDATA || "",
  "Microsoft",
  "WinGet",
  "Links",
)
function tool(name: string): string {
  const exe = process.platform === "win32" ? `${name}.exe` : name
  const linked = path.join(WINGET_LINKS, exe)
  if (process.platform === "win32" && fs.existsSync(linked)) return linked
  return name // assume on PATH
}
const YTDLP = tool("yt-dlp")
const FFMPEG = tool("ffmpeg")

interface Track {
  title: string
  artist: string
  audio: string // public URL (R2)
  cover: string // public URL (R2) or external
  slug: string // music/<slugified-title>, kept for music: links + note matching
  scId: string // SoundCloud track id — the dedupe key
  scUrl: string // SoundCloud permalink
  year?: number
  duration?: number
}

/** Bitrate (kbps) so an mp3 of `durationSec` lands near TARGET_MB, clamped. */
function targetBitrate(durationSec?: number): number {
  if (!durationSec || durationSec <= 0) return 128
  // Reserve ~0.4 MB for the embedded cover + container overhead.
  const audioBudgetBits = (TARGET_MB - 0.4) * 1024 * 1024 * 8
  const kbps = Math.floor(audioBudgetBits / durationSec / 1000)
  return Math.max(MIN_KBPS, Math.min(MAX_KBPS, kbps))
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
}

function run(cmd: string, cmdArgs: string[], opts: { quiet?: boolean } = {}): string {
  return execFileSync(cmd, cmdArgs, {
    encoding: "utf-8",
    stdio: opts.quiet ? ["ignore", "pipe", "ignore"] : ["ignore", "pipe", "inherit"],
    maxBuffer: 1024 * 1024 * 64,
  })
}

function loadManifest(): Track[] {
  if (!fs.existsSync(MANIFEST)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(MANIFEST, "utf-8"))
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

interface ScEntry {
  id: string
  title: string
  url: string
}

function listSoundCloud(): ScEntry[] {
  console.log(`→ Listing tracks on ${SOUNDCLOUD_URL}`)
  const out = run(
    YTDLP,
    ["--flat-playlist", "--print", "%(id)s\t%(title)s\t%(url)s", SOUNDCLOUD_URL],
    { quiet: true },
  )
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [id, title, url] = line.split("\t")
      return { id, title, url }
    })
    .filter((e) => e.id && e.url)
}

function downloadAndTranscode(entry: ScEntry): {
  mp3: string
  cover: string | null
  meta: { artist: string; year?: number; duration?: number }
} {
  const base = path.join(TMP_DIR, entry.id)
  const rawMp3 = `${base}.raw.mp3`
  const infoJson = `${base}.info.json`
  const webMp3 = `${base}.web.mp3`
  const coverPng = `${base}.cover.png`

  // 1. Download best audio -> mp3 with embedded metadata + thumbnail
  run(YTDLP, [
    "--no-playlist",
    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "0",
    "--embed-thumbnail",
    "--embed-metadata",
    "--write-info-json",
    "--force-overwrites",
    "-o",
    `${base}.%(ext)s`,
    entry.url,
  ])
  // yt-dlp writes "<id>.mp3" and "<id>.info.json"
  const dlMp3 = `${base}.mp3`
  if (!fs.existsSync(dlMp3)) throw new Error(`download produced no mp3 for ${entry.title}`)
  fs.renameSync(dlMp3, rawMp3)

  // 2. Read metadata from the info.json
  let artist = ARTIST_DEFAULT
  let year: number | undefined
  let duration: number | undefined
  if (fs.existsSync(infoJson)) {
    try {
      const j = JSON.parse(fs.readFileSync(infoJson, "utf-8"))
      if (j.uploader) artist = String(j.uploader)
      if (j.upload_date) year = parseInt(String(j.upload_date).slice(0, 4), 10)
      if (j.duration) duration = Math.round(Number(j.duration))
    } catch {
      /* keep defaults */
    }
  }

  // 3. Transcode at a size-targeted bitrate, preserving embedded cover
  const kbps = targetBitrate(duration)
  run(FFMPEG, [
    "-y",
    "-i",
    rawMp3,
    "-map",
    "0:a",
    "-map",
    "0:v?",
    "-c:a",
    "libmp3lame",
    "-b:a",
    `${kbps}k`,
    "-c:v",
    "copy",
    "-id3v2_version",
    "3",
    "-metadata:s:v",
    "title=Album cover",
    "-metadata:s:v",
    "comment=Cover (front)",
    webMp3,
  ])

  // 4. Extract standalone cover (if the mp3 has embedded art)
  let cover: string | null = null
  try {
    run(FFMPEG, ["-y", "-i", rawMp3, "-an", "-c:v", "copy", coverPng], { quiet: true })
    if (fs.existsSync(coverPng) && fs.statSync(coverPng).size > 0) cover = coverPng
  } catch {
    cover = null
  }

  return { mp3: webMp3, cover, meta: { artist, year, duration } }
}

function uploadToR2(localPath: string, key: string): string {
  if (NO_UPLOAD) {
    console.log(`   (skip upload) ${key}`)
    return `${R2_PUBLIC_BASE}/${key}`
  }
  // wrangler r2 object put <bucket>/<key> --file <path> --remote
  execSync(
    `npx wrangler r2 object put "${R2_BUCKET}/${key}" --file "${localPath}" --remote`,
    { cwd: ROOT, stdio: "inherit" },
  )
  return `${R2_PUBLIC_BASE}/${key}`
}

async function main() {
  console.log("=== sync:music ===")
  if (DRY_RUN) console.log("(dry-run: no R2 upload, no manifest write)")
  fs.mkdirSync(TMP_DIR, { recursive: true })

  const existing = loadManifest()
  const bySc = new Map(existing.map((t) => [t.scId, t]))

  const sc = listSoundCloud()
  console.log(`→ ${sc.length} tracks on SoundCloud, ${existing.length} already in manifest`)

  const todo = sc.filter((e) => FORCE || !bySc.has(e.id)).slice(0, LIMIT)
  if (!todo.length) {
    console.log("✓ Nothing new to sync.")
    return
  }
  console.log(`→ ${todo.length} track(s) to process${FORCE ? " (--force)" : ""}\n`)

  const result = new Map(bySc) // start from existing, overwrite/add as we go
  let ok = 0
  let failed = 0

  for (let i = 0; i < todo.length; i++) {
    const entry = todo[i]
    const tag = `[${i + 1}/${todo.length}] ${entry.title}`
    try {
      console.log(`\n${tag}`)
      const { mp3, cover, meta } = downloadAndTranscode(entry)
      const slug = `music/${slugify(entry.title)}`
      const keyBase = slugify(entry.title) || entry.id

      const audioUrl = uploadToR2(mp3, `audio/${keyBase}.mp3`)
      let coverUrl = ""
      if (cover) {
        coverUrl = uploadToR2(cover, `covers/${keyBase}.png`)
      }

      result.set(entry.id, {
        title: entry.title,
        artist: meta.artist || ARTIST_DEFAULT,
        audio: audioUrl,
        cover: coverUrl,
        slug,
        scId: entry.id,
        scUrl: entry.url,
        year: meta.year,
        duration: meta.duration,
      })
      ok++
      const mb = (fs.statSync(mp3).size / 1024 / 1024).toFixed(2)
      console.log(`   ✓ ${entry.title} — ${mb} MB`)
    } catch (err) {
      failed++
      console.error(`   ✘ ${entry.title}: ${(err as Error).message}`)
    }
  }

  if (!DRY_RUN) {
    // Preserve SoundCloud ordering; entries not on SC anymore drop off.
    const ordered = sc
      .map((e) => result.get(e.id))
      .filter((t): t is Track => Boolean(t))
    fs.writeFileSync(MANIFEST, JSON.stringify(ordered, null, 2))
    console.log(`\n→ Wrote ${MANIFEST} (${ordered.length} tracks)`)
  }

  console.log(`\n=== done: ${ok} ok, ${failed} failed ===`)
  if (!NO_UPLOAD) {
    // Clean tmp on success to avoid stale artifacts; keep on --no-upload for inspection.
    try {
      fs.rmSync(TMP_DIR, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
