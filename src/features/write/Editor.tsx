/**
 * The desk's editor: CodeMirror 6 over the note's prose (frontmatter is edited
 * in the fields above it, never here).
 *
 * Markdown with the vault's dialect in mind: [[wikilink]] and ![[image]]
 * completion from the content index, paste/drop an image to upload it, paste a
 * URL over a selection to link it, the margin notes from desk.ts underlined in
 * place, and a typewriter mode that keeps the line being written in the middle.
 */
import { useEffect, useRef } from "react"
import { Compartment, EditorSelection, EditorState, RangeSetBuilder, type Extension } from "@codemirror/state"
import {
  Decoration, EditorView, ViewPlugin, drawSelection, highlightActiveLine, keymap, placeholder,
  type DecorationSet, type ViewUpdate,
} from "@codemirror/view"
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete"
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search"
import { tags as t } from "@lezer/highlight"
import { voiceNotes } from "./desk"

export interface EditorApi {
  focus: () => void
  /** Insert at the cursor (replacing the selection). */
  insert: (text: string) => void
  /** Jump to an offset in the prose and select a range. */
  select: (from: number, to?: number) => void
  replaceRange: (from: number, to: number, text: string) => void
}

export interface LinkTarget { label: string; detail?: string }

interface Props {
  value: string
  onChange: (value: string) => void
  /** Notes the [[ completion offers. */
  links: LinkTarget[]
  /** Images the ![[ completion offers. */
  images: string[]
  onImage: (file: File) => Promise<string>
  onError: (message: string) => void
  typewriter: boolean
  keys: { save: () => void; commit: () => void; togglePreview: () => void; toggleFocus: () => void }
  apiRef?: React.MutableRefObject<EditorApi | null>
}

const highlight = HighlightStyle.define([
  { tag: t.heading1, fontFamily: "var(--font-header)", fontSize: "1.5em", fontWeight: "600" },
  { tag: t.heading2, fontFamily: "var(--font-header)", fontSize: "1.3em", fontWeight: "600" },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], fontFamily: "var(--font-header)", fontWeight: "600" },
  { tag: t.strong, fontWeight: "650" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "var(--color-accent)" },
  { tag: t.url, color: "var(--color-text-muted, #888)", opacity: "0.75" },
  { tag: t.quote, color: "var(--color-text-muted, #aaa)", fontStyle: "italic" },
  { tag: t.monospace, fontFamily: "var(--font-code)", fontSize: "0.9em", color: "var(--color-accent)" },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: "var(--color-text-muted, #888)", opacity: "0.55" },
  { tag: t.list, color: "var(--color-accent)" },
])

const theme = EditorView.theme({
  "&": { height: "100%", background: "transparent", color: "var(--color-text)", fontSize: "var(--write-size, 18px)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--write-font, var(--font-body))", lineHeight: "1.75", overflow: "auto" },
  ".cm-content": { maxWidth: "68ch", margin: "0 auto", padding: "2rem 1.25rem 40vh", caretColor: "var(--color-accent)" },
  ".cm-line": { padding: "0" },
  ".cm-activeLine": { background: "color-mix(in srgb, var(--color-accent) 5%, transparent)" },
  ".cm-cursor": { borderLeftColor: "var(--color-accent)", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { background: "color-mix(in srgb, var(--color-accent) 28%, transparent) !important" },
  ".cm-placeholder": { color: "var(--color-text-muted, #777)", fontStyle: "italic" },
  ".cm-voice": { textDecoration: "underline wavy color-mix(in srgb, var(--color-accent) 70%, transparent)", textDecorationThickness: "1px", textUnderlineOffset: "4px" },
  ".cm-wikilink": { color: "var(--color-accent)" },
  ".cm-tooltip": { background: "var(--color-bg-surface)", border: "1px solid color-mix(in srgb, var(--color-text) 15%, transparent)", borderRadius: "6px" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { background: "color-mix(in srgb, var(--color-accent) 30%, transparent)", color: "var(--color-text)" },
  ".cm-completionDetail": { opacity: "0.6", fontStyle: "normal", marginLeft: "0.75em" },
  ".cm-panels": { background: "var(--color-bg-surface)", color: "var(--color-text)" },
})

/** The margin notes, underlined where they are. */
const voiceMarks = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = this.build(view) }
  update(u: ViewUpdate) { if (u.docChanged) this.decorations = this.build(u.view) }
  build(view: EditorView): DecorationSet {
    const b = new RangeSetBuilder<Decoration>()
    for (const n of voiceNotes(view.state.doc.toString())) {
      if (n.to > n.from) b.add(n.from, n.to, Decoration.mark({ class: "cm-voice", attributes: { title: n.message } }))
    }
    return b.finish()
  }
}, { decorations: (v) => v.decorations })

