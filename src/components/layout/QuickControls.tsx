import { useState, useEffect, lazy, Suspense } from "react"
import { useStore } from "@/store"
import { useShell } from "@/hooks/useShell"
import { MusicBar } from "@/components/ui/MusicBar"
import { SearchButton } from "@/components/ui/SearchButton"
import { BgModeToggle } from "@/components/ui/BgModeToggle"
import styles from "./QuickControls.module.scss"

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

function formatDateTime(): string {
  const d = new Date()
  const dayName = d.toLocaleDateString("en-GB", { weekday: "long" })
  const monthName = d.toLocaleDateString("en-GB", { month: "long" })
  const day = d.getDate()
  const year = d.getFullYear()
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
  
  // Custom ordinal suffix
  const getOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"]
    const v = n % 100
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }

  return `${dayName}, ${monthName} ${getOrdinal(day)} ${year} | ${time}`
}

interface QuickControlsProps {
  variant?: "full" | "chat"
}

function TerminalToggle() {
  const shell = useShell()
  const chatTerminal = useStore((s) => s.chatTerminal)
  const setChatTerminal = useStore((s) => s.setChatTerminal)
  if (shell !== "chat") return null
  return (
    <button
      className={chatTerminal ? `${styles.iconBtn} ${styles.iconBtnActive}` : styles.iconBtn}
      onClick={() => setChatTerminal(!chatTerminal)}
      title={chatTerminal ? "Exit terminal view" : "Terminal view"}
      aria-label="Toggle terminal view"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5"/>
        <line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
    </button>
  )
}

function SideChatToggle() {
  const shell = useShell()
  const isSideChatOpen = useStore((s) => s.isSideChatOpen)
  const toggleSideChat = useStore((s) => s.toggleSideChat)

  if (shell !== "wiki") return null

  return (
    <button
      className={`${styles.iconBtn} ${styles.chatToggle} ${isSideChatOpen ? styles.chatToggleActive : ""}`}
      onClick={toggleSideChat}
      title={isSideChatOpen ? "Close chat" : "Open chat"}
      aria-label="Toggle side chat"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    </button>
  )
}

export function QuickControls({ variant = "full" }: QuickControlsProps) {
  const [time, setTime] = useState(() => formatDateTime())
  const theme = useStore((s) => s.theme)
  const accentBase = useStore((s) => s.accentBase)
  const cycleAccent = useStore((s) => s.cycleAccent)
  const setTheme = (t: "light" | "dark") => useStore.getState().setTheme(t)
  const shell = useShell()
  const isSideChatOpen = useStore((s) => s.isSideChatOpen)
  const sideChatWidth = useStore((s) => s.sideChatWidth)

  useEffect(() => {
    const id = setInterval(() => setTime(formatDateTime()), 1000)
    return () => clearInterval(id)
  }, [])

  // Shift QuickControls left when side chat is open on wiki shell
  const rightOffset = shell === "wiki" && isSideChatOpen ? sideChatWidth + 16 : undefined

  return (
    <div
      className={styles.quickControls}
      data-panel-ignore
      style={rightOffset ? { right: `${rightOffset}px` } : undefined}
    >
      {variant === "full" && <MusicBar />}

      {variant === "full" && <SearchButton />}

      {/* Day/Night Toggle */}
      <button
        className={styles.iconBtn}
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      >
        {theme === "dark" ? "\u263C" : "\u263E"}
      </button>

      {/* Theme Cycle Dot (ROYGBIV) */}
      <button
        className={styles.themeDot}
        onClick={cycleAccent}
        style={{ backgroundColor: accentBase }}
        title="Cycle accent color"
      />

      <BgModeToggle />

      {/* Side Chat Toggle (wiki only) */}
      <SideChatToggle />

      {/* Terminal View Toggle (chat only) */}
      <TerminalToggle />

      {/* Profile Icon */}
      {shell !== "main" && (
        <Suspense fallback={null}>
          <ProfileControl />
        </Suspense>
      )}

      {/* Clock + build stamp */}
      <div className={styles.clockGroup}>
        <span className={styles.clock}>{time}</span>
        <BuildStamp />
      </div>
    </div>
  )
}
