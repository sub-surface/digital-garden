/**
 * /write and /write/<YYYY-MM-DD>: the owner's desk for the logbook.
 *
 * Opens today's note (or starts it), and writes it in the browser: fields for
 * the frontmatter, CodeMirror for the prose, the card drawn live, the page
 * previewed through the real pipeline. Drafts save to the server as you type
 * (useDailyDraft); Commit sends one commit to master (src/worker/write.ts).
 *
 * Admin only. The API enforces it; this page only decides what to show.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useAuth } from "@/hooks/useAuth"
import { usePhoneViewport } from "@/hooks/usePhoneViewport"
import { useStore } from "@/store"
import { apiGet } from "@/lib/api"
import { almanac, almanacLines, dailyIso, isDailySlug } from "@/lib/daily"
import { isIsoDate, localIso, proseWords, shiftIso, type DailyFields } from "@/lib/daily-source"
import { NotFound } from "@/components/ui/NotFound"
import { WikiAuthModal } from "@/components/ui/wiki/WikiAuthModal"
import { Editor, type EditorApi } from "./Editor"
import { Fields } from "./Fields"
import { Preview } from "./Preview"
import { CommitPanel, Diff, HistoryPanel, NotesPanel, PreviousPanel } from "./Panels"
import { lineDiff, runOfDays, sinceLabel, voiceNotes } from "./desk"
import { useDailyDraft, type SaveState } from "./useDailyDraft"
import s from "./Write.module.scss"

type View = "write" | "split" | "read"
type Panel = "commit" | "history" | "previous" | "notes" | null

const STATE_LABEL: Record<SaveState, string> = {
  loading: "opening…",
  saved: "saved",
  dirty: "editing",
  saving: "saving…",
  offline: "offline, kept here",
  error: "not saved",
}

export function WritePage({ date }: { date?: string }) {
  const { session, role, loading } = useAuth()
  const [showAuth, setShowAuth] = useState(false)

  useEffect(() => {
    const meta = document.createElement("meta")
    meta.name = "robots"
    meta.content = "noindex"
    document.head.appendChild(meta)
    const title = document.title
    document.title = "Desk"
    return () => { meta.remove(); document.title = title }
  }, [])

  if (loading) return <div className="loading-shimmer">Opening the desk…</div>
  if (!session) {
    return (
      <div className={s.gate}>
        <p>The desk is private.</p>
        <button type="button" className={s.primary} onClick={() => setShowAuth(true)}>Sign in</button>
        {showAuth && <WikiAuthModal onClose={() => setShowAuth(false)} />}
      </div>
    )
  }
  if (role !== "admin") return <NotFound />
  return <Desk date={date} token={session.access_token} />
}

function Desk({ date, token }: { date?: string; token: string }) {
  const today = localIso()
  const iso = date && isIsoDate(date) ? date : today
  const navigate = useNavigate()
  const go = useCallback((day: string) => {
    void navigate({ to: day === localIso() ? "/write" : `/write/${day}` })
  }, [navigate])

  const desk = useDailyDraft(iso, token)
  const phone = usePhoneViewport()
  const [view, setView] = useState<View>(() => (window.innerWidth > 1100 ? "split" : "write"))
  const [focus, setFocus] = useState(false)
  const [typewriter, setTypewriter] = useState(false)
  const [panel, setPanel] = useState<Panel>(null)
  const [calendar, setCalendar] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const editor = useRef<EditorApi | null>(null)
  const [, tick] = useState(0)

  // "saved 4 min ago" stays true.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 20_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 5000)
    return () => clearTimeout(t)
  }, [flash])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && focus) setFocus(false)
      else if (e.key === "Escape" && panel) setPanel(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [focus, panel])

  // ── the logbook around this day ──
  const index = useStore((st) => st.contentIndex)
  const published = useMemo(() => {
    if (!index) return []
    return Object.values(index)
      .filter((n) => isDailySlug(n.slug))
      .map((n) => ({ iso: dailyIso(n.date), slug: n.slug, title: n.title }))
      .filter((d): d is { iso: string; slug: string; title: string } => d.iso !== null)
      .sort((a, b) => a.iso.localeCompare(b.iso))
  }, [index])
  const previous = useMemo(() => [...published].reverse().find((d) => d.iso < iso) ?? null, [published, iso])
  const knownTags = useMemo(() => {
    const count = new Map<string, number>()
    for (const n of Object.values(index ?? {})) for (const t of n.tags ?? []) count.set(t.toLowerCase(), (count.get(t.toLowerCase()) ?? 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
  }, [index])
  const links = useMemo(() => Object.values(index ?? {})
    .map((n) => ({ label: n.title, detail: n.slug.includes("/") ? n.slug.split("/")[0] : undefined }))
    .sort((a, b) => a.label.localeCompare(b.label)), [index])

  const [images, setImages] = useState<string[]>([])
  useEffect(() => {
    fetch("/image-dimensions.json").then((r) => (r.ok ? r.json() : {})).then((dims: Record<string, unknown>) => {
      setImages(Object.keys(dims).map((k) => decodeURIComponent(k.replace(/^\/content\/Media\//, ""))).sort())
    }).catch(() => { /* no ![[ completion, nothing else lost */ })
  }, [])

  const [drafts, setDrafts] = useState<{ iso: string; updated_at: string; committed_at: string | null }[]>([])
  useEffect(() => {
    apiGet<{ days: typeof drafts }>("/api/write/days", { token }).then((r) => setDrafts(r.days)).catch(() => { /* calendar shows published days only */ })
  }, [token, iso, desk.committedAt])

  const written = useMemo(() => new Set([...published.map((d) => d.iso), ...drafts.map((d) => d.iso)]), [published, drafts])
  const run = runOfDays(desk.doc?.body.trim() ? [...written, iso] : written, today)

  // ── edits ──
  const setBody = useCallback((body: string) => desk.update((d) => ({ ...d, body })), [desk.update]) // eslint-disable-line react-hooks/exhaustive-deps
  const setFields = useCallback((fields: DailyFields) => desk.update((d) => ({ ...d, fields })), [desk.update]) // eslint-disable-line react-hooks/exhaustive-deps

  const words = desk.doc ? proseWords(desk.doc.body) : 0
  const noteCount = desk.doc ? voiceNotes(desk.doc.body).length : 0
  const lines = useMemo(() => almanacLines(almanac(iso)), [iso])
  const dayLabel = new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

  const keys = useMemo(() => ({
    save: () => void desk.save(true).then(() => setFlash("saved")),
    commit: () => setPanel("commit"),
    togglePreview: () => setView((v) => (v === "read" ? (phone ? "write" : "split") : phone ? "read" : v === "split" ? "write" : "split")),
    toggleFocus: () => setFocus((f) => !f),
  }), [desk.save, phone]) // eslint-disable-line react-hooks/exhaustive-deps

  const status = desk.state === "saved" && desk.savedAt ? `saved ${sinceLabel(desk.savedAt)}` : STATE_LABEL[desk.state]
  const effectiveView: View = phone && view === "split" ? "write" : view

  return (
    <div className={s.desk} data-focus={focus || undefined} data-panel={panel ?? undefined}>
      <header className={s.bar}>
        <nav className={s.day} aria-label="Day">
          <button type="button" onClick={() => go(shiftIso(iso, -1))} aria-label="Previous day">‹</button>
          <button type="button" className={s.dayLabel} onClick={() => setCalendar((c) => !c)} aria-expanded={calendar}>
            {dayLabel}{iso === today && <em> today</em>}
          </button>
          <button type="button" onClick={() => go(shiftIso(iso, 1))} aria-label="Next day" disabled={iso >= today}>›</button>
          {iso !== today && <button type="button" className={s.todayBtn} onClick={() => go(today)}>today</button>}
          {calendar && <MonthGrid iso={iso} today={today} published={published.map((d) => d.iso)} drafts={drafts} onPick={(d) => { setCalendar(false); go(d) }} />}
        </nav>
        <p className={s.almanac} title={lines[1]}>{lines[0]}</p>
        <p className={s.status} data-state={desk.state} aria-live="polite">
          <span className={s.dot} aria-hidden="true" />{flash ?? status}
          <span className={s.sep}>·</span>{words} words
          {words > 0 && <><span className={s.sep}>·</span>{Math.max(1, Math.round(words / 230))} min</>}
          {run > 1 && <><span className={s.sep}>·</span>{run} days running</>}
          {desk.committedAt && !desk.unpublishedChanges && <><span className={s.sep}>·</span>committed</>}
          {desk.unpublishedChanges && desk.repo && <><span className={s.sep}>·</span>changed since commit</>}
        </p>
        <div className={s.actions}>
          <div className={s.segment} role="group" aria-label="View">
            {(phone ? ["write", "read"] : ["write", "split", "read"]).map((v) => (
              <button key={v} type="button" aria-pressed={effectiveView === v} onClick={() => setView(v as View)}>{v}</button>
            ))}
          </div>
          <button type="button" aria-pressed={focus} onClick={() => setFocus((f) => !f)} title="Focus (Ctrl+.)">focus</button>
          <button type="button" aria-pressed={typewriter} onClick={() => setTypewriter((t) => !t)} title="Keep the line you're writing in the middle">typewriter</button>
          <button type="button" aria-pressed={panel === "previous"} onClick={() => setPanel(panel === "previous" ? null : "previous")}>before</button>
          <button type="button" aria-pressed={panel === "notes"} onClick={() => setPanel(panel === "notes" ? null : "notes")}>notes{noteCount > 0 && <sup>{noteCount}</sup>}</button>
          <button type="button" aria-pressed={panel === "history"} onClick={() => setPanel(panel === "history" ? null : "history")}>history</button>
          <button type="button" className={s.primary} aria-pressed={panel === "commit"} onClick={() => setPanel(panel === "commit" ? null : "commit")} title="Ctrl+Enter">commit</button>
        </div>
      </header>

      {desk.notice && <p className={s.banner}>{desk.notice} <button type="button" onClick={desk.dismissNotice}>ok</button></p>}
      {desk.error && desk.state !== "loading" && <p className={s.banner} data-tone="error" role="alert">{desk.error}</p>}
      {desk.conflict && (
        <div className={s.banner} data-tone="warn" role="alert">
          <p>
            {desk.conflict.reason === "commit" ? "Master has a different version of this note (pushed from elsewhere since this draft began)." : "The note on master changed after this draft began, likely from Obsidian."}
            {" "}Which one carries on?
          </p>
          <details><summary>compare (master → this draft)</summary><Diff lines={lineDiff(desk.conflict.repo?.source ?? "", desk.source)} /></details>
          <div className={s.bannerActions}>
            <button type="button" onClick={() => desk.resolveConflict("mine")}>keep this draft</button>
            <button type="button" onClick={() => desk.resolveConflict("theirs")}>take master's</button>
          </div>
        </div>
      )}

      {!desk.doc
        ? <div className="loading-shimmer">{desk.state === "error" ? "Couldn't open this day." : "Opening the day…"}</div>
        : (
          <>
            {!focus && (
              <Fields iso={iso} fields={desk.doc.fields} onChange={setFields} knownTags={knownTags} onOpenCard={() => setPanel("commit")} />
            )}
            <div className={s.panes} data-view={effectiveView}>
              {effectiveView !== "read" && (
                <div className={s.writePane}>
                  <Editor
                    key={iso}
                    value={desk.doc.body}
                    onChange={setBody}
                    links={links}
                    images={[...desk.media.map((m) => m.name), ...images]}
                    onImage={desk.uploadImage}
                    onError={(m) => setFlash(m)}
                    typewriter={typewriter || focus}
                    keys={keys}
                    apiRef={editor}
                  />
                </div>
              )}
              {effectiveView !== "write" && !focus && (
                <div className={s.readPane}><Preview doc={desk.doc} media={desk.media} /></div>
              )}
            </div>
          </>
        )}

      {panel && desk.doc && !focus && (
        <aside className={s.drawer} aria-label={panel}>
          <button type="button" className={s.close} onClick={() => setPanel(null)} aria-label="Close">×</button>
          {panel === "commit" && (
            <CommitPanel doc={desk.doc} source={desk.source} repoSource={desk.repo?.source ?? null} media={desk.media}
              onCommit={async (imgs) => { const r = await desk.commit(imgs); setFlash("committed"); return r }} />
          )}
          {panel === "history" && <HistoryPanel iso={iso} token={token} current={desk.source} onRestore={(src) => { desk.replace(src); setFlash("restored") }} />}
          {panel === "previous" && <PreviousPanel entry={previous} />}
          {panel === "notes" && (
            <NotesPanel body={desk.doc.body}
              onSelect={(from, to) => editor.current?.select(from, to)}
              onFix={(from, to, text) => editor.current?.replaceRange(from, to, text)} />
          )}
          {panel !== "commit" && desk.doc.body.trim() && desk.state !== "loading" && (
            <p className={s.hint}>
              <button type="button" className={s.linkish} onClick={() => { if (window.confirm("Throw this draft away and go back to master's copy? A snapshot is kept in history.")) void desk.discard() }}>discard draft</button>
            </p>
          )}
        </aside>
      )}
    </div>
  )
}

