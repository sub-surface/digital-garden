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
import { resolveSeed, persistResolvedSeed, formatSeed, randomSeed } from "@/features/boot/bootSeed"
import type { BootTone } from "@/features/boot/bootTypes"
import { usePhoneViewport } from "@/hooks/usePhoneViewport"
import { COMMANDS, commandNames, commandsFor, lookup } from "./commands"
import { useContentSearch } from "@/hooks/useContentSearch"
import type { Surface, TerminalContext, TerminalNote, TerminalSession } from "./types"
import styles from "./Terminal.module.scss"

interface Props {
  surface?: Surface
  /** Supplied by the OS (opens a window) and by the route (router navigate). */
  onOpen?: (slug: string, title?: string) => void
  /** OS adapter for privileged/wiki routes that should become native windows. */
  onNavigate?: (url: string) => void
  onRequireLogin?: () => void
  /** Rendered top-right; the OS passes nothing since its chrome owns that. */
  header?: React.ReactNode
  /** Supplied by the OS so `exit` can close the window it lives in. */
  onClose?: () => void
  /** Dock only: whether the prompt is the visible tab (focus follows it). */
  active?: boolean
}

/** One row under the dock prompt. `value` is what Tab writes into the input. */
interface Suggestion {
  kind: "command" | "arg" | "note"
  label: string
  detail?: string
  value: string
  /** Enter on it runs this line; absent means Enter only completes. */
  run?: string
}

const MAX_COMMAND_SUGGESTIONS = 5
const MAX_NOTE_SUGGESTIONS = 5
const MAX_ARG_SUGGESTIONS = 8

const MAX_LINES = 400

function TerminalText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|https?:\/\/\S+|(?:[A-Z]:\\|\/)\S+)/g)
  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null
        const command = part.startsWith("`") && part.endsWith("`")
        const path = !command && (/^https?:\/\//.test(part) || /^(?:[A-Z]:\\|\/)/.test(part))
        return (
          <span key={index} data-syntax={command ? "command" : path ? "path" : undefined}>
            {command ? part.slice(1, -1) : part}
          </span>
        )
      })}
    </>
  )
}

