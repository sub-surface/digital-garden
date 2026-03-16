import { useState, useEffect, useRef } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@/store"
import { useAuth } from "@/hooks/useAuth"
import { useShell } from "@/hooks/useShell"
import { MusicBar } from "@/components/ui/MusicBar"
import { SearchButton } from "@/components/ui/SearchButton"
import { BgModeToggle } from "@/components/ui/BgModeToggle"
import { WikiAuthModal } from "@/components/ui/WikiAuthModal"
import styles from "./QuickControls.module.scss"

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

function ProfileButton() {
  const { session, role, loading, username, signOut } = useAuth()
  const shell = useShell()
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [authTab, setAuthTab] = useState<"login" | "signup">("login")
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [dropdownOpen])

  // Only show on wiki/chat shells
  if (shell === "main") return null

  // Status color: red = not logged in, yellow = loading/pending, green = authed
  const statusColor = loading
    ? "#b49442"
    : !session
      ? "#b44242"
      : role === "pending"
        ? "#b49442"
        : "#42b464"

  const statusTitle = loading
    ? "Authenticating..."
    : !session
      ? "Not logged in"
      : role === "pending"
        ? "Awaiting approval"
        : `Logged in as ${username || session.user?.email?.split("@")[0] || "user"}`

  return (
    <div className={styles.profileWrapper} ref={dropdownRef}>
      <button
        className={styles.iconBtn}
        onClick={() => {
          if (!session && !loading) {
            setAuthTab("login")
            setShowAuth(true)
          } else {
            setDropdownOpen((v) => !v)
          }
        }}
        title={statusTitle}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke={statusColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </button>

      {dropdownOpen && session && (
        <div className={styles.profileDropdown}>
          <div className={styles.profileDropdownName}>
            {username || session.user?.email?.split("@")[0] || "user"}
          </div>
          <button
            className={styles.profileDropdownItem}
            onClick={() => { setDropdownOpen(false); navigate({ to: "/profile" }) }}
          >
            Profile
          </button>
          <button
            className={styles.profileDropdownItem}
            onClick={() => { setDropdownOpen(false); signOut() }}
          >
            Log out
          </button>
        </div>
      )}

      {showAuth && (
        <WikiAuthModal onClose={() => setShowAuth(false)} defaultTab={authTab} />
      )}
    </div>
  )
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
      <ProfileButton />

      {/* Clock */}
      <div className={styles.clockGroup}>
        <span className={styles.clock}>{time}</span>
      </div>
    </div>
  )
}
