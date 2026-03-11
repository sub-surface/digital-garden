import { useState, useRef, useEffect } from "react"
import { Outlet, useNavigate } from "@tanstack/react-router"
import { useStore } from "@/store"
import { ThemePanel } from "./ThemePanel"
import { TerminalTitle } from "./TerminalTitle"
import { CornerMenu } from "./CornerMenu"
import { QuickControls } from "./QuickControls"
import { WikiAuthModal } from "@/components/ui/WikiAuthModal"
import { useAuth } from "@/hooks/useAuth"
import styles from "./ChatShell.module.scss"

function ChatUserMenu() {
  const { session, role, loading, username, signOut } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [authTab, setAuthTab] = useState<"login" | "signup">("login")
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

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

  if (loading) return null

  if (!session) {
    return (
      <>
        <div className={styles.authControls}>
          <button
            className={styles.authBtn}
            onClick={() => { setAuthTab("login"); setShowAuth(true) }}
          >
            Log in
          </button>
          <span className={styles.authSep}>/</span>
          <button
            className={styles.authBtn}
            onClick={() => { setAuthTab("signup"); setShowAuth(true) }}
          >
            Sign up
          </button>
        </div>
        {showAuth && <WikiAuthModal onClose={() => setShowAuth(false)} defaultTab={authTab} />}
      </>
    )
  }

  const displayName = username || session.user?.email?.split("@")[0] || "user"

  const roleBadgeClass = role === "admin"
    ? styles.roleBadgeAdmin
    : role === "editor"
      ? styles.roleBadgeEditor
      : styles.roleBadgePending

  return (
    <div className={styles.authControls} ref={dropdownRef}>
      <button
        className={styles.userBtn}
        onClick={() => setDropdownOpen((v) => !v)}
      >
        <span className={styles.userName}>{displayName}</span>
        <span className={`${styles.roleBadge} ${roleBadgeClass}`}>
          {role === "pending" ? "pending" : role}
        </span>
      </button>

      {dropdownOpen && (
        <div className={styles.userDropdown}>
          <button
            className={styles.dropdownItem}
            onClick={() => { setDropdownOpen(false); navigate({ to: "/profile" }) }}
          >
            Profile (wiki)
          </button>
          <button
            className={styles.dropdownItem}
            onClick={() => { setDropdownOpen(false); signOut() }}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  )
}

export function ChatShell() {
  const activeLayout = useStore((s) => s.activeLayout)

  return (
    <div
      className={styles.shell}
      data-chat
      data-layout={activeLayout}
      data-testid="chat-shell"
    >
      <ThemePanel />

      <TerminalTitle context="chat" />
      <QuickControls variant="chat" />
      <ChatUserMenu />

      <main className={styles.mainPane} data-testid="main-pane">
        <Outlet />
      </main>

      <CornerMenu variant="wiki" />
    </div>
  )
}
