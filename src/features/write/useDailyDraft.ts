/**
 * One day's note at the desk: where it comes from, autosave, the offline
 * buffer, conflicts with master, and commit.
 *
 * Opening a day picks the newest of: this browser's unsynced buffer, the
 * server draft, the note on master, a fresh scaffold. Every change is buffered
 * in localStorage at once (a draft buffer, not store state: gotcha #16 is
 * about settings) and sent to the server a moment after typing pauses. The
 * buffer is cleared once the server has the same text.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "@/lib/api"
import { parseDaily, scaffoldDaily, serializeDaily, type DailyDoc } from "@/lib/daily-source"

/** An image waiting in the desk's private storage; `url` is a local object URL ("" until fetched). */
export interface DraftMedia { name: string; url: string }
interface RepoNote { source: string; sha: string }
interface DraftRow {
  iso: string
  source: string
  base_sha: string | null
  media: string[]
  updated_at: string
  committed_at: string | null
  committed_sha: string | null
}
interface DayPayload { iso: string; slug: string; draft: DraftRow | null; repo: RepoNote | null }

export type SaveState = "loading" | "saved" | "dirty" | "saving" | "offline" | "error"

const PAUSE_MS = 1500
const MIN_GAP_MS = 3500
const RETRY_MS = 15_000

const bufferKey = (iso: string) => `write:buffer:${iso}`
interface Buffer { source: string; at: number; baseSha: string | null }
function readBuffer(iso: string): Buffer | null {
  try {
    const raw = localStorage.getItem(bufferKey(iso))
    return raw ? (JSON.parse(raw) as Buffer) : null
  } catch { return null }
}
function writeBuffer(iso: string, b: Buffer) {
  try { localStorage.setItem(bufferKey(iso), JSON.stringify(b)) } catch { /* private mode: the server copy still saves */ }
}
function clearBuffer(iso: string) {
  try { localStorage.removeItem(bufferKey(iso)) } catch { /* nothing to clear */ }
}

export interface Conflict { repo: RepoNote | null; reason: "load" | "commit" }

