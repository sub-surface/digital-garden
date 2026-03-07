import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/useAuth"
import { WikiMarkdownEditor } from "./WikiMarkdownEditor"
import { WikiAuthModal } from "./WikiAuthModal"

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "1x00000000000000000000AA"

type ArticleType = "philosopher" | "concept" | "movement" | "misc" | "custom"

const TYPE_CONFIG: Record<ArticleType, {
  label: string
  description: string
  folder: string
  frontmatter: (title: string) => string
  bodyTemplate: string
}> = {
  philosopher: {
    label: "Philosopher",
    description: "A philosopher profile with biography and positions",
    folder: "content/Wiki/Philosophers",
    frontmatter: (title) => [
      "---",
      `title: "${title}"`,
      `description: ""`,
      "tags: [wiki, philosopher]",
      "type: philosopher",
      'born: ""',
      'died: ""',
      'school: ""',
      'main_interests: ""',
      'notable_ideas: ""',
      "---",
    ].join("\n"),
    bodyTemplate: `\n# Philosopher: $TITLE\n\n> "Notable quote here."\n\n## Quick Info\n* **Dates:** \n* **Nationality:** \n* **Philosophical Tradition:** \n* **Areas of Specialization (AOS):** \n* **Notable For:** \n\n---\n\n## Biography Summary\n\n\n## Key Philosophical Contributions\n\n### Main Contribution\n\n\n## PhilPapers Survey Profile\n*Based on their writings, where would this philosopher stand on the major questions?*\n\n* **Mind:** \n* **Free Will:** \n* **Knowledge:** \n* **Meta-ethics:** \n* **God:** \n\n---\n\n## Major Works\n1. *Work Title* (Year) - Description.\n\n## Influence & Legacy\n* **Influenced by:** \n* **Followers/School:** \n* **Notable Critics:** \n* **Impact on Philosophy:** \n`,
  },
  concept: {
    label: "Concept",
    description: "A philosophical concept, distinction, or idea",
    folder: "content/Wiki/Concepts",
    frontmatter: (title) => [
      "---",
      `title: "${title}"`,
      `description: ""`,
      "tags: [wiki, concept]",
      "type: concept",
      "---",
    ].join("\n"),
    bodyTemplate: `\n# $TITLE\n\n## Overview\n\n\n## Key Distinctions\n\n\n## Historical Development\n\n\n## Major Positions\n\n\n## Further Reading\n\n`,
  },
  movement: {
    label: "Movement",
    description: "A philosophical tradition, school, or intellectual lineage",
    folder: "content/Wiki/Movements",
    frontmatter: (title) => [
      "---",
      `title: "${title}"`,
      `description: ""`,
      "tags: [wiki, movement]",
      "type: movement",
      "---",
    ].join("\n"),
    bodyTemplate: `\n# $TITLE\n\n## Overview\n\n\n## Key Figures\n\n\n## Core Tenets\n\n\n## Historical Context\n\n\n## Influence & Legacy\n\n\n## Further Reading\n\n`,
  },
  misc: {
    label: "Misc / General",
    description: "A wiki page in the root Wiki folder",
    folder: "content/Wiki",
    frontmatter: (title) => [
      "---",
      `title: "${title}"`,
      `description: ""`,
      "tags: [wiki]",
      "---",
    ].join("\n"),
    bodyTemplate: `\n# $TITLE\n\n`,
  },
  custom: {
    label: "Custom (Blank)",
    description: "A blank starter page for advanced users",
    folder: "content/Wiki",
    frontmatter: (title) => [
      "---",
      `title: "${title}"`,
      `description: ""`,
      "tags: [wiki]",
      "---",
    ].join("\n"),
    bodyTemplate: `\n# $TITLE\n\n`,
  },
}

