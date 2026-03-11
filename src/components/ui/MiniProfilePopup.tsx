import { useEffect, useRef, useState } from "react"
import styles from "./Chat.module.scss"

interface Props {
  username: string
  anchorEl: HTMLElement
  onClose: () => void
}

interface MiniProfile {
  username: string
  avatar_url: string | null
  role: string
  bio: string | null
  created_at: string | null
}

function initials(username: string): string {
  return username.slice(0, 2).toUpperCase()
}

function formatJoined(created_at: string | null): string | null {
  if (!created_at) return null
  const d = new Date(created_at)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

export function MiniProfilePopup({ username, anchorEl, onClose }: Props) {
  const [profile, setProfile] = useState<MiniProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)

  // Position relative to anchor
  const rect = anchorEl.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top
  const placeAbove = spaceBelow < 220 && spaceAbove > spaceBelow
  const top = placeAbove
    ? rect.top - 8 // will translate up via transform
    : rect.bottom + 8
  const left = Math.min(rect.left, window.innerWidth - 268)

  useEffect(() => {
    fetch(`/api/chat/users/${encodeURIComponent(username)}/mini`)
      .then((r) => {
        if (!r.ok) throw new Error("not found")
        return r.json() as Promise<MiniProfile>
      })
      .then((data) => {
        setProfile(data)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [username])

  useEffect(() => {
    function handleMousedown(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleMousedown)
    return () => document.removeEventListener("mousedown", handleMousedown)
  }, [onClose])

  const transformStyle = placeAbove ? "translateY(-100%)" : undefined

  return (
    <div
      ref={popupRef}
      className={styles.miniProfilePopup}
      style={{ top, left, transform: transformStyle }}
    >
      {loading && (
        <div className={styles.miniProfileLoading}>…</div>
      )}
      {!loading && error && (
        <div className={styles.miniProfileError}>profile not found</div>
      )}
      {!loading && !error && profile && (
        <>
          <div className={styles.miniProfileTop}>
            <div className={styles.miniProfileAvatar}>
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.username}
                  className={styles.avatarImg}
                />
              ) : (
                initials(profile.username)
              )}
            </div>
            <div className={styles.miniProfileMeta}>
              <div className={styles.miniProfileUsername}>{profile.username}</div>
              <div
                className={[
                  styles.miniProfileRole,
                  profile.role === "admin"
                    ? styles.roleAdmin
                    : profile.role === "editor"
                    ? styles.roleEditor
                    : styles.rolePending,
                ].join(" ")}
              >
                {profile.role}
              </div>
            </div>
          </div>
          {profile.bio && (
            <div className={styles.miniProfileBio}>
              {profile.bio.length > 100
                ? profile.bio.slice(0, 100) + "…"
                : profile.bio}
            </div>
          )}
          <div className={styles.miniProfileFooter}>
            <span className={styles.miniProfileStonk}>◆ —</span>
            {profile.created_at && (
              <span className={styles.miniProfileJoined}>
                joined {formatJoined(profile.created_at)}
              </span>
            )}
          </div>
          <a
            href={`https://wiki.subsurfaces.net/user/${encodeURIComponent(profile.username)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.miniProfileLink}
          >
            → view profile
          </a>
        </>
      )}
    </div>
  )
}