export function Terminal({ surface = "page", onOpen, onNavigate, onRequireLogin, header, onClose, active = true }: Props) {
  // Resolution is pure during render. TanStack Router observes history writes,
  // so canonicalising here used to update <Transitioner> while Terminal was
  // still rendering. Persist/canonicalise only after commit.
  const seedInfo = useMemo(() => resolveSeed({ persist: false }), [])
  const [seedDisplay, setSeedDisplay] = useState(seedInfo.display)
  const isPhone = usePhoneViewport()

  const [mode, setMode] = useState<"attract" | "prompt">("attract")
  const [input, setInput] = useState("")
  // History is shared and persisted, so ↑ in the dock finds yesterday's line.
  const history = useStore((s) => s.promptHistory)
  const pushPromptHistory = useStore((s) => s.pushPromptHistory)
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

  useEffect(() => {
    if (surface !== "page") return
    persistResolvedSeed(seedInfo.value, seedInfo.source, "replace")
  }, [seedInfo, surface])

  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  )

  const playback = useBootPlayback({
    // Windowed/overlay terminals start as prompts and should not spin up a
    // procedural generator for the one render before their collapse effect.
    seed: surface === "page" ? seedInfo.value : null,
    viewport: isPhone ? "narrow" : "wide",
    reducedMotion,
    maxLines: MAX_LINES,
  })

  const { lines, activeText, activeTone, injectLine, replaceLastLines, clearLines, setPaused } = playback

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
    injectLine(
      surface === "dock"
        ? "the garden prompt. type to search, or `help` for what it can do."
        : "subsurfaces terminal — type `help`",
      "muted",
    )
    injectLine("", "normal")
    setMode("prompt")
  }, [setPaused, injectLine, surface])

  // In a window the attract sequence is just noise — a 680px MS-DOS Prompt
  // wants to be a prompt. Fullscreen still opens on the procedural boot.
  useEffect(() => {
    if (surface !== "page") collapseToPrompt()
  }, [surface, collapseToPrompt])

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
    // preventScroll: in the dock, focusing must not scroll the page behind it.
    if (mode === "prompt" && active) inputRef.current?.focus({ preventScroll: true })
  }, [mode, active])

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
      replaceLastLines: (count, ls, tone: BootTone = "normal") =>
        replaceLastLines(count, ls, tone),
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
      navigate: (url) => onNavigate ? onNavigate(url) : window.location.assign(url),
      close: onClose,
      user: () =>
        session ? { username, role, email: session.user.email ?? null } : null,
      requireLogin: () => onRequireLogin ? onRequireLogin() : window.location.assign("https://wiki.subsurfaces.net/profile"),
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
      surface, injectLine, replaceLastLines, clearLines, notes, onOpen, onNavigate, onRequireLogin, onClose, session, username, role,
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

      pushPromptHistory(line)
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
      const cmd = lookup(name, surface)

      if (!cmd) {
        injectLine(`${name}: command not found`, "error")
        const near = commandNames(surface).filter((n) => n.startsWith(name[0] ?? "")).slice(0, 6)
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
    [ctx, injectLine, role, surface, pushPromptHistory],
  )

  // -------------------------------------------------------------------------
  // dock: live suggestions under the prompt
  // -------------------------------------------------------------------------

  const isDock = surface === "dock"
  const trimmed = input.trimStart()
  const firstSpace = trimmed.indexOf(" ")
  const head = (firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace)).toLowerCase()
  const headCmd = head ? lookup(head, surface) : undefined
  const suggesting = isDock && mode === "prompt" && !sessionPrompt && trimmed.length > 0
  // Free text searches the garden; a command with arguments doesn't.
  const searchQuery = suggesting && trimmed.length >= 2 && !(headCmd && firstSpace !== -1) ? trimmed : ""
  const { results: noteHits } = useContentSearch({ enabled: isDock, query: searchQuery, limit: MAX_NOTE_SUGGESTIONS })

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!suggesting) return []
    if (firstSpace !== -1) {
      if (!headCmd?.complete) return []
      const rest = trimmed.slice(firstSpace + 1)
      return headCmd
        .complete(ctx, rest)
        .slice(0, MAX_ARG_SUGGESTIONS)
        .map((candidate) => ({ kind: "arg", label: candidate, value: `${head} ${candidate}`, run: `${head} ${candidate}` }))
    }
    const commands: Suggestion[] = commandsFor(surface)
      .filter((cmd) => cmd.name.startsWith(head) || cmd.aliases?.some((a) => a.startsWith(head)))
      .slice(0, MAX_COMMAND_SUGGESTIONS)
      .map((cmd) => {
        const takesArgs = cmd.help.usage.includes(" ")
        const needsArgs = /\s</.test(cmd.help.usage)
        return {
          kind: "command",
          label: cmd.name,
          detail: cmd.help.description,
          value: takesArgs ? `${cmd.name} ` : cmd.name,
          run: needsArgs ? undefined : cmd.name,
        }
      })
    const notes: Suggestion[] = noteHits
      .filter((hit) => hit.kind === "garden")
      .map((hit) => ({ kind: "note", label: hit.title, detail: hit.target, value: `open ${hit.target}`, run: `open ${hit.target}` }))
    return [...commands, ...notes]
  }, [suggesting, firstSpace, headCmd, trimmed, head, ctx, surface, noteHits])

  const [selected, setSelected] = useState(0)
  // Moved with the arrows: Enter then means "this row", not "what I typed".
  const [navigated, setNavigated] = useState(false)
  const [lastInput, setLastInput] = useState(input)
  if (lastInput !== input) {
    setLastInput(input)
    setSelected(0)
    setNavigated(false)
  }
  const current = suggestions[Math.min(selected, suggestions.length - 1)]

  // Requests from the rest of the site: `?` runs `keys`, "/" opens empty, etc.
  const dockRequest = useStore((s) => s.dockRequest)
  // A mailbox: the dock (lazy) mounts *after* the request that opened it was
  // posted, so a pending request is taken on mount, then cleared.
  const handledRequest = useRef(0)
  useEffect(() => {
    if (!isDock || mode !== "prompt" || !dockRequest || dockRequest.id === handledRequest.current) return
    handledRequest.current = dockRequest.id
    useStore.setState({ dockRequest: null })
    if (dockRequest.run) void execute(dockRequest.run)
    if (dockRequest.input !== undefined) setInput(dockRequest.input)
  }, [isDock, mode, dockRequest, execute])

  const submit = (line: string) => {
    setInput("")
    setTabState(null)
    void execute(line)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isDock && e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      if (input) setInput("")
      else onClose?.()
      return
    }

    if (e.key === "Enter") {
      e.preventDefault()
      // In the dock: a typed command runs as typed; otherwise Enter takes the
      // highlighted row (so "kant" + Enter opens the best match).
      if (current && (navigated || !headCmd)) {
        if (current.run) submit(current.run)
        else setInput(current.value)
        return
      }
      submit(input)
      return
    }

    if (suggestions.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault()
      const step = e.key === "ArrowDown" ? 1 : -1
      setSelected((i) => (i + step + suggestions.length) % suggestions.length)
      setNavigated(true)
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
      // The dock shows its candidates, so Tab takes the highlighted one and the
      // list re-forms around it (e.g. "bg" → "bg " → its modes).
      if (isDock && current) {
        setInput(current.value)
        return
      }
      if (tabState) {
        const idx = (tabState.index + 1) % tabState.matches.length
        setTabState({ ...tabState, index: idx })
        setInput(tabState.matches[idx])
        return
      }

      let matches: string[]
      if (input.indexOf(" ") === -1) {
        matches = commandNames(surface).filter((n) => n.startsWith(input.toLowerCase()))
      } else {
        const space = input.indexOf(" ")
        const name = input.slice(0, space).toLowerCase()
        const value = input.slice(space + 1)
        const cmd = lookup(name, surface)
        matches = cmd?.complete
          ? cmd.complete(ctx, value).map((candidate) => `${name} ${candidate}`)
          : []
      }
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

  const promptSymbol = sessionPrompt ?? (surface === "window" ? "C:\\GARDEN>" : ">")

  const inputRow = mode === "prompt" && (
    <div className={styles.inputRow}>
      <span className={styles.promptSymbol}>{promptSymbol}</span>
      <input
        ref={inputRef}
        id={isDock ? "dock-prompt-input" : "shared-terminal-input"}
        name="terminal-command"
        className={styles.input}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        placeholder={isDock ? "search the garden, or type a command" : undefined}
        aria-label={isDock ? "Prompt: search or type a command" : "Terminal input"}
        role={isDock ? "combobox" : undefined}
        aria-expanded={isDock ? suggestions.length > 0 : undefined}
        aria-controls={isDock ? "dock-suggestions" : undefined}
        aria-activedescendant={isDock && current ? `dock-suggestion-${suggestions.indexOf(current)}` : undefined}
      />
    </div>
  )

  return (
    <div
      className={styles.terminal}
      data-surface={surface}
      onClick={() => {
        if (mode === "attract") collapseToPrompt()
        else if (!window.getSelection()?.toString()) inputRef.current?.focus({ preventScroll: true })
      }}
    >
      {header && <div className={styles.header}>{header}</div>}

      {mode === "prompt" && !isDock && (
        <div className={styles.masthead} aria-label="Subsurfaces 95 terminal">
          <span>┌─ SUBSURFACES 95 ─────────────────────────────┐</span>
          <span>{`│ C:\\GARDEN · W:\\WIKI · X:\\CHAT · ${seedDisplay.padEnd(10)} │`}</span>
          <span>└──────────────────────────────────────────────┘</span>
        </div>
      )}

      <div className={styles.feed} ref={feedRef} role="log" aria-label="Terminal output">
        {lines.map((line) => (
          <div key={line.id} className={styles.line} data-tone={line.tone}>
            {line.text ? <TerminalText text={line.text} /> : "\u00a0"}
          </div>
        ))}

        {mode === "attract" && activeText && (
          <div className={styles.line} data-tone={activeTone}>
            {activeText}
            <span className={styles.cursor} />
          </div>
        )}

        {!isDock && inputRow}
      </div>

      {isDock && (
        <div className={styles.dockPrompt}>
          {suggestions.length > 0 && (
            <ul className={styles.suggestions} id="dock-suggestions" role="listbox" aria-label="Suggestions">
              {suggestions.map((sug, i) => (
                <li
                  key={`${sug.kind}:${sug.value}`}
                  id={`dock-suggestion-${i}`}
                  role="option"
                  aria-selected={sug === current}
                  className={styles.suggestion}
                  data-kind={sug.kind}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => (sug.run ? submit(sug.run) : setInput(sug.value))}
                  onPointerEnter={() => setSelected(i)}
                >
                  <span className={styles.suggestionKind}>{sug.kind === "note" ? "note" : sug.kind === "arg" ? "↳" : "cmd"}</span>
                  <span className={styles.suggestionLabel}>{sug.label}</span>
                  {sug.detail && <span className={styles.suggestionDetail}>{sug.detail}</span>}
                </li>
              ))}
            </ul>
          )}
          {inputRow}
          <div className={styles.dockHint} aria-hidden="true">
            {input
              ? "Tab completes · ↑↓ choose · Enter runs · Esc clears"
              : "try random · here · toc · keys · help — Esc closes"}
          </div>
        </div>
      )}

      {mode === "attract" && (
        <div className={styles.hint}>press any key</div>
      )}
    </div>
  )
}

export { COMMANDS }