/** [[wikilinks]] coloured as links (the markdown grammar doesn't know them). */
const wikilinkMarks = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = this.build(view) }
  update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view) }
  build(view: EditorView): DecorationSet {
    const b = new RangeSetBuilder<Decoration>()
    for (const { from, to } of view.visibleRanges) {
      const text = view.state.doc.sliceString(from, to)
      for (const m of text.matchAll(/!?\[\[[^\]\n]+\]\]/g)) b.add(from + m.index!, from + m.index! + m[0].length, Decoration.mark({ class: "cm-wikilink" }))
    }
    return b.finish()
  }
}, { decorations: (v) => v.decorations })

function wrap(view: EditorView, before: string, after = before): boolean {
  view.dispatch(view.state.changeByRange((range) => {
    const text = view.state.sliceDoc(range.from, range.to)
    // Toggle off when already wrapped.
    const outer = view.state.sliceDoc(range.from - before.length, range.to + after.length)
    if (outer === before + text + after) {
      return { changes: [{ from: range.from - before.length, to: range.from }, { from: range.to, to: range.to + after.length }], range: EditorSelection.range(range.from - before.length, range.to - before.length) }
    }
    return { changes: { from: range.from, to: range.to, insert: before + text + after }, range: EditorSelection.range(range.from + before.length, range.to + before.length) }
  }))
  return true
}

function link(view: EditorView): boolean {
  const r = view.state.selection.main
  const text = view.state.sliceDoc(r.from, r.to)
  view.dispatch({ changes: { from: r.from, to: r.to, insert: `[${text}]()` }, selection: { anchor: r.from + text.length + 3 } })
  return true
}

const URL_RE = /^https?:\/\/\S+$/

