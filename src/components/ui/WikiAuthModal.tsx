import { useState } from "react"
import { useAuth } from "@/hooks/useAuth"

interface Props {
  onClose: () => void
  defaultTab?: "login" | "signup"
}

export function WikiAuthModal({ onClose, defaultTab = "login" }: Props) {
  const { signIn, signUp } = useAuth()
  const [tab, setTab] = useState<"login" | "signup">(defaultTab)
  const [email, setEmail] = useState("")
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

    const result = isSignup
      ? await signUp(email.trim(), username.trim())
      : await signIn(email.trim())

    setSubmitting(false)
    if (result.error) setError(result.error)
    else setSent(true)
  }

  return (
    <div className="wiki-auth-overlay" onClick={onClose}>
      <div className="wiki-auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="wiki-auth-close" onClick={onClose} aria-label="Close">&times;</button>

        {sent ? (
          <div className="wiki-auth-sent">
            <p className="wiki-form-prompt">&gt; magic link sent.</p>
            <p className="wiki-form-hint">
              Check your email for a login link.
              {isSignup && " After confirming, your account will need admin approval before you can edit."}
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

            <p className="wiki-form-hint" style={{ marginTop: "var(--space-2)", marginBottom: "var(--space-4)" }}>
              {isSignup
                ? "Create an account. New accounts require admin approval before editing."
                : "Enter your email to receive a magic link."}
            </p>

            <form onSubmit={handleSubmit}>
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
                    <span className="wiki-form-field-hint">3-30 chars, letters, numbers, hyphens only</span>
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

              {error && <div className="wiki-form-error">&gt; {error}</div>}

              <div className="wiki-form-actions" style={{ marginTop: "var(--space-4)" }}>
                <button
                  className="wiki-form-btn"
                  type="submit"
                  disabled={submitting || !email.trim() || (isSignup && !usernameValid)}
                >
                  {submitting ? "Sending..." : isSignup ? "Create Account" : "Send Magic Link"}
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
