/**
 * The note's frontmatter as a form: headline (the date is added for you),
 * description (measured against what the card can show), tags (drag to
 * reorder: the first tag that names a family chooses the drawing), published,
 * and the card itself, redrawn as you change any of it.
 */
import { useMemo, useState } from "react"
import { CARD_DESCRIPTION_LIMIT, MOTIF_NAMES, TAG_MOTIFS, motifFor } from "@/lib/daily-art"
import { dayName, type DailyFields } from "@/lib/daily-source"
import { plateSvgUrl } from "./card"
import s from "./Write.module.scss"

interface Props {
  iso: string
  fields: DailyFields
  onChange: (next: DailyFields) => void
  knownTags: string[]
  onOpenCard: () => void
}

export function Fields({ iso, fields, onChange, knownTags, onOpenCard }: Props) {
  const set = <K extends keyof DailyFields>(key: K, value: DailyFields[K]) => onChange({ ...fields, [key]: value })
  const [draft, setDraft] = useState("")
  const [dragging, setDragging] = useState<number | null>(null)

  const chooser = fields.tags.find((tag) => TAG_MOTIFS[tag.toLowerCase()])
  const plate = useMemo(
    () => plateSvgUrl({ iso, tags: fields.tags, motif: fields.ogMotif || undefined, almanac: fields.ogAlmanac || undefined }),
    [iso, fields.tags, fields.ogMotif, fields.ogAlmanac],
  )
  const why = fields.ogMotif
    ? "named outright"
    : chooser ? `from #${chooser}` : "the date's choice"

  const addTag = (raw: string) => {
    const tag = raw.trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-")
    setDraft("")
    if (!tag || fields.tags.includes(tag)) return
    set("tags", [...fields.tags, tag])
  }
  const move = (from: number, to: number) => {
    if (from === to) return
    const next = [...fields.tags]
    const [tag] = next.splice(from, 1)
    next.splice(to, 0, tag)
    set("tags", next)
  }

  const descLen = fields.description.length
  const suggestions = knownTags.filter((t) => !fields.tags.includes(t))

  return (
    <section className={s.fields} aria-label="Frontmatter">
      <div className={s.fieldText}>
        <label className={s.headline}>
          <span className={s.dayPrefix}>{dayName(iso)}:</span>
          <input
            value={fields.headline}
            onChange={(e) => set("headline", e.target.value)}
            placeholder="a short title"
            aria-label="Headline"
            spellCheck
          />
        </label>

        <label className={s.description}>
          <textarea
            value={fields.description}
            onChange={(e) => set("description", e.target.value.replace(/\n+/g, " "))}
            placeholder="One line for the logbook, the card and the link preview."
            rows={2}
            aria-label="Description"
            spellCheck
          />
          <span className={s.counter} data-over={descLen > CARD_DESCRIPTION_LIMIT || undefined}
            title={descLen > CARD_DESCRIPTION_LIMIT ? "The card will cut this at a word" : "Fits the card"}>
            {descLen}/{CARD_DESCRIPTION_LIMIT}
          </span>
        </label>

        <div className={s.tags}>
          {fields.tags.map((tag, i) => {
            const draws = TAG_MOTIFS[tag.toLowerCase()]
            return (
              <span
                key={tag}
                className={s.tag}
                data-chooser={(!fields.ogMotif && tag === chooser) || undefined}
                data-dragging={dragging === i || undefined}
                draggable
                onDragStart={(e) => { setDragging(i); e.dataTransfer.effectAllowed = "move" }}
                onDragOver={(e) => { e.preventDefault(); if (dragging !== null && dragging !== i) { move(dragging, i); setDragging(i) } }}
                onDragEnd={() => setDragging(null)}
                title={draws ? `draws: ${draws.join(" or ")}` : "drag to reorder"}
              >
                #{tag}
                {draws && <i className={s.tagDot} aria-hidden="true" />}
                <button type="button" onClick={() => set("tags", fields.tags.filter((t) => t !== tag))} aria-label={`Remove ${tag}`}>×</button>
              </span>
            )
          })}
          <input
            className={s.tagInput}
            value={draft}
            list="write-known-tags"
            onChange={(e) => {
              const v = e.target.value
              if (/[,\s]$/.test(v)) addTag(v.slice(0, -1))
              else setDraft(v)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); addTag(draft) }
              if (e.key === "Backspace" && !draft && fields.tags.length) set("tags", fields.tags.slice(0, -1))
            }}
            onBlur={() => draft && addTag(draft)}
            placeholder="+ tag"
            aria-label="Add a tag"
          />
          <datalist id="write-known-tags">
            {suggestions.map((t) => <option key={t} value={t}>{TAG_MOTIFS[t] ? `draws ${TAG_MOTIFS[t].join("/")}` : ""}</option>)}
          </datalist>
        </div>

        <label className={s.publish}>
          <input type="checkbox" checked={fields.public} onChange={(e) => set("public", e.target.checked)} />
          <span className={s.switch} aria-hidden="true" />
          <span>{fields.public ? "In the logbook" : "Kept back"}</span>
          <small>{fields.public ? "public: true, published on commit" : "public: false, committed but not shown"}</small>
        </label>
      </div>

      <figure className={s.card}>
        <button type="button" className={s.plate} onClick={onOpenCard} title="See the whole card">
          <img src={plate.url} width={1200} height={630} alt={`This day's drawing: ${plate.motif}`} />
        </button>
        <figcaption>
          <select
            value={fields.ogMotif}
            onChange={(e) => set("ogMotif", e.target.value)}
            aria-label="Drawing"
          >
            <option value="">{motifFor(iso, fields.tags)} ({why})</option>
            {MOTIF_NAMES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <label title="Moon with the sun's arc, the year ruler, the plain fact line">
            <input type="checkbox" checked={fields.ogAlmanac === "classic"} onChange={(e) => set("ogAlmanac", e.target.checked ? "classic" : "")} />
            classic almanac
          </label>
        </figcaption>
      </figure>
    </section>
  )
}
