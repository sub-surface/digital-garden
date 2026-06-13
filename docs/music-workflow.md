# Music Workflow

**SoundCloud is the single source of truth for the site's music.** You upload a
track once (to SoundCloud); a local sync command pulls it, compresses it to
~5 MB, extracts the cover, uploads audio + art to Cloudflare R2, and regenerates
the manifest. No per-track markdown notes, no manual file copying, no hand-edited
frontmatter.

---

## Everyday flow

1. Upload (or edit) a track on [soundcloud.com/m0rvidd](https://soundcloud.com/m0rvidd).
2. Run:
   ```bash
   npm run sync:music
   ```
3. Commit the changed `public/music.json` and push. Done.

That's it. The command is incremental — it only downloads tracks that aren't
already in the manifest, so re-running is cheap.

---

## What `sync:music` does

For every **new** SoundCloud track (matched by SoundCloud id, so renames are safe):

```
yt-dlp (download best audio + embedded artwork + metadata)
  → ffmpeg (re-encode to a size-targeted bitrate ≈ 5 MB, keep cover)
  → ffmpeg (extract standalone cover PNG)
  → wrangler r2 object put   (upload mp3 → audio/<slug>.mp3, cover → covers/<slug>.png)
  → write public/music.json  (title, artist, year, duration, R2 urls, SoundCloud url)
```

Metadata comes straight from SoundCloud: **title**, **artist** (uploader),
**year** (upload date), **duration**, and the **cover art** embedded in the
track. Nothing is typed by hand.

### Flags

| Flag | Effect |
|---|---|
| `--force` | Re-download/transcode/upload every track (use after changing encode settings). |
| `--dry-run` | Do everything except upload to R2 and write the manifest. |
| `--no-upload` | Transcode locally, skip R2 (artifacts kept in `.music-sync-tmp/` for inspection). |
| `--limit=N` | Only process the first N new tracks (handy for testing). |

To **refresh a single track** (e.g. you re-uploaded a better mix): delete its
entry from `public/music.json`, then run `npm run sync:music`.

To **remove a track** from the site: delete it on SoundCloud (it drops out of the
manifest on the next sync) **or** delete its entry from `music.json`. Optionally
also delete the R2 objects to reclaim space (see below).

---

## Configuration

Top of `scripts/sync-music.ts`:

| Const | Default | Meaning |
|---|---|---|
| `SOUNDCLOUD_URL` | `…/m0rvidd/tracks` | The profile to sync. |
| `ARTIST_DEFAULT` | `m0rvidd` | Fallback artist if SoundCloud has none. |
| `TARGET_MB` | `5` | Per-track size target. |
| `MIN_KBPS` / `MAX_KBPS` | `96` / `192` | Quality floor/ceiling — bitrate is computed from each track's duration so long and short tracks both land near `TARGET_MB`. |
| `R2_BUCKET` | `subsurfaces-music` | R2 bucket name. |
| `R2_PUBLIC_BASE` | env `R2_PUBLIC_BASE` | Public base URL audio is served from (r2.dev or custom domain). |

---

## R2 (audio hosting)

Audio lives in a Cloudflare R2 bucket, **not** in git — the repo only stores the
small `music.json` manifest. R2 is effectively free at this scale (≈0.2 GB,
well inside the 10 GB free tier; R2 has **no egress fees**).

### One-time setup

1. Log in: `npx wrangler login` (opens a browser → Allow).
2. Create the bucket:
   ```bash
   npx wrangler r2 bucket create subsurfaces-music
   ```
3. Enable public access in the Cloudflare dashboard (R2 → the bucket →
   Settings → Public access), or attach a custom domain. Copy the public URL.
4. Set `R2_PUBLIC_BASE` to that URL — either edit the const in
   `scripts/sync-music.ts` or set it in your environment:
   ```bash
   export R2_PUBLIC_BASE="https://pub-xxxx.r2.dev"   # or https://music.subsurfaces.net
   ```

### Manual object ops

```bash
# list objects
npx wrangler r2 object get subsurfaces-music --remote        # (per-key)
# delete one track's files
npx wrangler r2 object delete "subsurfaces-music/audio/eden.mp3" --remote
npx wrangler r2 object delete "subsurfaces-music/covers/eden.png" --remote
```

---

## Manual fallback (tracks not on SoundCloud)

If a track isn't on SoundCloud (e.g. a one-off bounce from Ableton/FL), convert
and upload it by hand, then add an entry to `public/music.json`.

**Convert + compress a WAV/large MP3 to a ~5 MB web MP3** (replace `300` with the
track length in seconds to hit ~5 MB; or just use `-b:a 128k`):

```bash
# size-targeted: ≈5 MB for a 300s track → ~128k
ffmpeg -i input.wav -c:a libmp3lame -b:a 128k -id3v2_version 3 \
  -metadata title="Track Name" -metadata artist="m0rvidd" output.mp3
```

**Embed a cover** (optional):

```bash
ffmpeg -i output.mp3 -i cover.png -map 0:a -map 1 -c:a copy -c:v copy \
  -id3v2_version 3 -metadata:s:v title="Album cover" tagged.mp3
```

**Upload to R2 and add to the manifest:**

```bash
npx wrangler r2 object put "subsurfaces-music/audio/track-name.mp3" --file output.mp3 --remote
npx wrangler r2 object put "subsurfaces-music/covers/track-name.png" --file cover.png --remote
```

```jsonc
// public/music.json — append an object
{
  "title": "Track Name",
  "artist": "m0rvidd",
  "audio": "https://pub-xxxx.r2.dev/audio/track-name.mp3",
  "cover": "https://pub-xxxx.r2.dev/covers/track-name.png",
  "slug": "music/track-name"
}
```

---

## How the site consumes it

- `MusicProvider` (`src/components/ui/MusicContext.tsx`) fetches `/music.json`
  at runtime and drives a single `<audio>` element + Web Audio analyser.
- `MusicPage`, `MusicPlayer`, `MusicBar`, `MobileMusicBar` all read from that
  context — they don't care where the audio is hosted.
- `music:Track Title` links (case-insensitive title match) play a track and open
  the player from anywhere in the garden; handled in `NoteBody`.
- A track may **optionally** have a backing note at its slug
  (`content/Music/<name>.md`) for liner notes — the `/music` page links to it
  only if it exists. The note is no longer required for a track to appear.
- `prebuild` no longer generates `music.json`; `sync:music` owns it.

---

## Tooling

Requires `yt-dlp`, `ffmpeg`/`ffprobe`, and `wrangler` (logged in). On this
machine they're installed via winget; the sync script resolves them from the
winget Links dir if they're not on `PATH`.
