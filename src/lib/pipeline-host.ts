/**
 * Where the note pipeline gets the data it can't compute: the prebuild
 * manifests (slug map, content index, image sizes) and the source of a note
 * another note embeds.
 *
 * The pipeline used to read these straight off disk, which kept it out of the
 * browser. Now it asks a host, and each runtime installs one:
 *   - Node (prebuild, tests): `import "./pipeline-host-node"` (src/lib/markdown.ts does)
 *   - the browser (/write's live preview): `setPipelineHost(...)` with fetched data
 *
 * No host is a loud error, not a silent empty slug map: a pipeline that quietly
 * marks every link missing is worse than one that refuses to run.
 */

export interface PipelineHost {
  /** A prebuild manifest from `public/`: `slug-map.json`, `content-index.json`, `image-dimensions.json`. */
  manifest<T>(file: string, fallback: T): T
  /** Raw source of a note, by its content-index `contentPath`. Null when unreadable. */
  noteSource(contentPath: string): string | null
}

let current: PipelineHost | null = null

export function setPipelineHost(host: PipelineHost): void {
  current = host
}

export function pipelineHost(): PipelineHost {
  if (!current) {
    throw new Error(
      "note pipeline: no host installed. In Node import \"src/lib/pipeline-host-node\"; in the browser call setPipelineHost().",
    )
  }
  return current
}
