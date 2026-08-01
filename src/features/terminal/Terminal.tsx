/**
 * The terminal — one module, three surfaces.
 *
 * Replaces BootPage.tsx (1,143 lines: zoom panes, telemetry gauges, a help
 * overlay, an auth modal, scroll-follow controls, speed and palette pickers).
 * What is left is a feed and a prompt.
 *
 * The attract sequence and the prompt deliberately share ONE line buffer:
 * useBootPlayback already owns both the generated stream and `injectLine`, so
 * "collapse into a prompt" is just pausing the generator. The procedural boot
 * scrolls away as scrollback rather than being thrown out.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useStore } from "@/store"
import { useAuth } from "@/hooks/useAuth"
import { useMusic } from "@/components/ui/music/MusicContext"
import { useBootPlayback } from "@/features/boot/useBootPlayback"
import { resolveSeed, formatSeed, randomSeed } from "@/features/boot/bootSeed"
import type { BootTone } from "@/features/boot/bootTypes"
import { usePhoneViewport } from "@/hooks/usePhoneViewport"
import { COMMANDS, COMMAND_NAMES, lookup } from "./commands"
import type { Surface, TerminalContext, TerminalNote, TerminalSession } from "./types"
import styles from "./Terminal.module.scss"

interface Props {
  surface?: Surface
  /** Supplied by the OS (opens a window) and by the route (router navigate). */
  onOpen?: (slug: string, title?: string) => void
  /** Rendered top-right; the OS passes nothing since its chrome owns that. */
  header?: React.ReactNode
}

const MAX_LINES = 400

