import { useState } from "react"
import { useAuth } from "@/hooks/useAuth"

interface Props {
  onClose: () => void
  defaultTab?: "login" | "signup"
}

export function WikiAuthModal({ onClose, defaultTab = "login" }: Props) {
  const { signInWithPassword, signUp, resetPassword } = useAuth()
  const [tab, setTab] = useState<"login" | "signup">(defaultTab)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [username, setUsername] = useState("")
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Forgot password state
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState("")
  const [forgotSubmitting, setForgotSubmitting] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)

  const isSignup = tab === "signup"
  const usernameValid = /^[a-zA-Z0-9-]{3,30}$/.test(username)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    if (isSignup && !usernameValid) return
    setSubmitting(true)
    setError(null)

    if (isSignup) {
      if (!password || password.length < 6) {
        setError("Password must be at least 6 characters")
        setSubmitting(false)
        return
      }
      const result = await signUp(email.trim(), username.trim(), password)
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

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!forgotEmail.trim()) return
    setForgotSubmitting(true)
    setForgotError(null)
    const result = await resetPassword(forgotEmail.trim())
    setForgotSubmitting(false)
    if (result.error) setForgotError(result.error)
    else setForgotSent(true)
  }

  const openForgot = () => {
    // Pre-fill forgot email from whatever the user typed in the login form
    setForgotEmail(email)
    setForgotSent(false)
    setForgotError(null)
    setShowForgot(true)
  }

  return (
    <div className="wiki-auth-overlay" onClick={onClose}>
      <div className="wiki-auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="wiki-auth-close" onClick={onClose} aria-label="Close">&times;</button>

        {sent ? (
          <div className="wiki-auth-sent">
            <p className="wiki-form-prompt">&gt; check your email.</p>
            <p className="wiki-form-hint">
              A confirmation link has been sent to <strong>{email}</strong>. Click it to verify your account, then log in with your password.
            </p>
            <p className="wiki-form-hint" style={{ marginTop: "var(--space-2)", opacity: 0.6 }}>
              New accounts require admin approval before editing.
            </p>
          </div>
        ) : showForgot ? (
          /* ── Forgot password panel ── */
          <div>
            <p className="wiki-form-prompt" style={{ marginBottom: "var(--space-3)" }}>&gt; reset your password.</p>
            {forgotSent ? (
              <>
                <p className="wiki-form-hint">
                  Check your email for a reset link. Click it to set a new password on your profile page.
                </p>
                <button
                  className="wiki-form-btn wiki-form-btn-secondary"
                  style={{ marginTop: "var(--space-4)" }}
                  onClick={() => setShowForgot(false)}
                >
                  Back to login
                </button>
              </>
            ) : (
              <form onSubmit={handleForgot}>
                <div className="wiki-form-field">
                  <label className="wiki-form-label" htmlFor="forgot-email">
                    Email <span className="wiki-form-required">*</span>
                  </label>
                  <input
                    id="forgot-email"
                    className="wiki-form-input"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoFocus
                    required
                  />
                </div>

                {forgotError && <div className="wiki-form-error">&gt; {forgotError}</div>}

                <div className="wiki-form-actions" style={{ marginTop: "var(--space-4)" }}>
                  <button
                    className="wiki-form-btn"
                    type="submit"
                    disabled={forgotSubmitting || !forgotEmail.trim()}
                  >
                    {forgotSubmitting ? "Sending…" : "Send reset link"}
                  </button>
                  <button
                    className="wiki-form-btn wiki-form-btn-secondary"
                    type="button"
                    onClick={() => setShowForgot(false)}
                  >
                    Back
                  </button>
                </div>
              </form>
            )}
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
                  placeholder={isSignup ? "min 6 characters" : "••••••••"}
                  required
                  minLength={isSignup ? 6 : undefined}
                />
              </div>

              {!isSignup && (
                <button
                  type="button"
                  className="wiki-form-link"
                  style={{ display: "block", textAlign: "right", marginBottom: "var(--space-3)", fontSize: "0.7rem", opacity: 0.6 }}
                  onClick={openForgot}
                >
                  Forgot password?
                </button>
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
                  disabled={submitting || !email.trim() || !password || (isSignup && !usernameValid)}
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
