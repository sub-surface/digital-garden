import { useState } from "react"
import { useAuth } from "@/hooks/useAuth"

interface Props {
  onClose: () => void
}

export function WikiAuthModal({ onClose }: Props) {
  const { signIn } = useAuth()
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setSubmitting(true)
    setError(null)
    const { error } = await signIn(email.trim())
    setSubmitting(false)
    if (error) setError(error)
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
              Check your email for a login link. After first login, your account will need admin approval before you can edit.
            </p>
          </div>
        ) : (
          <>
            <h2 className="wiki-form-heading" style={{ marginBottom: 'var(--space-2)' }}>Sign in to edit</h2>
            <p className="wiki-form-hint" style={{ marginTop: 0, marginBottom: 'var(--space-4)' }}>
              Enter your email to receive a magic link. New accounts require admin approval.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="wiki-form-field">
                <input
                  className="wiki-form-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus
                  required
                />
              </div>

              {error && <div className="wiki-form-error">&gt; {error}</div>}

              <div className="wiki-form-actions" style={{ marginTop: 'var(--space-4)' }}>
                <button
                  className="wiki-form-btn"
                  type="submit"
                  disabled={submitting || !email.trim()}
                >
                  {submitting ? "Sending..." : "Send Magic Link"}
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
