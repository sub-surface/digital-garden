import { useState, useEffect, lazy, Suspense } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@/store"
import { useShell } from "@/hooks/useShell"
import { ReaderToggle } from "@/components/ui/ReaderToggle"
import { RecoveredControl } from "./RecoveredControl"
import { NowSlot } from "./NowSlot"
import styles from "./QuickControls.module.scss"

/**
 * The bar, in three clusters:
 *   now      — the song while you listen, otherwise what's new in the garden
 *   prompt   — opens the dock's prompt (search + every command)
 *   you      — reader mode, chat, settings, profile, the clock
 *
 * Day/night, accent and background moved into Settings (`\`); every button
 * here is also a prompt command, so the bar is a shortcut, not an interface.
 */

const NON_ARCADE_SLUGS = new Set(["graph", "constellation"])

function ArcadeBackButton() {
  const activeLayout = useStore((s) => s.activeLayout)
  const slug = useStore((s) => s.activeGraphSlug)
  const navigate = useNavigate()
  if (activeLayout !== "game") return null
  if (NON_ARCADE_SLUGS.has(slug.toLowerCase())) return null
  return (
    <button
      className={styles.arcadeBack}
      onClick={() => navigate({ to: "/$", params: { _splat: "arcade" } as any })}
      title="Back to the arcade"
      aria-label="Back to the arcade"
    >
      ‹ Arcade
    </button>
  )
}

const ProfileControl = lazy(() => import("./ProfileControl").then((m) => ({ default: m.ProfileControl })))

const COMMIT_SHA = __COMMIT_SHA__
const COMMIT_URL =
  __COMMIT_SHA_FULL__ === "dev"
    ? null
    : `https://github.com/sub-surface/digital-garden/commit/${__COMMIT_SHA_FULL__}`

/** Build stamp: the commit this bundle was built from, linking to GitHub. */
function BuildStamp() {
  if (!COMMIT_URL) {
    return <span className={styles.commit} title="Local dev build">{COMMIT_SHA}</span>
  }
  return (
    <a
      className={styles.commit}
      href={COMMIT_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={`Running commit ${__COMMIT_SHA_FULL__} — view on GitHub`}
    >
      {COMMIT_SHA}
    </a>
  )
}

// Built once: toLocale*String constructs a fresh formatter on every call,
// and this runs every second.
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "long" })
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long" })
const CLOCK = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })

function formatDateTime(): { date: string; time: string } {
  const d = new Date()
  const dayName = WEEKDAY.format(d)
  const monthName = MONTH.format(d)
  const day = d.getDate()
  const year = d.getFullYear()
  const time = CLOCK.format(d)
  
  // Custom ordinal suffix
  const getOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"]
    const v = n % 100
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }

  return {
    date: `${dayName}, ${monthName} ${getOrdinal(day)} ${year}`,
    time,
  }
}


/**
 * Its own component, so the per-second tick re-renders two spans rather than
 * the whole bar; it also stops while the tab is hidden.
 */
function Clock() {
  const [time, setTime] = useState(() => formatDateTime())
  useEffect(() => {
    let id = 0
    const start = () => {
      window.clearInterval(id)
      if (document.visibilityState !== "visible") return
      setTime(formatDateTime())
      id = window.setInterval(() => setTime(formatDateTime()), 1000)
    }
    start()
    document.addEventListener("visibilitychange", start)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", start)
    }
  }, [])
  return (
    <span className={styles.clock}>
      <span className={styles.clockDate}>{time.date} | </span>
      <span className={styles.clockTime}>{time.time}</span>
    </span>
  )
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

function PromptButton({ compact }: { compact: boolean }) {
  const open = useStore((s) => s.dock === "prompt")
  const toggleDock = useStore((s) => s.toggleDock)
  return (
    <button
      className={styles.promptBtn}
      data-compact={compact || undefined}
      data-active={open || undefined}
      onClick={() => toggleDock("prompt")}
      aria-label="Open the prompt: search, or run a command"
      aria-expanded={open}
      title="Search, or run a command"
    >
      <span className={styles.promptCaret} aria-hidden="true">›</span>
      {!compact && <span className={styles.promptText}>search or command</span>}
      <kbd className={styles.promptKey}>{isMac ? "⌘P" : "Ctrl P"}</kbd>
    </button>
  )
}

function ChatDockToggle() {
  const shell = useShell()
  const open = useStore((s) => s.dock === "chat")
  const toggleDock = useStore((s) => s.toggleDock)
  if (shell !== "wiki" && shell !== "main") return null
  return (
    <button
      className={`${styles.iconBtn} ${open ? styles.iconBtnActive : ""}`}
      onClick={() => toggleDock("chat")}
      title={open ? "Close philchat (C)" : "philchat (C)"}
      aria-label="Toggle philchat"
      aria-pressed={open}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    </button>
  )
}

function SettingsButton() {
  const open = useStore((s) => s.isThemePanelOpen)
  const toggle = useStore((s) => s.toggleThemePanel)
  return (
    <button
      className={`${styles.iconBtn} ${open ? styles.iconBtnActive : ""}`}
      onClick={toggle}
      title="Settings: look, reading, background (\)"
      aria-label="Settings"
      aria-expanded={open}
      data-settings-trigger
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="4" y1="6" x2="20" y2="6" /><circle cx="9" cy="6" r="2" fill="var(--color-bg)" />
        <line x1="4" y1="12" x2="20" y2="12" /><circle cx="15" cy="12" r="2" fill="var(--color-bg)" />
        <line x1="4" y1="18" x2="20" y2="18" /><circle cx="7" cy="18" r="2" fill="var(--color-bg)" />
      </svg>
    </button>
  )
}

export function QuickControls() {
  const shell = useShell()
  const activeSlug = useStore((s) => s.activeGraphSlug)
  const isWiki =
    shell === "wiki" ||
    activeSlug.toLowerCase().startsWith("wiki") ||
    (typeof window !== "undefined" && window.location.pathname.toLowerCase().startsWith("/wiki"))

  return (
    <div className={styles.quickControls} data-panel-ignore data-reader-keep>
      <div className={styles.cluster} data-cluster="now">
        <ArcadeBackButton />
        <NowSlot scope={isWiki ? "wiki" : "garden"} music={shell === "main" && !isWiki} />
      </div>

      <div className={styles.cluster} data-cluster="prompt">
        <PromptButton compact={shell === "wiki"} />
      </div>

      <div className={styles.cluster} data-cluster="you">
        <ReaderToggle />
        <ChatDockToggle />
        <SettingsButton />
        {shell === "main" && <RecoveredControl />}
        {shell !== "main" && (
          <Suspense fallback={null}>
            <ProfileControl />
          </Suspense>
        )}
        <div className={styles.clockGroup}>
          <Clock />
          <BuildStamp />
        </div>
      </div>
    </div>
  )
}
