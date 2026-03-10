import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/useAuth"

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
  /** If provided, show a public profile for this username. Otherwise show own profile. */
  username?: string
}

export function WikiProfilePage({ username: viewUsername }: Props) {
  const auth = useAuth()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingBio, setEditingBio] = useState(false)
  const [bioValue, setBioValue] = useState("")
  const [saving, setSaving] = useState(false)

  const isOwnProfile = !viewUsername

  useEffect(() => {
    async function fetchProfile() {
      setLoading(true)
      setError(null)
      try {
        if (isOwnProfile) {
          // Show own profile using auth state + fetch edits
          if (!auth.session) {
            setLoading(false)
            return
          }
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
            // Fallback to auth state
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
          if (!res.ok) {
            setError("User not found")
            setLoading(false)
            return
          }
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
    setSaving(true)
    const { error } = await auth.updateProfile({ bio: bioValue })
    setSaving(false)
    if (!error) {
      setEditingBio(false)
      if (profile) setProfile({ ...profile, bio: bioValue })
    }
  }

  if (loading || auth.loading) {
    return (
      <div className="wiki-form-page">
        <p className="wiki-form-hint">Loading profile...</p>
      </div>
    )
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
      <div className="wiki-profile-header">
        <div>
          <h1 className="wiki-form-heading" style={{ marginBottom: "var(--space-1)" }}>
            {profile.username}
          </h1>
          <div className="wiki-profile-meta">
            <span className={`wiki-admin-role ${roleBadgeClass}`}>
              {profile.role === "pending" ? "awaiting approval" : profile.role}
            </span>
            {joinDate && <span className="wiki-profile-joined">Joined {joinDate}</span>}
            <span className="wiki-profile-edits">{profile.editCount} contribution{profile.editCount !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>

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
              <button className="wiki-form-btn" onClick={handleSaveBio} disabled={saving}>
                {saving ? "Saving..." : "Save"}
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