function MonthGrid({ iso, today, published, drafts, onPick }: {
  iso: string
  today: string
  published: string[]
  drafts: { iso: string; updated_at: string; committed_at: string | null }[]
  onPick: (iso: string) => void
}) {
  const [month, setMonth] = useState(iso.slice(0, 7))
  const pub = useMemo(() => new Set(published), [published])
  const pending = useMemo(() => new Set(drafts.filter((d) => !d.committed_at || d.updated_at > d.committed_at).map((d) => d.iso)), [drafts])
  const [y, m] = month.split("-").map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const lead = (first.getUTCDay() + 6) % 7
  const shift = (n: number) => setMonth(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7))
  return (
    <div className={s.month} role="dialog" aria-label="Pick a day">
      <div className={s.monthHead}>
        <button type="button" onClick={() => shift(-1)} aria-label="Earlier month">‹</button>
        <span>{first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
        <button type="button" onClick={() => shift(1)} aria-label="Later month" disabled={month >= today.slice(0, 7)}>›</button>
      </div>
      <div className={s.monthGrid}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={`h${i}`} className={s.weekday}>{d}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
        {Array.from({ length }, (_, i) => {
          const day = `${month}-${String(i + 1).padStart(2, "0")}`
          return (
            <button key={day} type="button" disabled={day > today} onClick={() => onPick(day)}
              data-published={pub.has(day) || undefined} data-pending={pending.has(day) || undefined}
              data-current={day === iso || undefined} data-today={day === today || undefined}
              title={pending.has(day) ? "draft not committed" : pub.has(day) ? "in the logbook" : undefined}>
              {i + 1}
            </button>
          )
        })}
      </div>
      <p className={s.legend}><i data-published /> in the logbook <i data-pending /> uncommitted draft</p>
    </div>
  )
}
