import { useState } from "react"
import { useAuth } from "@/hooks/useAuth"

interface Props {
  onClose: () => void
  defaultTab?: "login" | "signup"
}

export function WikiAuthModal({ onClose, defaultTab = "login" }: Props) {
  const { signInWithPassword, signUp } = useAuth()
  const [tab, setTab] = useState<"login" | "signup">(defaultTab)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [username, setUsername] = useState("")
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isSignup = tab === "signup"
  const usernameValid = /^[a-zA-Z0-9-]{3,30}$/.test(username)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    if (isSignup && !usernameValid) return
    setSubmitting(true)
    setError(null)

    if (isSignup) {
      const result = await signUp(email.trim(), username.trim())
      setSubmitting(false)
      if (result.error) setError(result.error)
      else setSent(true)
    } else {
      if (!password) { setSubmitting(false); return }
      const result = await signInWithPassword(email.trim(), password)
      setSubmitting(false)
      if (result.error) setError(result.error)
      else onClose()
    }
  }

  return (
    <div className="wiki-auth-overlay" onClick={onClose}>
      <div className="wiki-auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="wiki-auth-close" onClick={onClose} aria-label="Close">&times;</button>

        {sent ? (
          <div className="wiki-auth-sent">
            <p className="wiki-form-prompt">&gt; check your email.</p>
            <p className="wiki-form-hint">
              A confirmation link has been sent to <strong>{email}</strong>. Clicking it will bring you to your profile where you can set a password — then you can log in normally.
            </p>
            <p className="wiki-form-hint" style={{ marginTop: "var(--space-2)", opacity: 0.6 }}>
              New accounts require admin approval before editing.
            </p>
          </div>
        ) : (
          <>
            <div className="wiki-auth-tabs">
              <button
                type="button"
                className={`wiki-auth-tab ${tab === "login" ? "wiki-auth-tab-active" : ""}`}
                onClick={() => { setTab("login"); setError(null) }}
              >
                Log in
              </button>
              <button
                type="button"
                className={`wiki-auth-tab ${tab === "signup" ? "wiki-auth-tab-active" : ""}`}
                onClick={() => { setTab("signup"); setError(null) }}
              >
                Sign up
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ marginTop: "var(--space-4)" }}>
              {isSignup && (
                <div className="wiki-form-field">
                  <label className="wiki-form-label" htmlFor="auth-username">
                    Username <span className="wiki-form-required">*</span>
                  </label>
                  <input
                    id="auth-username"
                    className="wiki-form-input"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="my-username"
                    autoFocus
                    required
                    minLength={3}
                    maxLength={30}
                    pattern="[a-zA-Z0-9-]{3,30}"
                  />
                  {username && !usernameValid && (
                    <span className="wiki-form-field-hint">3–30 chars, letters, numbers, hyphens only</span>
                  )}
                </div>
              )}

              <div className="wiki-form-field">
                <label className="wiki-form-label" htmlFor="auth-email">
                  Email <span className="wiki-form-required">*</span>
                </label>
                <input
                  id="auth-email"
                  className="wiki-form-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus={!isSignup}
                  required
                />
              </div>

              {!isSignup && (
                <div className="wiki-form-field">
                  <label className="wiki-form-label" htmlFor="auth-password">
                    Password <span className="wiki-form-required">*</span>
                  </label>
                  <input
                    id="auth-password"
                    className="wiki-form-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
              )}

              {isSignup && (
                <p className="wiki-form-hint" style={{ marginBottom: "var(--space-3)" }}>
                  New accounts require admin approval before editing.
                </p>
              )}

              {error && <div className="wiki-form-error">&gt; {error}</div>}

              <div className="wiki-form-actions" style={{ marginTop: "var(--space-4)" }}>
                <button
                  className="wiki-form-btn"
                  type="submit"
                  disabled={submitting || !email.trim() || (!isSignup && !password) || (isSignup && !usernameValid)}
                >
                  {submitting ? "Please wait…" : isSignup ? "Create Account" : "Log in"}
                </button>
                <button className="wiki-form-btn wiki-form-btn-secondary" type="button" onClick={onClose}>
                  Cancel
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
