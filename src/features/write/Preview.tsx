/**
 * The draft as the reader will see it: the day's drawing, the header, and the
 * body through the real note pipeline (preview.ts), islands hydrated by the
 * reader's own NoteHtml. Re-rendered a moment after typing pauses.
 */
import { useEffect, useMemo, useState } from "react"
import { useStore } from "@/store"
import { NoteHtml } from "@/components/ui/reader/NoteHtml"
import { almanac, almanacLines } from "@/lib/daily"
import { fullTitle, type DailyDoc } from "@/lib/daily-source"
import { plateSvgUrl } from "./card"
import { renderPreview, type PreviewResult } from "./livePipeline"
import type { DraftMedia } from "./useDailyDraft"
import s from "./Write.module.scss"

export function Preview({ doc, media }: { doc: DailyDoc; media: DraftMedia[] }) {
  const index = useStore((st) => st.contentIndex)
  const [result, setResult] = useState<PreviewResult | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const body = doc.body

  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      renderPreview(body, index, media)
        .then((r) => { if (live) { setResult(r); setFailed(null) } })
        .catch((e) => { if (live) setFailed(e instanceof Error ? e.message : String(e)) })
    }, 350)
    return () => { live = false; clearTimeout(t) }
  }, [body, index, media])

  const { iso, fields } = doc
  const plate = useMemo(
    () => plateSvgUrl({ iso, tags: fields.tags, motif: fields.ogMotif || undefined, almanac: fields.ogAlmanac || undefined }).url,
    [iso, fields.tags, fields.ogMotif, fields.ogAlmanac],
  )
  const lines = useMemo(() => almanacLines(almanac(iso)), [iso])
  const long = new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })

  return (
    <div className={s.preview}>
      <img className={s.previewPlate} src={plate} width={1200} height={630} alt="" />
      <div className="note-header">
        <h1 className="note-header__title">{fullTitle(iso, fields.headline)}</h1>
        <div className="note-date note-header__meta">{long}</div>
        {fields.tags.length > 0 && (
          <div className="tag-list note-header__tags">
            {fields.tags.map((tag) => <span key={tag} className="tag-pill">#{tag}</span>)}
          </div>
        )}
      </div>
      <p className={s.previewAlmanac}>{lines[0]}<br />{lines[1]}</p>
      {failed && <div className="note-build-error" role="alert">Preview failed: {failed}</div>}
      {result?.errors.map((e) => <div key={e} className="note-build-error" role="alert">{e}</div>)}
      <div className="note-content">
        {result ? <NoteHtml html={result.html} /> : <div className="note-loading">Setting type…</div>}
      </div>
    </div>
  )
}