export function Terminal({ surface = "page", onOpen, header }: Props) {
  const seedInfo = useMemo(() => resolveSeed(), [])
  const [seedDisplay, setSeedDisplay] = useState(seedInfo.display)
  const isPhone = usePhoneViewport()

  const [mode, setMode] = useState<"attract" | "prompt">("attract")
  const [input, setInput] = useState("")
  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [tabState, setTabState] = useState<{ matches: string[]; index: number } | null>(null)
  // The session lives in a ref (execute() reads it synchronously) with a mirror
  // in state purely so the prompt symbol re-renders.
  const sessionRef = useRef<TerminalSession | null>(null)
  const [sessionPrompt, setSessionPrompt] = useState<string | null>(null)

  const feedRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const contentIndex = useStore((s) => s.contentIndex)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const { session, username, role } = useAuth()
  const music = useMusic()

  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  )

  const playback = useBootPlayback({
    seed: seedInfo.value,
    viewport: isPhone ? "narrow" : "wide",
    reducedMotion,
    maxLines: MAX_LINES,
  })

  const { lines, activeText, activeTone, injectLine, clearLines, setPaused } = playback

  // -------------------------------------------------------------------------
  // attract → prompt
  // -------------------------------------------------------------------------

  // Guarded by a ref, not by reading `mode` inside a state updater: React
  // double-invokes updaters in StrictMode, which would pause twice and print
  // the banner twice.
  const collapsedRef = useRef(false)

  const collapseToPrompt = useCallback(() => {
    if (collapsedRef.current) return
    collapsedRef.current = true
    setPaused(true)
    injectLine("", "normal")
    injectLine("subsurfaces terminal — type `help`", "muted")
    injectLine("", "normal")
    setMode("prompt")
  }, [setPaused, injectLine])

  useEffect(() => {
    if (mode === "prompt") return
    const onKey = (e: KeyboardEvent) => {
      // Ignore bare modifiers so Alt+Tab into the tab doesn't count as intent.
      if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") return
      collapseToPrompt()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [mode, collapseToPrompt])

  // Keep the newest line in view.
  useEffect(() => {
    const el = feedRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines, activeText, mode])

  useEffect(() => {
    if (mode === "prompt") inputRef.current?.focus()
  }, [mode])

  // -------------------------------------------------------------------------
  // command context
  // -------------------------------------------------------------------------

  const notes = useMemo<TerminalNote[]>(() => {
    if (!contentIndex) return []
    return Object.values(contentIndex)
      .filter((n) => !n.private && !n.draft)
      .map((n) => ({
        slug: n.slug,
        title: n.title,
        tags: n.tags ?? [],
        contentPath: n.contentPath ?? `${n.slug}.md`,
        folder: n.folder,
        excerpt: n.excerpt,
      }))
  }, [contentIndex])

  const historyRef = useRef<string[]>([])
  historyRef.current = history

  const ctx = useMemo<TerminalContext>(
    () => ({
      surface,
      startSession: (s) => {
        sessionRef.current = s
        setSessionPrompt(s.prompt)
      },
      endSession: () => {
        sessionRef.current = null
        setSessionPrompt(null)
      },
      print: (text, tone: BootTone = "normal") => injectLine(text, tone),
      printLines: (ls, tone: BootTone = "normal") => ls.forEach((l) => injectLine(l, tone)),
      clear: () => clearLines(),
      history: () => historyRef.current,
      notes: () => notes,
      fetchNote: async (contentPath) => {
        try {
          const res = await fetch(`/content/${contentPath}`)
          if (!res.ok) return null
          const text = await res.text()
          // An SPA fallback returns index.html with a 200 — detect and reject,
          // otherwise `cat` prints a page of markup and calls it a note.
          if (text.trimStart().startsWith("<!")) return null
          return text
        } catch {
          return null
        }
      },
      open: (slug, title) => {
        if (onOpen) onOpen(slug, title)
        else window.location.assign(`/${slug}`)
      },
      navigate: (url) => window.location.assign(url),
      user: () =>
        session ? { username, role, email: session.user.email ?? null } : null,
      requireLogin: () => window.location.assign("https://wiki.subsurfaces.net/profile"),
      theme: { get: () => theme, set: setTheme },
      seed: {
        value: seedInfo.value,
        display: seedDisplay,
        reseed: () => {
          const next = randomSeed()
          setSeedDisplay(formatSeed(next))
          const url = new URL(window.location.href)
          url.searchParams.set("seed", formatSeed(next))
          window.location.assign(url.toString())
        },
      },
      music: {
        tracks: music.tracks,
        currentTrackIndex: music.currentTrackIndex,
        isPlaying: music.isPlaying,
        volume: music.volume,
        playTrack: music.playTrack,
        togglePlay: music.togglePlay,
        nextTrack: music.nextTrack,
        prevTrack: music.prevTrack,
        setVolume: music.setVolume,
      },
    }),
    [
      surface, injectLine, clearLines, notes, onOpen, session, username, role,
      theme, setTheme, seedInfo.value, seedDisplay, music,
    ],
  )

  // -------------------------------------------------------------------------
  // execution
  // -------------------------------------------------------------------------

  const execute = useCallback(
    async (raw: string) => {
      const line = raw.trim()
      const session = sessionRef.current
      injectLine(`${session ? session.prompt : ">"} ${line || ""}`, "accent")
      if (!line) return

      setHistory((h) => [...h, line])
      setHistoryIdx(-1)

      // A session owns the prompt until it is left. `exit`/`quit` always work,
      // so there is no way to be trapped in one.
      if (session) {
        if (/^(exit|quit|bye)$/i.test(line)) {
          sessionRef.current = null
          setSessionPrompt(null)
          injectLine("session ended.", "muted")
          return
        }
        try {
          await session.onInput(line, ctx)
        } catch (err) {
          injectLine(
            `session: ${err instanceof Error ? err.message : "unexpected failure"}`,
            "error",
          )
        }
        return
      }

      const [name, ...args] = line.split(/\s+/)
      const cmd = lookup(name)

      if (!cmd) {
        injectLine(`${name}: command not found`, "error")
        const near = COMMAND_NAMES.filter((n) => n.startsWith(name[0] ?? "")).slice(0, 6)
        if (near.length) injectLine(`did you mean: ${near.join(", ")}?`, "muted")
        return
      }

      if (cmd.requireRole && role !== cmd.requireRole && role !== "admin") {
        injectLine(`${cmd.name}: requires ${cmd.requireRole}`, "error")
        return
      }

      try {
        await cmd.run(ctx, args)
      } catch (err) {
        // Failure is visible and specific — house law.
        injectLine(
          `${cmd.name}: ${err instanceof Error ? err.message : "unexpected failure"}`,
          "error",
        )
      }
    },
    [ctx, injectLine, role],
  )

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      const value = input
      setInput("")
      setTabState(null)
      void execute(value)
      return
    }

    if (e.key === "ArrowUp") {
      e.preventDefault()
      if (!history.length) return
      const next = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1)
      setHistoryIdx(next)
      setInput(history[next])
      return
    }

    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (historyIdx === -1) return
      const next = historyIdx + 1
      if (next >= history.length) {
        setHistoryIdx(-1)
        setInput("")
      } else {
        setHistoryIdx(next)
        setInput(history[next])
      }
      return
    }

    if (e.key === "Tab") {
      e.preventDefault()
      // Only the command word completes; arguments are too varied to guess.
      if (input.includes(" ")) return
      if (tabState) {
        const idx = (tabState.index + 1) % tabState.matches.length
        setTabState({ ...tabState, index: idx })
        setInput(tabState.matches[idx])
        return
      }
      const matches = COMMAND_NAMES.filter((n) => n.startsWith(input.toLowerCase()))
      if (!matches.length) return
      setTabState({ matches, index: 0 })
      setInput(matches[0])
      return
    }

    if (e.key === "l" && e.ctrlKey) {
      e.preventDefault()
      clearLines()
      return
    }

    setTabState(null)
  }

  const promptSymbol = sessionPrompt ?? (surface === "window" ? "C:\\>" : ">")

  return (
    <div
      className={styles.terminal}
      data-surface={surface}
      onClick={() => {
        if (mode === "attract") collapseToPrompt()
        else inputRef.current?.focus()
      }}
    >
      {header && <div className={styles.header}>{header}</div>}

      <div className={styles.feed} ref={feedRef} role="log" aria-label="Terminal output">
        {lines.map((line) => (
          <div key={line.id} className={styles.line} data-tone={line.tone}>
            {line.text || "\u00a0"}
          </div>
        ))}

        {mode === "attract" && activeText && (
          <div className={styles.line} data-tone={activeTone}>
            {activeText}
            <span className={styles.cursor} />
          </div>
        )}

        {mode === "prompt" && (
          <div className={styles.inputRow}>
            <span className={styles.promptSymbol}>{promptSymbol}</span>
            <input
              ref={inputRef}
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              aria-label="Terminal input"
            />
          </div>
        )}
      </div>

      {mode === "attract" && (
        <div className={styles.hint}>press any key</div>
      )}
    </div>
  )
}

export { COMMANDS }
