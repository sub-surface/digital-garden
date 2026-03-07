import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/hooks/useAuth"
import { WikiAuthModal } from "./WikiAuthModal"
import { useNavigate } from "@tanstack/react-router"

interface Profile {
  id: string
  email: string
  username: string | null
  role: string
  created_at: string
}

interface EditLogEntry {
  id: string
  slug: string
  pr_url: string
  created_at: string
  email?: string
}

interface PageLock {
  slug: string
  reason: string | null
  locked_at: string
  locked_by_email?: string
}

type Tab = "users" | "log" | "locks"

export function WikiAdminPage() {
  const { session, role, loading } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>("users")

  // Auth gate
  if (!loading && !session) {
    return (
      <div className="wiki-form-page">
        <h1 className="wiki-form-heading">Admin Panel</h1>
        <p className="wiki-form-hint">Sign in with an admin account.</p>
        <button className="wiki-form-btn" onClick={() => setShowAuth(true)}>Sign In</button>
        {showAuth && <WikiAuthModal onClose={() => setShowAuth(false)} />}
      </div>
    )
  }

  if (!loading && role !== "admin") {
    return (
      <div className="wiki-form-page">
        <h1 className="wiki-form-heading">Access Denied</h1>
        <p className="wiki-form-hint">This page requires admin access.</p>
        <button className="wiki-form-btn wiki-form-btn-secondary" onClick={() => navigate({ to: "/" })}>
          Back to Wiki
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="wiki-form-page">
        <p className="wiki-form-hint">Loading...</p>
      </div>
    )
  }

  const authHeader = { Authorization: `Bearer ${session!.access_token}` }

  return (
    <div className="wiki-form-page" style={{ maxWidth: '900px' }}>
      <h1 className="wiki-form-heading">Wiki Admin</h1>

      <div className="wiki-admin-tabs">
        {(["users", "log", "locks"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`wiki-admin-tab ${tab === t ? "wiki-admin-tab-active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "users" ? "Users" : t === "log" ? "Edit Log" : "Page Locks"}
          </button>
        ))}
      </div>

      {tab === "users" && <UsersTab authHeader={authHeader} />}
      {tab === "log" && <EditLogTab authHeader={authHeader} />}
      {tab === "locks" && <LocksTab authHeader={authHeader} />}
    </div>
  )
}

// ── Users Tab ──

function UsersTab({ authHeader }: { authHeader: Record<string, string> }) {
  const [users, setUsers] = useState<Profile[]>([])
  const [filter, setFilter] = useState<string>("all")
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users", { headers: authHeader })
      if (res.ok) {
        const data = await res.json() as Profile[]
        setUsers(data)
      }
    } catch {}
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const updateRole = async (userId: string, newRole: string) => {
    setLoadingAction(userId)
    try {
      const endpoint = newRole === "none"
        ? "/api/admin/revoke"
        : "/api/admin/approve"
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      })
      if (res.ok) await fetchUsers()
    } catch {}
    setLoadingAction(null)
  }

  const filtered = filter === "all" ? users : users.filter((u) => u.role === filter)

  return (
    <div>
      <div className="wiki-admin-filter">
        {["all", "pending", "editor", "admin"].map((f) => (
          <button
            key={f}
            className={`wiki-form-btn ${filter === f ? "" : "wiki-form-btn-secondary"}`}
            style={{ padding: '4px 12px', fontSize: '0.72rem' }}
            onClick={() => setFilter(f)}
          >
            {f} ({f === "all" ? users.length : users.filter((u) => u.role === f).length})
          </button>
        ))}
      </div>

      <div className="wiki-admin-table-wrap">
        <table className="wiki-admin-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Username</th>
              <th>Role</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>{user.username || "—"}</td>
                <td>
                  <span className={`wiki-admin-role wiki-admin-role-${user.role}`}>
                    {user.role}
                  </span>
                </td>
                <td>{new Date(user.created_at).toLocaleDateString()}</td>
                <td>
                  {loadingAction === user.id ? (
                    <span className="wiki-form-hint" style={{ margin: 0 }}>...</span>
                  ) : (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {user.role === "pending" && (
                        <button
                          className="wiki-form-btn"
                          style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                          onClick={() => updateRole(user.id, "editor")}
                        >
                          Approve
                        </button>
                      )}
                      {user.role === "editor" && (
                        <>
                          <button
                            className="wiki-form-btn"
                            style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                            onClick={() => updateRole(user.id, "admin")}
                          >
                            Promote
                          </button>
                          <button
                            className="wiki-form-btn wiki-form-btn-secondary"
                            style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                            onClick={() => updateRole(user.id, "none")}
                          >
                            Revoke
                          </button>
                        </>
                      )}
                      {user.role === "admin" && (
                        <button
                          className="wiki-form-btn wiki-form-btn-secondary"
                          style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                          onClick={() => updateRole(user.id, "editor")}
                        >
                          Demote
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', opacity: 0.5 }}>No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Edit Log Tab ──

function EditLogTab({ authHeader }: { authHeader: Record<string, string> }) {
  const [entries, setEntries] = useState<EditLogEntry[]>([])

  useEffect(() => {
    fetch("/api/admin/log", { headers: authHeader })
      .then((r) => r.ok ? r.json() as Promise<EditLogEntry[]> : [])
      .then(setEntries)
      .catch(() => {})
  }, [])

  return (
    <div className="wiki-admin-table-wrap">
      <table className="wiki-admin-table">
        <thead>
          <tr>
            <th>Slug</th>
            <th>User</th>
            <th>PR</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td><code>{entry.slug}</code></td>
              <td>{entry.email || "—"}</td>
              <td>
                {entry.pr_url ? (
                  <a href={entry.pr_url} target="_blank" rel="noopener noreferrer" className="wiki-form-link">
                    View PR
                  </a>
                ) : "—"}
              </td>
              <td>{new Date(entry.created_at).toLocaleString()}</td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr><td colSpan={4} style={{ textAlign: 'center', opacity: 0.5 }}>No edits yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Page Locks Tab ──

function LocksTab({ authHeader }: { authHeader: Record<string, string> }) {
  const [locks, setLocks] = useState<PageLock[]>([])
  const [newSlug, setNewSlug] = useState("")
  const [newReason, setNewReason] = useState("")

  const fetchLocks = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/locks", { headers: authHeader })
      if (res.ok) setLocks(await res.json() as PageLock[])
    } catch {}
  }, [])

  useEffect(() => { fetchLocks() }, [fetchLocks])

  const addLock = async () => {
    if (!newSlug.trim()) return
    await fetch("/api/admin/lock", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ slug: newSlug.trim(), reason: newReason.trim() || null }),
    })
    setNewSlug("")
    setNewReason("")
    fetchLocks()
  }

  const removeLock = async (slug: string) => {
    await fetch("/api/admin/lock", {
      method: "DELETE",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    })
    fetchLocks()
  }

  return (
    <div>
      <div className="wiki-admin-lock-form">
        <div className="wiki-form-field" style={{ flex: 1 }}>
          <input
            className="wiki-form-input"
            type="text"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            placeholder="wiki/philosophers/spinoza"
          />
        </div>
        <div className="wiki-form-field" style={{ flex: 1 }}>
          <input
            className="wiki-form-input"
            type="text"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            placeholder="Reason (optional)"
          />
        </div>
        <button className="wiki-form-btn" onClick={addLock} disabled={!newSlug.trim()}>
          Lock Page
        </button>
      </div>

      <div className="wiki-admin-table-wrap">
        <table className="wiki-admin-table">
          <thead>
            <tr>
              <th>Slug</th>
              <th>Reason</th>
              <th>Locked</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {locks.map((lock) => (
              <tr key={lock.slug}>
                <td><code>{lock.slug}</code></td>
                <td>{lock.reason || "—"}</td>
                <td>{new Date(lock.locked_at).toLocaleString()}</td>
                <td>
                  <button
                    className="wiki-form-btn wiki-form-btn-secondary"
                    style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                    onClick={() => removeLock(lock.slug)}
                  >
                    Unlock
                  </button>
                </td>
              </tr>
            ))}
            {locks.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', opacity: 0.5 }}>No locked pages</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