export function WikiNewPage() {
  const { session, role, loading } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [step, setStep] = useState(1)
  const [articleType, setArticleType] = useState<ArticleType>("philosopher")
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [turnstileToken, setTurnstileToken] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ prUrl: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Generate filename slug from title
  const fileSlug = title
    .trim()
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .replace(/\s+/g, "-")

  // When advancing to editor step, populate content from template
  const advanceToEditor = () => {
    const config = TYPE_CONFIG[articleType]
    const fm = config.frontmatter(title.trim())
    const body = config.bodyTemplate.replace(/\$TITLE/g, title.trim())
    setContent(fm + body)
    setStep(3)
  }

  // Load Turnstile on step 3
  useEffect(() => {
    if (step !== 3 || !session) return
    const timer = setTimeout(() => {
      const el = document.getElementById("cf-turnstile-new")
      if (!el || el.childElementCount > 0) return
      if (typeof window !== "undefined" && (window as any).turnstile && TURNSTILE_SITE_KEY) {
        ;(window as any).turnstile.render("#cf-turnstile-new", {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => setTurnstileToken(token),
          "expired-callback": () => setTurnstileToken(""),
        })
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [step, session])

  const handleSubmit = async () => {
    if (!session || !turnstileToken) return
    setSubmitting(true)
    setError(null)
    try {
      const config = TYPE_CONFIG[articleType]
      const filePath = `${config.folder}/${fileSlug}.md`

      const res = await fetch("/api/new", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          filePath,
          content,
          articleType,
          turnstileToken,
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

  // Auth gate
  if (!loading && !session) {
    return (
      <div className="wiki-form-page">
        <h1 className="wiki-form-heading">Sign in to create</h1>
        <p className="wiki-form-hint">You need an approved account to create wiki pages.</p>
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
          Your account is awaiting admin approval. You will be able to create pages once approved.
        </p>
      </div>
    )
  }

  if (result) {
    return (
      <div className="wiki-form-page">
        <div className="wiki-form-terminal-box">
          <p className="wiki-form-prompt">&gt; article created.</p>
          <p className="wiki-form-prompt">&gt; pull request opened.</p>
          <p className="wiki-form-prompt wiki-form-success">&gt; status: pending review.</p>
          <p style={{ marginTop: "2rem" }}>
            Your article has been submitted for review.{" "}
            <a href={result.prUrl} target="_blank" rel="noopener noreferrer" className="wiki-form-link">
              View pull request &rarr;
            </a>
          </p>
        </div>
      </div>
    )
  }

  const STEPS = ["Type", "Title", "Content"]

  return (
    <div className="wiki-form-page" style={{ maxWidth: '800px' }}>
      <h1 className="wiki-form-heading">Add Article</h1>
      <p className="wiki-form-subheading">
        Create a new wiki page. Changes are submitted as a pull request for review.
      </p>

      <div className="wiki-form-steps">
        {STEPS.map((label, i) => {
          const s = i + 1
          return (
            <span
              key={s}
              className={`wiki-form-step ${step === s ? "wiki-form-step-active" : ""} ${step > s ? "wiki-form-step-done" : ""}`}
            >
              {label}
            </span>
          )
        })}
      </div>

      {/* Step 1: Article type */}
      {step === 1 && (
        <div>
          <p className="wiki-form-hint">What kind of article are you creating?</p>
          <div className="wiki-new-type-grid">
            {(Object.entries(TYPE_CONFIG) as [ArticleType, typeof TYPE_CONFIG[ArticleType]][]).map(([key, config]) => (
              <button
                key={key}
                type="button"
                className={`wiki-new-type-card ${articleType === key ? "wiki-new-type-card-active" : ""}`}
                onClick={() => setArticleType(key)}
              >
                <span className="wiki-new-type-label">{config.label}</span>
                <span className="wiki-new-type-desc">{config.description}</span>
              </button>
            ))}
          </div>
          <div className="wiki-form-actions">
            <button className="wiki-form-btn" onClick={() => setStep(2)}>
              Next: Title &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Title */}
      {step === 2 && (
        <div>
          <div className="wiki-form-field">
            <label className="wiki-form-label" htmlFor="new-title">
              Article Title <span className="wiki-form-required">*</span>
            </label>
            <input
              id="new-title"
              className="wiki-form-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Baruch de Spinoza"
              autoFocus
            />
          </div>
          {title.trim() && (
            <p className="wiki-form-hint" style={{ marginTop: 'var(--space-2)' }}>
              File: <code>{TYPE_CONFIG[articleType].folder}/{fileSlug}.md</code>
            </p>
          )}
          <div className="wiki-form-actions">
            <button className="wiki-form-btn wiki-form-btn-secondary" onClick={() => setStep(1)}>
              &larr; Back
            </button>
            <button
              className="wiki-form-btn"
              disabled={!title.trim()}
              onClick={advanceToEditor}
            >
              Next: Content &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Editor */}
      {step === 3 && (
        <div>
          <WikiMarkdownEditor
            value={content}
            onChange={setContent}
            placeholder="Write your article..."
            minHeight={500}
          />

          <div className="wiki-form-turnstile">
            <div id="cf-turnstile-new" />
          </div>

          {error && <div className="wiki-form-error">&gt; {error}</div>}

          <div className="wiki-form-actions">
            <button className="wiki-form-btn wiki-form-btn-secondary" onClick={() => setStep(2)}>
              &larr; Back
            </button>
            <button
              className="wiki-form-btn"
              onClick={handleSubmit}
              disabled={submitting || !turnstileToken || !content.trim()}
            >
              {submitting ? "Submitting..." : "Submit Article"}
            </button>
          </div>

          <p className="wiki-form-hint">
            Articles are reviewed before publishing. A pull request will be opened in the repo.
          </p>
        </div>
      )}
    </div>
  )
}
