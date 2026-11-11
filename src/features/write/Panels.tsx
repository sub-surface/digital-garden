/**
 * The desk's drawer: commit, history, the previous entry, margin notes.
 */
import { useEffect, useMemo, useState } from "react"
import { apiErrorMessage, apiGet } from "@/lib/api"
import { loadNote } from "@/lib/note-loader"
import { NoteHtml } from "@/components/ui/reader/NoteHtml"
import { dailyHeadline } from "@/lib/daily"
import { CARD_DESCRIPTION_LIMIT } from "@/lib/daily-art"
import { fullTitle, type DailyDoc } from "@/lib/daily-source"
import { lineDiff, sinceLabel, voiceNotes, type DiffLine } from "./desk"
import { renderCard, type RenderedCard } from "./card"
import type { DraftMedia } from "./useDailyDraft"
import s from "./Write.module.scss"

export function Diff({ lines }: { lines: DiffLine[] }) {
  // Long runs of unchanged lines fold to their ends.
  const shown: (DiffLine | { op: "fold"; n: number })[] = []
  let run: DiffLine[] = []
  const flush = (atEnd: boolean) => {
    if (run.length <= 6) shown.push(...run)
    else {
      const head = shown.length ? run.slice(0, 2) : []
      const tail = atEnd ? [] : run.slice(-2)
      shown.push(...head, { op: "fold", n: run.length - head.length - tail.length }, ...tail)
    }
    run = []
  }
  for (const l of lines) {
    if (l.op === "same") run.push(l)
    else { flush(false); shown.push(l) }
  }
  flush(true)
  return (
    <pre className={s.diff}>
      {shown.map((l, i) => l.op === "fold"
        ? <span key={i} className={s.fold}>⋯ {l.n} unchanged</span>
        : <span key={i} data-op={l.op}>{l.op === "add" ? "+ " : l.op === "del" ? "− " : "  "}{l.text || " "}</span>)}
    </pre>
  )
}

// ── commit ──
interface CommitProps {
  doc: DailyDoc
  source: string
  repoSource: string | null
  media: DraftMedia[]
  onCommit: (images?: { card: string; plate: string }) => Promise<{ url: string; commit: string; images: string[] }>
  onCardShown?: (url: string) => void
}

