import { useState, useRef, useEffect } from "react"
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router"
import { useStore } from "@/store"
import { ThemePanel } from "./ThemePanel"
import { BgCanvas } from "./BgCanvas"
import { QuickControls } from "./QuickControls"
import { TerminalTitle } from "./TerminalTitle"
import { CornerMenu } from "./CornerMenu"
import { LinkPreview } from "@/components/ui/LinkPreview"
import { SearchOverlay } from "@/components/ui/SearchOverlay"
import { MDXProvider } from "@/components/mdx/MDXProvider"
import { WikiAuthModal } from "@/components/ui/WikiAuthModal"
import { useAuth } from "@/hooks/useAuth"
import styles from "./WikiShell.module.scss"

function WikiUserMenu() {
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
          {role === "pending" ? "awaiting approval" : role}
        </span>
      </button>

      {dropdownOpen && (
        <div className={styles.userDropdown}>
          <button
            className={styles.dropdownItem}
            onClick={() => { setDropdownOpen(false); navigate({ to: "/profile" }) }}
          >
            Profile
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

export function WikiShell() {
  const activeLayout = useStore((s) => s.activeLayout)
  const location = useLocation()

  const segments = location.pathname.replace(/^\//, "").split("/").filter(Boolean)
  const breadcrumb = segments.map((s) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))

  return (
    <MDXProvider>
      <div
        className={styles.shell}
        data-wiki
        data-layout={activeLayout}
        data-testid="wiki-shell"
      >
        <BgCanvas />
        <ThemePanel />
        <QuickControls />
        <LinkPreview />
        <SearchOverlay />

        <TerminalTitle context="wiki" />
        <WikiUserMenu />

        {breadcrumb.length > 0 && (
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            {breadcrumb.map((crumb, i) => (
              <span key={i} className={styles.breadcrumbSegment}>
                {i > 0 && <span className={styles.breadcrumbSep}>/</span>}
                {crumb}
              </span>
            ))}
          </nav>
        )}

        <main className={styles.mainPane} data-testid="main-pane">
          <div className={styles.mainContent}>
            <Outlet />
          </div>
        </main>

        <CornerMenu variant="wiki" />
      </div>
    </MDXProvider>
  )
}
