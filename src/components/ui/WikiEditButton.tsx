import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/useAuth"
import { WikiAuthModal } from "./WikiAuthModal"
import { useNavigate } from "@tanstack/react-router"

interface Props {
  slug: string
}

export function WikiEditButton({ slug }: Props) {
  const { session, role, loading } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [locked, setLocked] = useState<{ locked: boolean; reason?: string }>({ locked: false })
  const navigate = useNavigate()

  useEffect(() => {
    fetch(`/api/lock-status?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.ok ? r.json() as Promise<{ locked: boolean; reason?: string }> : { locked: false })
      .then(setLocked)
      .catch(() => {})
  }, [slug])

  if (loading) return null

  if (locked.locked) {
    return (
      <span className="wiki-edit-btn wiki-edit-btn-locked" title={locked.reason || "This page is locked"}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: '4px' }}>
          <path d="M4 7V5a4 4 0 118 0v2h1a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V8a1 1 0 011-1h1zm2-2a2 2 0 114 0v2H6V5z"/>
        </svg>
        Locked
      </span>
    )
  }

  const handleClick = () => {
    if (!session) {
      setShowAuth(true)
      return
    }
    if (role === "pending") {
      return
    }
    navigate({ to: `/edit/${slug}` })
  }

  return (
    <>
      <button
        className="wiki-edit-btn"
        onClick={handleClick}
        title={role === "pending" ? "Your account is awaiting admin approval" : "Edit this page"}
        disabled={role === "pending"}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: '4px' }}>
          <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L3.462 11.098a.25.25 0 00-.064.108l-.631 2.2 2.2-.63a.25.25 0 00.108-.064l8.61-8.61a.25.25 0 000-.354l-1.086-1.086z"/>
        </svg>
        {role === "pending" ? "Awaiting Approval" : "Edit"}
      </button>
      {showAuth && <WikiAuthModal onClose={() => setShowAuth(false)} />}
    </>
  )
}
