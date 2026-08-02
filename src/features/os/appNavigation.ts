import { useCallback } from "react"
import { classifyLayout } from "@/lib/layout"
import type { NoteMetadata } from "@/types/content"
import { useOS } from "./osStore"

/** Extension by layout — articles are documents, system pages are executables. */
export function fileExt(note: Pick<NoteMetadata, "slug" | "layout" | "type" | "system">): string {
  if (note.system) return "EXE"
  const layout = classifyLayout(note.slug, { layout: note.layout, type: note.type })
  if (layout === "game") return "EXE"
  if (note.type === "book" || note.type === "movie") return "NFO"
  return layout === "article" ? "DOC" : "TXT"
}

/** MS-DOS-style display name used by Explorer and window titles. */
export function dosName(slug: string, ext: string): string {
  const base = slug.split("/").pop() ?? slug
  const clean = base.replace(/[^a-z0-9]/gi, "").toUpperCase()
  const stem = clean.length > 8 ? `${clean.slice(0, 6)}~1` : clean.padEnd(0)
  return `${stem || "UNTITLED"}.${ext}`
}

export function appForNote(note: NoteMetadata): string {
  if (note.system) return "program"
  const layout = classifyLayout(note.slug, { layout: note.layout, type: note.type })
  if (layout === "game") return "program"
  return "browser"
}

/** Shared open-a-note action used by desktop chrome and lazy programs alike. */
export function useOpenNote() {
  const openWindow = useOS((state) => state.openWindow)
  return useCallback((note: NoteMetadata) => {
    const appId = appForNote(note)
    const ext = fileExt(note)
    openWindow({
      appId,
      args: { slug: note.slug },
      title: `${note.title} — ${dosName(note.slug, ext)}`,
      ...(appId === "program" ? { w: 860, h: 640 } : {}),
    })
  }, [openWindow])
}
