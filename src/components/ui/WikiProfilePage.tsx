import { useState, useEffect, useRef } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useBookmarks } from "@/hooks/useBookmarks"

interface ProfileData {
  username: string
  role: string
  bio: string | null
  avatar_url: string | null
  created_at: string | null
  edits: { slug: string; pr_url: string; edit_summary: string | null; created_at: string }[]
  editCount: number
}

interface Props {
  username?: string
}

export function WikiProfilePage({ username: viewUsername }: Props) {
  const auth = useAuth()
  const { bookmarks, removeBookmark } = useBookmarks()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Bio editing
  const [editingBio, setEditingBio] = useState(false)
  const [bioValue, setBioValue] = useState("")
  const [savingBio, setSavingBio] = useState(false)

  // Username editing
  const [editingUsername, setEditingUsername] = useState(false)
  const [usernameValue, setUsernameValue] = useState("")
  const [savingUsername, setSavingUsername] = useState(false)
  const [usernameError, setUsernameError] = useState<string | null>(null)

  // Avatar upload
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Password change
  const [editingPassword, setEditingPassword] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  const isOwnProfile = !viewUsername
  const usernameValid = /^[a-zA-Z0-9-]{3,30}$/.test(usernameValue)

  // Detect fresh magic-link session — AMR contains "otp" but not "password"
  const amr = (auth.session?.user as any)?.amr as { method: string }[] | undefined
  const isOtpOnly = Array.isArray(amr)
    ? amr.some(a => a.method === "otp") && !amr.some(a => a.method === "password")
    : false

  useEffect(() => {
    async function fetchProfile() {
      setLoading(true)
      setError(null)
      try {
        if (isOwnProfile) {
          if (!auth.session) { setLoading(false); return }
          const username = auth.username
          if (!username) {
            setProfile({
              username: auth.session.user?.email?.split("@")[0] || "user",
              role: auth.role || "pending",
              bio: auth.bio,
              avatar_url: auth.avatar_url,
              created_at: auth.created_at,
              edits: [],
              editCount: 0,
            })
            setLoading(false)
            return
          }
          const res = await fetch(`/api/user/${encodeURIComponent(username)}`)
          if (res.ok) {
            setProfile(await res.json() as ProfileData)
          } else {
            setProfile({
              username,
              role: auth.role || "pending",
              bio: auth.bio,
              avatar_url: auth.avatar_url,
              created_at: auth.created_at,
              edits: [],
              editCount: 0,
            })
          }
        } else {
          const res = await fetch(`/api/user/${encodeURIComponent(viewUsername)}`)
          if (!res.ok) { setError("User not found"); setLoading(false); return }
          setProfile(await res.json() as ProfileData)
        }
      } catch {
        setError("Failed to load profile")
      } finally {
        setLoading(false)
      }
    }
    if (!auth.loading) fetchProfile()
  }, [auth.loading, auth.session, auth.username, viewUsername])

  const handleSaveBio = async () => {
    setSavingBio(true)
    const { error } = await auth.updateProfile({ bio: bioValue })
    setSavingBio(false)
    if (!error) {
      setEditingBio(false)
      if (profile) setProfile({ ...profile, bio: bioValue })
    }
  }

  const handleChangePassword = async () => {
    if (newPassword.length < 8) { setPasswordError("Password must be at least 8 characters"); return }
    if (newPassword !== confirmPassword) { setPasswordError("Passwords do not match"); return }
    setSavingPassword(true)
    setPasswordError(null)
    const { error } = await auth.changePassword(newPassword)
    setSavingPassword(false)
    if (error) {
      setPasswordError(error)
    } else {
      setPasswordSuccess(true)
      setEditingPassword(false)
      setNewPassword("")
      setConfirmPassword("")
    }
  }

  const handleSaveUsername = async () => {
    if (!usernameValid) return
    setSavingUsername(true)
    setUsernameError(null)
    const { error } = await auth.updateProfile({ username: usernameValue })
    setSavingUsername(false)
    if (error) {
      setUsernameError(error)
    } else {
      setEditingUsername(false)
      if (profile) setProfile({ ...profile, username: usernameValue })
    }
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !auth.session) return
    setAvatarError(null)
    setUploadingAvatar(true)
    try {
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          Authorization: `Bearer ${auth.session.access_token}`,
        },
        body: file,
      })
      const data = await res.json() as { ok?: boolean; avatar_url?: string; error?: string }
      if (!res.ok || !data.ok) {
        setAvatarError(data.error ?? "Upload failed")
      } else {
        await auth.updateProfile({ avatar_url: data.avatar_url! })
        if (profile) setProfile({ ...profile, avatar_url: data.avatar_url! })
      }
    } catch {
      setAvatarError("Upload failed")
    } finally {
      setUploadingAvatar(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ""
    }
  }

  if (loading || auth.loading) {
    return <div className="wiki-form-page"><p className="wiki-form-hint">Loading profile...</p></div>
  }

  if (!isOwnProfile && error) {
    return (
      <div className="wiki-form-page">
        <h1 className="wiki-form-heading">User not found</h1>
        <p className="wiki-form-hint">No user with that username exists.</p>
      </div>
    )
  }

  if (isOwnProfile && !auth.session) {
    return (
      <div className="wiki-form-page">
        <h1 className="wiki-form-heading">Not signed in</h1>
        <p className="wiki-form-hint">Sign in to view your profile.</p>
      </div>
    )
  }

  if (!profile) return null

  const roleBadgeClass =
    profile.role === "admin" ? "wiki-admin-role-admin"
    : profile.role === "editor" ? "wiki-admin-role-editor"
    : profile.role === "pending" ? "wiki-admin-role-pending"
    : "wiki-admin-role-none"

  const joinDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : null

  return (
    <div className="wiki-form-page" style={{ maxWidth: "800px" }}>

      {/* Password prompt for fresh magic-link accounts */}
      {isOwnProfile && isOtpOnly && !editingPassword && !passwordSuccess && (
        <div className="wiki-form-notice" style={{ marginBottom: "var(--space-6)" }}>
          <p className="wiki-form-prompt">&gt; set a password to log in without email next time.</p>
          <button
            className="wiki-form-btn"
            style={{ marginTop: "var(--space-3)" }}
            onClick={() => setEditingPassword(true)}
          >
            Set password
          </button>
        </div>
      )}

      {/* Avatar */}
      <div className="wiki-profile-avatar-row">
        <div className="wiki-profile-avatar-wrap">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.username} className="wiki-profile-avatar-img" />
          ) : (
            <div className="wiki-profile-avatar-placeholder">
              {profile.username.slice(0, 2).toUpperCase()}
            </div>
          )}
          {isOwnProfile && (
            <button
              className="wiki-profile-avatar-btn"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              title="Upload profile picture"
            >
              {uploadingAvatar ? "…" : "↑"}
            </button>
          )}
        </div>
        {isOwnProfile && (
          <>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: "none" }}
              onChange={handleAvatarChange}
            />
            {avatarError && <span className="wiki-form-field-hint" style={{ color: "var(--color-accent)" }}>{avatarError}</span>}
          </>
        )}
      </div>

      {/* Header */}
      <div className="wiki-profile-header">
        {editingUsername && isOwnProfile ? (
          <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <input
                className="wiki-form-input"
                type="text"
                value={usernameValue}
                onChange={(e) => { setUsernameValue(e.target.value); setUsernameError(null) }}
                placeholder="new-username"
                autoFocus
                maxLength={30}
                style={{ fontSize: "1.4rem", padding: "var(--space-2) var(--space-3)" }}
              />
              {usernameValue && !usernameValid && (
                <span className="wiki-form-field-hint">3-30 chars, letters, numbers, hyphens only</span>
              )}
              {usernameError && <div className="wiki-form-error" style={{ marginTop: "var(--space-2)" }}>&gt; {usernameError}</div>}
            </div>
            <div className="wiki-form-actions" style={{ marginTop: "var(--space-1)" }}>
              <button className="wiki-form-btn" onClick={handleSaveUsername} disabled={savingUsername || !usernameValid}>
                {savingUsername ? "Saving..." : "Save"}
              </button>
              <button className="wiki-form-btn wiki-form-btn-secondary" onClick={() => { setEditingUsername(false); setUsernameError(null) }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)" }}>
            <h1 className="wiki-form-heading" style={{ marginBottom: "var(--space-1)", flex: 1 }}>
              {profile.username}
            </h1>
            {isOwnProfile && (
              <button
                className="wiki-edit-btn"
                onClick={() => { setUsernameValue(profile.username); setEditingUsername(true) }}
                style={{ marginTop: "6px", flexShrink: 0 }}
                title="Change username"
              >
                <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: "3px" }}>
                  <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L3.462 11.098a.25.25 0 00-.064.108l-.631 2.2 2.2-.63a.25.25 0 00.108-.064l8.61-8.61a.25.25 0 000-.354l-1.086-1.086z"/>
                </svg>
                Change username
              </button>
            )}
          </div>
        )}
        <div className="wiki-profile-meta">
          <span className={`wiki-admin-role ${roleBadgeClass}`}>
            {profile.role === "pending" ? "awaiting approval" : profile.role}
          </span>
          {joinDate && <span className="wiki-profile-joined">Joined {joinDate}</span>}
          <span className="wiki-profile-edits">{profile.editCount} contribution{profile.editCount !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Bio */}
      <div className="wiki-profile-section">
        <h3 className="wiki-profile-section-title">Bio</h3>
        {editingBio && isOwnProfile ? (
          <div>
            <textarea
              className="wiki-form-textarea"
              value={bioValue}
              onChange={(e) => setBioValue(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Tell us about yourself..."
              style={{ minHeight: "80px" }}
            />
            <div className="wiki-form-actions" style={{ marginTop: "var(--space-2)" }}>
              <button className="wiki-form-btn" onClick={handleSaveBio} disabled={savingBio}>
                {savingBio ? "Saving..." : "Save"}
              </button>
              <button className="wiki-form-btn wiki-form-btn-secondary" onClick={() => setEditingBio(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="wiki-profile-bio">{profile.bio || (isOwnProfile ? "No bio set." : "No bio.")}</p>
            {isOwnProfile && (
              <button
                className="wiki-edit-btn"
                onClick={() => { setBioValue(profile.bio || ""); setEditingBio(true) }}
                style={{ marginTop: "var(--space-2)" }}
              >
                Edit bio
              </button>
            )}
          </div>
        )}
      </div>

      {/* Password — own profile only */}
      {isOwnProfile && (
        <div className="wiki-profile-section">
          <h3 className="wiki-profile-section-title">Password</h3>
          {editingPassword ? (
            <div>
              <div className="wiki-form-field">
                <label className="wiki-form-label" htmlFor="new-password">New password</label>
                <input
                  id="new-password"
                  className="wiki-form-input"
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPasswordError(null) }}
                  placeholder="minimum 8 characters"
                  autoFocus
                  minLength={8}
                />
              </div>
              <div className="wiki-form-field">
                <label className="wiki-form-label" htmlFor="confirm-password">Confirm password</label>
                <input
                  id="confirm-password"
                  className="wiki-form-input"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(null) }}
                  placeholder="repeat new password"
                />
              </div>
              {passwordError && <div className="wiki-form-error">&gt; {passwordError}</div>}
              <div className="wiki-form-actions" style={{ marginTop: "var(--space-2)" }}>
                <button
                  className="wiki-form-btn"
                  onClick={handleChangePassword}
                  disabled={savingPassword || !newPassword || !confirmPassword}
                >
                  {savingPassword ? "Saving..." : "Set password"}
                </button>
                <button
                  className="wiki-form-btn wiki-form-btn-secondary"
                  onClick={() => { setEditingPassword(false); setNewPassword(""); setConfirmPassword(""); setPasswordError(null) }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              {passwordSuccess && (
                <p className="wiki-form-hint" style={{ color: "var(--color-accent)", marginBottom: "var(--space-2)" }}>
                  Password updated successfully.
                </p>
              )}
              <p className="wiki-profile-bio" style={{ opacity: 0.6 }}>••••••••</p>
              <button
                className="wiki-edit-btn"
                onClick={() => { setEditingPassword(true); setPasswordSuccess(false) }}
                style={{ marginTop: "var(--space-2)" }}
              >
                Change password
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bookmarks — own profile only */}
      {isOwnProfile && (
        <div className="wiki-profile-section">
          <h3 className="wiki-profile-section-title">Bookmarks ({bookmarks.length})</h3>
          {bookmarks.length === 0 ? (
            <p className="wiki-profile-bio" style={{ opacity: 0.5 }}>
              No bookmarks yet. Use the Bookmark button on any article to save it here.
            </p>
          ) : (
            <div className="wiki-bookmark-list">
              {bookmarks.map((b) => (
                <div key={b.slug} className="wiki-bookmark-item">
                  <a href={`/${b.slug}`} className="wiki-bookmark-title wiki-form-link">
                    {b.title}
                  </a>
                  <span className="wiki-bookmark-slug">{b.slug}</span>
                  <button
                    className="wiki-bookmark-remove"
                    onClick={() => removeBookmark(b.slug)}
                    title="Remove bookmark"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit history */}
      {profile.edits.length > 0 && (
        <div className="wiki-profile-section">
          <h3 className="wiki-profile-section-title">Edit History</h3>
          <div className="wiki-admin-table-wrap">
            <table className="wiki-admin-table">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Summary</th>
                  <th>Date</th>
                  <th>PR</th>
                </tr>
              </thead>
              <tbody>
                {profile.edits.map((edit, i) => (
                  <tr key={i}>
                    <td><code>{edit.slug}</code></td>
                    <td>{edit.edit_summary || "-"}</td>
                    <td>{new Date(edit.created_at).toLocaleDateString()}</td>
                    <td>
                      {edit.pr_url && (
                        <a href={edit.pr_url} target="_blank" rel="noopener noreferrer" className="wiki-form-link">
                          View
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
