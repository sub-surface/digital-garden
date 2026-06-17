import { useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useAuth } from "@/hooks/useAuth"
import { useShell } from "@/hooks/useShell"
import { WikiAuthModal } from "@/components/ui/wiki/WikiAuthModal"
import styles from "./QuickControls.module.scss"

export function ProfileControl() {
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

  if (shell === "main") return null

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
