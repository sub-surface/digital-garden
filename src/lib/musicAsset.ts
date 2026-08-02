/**
 * Keep Web Audio media same-origin on every shell. R2's public CORS policy can
 * drift per hostname; the Worker proxy has one stable URL and preserves Range.
 */
const MUSIC_R2 = "https://pub-1c8f47f651264c60ac3e99705b46795e.r2.dev/"

export function musicAssetUrl(path: string): string {
  if (!path.startsWith(MUSIC_R2)) return path
  return `/api/music/${path.slice(MUSIC_R2.length)}`
}