export function CommitPanel({ doc, source, repoSource, media, onCommit }: CommitProps) {
  const [card, setCard] = useState<RenderedCard | null>(null)
  const [cardError, setCardError] = useState<string | null>(null)
  const [step, setStep] = useState<"idle" | "committing" | "done" | "error">("idle")
  const [result, setResult] = useState<{ url: string; commit: string; images: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { fields } = doc

  const cardKey = JSON.stringify([doc.iso, fields.headline, fields.description, fields.tags, fields.ogMotif, fields.ogAlmanac])
  useEffect(() => {
    let live = true
    setCardError(null)
    renderCard({ iso: doc.iso, title: fullTitle(doc.iso, fields.headline), description: fields.description, tags: fields.tags, motif: fields.ogMotif || undefined, almanac: fields.ogAlmanac || undefined })
      .then((c) => { if (live) setCard((old) => { if (old?.previewUrl) URL.revokeObjectURL(old.previewUrl); return c }) })
      .catch((e) => { if (live) setCardError(e instanceof Error ? e.message : String(e)) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey])

  const used = media.filter((m) => source.includes(m.name))
  const checks: { ok: boolean; text: string; warn?: boolean }[] = [
    { ok: Boolean(fields.headline.trim()), text: fields.headline.trim() ? "a headline" : "no headline yet", warn: true },
    { ok: Boolean(fields.description.trim()), text: fields.description.trim() ? `a description${fields.description.length > CARD_DESCRIPTION_LIMIT ? " (the card will cut it)" : ""}` : "no description: the logbook and link previews show nothing", warn: true },
    { ok: doc.body.trim().length > 0, text: doc.body.trim() ? "some prose" : "no prose" },
    { ok: fields.public, text: fields.public ? "published (public: true)" : "kept back (public: false): committed, not shown", warn: true },
    { ok: Boolean(card), text: card ? "card + plate drawn" : cardError ? `card failed (${cardError}): commits without one` : "drawing the card…", warn: true },
  ]
  const lines = useMemo(() => lineDiff(repoSource ?? "", source), [repoSource, source])
  const changed = lines.some((l) => l.op !== "same")

  const go = async () => {
    setStep("committing")
    setError(null)
    try {
      const r = await onCommit(card ? { card: card.card, plate: card.plate } : undefined)
      setResult(r)
      setStep("done")
    } catch (e) {
      setError(apiErrorMessage(e, "Commit failed: is the network there?"))
      setStep("error")
    }
  }

  return (
    <div className={s.panel}>
      <h2>Commit</h2>
      <p className={s.hint}>One commit to master: the note{used.length ? `, ${used.length} image${used.length > 1 ? "s" : ""}` : ""}, its card and plate. Cloudflare deploys it in a few minutes. Afterwards, <code>git pull</code> before you open the day in Obsidian.</p>
      {card?.previewUrl
        ? <img className={s.cardFull} src={card.previewUrl} width={1200} height={630} alt="The OG card" />
        : <div className={s.cardFull} data-pending>{cardError ? "no card" : "drawing…"}</div>}
      <ul className={s.checks}>
        {checks.map((c) => <li key={c.text} data-ok={c.ok || undefined} data-warn={(!c.ok && c.warn) || undefined}>{c.text}</li>)}
        {used.map((m) => <li key={m.name} data-ok>content/Media/{m.name}</li>)}
      </ul>
      {repoSource !== null && <details className={s.changes}><summary>{changed ? "changes against master" : "same as master"}</summary>{changed && <Diff lines={lines} />}</details>}
      {step === "done" && result
        ? <p className={s.done}>Committed <a href={result.url} target="_blank" rel="noreferrer">{result.commit.slice(0, 7)}</a>. It will be live after the deploy.</p>
        : <button type="button" className={s.primary} disabled={step === "committing" || !source.trim() || (!changed && repoSource !== null)} onClick={go}>
          {step === "committing" ? "Committing…" : !changed && repoSource !== null ? "Nothing to commit" : "Commit to master"}
        </button>}
      {error && <p className={s.error} role="alert">{error}</p>}
    </div>
  )
}

// ── history ──
interface Revision { id: number; created_at: string; source: string }

export function HistoryPanel({ iso, token, current, onRestore }: { iso: string; token: string | null; current: string; onRestore: (source: string) => void }) {
  const [revs, setRevs] = useState<Revision[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    setRevs(null)
    apiGet<{ revisions: Revision[] }>(`/api/write/day/${iso}/revisions`, { token })
      .then((r) => { if (live) setRevs(r.revisions) })
      .catch((e) => { if (live) setError(apiErrorMessage(e, "Could not load the history")) })
    return () => { live = false }
  }, [iso, token])
  const sel = revs?.find((r) => r.id === open)
  return (
    <div className={s.panel}>
      <h2>History</h2>
      <p className={s.hint}>A snapshot every ten minutes of writing, and one at each commit or discard.</p>
      {error && <p className={s.error}>{error}</p>}
      {revs?.length === 0 && <p className={s.hint}>Nothing yet.</p>}
      <ol className={s.revisions}>
        {revs?.map((r) => (
          <li key={r.id} data-open={r.id === open || undefined}>
            <button type="button" onClick={() => setOpen(r.id === open ? null : r.id)}>
              {new Date(r.created_at).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
              <small>{sinceLabel(Date.parse(r.created_at))}{r.source === current ? " · current" : ""}</small>
            </button>
          </li>
        ))}
      </ol>
      {sel && (
        <>
          <Diff lines={lineDiff(sel.source, current)} />
          <button type="button" className={s.secondary} disabled={sel.source === current} onClick={() => onRestore(sel.source)}>Restore this version</button>
          <p className={s.hint}>The diff reads from that version to now. Restoring is itself undoable: it's just another edit.</p>
        </>
      )}
    </div>
  )
}

// ── the previous entry ──
export function PreviousPanel({ entry }: { entry: { iso: string; slug: string; title: string } | null }) {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    setHtml(null)
    setError(false)
    if (!entry) return
    let live = true
    loadNote(entry.slug).then((n) => { if (live) setHtml(n.html) }).catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [entry])
  if (!entry) return <div className={s.panel}><h2>Before this</h2><p className={s.hint}>This is the first entry.</p></div>
  const when = new Date(`${entry.iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
  return (
    <div className={s.panel}>
      <h2>Before this</h2>
      <p className={s.hint}>{when} · <a href={`/${entry.slug}`} target="_blank" rel="noreferrer">open</a></p>
      <h3 className={s.prevTitle}>{dailyHeadline(entry.title)}</h3>
      {error && <p className={s.error}>Could not load it.</p>}
      <div className={`note-content ${s.prevBody}`}>{html ? <NoteHtml html={html} /> : !error && <div className="note-loading">…</div>}</div>
    </div>
  )
}

// ── margin notes ──
export function NotesPanel({ body, onSelect, onFix }: { body: string; onSelect: (from: number, to: number) => void; onFix: (from: number, to: number, text: string) => void }) {
  const notes = useMemo(() => voiceNotes(body), [body])
  return (
    <div className={s.panel}>
      <h2>Margin notes</h2>
      <p className={s.hint}>Suggestions, not rules. They're underlined in the text as well.</p>
      {notes.length === 0 && <p className={s.hint}>Nothing to remark on.</p>}
      <ul className={s.notes}>
        {notes.map((n) => {
          const line = body.slice(0, n.from).split("\n").length
          return (
            <li key={`${n.from}-${n.kind}`}>
              <button type="button" onClick={() => onSelect(n.from, n.to)}>
                <small>line {line}</small> {n.message}
              </button>
              {n.fix !== undefined && <button type="button" className={s.fix} onClick={() => onFix(n.from, n.to, n.fix!)}>fix</button>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
