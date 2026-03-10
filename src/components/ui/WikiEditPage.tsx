import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/useAuth"
import { WikiMarkdownEditor } from "./WikiMarkdownEditor"
import { WikiAuthModal } from "./WikiAuthModal"
import { useStore } from "@/store"
import { resolveSlug } from "@/lib/content-loader"

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "1x00000000000000000000AA"

interface Props {
  slug: string
}

function computeChangeSummary(original: string, current: string): { added: number; removed: number } {
  const origLines = original.split("\n")
  const currLines = current.split("\n")
  const origSet = new Set(origLines)
  const currSet = new Set(currLines)
  let added = 0
  let removed = 0
  for (const line of currLines) {
    if (!origSet.has(line)) added++
  }
  for (const line of origLines) {
    if (!currSet.has(line)) removed++
  }
  return { added, removed }
}

export function WikiEditPage({ slug }: Props) {
  const { session, role, loading } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [content, setContent] = useState("")
  const [originalContent, setOriginalContent] = useState("")
  const [loadingContent, setLoadingContent] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ prUrl: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editSummary, setEditSummary] = useState("")

  const contentIndex = useStore((s) => s.contentIndex)

  useEffect(() => {
    async function fetchContent() {
      setLoadingContent(true)
      setLoadError(null)
      try {
        const resolvedKey = contentIndex ? (resolveSlug(slug, contentIndex) ?? slug) : slug
        const meta = contentIndex?.[resolvedKey]
        const contentPath = meta?.contentPath || `${resolvedKey}.md`

        const res = await fetch(`/content/${contentPath}`)
        if (!res.ok) throw new Error(`Failed to fetch page content`)
        const ct = res.headers.get("content-type") || ""
        if (ct.includes("text/html")) throw new Error("Page source not found")
        const text = await res.text()
        setContent(text)
        setOriginalContent(text)
      } catch (e: any) {
        setLoadError(e.message)
      } finally {
        setLoadingContent(false)
      }
    }
    fetchContent()
  }, [slug, contentIndex])

  useEffect(() => {
    if (!session || role === "pending") return
    const timer = setTimeout(() => {
      const el = document.getElementById("cf-turnstile-edit")
      if (!el || el.childElementCount > 0) return
      if (typeof window !== "undefined" && (window as any).turnstile && TURNSTILE_SITE_KEY) {
        ;(window as any).turnstile.render("#cf-turnstile-edit", {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => setTurnstileToken(token),
          "expired-callback": () => setTurnstileToken(""),
        })
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [session, role])

  const handleSubmit = async () => {
    if (!session || !turnstileToken || !editSummary.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          slug,
          content,
          turnstileToken,
          editSummary: editSummary.trim(),
        }),
      })
      const data = await res.json() as { prUrl?: string; error?: string }
      if (!res.ok || data.error) {
        setError(data.error ?? "Submission failed.")
      } else if (data.prUrl) {
        setResult({ prUrl: data.prUrl })
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const hasChanges = content !== originalContent
  const changeSummary = hasChanges ? computeChangeSummary(originalContent, content) : null

  if (!loading && !session) {
    return (
      <div className="wiki-form-page">
        <h1 className="wiki-form-heading">Sign in to edit</h1>
        <p className="wiki-form-hint">You need an approved account to edit wiki pages.</p>
        <button className="wiki-form-btn" onClick={() => setShowAuth(true)}>Sign In</button>
        {showAuth && <WikiAuthModal onClose={() => setShowAuth(false)} />}
      </div>
    )
  }

  if (!loading && role === "pending") {
    return (
      <div className="wiki-form-page">
        <h1 className="wiki-form-heading">Account Pending</h1>
        <p className="wiki-form-hint">
          Your account is awaiting admin approval. You will be able to edit once approved.
        </p>
      </div>
    )
  }

  if (result) {
    return (
      <div className="wiki-form-page">
        <div className="wiki-form-terminal-box">
          <p className="wiki-form-prompt">&gt; edit submitted.</p>
          <p className="wiki-form-prompt">&gt; pull request opened.</p>
          <p className="wiki-form-prompt wiki-form-success">&gt; status: pending review.</p>
          <p style={{ marginTop: "2rem" }}>
            Your edit has been submitted for review.{" "}
            <a href={result.prUrl} target="_blank" rel="noopener noreferrer" className="wiki-form-link">
              View pull request &rarr;
            </a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="wiki-form-page" style={{ maxWidth: '800px' }}>
      <h1 className="wiki-form-heading">
        Editing: {slug.split("/").pop()?.replace(/-/g, " ")}
      </h1>
      <p className="wiki-form-subheading">
        Changes will be submitted as a pull request for review.
      </p>

      {loadingContent && <p className="wiki-form-hint">Loading page content...</p>}
      {loadError && <div className="wiki-form-error">&gt; {loadError}</div>}

      {!loadingContent && !loadError && (
        <>
          <WikiMarkdownEditor
            value={content}
            onChange={setContent}
            placeholder="Edit the page content..."
            minHeight={500}
          />

          {hasChanges && changeSummary && (
            <div className="wiki-change-summary">
              <span className="wiki-change-added">+{changeSummary.added} line{changeSummary.added !== 1 ? "s" : ""} added</span>
              <span className="wiki-change-removed">-{changeSummary.removed} line{changeSummary.removed !== 1 ? "s" : ""} removed</span>
              <span className="wiki-change-note">Review your changes above before submitting.</span>
            </div>
          )}

          <div className="wiki-form-field" style={{ marginTop: "var(--space-4)" }}>
            <label className="wiki-form-label" htmlFor="edit-summary">
              Edit summary <span className="wiki-form-required">*</span>
            </label>
            <input
              id="edit-summary"
              className="wiki-form-input"
              type="text"
              value={editSummary}
              onChange={(e) => setEditSummary(e.target.value.slice(0, 200))}
              placeholder="Briefly describe your changes..."
              maxLength={200}
              required
            />
            <span className="wiki-form-field-hint">{editSummary.length}/200</span>
          </div>

          <div className="wiki-form-turnstile">
            <div id="cf-turnstile-edit" />
          </div>

          {error && <div className="wiki-form-error">&gt; {error}</div>}

          <div className="wiki-form-actions">
            <button
              className="wiki-form-btn"
              onClick={handleSubmit}
              disabled={submitting || !turnstileToken || !hasChanges || !editSummary.trim()}
            >
              {submitting ? "Submitting..." : "Submit Edit"}
            </button>
            {!hasChanges && (
              <span className="wiki-form-hint" style={{ margin: 0 }}>No changes to submit</span>
            )}
          </div>

          <p className="wiki-form-hint">
            Edits are reviewed before publishing. A pull request will be opened in the repo.
          </p>
        </>
      )}
    </div>
  )
}
