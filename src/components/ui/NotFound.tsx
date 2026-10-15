import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useShell } from "@/hooks/useShell"
import styles from "./NotFound.module.scss"

interface BrokenLinks {
  bySlug: Record<string, string[]>
}

/** Lowercase basename with spaces as hyphens: the shape links and paths share. */
function linkKey(raw: string): string {
  return decodeURIComponent(raw).replace(/\\+$/, "").split("#")[0].split("/").pop()!.trim().toLowerCase().replace(/\s+/g, "-")
}

function humanize(key: string): string {
  const words = key.replace(/-/g, " ").trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Pages that link to `path` without it existing. prebuild writes every
 * unresolved wikilink to public/broken-links.json; a 404 that matches one is a
 * *wanted* page, not a typo, so it gets its own invitation.
 */
function useWantedBy(path: string): string[] | null {
  const [wantedBy, setWantedBy] = useState<string[] | null>(null)
  useEffect(() => {
    const key = linkKey(path)
    if (!key) return
    let cancelled = false
    // Static build artefact, not an API route, so a plain fetch (cf. content-index.json in AppShell).
    fetch("/broken-links.json")
      .then((r) => (r.ok ? (r.json() as Promise<BrokenLinks>) : null))
      .then((data) => {
        if (cancelled || !data) return
        const pages = Object.entries(data.bySlug)
          .filter(([, links]) => links.some((l) => linkKey(l) === key))
          .map(([slug]) => slug)
        setWantedBy(pages)
      })
      .catch(() => { /* no list → plain 404 */ })
    return () => { cancelled = true }
  }, [path])
  return wantedBy
}

export function NotFound() {
  const navigate = useNavigate()
  const shell = useShell()
  const path = typeof window === "undefined" ? "" : window.location.pathname
  const wantedBy = useWantedBy(path)
  const title = humanize(linkKey(path))

  if (wantedBy && wantedBy.length > 0) {
    const canStart = shell === "wiki" || path.toLowerCase().startsWith("/wiki/")
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Not written yet</h1>
        <p className={styles.wantedTitle}>{title}</p>
        <p className={styles.message}>
          This page is wanted, but nobody has written it yet. It's mentioned in:
        </p>
        <ul className={styles.wantedList}>
          {wantedBy.slice(0, 12).map((slug) => (
            <li key={slug}>
              <a href={`/${slug}`} className="internal-link">{humanize(linkKey(slug))}</a>
            </li>
          ))}
          {wantedBy.length > 12 && <li className={styles.more}>…and {wantedBy.length - 12} more</li>}
        </ul>
        <div className={styles.actions}>
          {canStart && (
            <a href={`/new?title=${encodeURIComponent(title)}`} className={styles.button}>
              {">"} START_THIS_ARTICLE
            </a>
          )}
          <button className={styles.button} onClick={() => navigate({ to: "/" })}>
            {">"} RECOVER_TO_CORE
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.glitchArt}>
        <pre>
{`
   _  _    ___   _  _
  | || |  / _ \\ | || |
  | || |_| | | || || |_
  |__   _| | | ||__   _|
     | | | |_| |   | |
     |_|  \\___/    |_|
`}
        </pre>
      </div>
      <h1 className={styles.title}>Territory Not Mapped</h1>
      <p className={styles.message}>
        The coordinates you requested do not correspond to any known sectors in the Sub-Surface index.
      </p>
      <div className={styles.actions}>
        <button
          className={styles.button}
          onClick={() => navigate({ to: "/" })}
        >
          {">"} RECOVER_TO_CORE
        </button>
      </div>
      <div className={styles.terminal}>
        <div className={styles.line}>[ERR] SECTOR_MISSING_OR_CORRUPT</div>
        <div className={styles.line}>[INF] ATTEMPTING_REROUTE... FAILED.</div>
        <div className={styles.line}>[WRN] UNKNOWN_PATH_DETECTED</div>
      </div>
    </div>
  )
}