export function useDailyDraft(iso: string, token: string | null) {
  const [doc, setDoc] = useState<DailyDoc | null>(null)
  /** The file text formatting is preserved from (see serializeDaily). */
  const template = useRef<string | undefined>(undefined)
  const [baseSha, setBaseSha] = useState<string | null>(null)
  const [repo, setRepo] = useState<RepoNote | null>(null)
  const [media, setMedia] = useState<DraftMedia[]>([])
  const [state, setState] = useState<SaveState>("loading")
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [committedAt, setCommittedAt] = useState<string | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  const source = useMemo(() => (doc ? serializeDaily(doc, template.current) : ""), [doc])

  // What the server holds, and the latest of everything, for timers and cleanups.
  const sent = useRef<{ source: string; baseSha: string | null }>({ source: "", baseSha: null })
  const live = useRef({ iso, source, baseSha, token })
  useLayoutEffect(() => { live.current = { iso, source, baseSha, token } })
  /** The day whose text is loaded (null while loading): saves only ever go to it. */
  const loadedFor = useRef<string | null>(null)
  const lastPut = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const opts = useCallback(() => ({ token: live.current.token }), [])

  // ── load ──
  useEffect(() => {
    if (!token) return
    let cancelled = false
    const day = iso
    loadedFor.current = null
    setState("loading")
    setDoc(null)
    setConflict(null)
    setNotice(null)
    setError(null)
    apiGet<DayPayload>(`/api/write/day/${iso}`, { token }).then((payload) => {
      if (cancelled) return
      const { draft, repo } = payload
      let start: string
      let base: string | null
      if (draft?.source) {
        start = draft.source
        base = draft.base_sha
        sent.current = { source: draft.source, baseSha: draft.base_sha }
      } else {
        start = repo?.source ?? serializeDaily(scaffoldDaily(iso))
        base = repo?.sha ?? null
        // Nothing to save until it's touched.
        sent.current = { source: start, baseSha: base }
      }
      const buffered = readBuffer(iso)
      if (buffered && buffered.source !== start && buffered.at > Date.parse(draft?.updated_at ?? "1970-01-01")) {
        start = buffered.source
        base = buffered.baseSha
        setNotice("Restored text from this browser that hadn't reached the server yet.")
      } else if (buffered && buffered.source === sent.current.source) {
        clearBuffer(iso)
      }
      if (draft?.source && repo && draft.base_sha !== repo.sha && draft.source !== repo.source) {
        setConflict({ repo, reason: "load" })
      }
      template.current = start
      setRepo(repo)
      setBaseSha(base)
      setMedia((draft?.media ?? []).map((name) => ({ name, url: "" })))
      setCommittedAt(draft?.committed_at ?? null)
      setSavedAt(draft?.updated_at ? Date.parse(draft.updated_at) : null)
      setDoc(parseDaily(start, iso))
      loadedFor.current = day
      setState(start === sent.current.source ? "saved" : "dirty")
    }).catch((e) => {
      if (cancelled) return
      setError(e instanceof ApiError ? e.message : "Could not reach the server.")
      // Offline: carry on from this browser's buffer if there is one.
      const buffered = readBuffer(iso)
      if (buffered) {
        template.current = buffered.source
        setDoc(parseDaily(buffered.source, iso))
        setBaseSha(buffered.baseSha)
        sent.current = { source: "", baseSha: null }
        loadedFor.current = day
        setState("offline")
      } else {
        setState("error")
      }
    })
    return () => {
      cancelled = true
      // Leaving a day with unsent text: send it on the way out.
      // (live.current already names the next day; its text is still this day's.)
      const { source: s, baseSha: b, token: t } = live.current
      if (loadedFor.current === day && s && s !== sent.current.source) {
        apiPut(`/api/write/day/${day}`, { source: s, baseSha: b }, { token: t }).then(() => clearBuffer(day)).catch(() => { /* stays buffered */ })
      }
    }
  }, [iso, token, reloadTick])

  // ── save ──
  const save = useCallback(async (force = false) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const { iso: day, source: s, baseSha: b } = live.current
    if (loadedFor.current !== day || !s) return
    if (!force && s === sent.current.source && b === sent.current.baseSha) { setState("saved"); return }
    setState("saving")
    lastPut.current = Date.now()
    try {
      const res = await apiPut<{ updated_at: string }>(`/api/write/day/${day}`, { source: s, baseSha: b }, opts())
      if (live.current.iso !== day) return
      sent.current = { source: s, baseSha: b }
      setSavedAt(Date.parse(res.updated_at))
      setError(null)
      if (live.current.source === s) { clearBuffer(day); setState("saved") } else setState("dirty")
    } catch (e) {
      if (live.current.iso !== day) return
      const offline = !(e instanceof ApiError)
      setState(offline ? "offline" : "error")
      setError(offline ? "Offline: kept in this browser, will retry." : (e as ApiError).message)
      timer.current = setTimeout(() => void save(), RETRY_MS)
    }
  }, [opts])

  useEffect(() => {
    if (loadedFor.current !== iso || !source) return
    if (source === sent.current.source && baseSha === sent.current.baseSha) return
    writeBuffer(iso, { source, at: Date.now(), baseSha })
    setState((s) => (s === "offline" || s === "error" ? s : "dirty"))
    if (timer.current) clearTimeout(timer.current)
    const wait = Math.max(PAUSE_MS, MIN_GAP_MS - (Date.now() - lastPut.current))
    timer.current = setTimeout(() => void save(), wait)
  }, [source, baseSha, iso, save])

  useEffect(() => {
    const online = () => void save()
    const leaving = (e: BeforeUnloadEvent) => {
      if (loadedFor.current && live.current.source !== sent.current.source) e.preventDefault()
    }
    window.addEventListener("online", online)
    window.addEventListener("beforeunload", leaving)
    return () => {
      window.removeEventListener("online", online)
      window.removeEventListener("beforeunload", leaving)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [save])

  // Images are private until commit: fetch each with the token, show it as a blob.
  useEffect(() => {
    const missing = media.filter((m) => !m.url)
    if (!missing.length || !token) return
    let live = true
    for (const m of missing) {
      // Raw fetch on purpose (gotcha #19's exception): the body is an image, not JSON.
      fetch(`/api/write/media/${iso}/${encodeURIComponent(m.name)}`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
        .then((b) => {
          if (!live) return
          const url = URL.createObjectURL(b)
          setMedia((all) => all.map((x) => (x.name === m.name && !x.url ? { ...x, url } : x)))
        })
        .catch(() => { /* the preview shows it as missing until commit */ })
    }
    return () => { live = false }
  }, [media, iso, token])

  // Object URLs belong to the day; let them go when it changes.
  const mediaRef = useRef(media)
  useEffect(() => { mediaRef.current = media }, [media])
  useEffect(() => () => { for (const m of mediaRef.current) if (m.url) URL.revokeObjectURL(m.url) }, [iso])

  // ── edits ──
  const update = useCallback((fn: (d: DailyDoc) => DailyDoc) => setDoc((d) => (d ? fn(d) : d)), [])

  /** Replace the whole note (history restore, take the repo's version). */
  const replace = useCallback((text: string, sha?: string | null) => {
    template.current = text
    setDoc(parseDaily(text, live.current.iso))
    if (sha !== undefined) setBaseSha(sha)
  }, [])

  const resolveConflict = useCallback((keep: "mine" | "theirs") => {
    const c = conflict
    if (!c) return
    if (keep === "theirs" && c.repo) replace(c.repo.source, c.repo.sha)
    // Keeping mine: accept that the commit will replace master's copy.
    else setBaseSha(c.repo?.sha ?? null)
    setRepo(c.repo)
    setConflict(null)
  }, [conflict, replace])

  const discard = useCallback(async () => {
    await apiDelete(`/api/write/day/${live.current.iso}`, undefined, opts())
    clearBuffer(live.current.iso)
    setReloadTick((n) => n + 1)
  }, [opts])

  const uploadImage = useCallback(async (file: File): Promise<string> => {
    const day = live.current.iso
    const res = await apiPost<{ name: string }>(
      `/api/write/media?iso=${day}&name=${encodeURIComponent(file.name || "pasted")}`,
      file,
      { ...opts(), headers: { "Content-Type": file.type } },
    )
    // Shown from the file itself: no round trip for an image we already have.
    setMedia((m) => [...m.filter((x) => x.name !== res.name), { name: res.name, url: URL.createObjectURL(file) }])
    return res.name
  }, [opts])

  const commit = useCallback(async (images?: { card: string; plate: string }) => {
    await save()
    const { iso: day, source: s, baseSha: b } = live.current
    try {
      const res = await apiPost<{ commit: string; url: string; sha: string; committed_at: string; images: string[] }>(
        "/api/write/commit", { iso: day, source: s, baseSha: b, ...images }, opts(),
      )
      sent.current = { source: s, baseSha: res.sha }
      setBaseSha(res.sha)
      setRepo({ source: s, sha: res.sha })
      setCommittedAt(res.committed_at)
      clearBuffer(day)
      return res
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && (e.body as { conflict?: boolean })?.conflict) {
        setConflict({ repo: (e.body as { repo: RepoNote | null }).repo, reason: "commit" })
      }
      throw e
    }
  }, [opts, save])

  const unpublishedChanges = Boolean(repo && source !== repo.source) || (!repo && Boolean(doc?.body.trim()))

  return {
    doc, source, state, savedAt, committedAt, repo, media, conflict, notice, error, baseSha, unpublishedChanges,
    update, replace, save, discard, commit, uploadImage, resolveConflict,
    dismissNotice: () => setNotice(null),
  }
}
