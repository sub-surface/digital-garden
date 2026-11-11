/**
 * The note pipeline's Node host (see pipeline-host.ts): manifests from
 * `public/`, note sources from `content/`, both relative to the working
 * directory (prebuild and the test scripts run from the repo root).
 * Importing this module installs it.
 */
import * as fs from "fs"
import * as path from "path"
import { setPipelineHost } from "./pipeline-host"

/**
 * Prebuild-generated manifests, re-read whenever prebuild rewrites them. A
 * module-level cache once held the first slug-map for the life of the Vite
 * process, so notes added while `npm run dev` was running never resolved.
 */
const manifestCache = new Map<string, { mtimeMs: number; data: unknown }>()

function manifest<T>(file: string, fallback: T): T {
  const abs = path.resolve(process.cwd(), "public", file)
  try {
    const { mtimeMs } = fs.statSync(abs)
    const hit = manifestCache.get(abs)
    if (hit && hit.mtimeMs === mtimeMs) return hit.data as T
    const data = JSON.parse(fs.readFileSync(abs, "utf-8")) as T
    manifestCache.set(abs, { mtimeMs, data })
    return data
  } catch {
    // image-dimensions.json is optional (no CLS fix, nothing breaks); the others mean prebuild hasn't run.
    if (file !== "image-dimensions.json") console.warn(`[note-pipeline] could not load public/${file} - run prebuild`)
    return fallback
  }
}

function noteSource(contentPath: string): string | null {
  try {
    return fs.readFileSync(path.resolve(process.cwd(), "content", contentPath), "utf-8")
  } catch {
    return null
  }
}

setPipelineHost({ manifest, noteSource })