export function Editor({ value, onChange, links, images, onImage, onError, typewriter, keys, apiRef }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  // Handlers change every render; the editor is built once and reads them through refs.
  const latest = useRef({ onChange, links, images, onImage, onError, keys })
  useEffect(() => { latest.current = { onChange, links, images, onImage, onError, keys } })
  const typewriterCompartment = useRef(new Compartment())

  useEffect(() => {
    const complete = (ctx: CompletionContext): CompletionResult | null => {
      const m = ctx.matchBefore(/(!?)\[\[([^\]\n|#]*)$/)
      if (!m) return null
      const embed = m.text.startsWith("!")
      const from = m.from + (embed ? 3 : 2)
      const options = embed
        ? latest.current.images.map((name) => ({ label: name, type: "variable", apply: `${name}]]` }))
        : latest.current.links.map((l) => ({ label: l.label, detail: l.detail, type: "text", apply: `${l.label}]]` }))
      return { from, options, validFor: /^[^\]\n|#]*$/ }
    }

    const upload = (files: File[], at: number) => {
      for (const file of files) {
        latest.current.onImage(file).then((name) => {
          const v = view.current
          if (!v) return
          const pos = Math.min(at, v.state.doc.length)
          const line = v.state.doc.lineAt(pos)
          const pad = line.text.trim() ? "\n\n" : ""
          v.dispatch({ changes: { from: line.to, insert: `${pad}![[${name}]]\n` } })
        }).catch((e) => latest.current.onError(e instanceof Error ? e.message : "Upload failed"))
      }
    }

    const extensions: Extension[] = [
      history(),
      drawSelection(),
      highlightActiveLine(),
      EditorView.lineWrapping,
      markdown({ base: markdownLanguage }),
      syntaxHighlighting(highlight),
      theme,
      closeBrackets(),
      search({ top: true }),
      highlightSelectionMatches(),
      autocompletion({ override: [complete], icons: false }),
      voiceMarks,
      wikilinkMarks,
      placeholder("Today…"),
      EditorView.contentAttributes.of({ spellcheck: "true", autocorrect: "on", autocapitalize: "sentences", "aria-label": "Note" }),
      keymap.of([
        { key: "Mod-s", preventDefault: true, run: () => { latest.current.keys.save(); return true } },
        { key: "Mod-Enter", preventDefault: true, run: () => { latest.current.keys.commit(); return true } },
        { key: "Mod-e", preventDefault: true, run: () => { latest.current.keys.togglePreview(); return true } },
        { key: "Mod-.", preventDefault: true, run: () => { latest.current.keys.toggleFocus(); return true } },
        { key: "Mod-b", run: (v) => wrap(v, "**") },
        { key: "Mod-i", run: (v) => wrap(v, "*") },
        { key: "Mod-k", run: link },
        { key: "Mod-Shift-k", run: (v) => wrap(v, "[[", "]]") },
        ...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab,
      ]),
      EditorView.domEventHandlers({
        paste(e, v) {
          const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"))
          if (files.length) { e.preventDefault(); upload(files, v.state.selection.main.head); return true }
          const text = e.clipboardData?.getData("text/plain")?.trim() ?? ""
          const sel = v.state.selection.main
          if (URL_RE.test(text) && !sel.empty) {
            e.preventDefault()
            v.dispatch({ changes: { from: sel.from, to: sel.to, insert: `[${v.state.sliceDoc(sel.from, sel.to)}](${text})` } })
            return true
          }
          return false
        },
        drop(e, v) {
          const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"))
          if (!files.length) return false
          e.preventDefault()
          upload(files, v.posAtCoords({ x: e.clientX, y: e.clientY }) ?? v.state.doc.length)
          return true
        },
      }),
      EditorView.updateListener.of((u) => { if (u.docChanged) latest.current.onChange(u.state.doc.toString()) }),
      typewriterCompartment.current.of([]),
    ]

    const v = new EditorView({ parent: host.current!, state: EditorState.create({ doc: value, extensions }) })
    view.current = v
    v.focus()
    // Start at the end: the usual thing is to carry on writing.
    v.dispatch({ selection: { anchor: v.state.doc.length }, scrollIntoView: true })
    return () => { v.destroy(); view.current = null }
    // Built once per mount; `value` changes are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Outside changes (history restore, taking master's version) replace the text.
  useEffect(() => {
    const v = view.current
    if (!v) return
    const now = v.state.doc.toString()
    if (now !== value) v.dispatch({ changes: { from: 0, to: now.length, insert: value } })
  }, [value])

  useEffect(() => {
    view.current?.dispatch({
      effects: typewriterCompartment.current.reconfigure(typewriter
        ? EditorView.updateListener.of((u) => {
          if (!u.selectionSet && !u.docChanged) return
          const head = u.state.selection.main.head
          // After the update settles: dispatching inside a listener is not allowed.
          requestAnimationFrame(() => u.view.dispatch({ effects: EditorView.scrollIntoView(head, { y: "center" }) }))
        })
        : []),
    })
  }, [typewriter])

  useEffect(() => {
    if (!apiRef) return
    apiRef.current = {
      focus: () => view.current?.focus(),
      insert: (text) => {
        const v = view.current
        if (!v) return
        v.dispatch(v.state.replaceSelection(text))
        v.focus()
      },
      select: (from, to = from) => {
        const v = view.current
        if (!v) return
        const len = v.state.doc.length
        v.dispatch({ selection: { anchor: Math.min(from, len), head: Math.min(to, len) }, scrollIntoView: true })
        v.focus()
      },
      replaceRange: (from, to, text) => view.current?.dispatch({ changes: { from, to, insert: text } }),
    }
    return () => { apiRef.current = null }
  }, [apiRef])

  return <div ref={host} className="write-editor" />
}
