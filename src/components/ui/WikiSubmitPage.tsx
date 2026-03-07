import { useState, useEffect, useRef } from "react"

// VITE_TURNSTILE_SITE_KEY — set in .env.local for dev (use 1x00000000000000000000AA test key)
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "1x00000000000000000000AA"

// ── Survey question definitions ──

interface Question {
  key: string
  label: string
  options: string[]
}

const METAPHYSICS_QUESTIONS: Question[] = [
  { key: "apriori", label: "A priori knowledge", options: ["Yes", "No"] },
  { key: "abstractObjects", label: "Abstract objects", options: ["Platonism", "Nominalism"] },
  { key: "analyticSynthetic", label: "Analytic-synthetic distinction", options: ["Yes", "No"] },
  { key: "epistemicJustification", label: "Epistemic justification", options: ["Internalism", "Externalism"] },
  { key: "externalWorld", label: "External world", options: ["Idealism", "Skepticism", "Non-skeptical realism"] },
  { key: "freeWill", label: "Free will", options: ["Compatibilism", "Libertarianism", "No free will"] },
  { key: "knowledge", label: "Knowledge", options: ["Empiricism", "Rationalism"] },
  { key: "knowledgeClaims", label: "Knowledge claims", options: ["Contextualism", "Invariantism", "Relativism"] },
  { key: "mentalContent", label: "Mental content", options: ["Internalism", "Externalism"] },
  { key: "mind", label: "Mind", options: ["Physicalism", "Non-physicalism"] },
  { key: "perceptualExperience", label: "Perceptual experience", options: ["Disjunctivism", "Qualia theory", "Representationalism", "Sense-datum theory"] },
  { key: "personalIdentity", label: "Personal identity", options: ["Biological view", "Psychological view", "Further-fact view"] },
  { key: "teletransporter", label: "Teletransporter (Survival or Death?)", options: ["Survival", "Death"] },
  { key: "time", label: "Time", options: ["A-theory", "B-theory"] },
  { key: "truth", label: "Truth", options: ["Correspondence", "Deflationary", "Epistemic"] },
  { key: "vagueness", label: "Vagueness", options: ["Epistemic", "Metaphysical", "Semantic"] },
]

const VALUE_QUESTIONS: Question[] = [
  { key: "aestheticValue", label: "Aesthetic value", options: ["Objective", "Subjective"] },
  { key: "eatingAnimals", label: "Eating animals", options: ["Omnivorism", "Vegetarianism", "Veganism"] },
  { key: "experienceMachine", label: "Experience machine (Would you enter?)", options: ["Yes", "No"] },
  { key: "footbridge", label: "Footbridge (Push or Don't Push?)", options: ["Push", "Don't push"] },
  { key: "gender", label: "Gender", options: ["Biological", "Psychological", "Social", "Unreal"] },
  { key: "meaningOfLife", label: "Meaning of life", options: ["Subjective", "Objective", "Nonexistent"] },
  { key: "metaEthics", label: "Meta-ethics", options: ["Moral realism", "Moral anti-realism"] },
  { key: "moralJudgment", label: "Moral judgment", options: ["Cognitivism", "Non-cognitivism"] },
  { key: "moralMotivation", label: "Moral motivation", options: ["Internalism", "Externalism"] },
  { key: "moralPrinciples", label: "Moral principles", options: ["Generalism", "Particularism"] },
  { key: "normativeEthics", label: "Normative ethics", options: ["Consequentialism", "Deontology", "Virtue ethics"] },
  { key: "politicalPhilosophy", label: "Political philosophy", options: ["Communitarianism", "Egalitarianism", "Libertarianism"] },
  { key: "race", label: "Race", options: ["Biological", "Social", "Unreal"] },
  { key: "trolleyProblem", label: "Trolley problem (Switch or Don't Switch?)", options: ["Switch", "Don't switch"] },
]

const LOGIC_QUESTIONS: Question[] = [
  { key: "lawsOfNature", label: "Laws of nature", options: ["Humean", "Non-Humean"] },
  { key: "logic", label: "Logic", options: ["Classical", "Non-classical"] },
  { key: "newcomb", label: "Newcomb's problem", options: ["One box", "Two boxes"] },
  { key: "properNames", label: "Proper names", options: ["Fregean", "Millian"] },
  { key: "science", label: "Science", options: ["Scientific realism", "Scientific anti-realism"] },
]

const METAPHILOSOPHY_QUESTIONS: Question[] = [
  { key: "aimOfPhilosophy", label: "Aim of philosophy", options: ["Truth/knowledge", "Understanding", "Wisdom", "Happiness"] },
  { key: "god", label: "God", options: ["Theism", "Atheism"] },
  { key: "philosophicalMethods", label: "Philosophical methods", options: ["Conceptual analysis", "Empirical philosophy", "Formal philosophy", "Intuition-based", "Phenomenology", "Thought experiments"] },
  { key: "philosophicalProgress", label: "Philosophical progress", options: ["A lot", "A little", "None"] },
]

const ALL_QUESTIONS = [...METAPHYSICS_QUESTIONS, ...VALUE_QUESTIONS, ...LOGIC_QUESTIONS, ...METAPHILOSOPHY_QUESTIONS]

// ── Form state type ──

type FormData = {
  name: string
  username: string
  pronouns: string
  imageUrl: string
  imageBase64: string      // base64 payload (no data-URL prefix)
  imageFilename: string    // original filename for extension
  tradition: string
  aos: string
  influences: string
  additionalNotes: string
  bodyContent: string
  [key: string]: string
}

const INITIAL_FORM: FormData = {
  name: "",
  username: "",
  pronouns: "",
  imageUrl: "",
  imageBase64: "",
  imageFilename: "",
  tradition: "",
  aos: "",
  influences: "",
  additionalNotes: "",
  bodyContent: "",
}

// ── Image upload field ──

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"]
const MAX_IMAGE_BYTES = 4 * 1024 * 1024 // 4 MB

function ImageUploadField({
  imageUrl,
  imageBase64,
  imageFilename,
  onUrlChange,
  onUpload,
  onClear,
}: {
  imageUrl: string
  imageBase64: string
  imageFilename: string
  onUrlChange: (url: string) => void
  onUpload: (base64: string, filename: string, previewUrl: string) => void
  onClear: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState("")
  const hasUpload = !!imageBase64

  function handleFile(file: File) {
    setUploadError("")
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setUploadError("Unsupported format. Use JPEG, PNG, GIF, or WebP.")
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError("Image must be under 4 MB.")
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      // Strip data-URL prefix — keep only the base64 payload
      const base64 = dataUrl.split(",")[1]
      onUpload(base64, file.name, dataUrl)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="wiki-form-field">
      <label className="wiki-form-label">Profile Image</label>

      {hasUpload ? (
        <div className="wiki-form-image-preview">
          <img src={`data:image/*;base64,${imageBase64}`} alt="Preview" className="wiki-form-image-thumb" />
          <div className="wiki-form-image-meta">
            <span className="wiki-form-image-filename">{imageFilename}</span>
            <button type="button" className="wiki-form-image-clear" onClick={onClear}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="wiki-form-image-row">
          <input
            className="wiki-form-input wiki-form-image-url"
            type="url"
            value={imageUrl}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://… (paste a URL)"
          />
          <span className="wiki-form-image-or">or</span>
          <button
            type="button"
            className="wiki-form-btn wiki-form-btn-secondary wiki-form-upload-btn"
            onClick={() => fileRef.current?.click()}
          >
            Upload file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              // Reset so the same file can be re-selected after a clear
              e.target.value = ""
            }}
          />
        </div>
      )}

      {uploadError && <span className="wiki-form-upload-error">{uploadError}</span>}
      <span className="wiki-form-hint" style={{ margin: 0 }}>JPEG, PNG, GIF or WebP · max 4 MB. The image will be committed to the repo alongside your profile.</span>
    </div>
  )
}

// ── Markdown toolbar ──

interface ToolbarAction {
  label: string
  title: string
  wrap?: [string, string]
  prefix?: string
  placeholder?: string
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { label: "B", title: "Bold", wrap: ["**", "**"], placeholder: "bold text" },
  { label: "I", title: "Italic", wrap: ["*", "*"], placeholder: "italic text" },
  { label: "H2", title: "Heading 2", prefix: "## " },
  { label: "H3", title: "Heading 3", prefix: "### " },
  { label: "\"", title: "Blockquote", prefix: "> " },
  { label: "`", title: "Inline code", wrap: ["`", "`"], placeholder: "code" },
  { label: "—", title: "Horizontal rule", prefix: "\n---\n" },
  { label: "•", title: "Bullet list item", prefix: "- " },
  { label: "🔗", title: "Link", wrap: ["[", "](url)"], placeholder: "link text" },
]

function applyToolbarAction(
  textarea: HTMLTextAreaElement,
  action: ToolbarAction,
  getValue: () => string,
  setValue: (v: string) => void,
) {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const text = getValue()
  const selected = text.slice(start, end)

  let newText: string
  let cursorStart: number
  let cursorEnd: number

  if (action.wrap) {
    const [open, close] = action.wrap
    const inner = selected || action.placeholder || ""
    newText = text.slice(0, start) + open + inner + close + text.slice(end)
    cursorStart = start + open.length
    cursorEnd = cursorStart + inner.length
  } else if (action.prefix) {
    // For prefixes, apply to the start of the line
    const lineStart = text.lastIndexOf("\n", start - 1) + 1
    newText = text.slice(0, lineStart) + action.prefix + text.slice(lineStart)
    cursorStart = start + action.prefix.length
    cursorEnd = end + action.prefix.length
  } else {
    return
  }

  setValue(newText)
  requestAnimationFrame(() => {
    textarea.focus()
    textarea.setSelectionRange(cursorStart, cursorEnd)
  })
}

function MarkdownEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  return (
    <div className="wiki-form-md-editor">
      <div className="wiki-form-md-toolbar" role="toolbar" aria-label="Markdown formatting">
        {TOOLBAR_ACTIONS.map((action) => (
          <button
            key={action.title}
            type="button"
            className="wiki-form-md-tool"
            title={action.title}
            onMouseDown={(e) => {
              // Prevent textarea from losing focus
              e.preventDefault()
              if (textareaRef.current) {
                applyToolbarAction(textareaRef.current, action, () => value, onChange)
              }
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        className="wiki-form-textarea wiki-form-md-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          "Write your profile body here in Markdown.\n\n" +
          "You can write about yourself, elaborate on your positions, share relevant reading, etc.\n\n" +
          "— Images: ![alt text](https://url-to-image.jpg)\n" +
          "— Headings: ## Section Title\n" +
          "— Links: [link text](https://url)\n" +
          "— Bold: **text**  Italic: *text*\n" +
          "— Blockquote: > quoted text\n\n" +
          "MDX components are also supported — e.g. <Query filter=\"tag=ethics\" />\n\n" +
          "This section is optional."
        }
        rows={16}
        spellCheck
      />
      {value && (
        <div className="wiki-form-md-hint">
          {value.split(/\s+/).filter(Boolean).length} words
        </div>
      )}
    </div>
  )
}

// ── Survey question with "Other" support ──

function SurveyQuestion({
  question,
  value,
  onChange,
}: {
  question: Question
  value: string
  onChange: (key: string, value: string) => void
}) {
  const isOther = value.startsWith("__other__:")
  const selectValue = isOther ? "__other__" : value
  const otherInputValue = isOther ? value.replace("__other__:", "") : ""

  return (
    <div className="wiki-form-field">
      <label htmlFor={question.key} className="wiki-form-label">
        {question.label}
      </label>
      <select
        id={question.key}
        className="wiki-form-select"
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === "__other__") {
            onChange(question.key, "__other__:")
          } else {
            onChange(question.key, e.target.value)
          }
        }}
      >
        <option value="">— skip —</option>
        {question.options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
        <option value="__other__">Other…</option>
      </select>
      {isOther && (
        <input
          type="text"
          className="wiki-form-input wiki-form-other-input"
          placeholder="Describe your position…"
          value={otherInputValue}
          onChange={(e) => onChange(question.key, "__other__:" + e.target.value)}
          autoFocus
        />
      )}
    </div>
  )
}

// ── Collapsible survey section ──

function SurveySection({
  title,
  questions,
  formData,
  onChange,
}: {
  title: string
  questions: Question[]
  formData: FormData
  onChange: (key: string, value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const answered = questions.filter((q) => formData[q.key]).length

  return (
    <div className="wiki-form-section">
      <button
        type="button"
        className="wiki-form-section-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="wiki-form-section-title">{title}</span>
        <span className="wiki-form-section-meta">
          {answered > 0 && <span className="wiki-form-answered">{answered}/{questions.length}</span>}
          <span className="wiki-form-caret">{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <div className="wiki-form-section-body">
          {questions.map((q) => (
            <SurveyQuestion
              key={q.key}
              question={q}
              value={formData[q.key] ?? ""}
              onChange={onChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component (exported for route + MDX embed) ──

const DRAFT_KEY = "wiki-submit-draft"

function saveDraft(data: FormData) {
  // Don't persist large base64 image in localStorage
  const { imageBase64, ...rest } = data
  localStorage.setItem(DRAFT_KEY, JSON.stringify(rest))
}

function downloadDraft(data: FormData) {
  const { imageBase64, ...rest } = data
  const blob = new Blob([JSON.stringify(rest, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `wiki-draft-${rest.username || "profile"}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function WikiSubmitForm() {
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState<FormData>(() => {
    try {
      const stored = localStorage.getItem(DRAFT_KEY)
      if (stored) return { ...INITIAL_FORM, ...JSON.parse(stored) }
    } catch {}
    return INITIAL_FORM
  })
  const [turnstileToken, setTurnstileToken] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ prUrl: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draftSaved, setDraftSaved] = useState(false)
  const uploadDraftRef = useRef<HTMLInputElement>(null)

  const STEPS = ["Basic Info", "Survey", "Page Content", "Review & Submit"]
  const TOTAL_STEPS = STEPS.length

  const setField = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  // Load Turnstile widget when reaching final step
  useEffect(() => {
    if (step !== TOTAL_STEPS) return
    const timer = setTimeout(() => {
      const el = document.getElementById("cf-turnstile")
      if (!el || el.childElementCount > 0) return
      if (typeof window !== "undefined" && (window as any).turnstile && TURNSTILE_SITE_KEY) {
        ;(window as any).turnstile.render("#cf-turnstile", {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => setTurnstileToken(token),
          "expired-callback": () => setTurnstileToken(""),
        })
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [step])

  const handleSubmit = async () => {
    if (!turnstileToken) {
      setError("Please complete the CAPTCHA before submitting.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      // Clean survey answers by stripping the "__other__:" prefix
      const cleanedFormData = { ...formData }
      ALL_QUESTIONS.forEach((q) => {
        const val = cleanedFormData[q.key]
        if (val?.startsWith("__other__:")) {
          cleanedFormData[q.key] = val.replace("__other__:", "").trim()
        }
      })

      // Don't send the local data-URL preview as imageUrl — the server derives the final URL
      const payload = {
        ...cleanedFormData,
        imageUrl: formData.imageBase64 ? "" : formData.imageUrl,
        turnstileToken,
      }
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json() as { prUrl?: string; error?: string }
      if (!res.ok || data.error) {
        setError(data.error ?? "Submission failed. Please try again.")
      } else if (data.prUrl) {
        setResult({ prUrl: data.prUrl })
      }
    } catch {
      setError("Network error. Please check your connection and try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const answeredCount = ALL_QUESTIONS.filter((q) => {
    const val = formData[q.key]
    if (!val) return false
    // Prefix only (selected "Other" but haven't typed yet)
    if (val === "__other__:") return false
    return true
  }).length

  // ── Success state ──
  if (result) {
    return (
      <div className="wiki-form-page">
        <div className="wiki-form-terminal-box">
          <p className="wiki-form-prompt">{">"} submission received.</p>
          <p className="wiki-form-prompt">{">"} pull request opened.</p>
          <p className="wiki-form-prompt wiki-form-success">{">"} status: pending review.</p>
          <p style={{ marginTop: "2rem" }}>
            Your profile has been submitted for review.{" "}
            <a
              href={result.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="wiki-form-link"
            >
              View pull request →
            </a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="wiki-form-page">
      <h1 className="wiki-form-heading">Submit Your Profile</h1>
      <p className="wiki-form-subheading">
        Fill in your details, answer as many survey questions as you like, and optionally write a page body. All questions are optional except name and username.
      </p>

      {/* Step indicator */}
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

      {/* Step 1 — Basic Info */}
      {step === 1 && (
        <div className="wiki-form-section">
          <div className="wiki-form-field" style={{ marginBottom: "1rem" }}>
            <label className="wiki-form-label">Have a saved draft?</label>
            <button
              className="wiki-form-btn wiki-form-btn-secondary"
              type="button"
              onClick={() => uploadDraftRef.current?.click()}
            >
              Upload Draft
            </button>
            <input
              ref={uploadDraftRef}
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = (ev) => {
                  try {
                    const parsed = JSON.parse(ev.target?.result as string)
                    setFormData((prev) => ({ ...prev, ...parsed }))
                    setStep(4)
                  } catch { setError("Invalid draft file.") }
                }
                reader.readAsText(file)
                e.target.value = ""
              }}
            />
          </div>
          <div className="wiki-form-field">
            <label className="wiki-form-label" htmlFor="name">Name <span className="wiki-form-required">*</span></label>
            <input
              id="name"
              className="wiki-form-input"
              type="text"
              value={formData.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Your display name"
              autoComplete="off"
            />
          </div>

          <div className="wiki-form-field">
            <label className="wiki-form-label" htmlFor="username">Discord Username <span className="wiki-form-required">*</span></label>
            <input
              id="username"
              className="wiki-form-input"
              type="text"
              value={formData.username}
              onChange={(e) => setField("username", e.target.value)}
              placeholder="@yourhandle"
              autoComplete="off"
            />
          </div>

          <div className="wiki-form-field">
            <label className="wiki-form-label" htmlFor="pronouns">Pronouns</label>
            <input
              id="pronouns"
              className="wiki-form-input"
              type="text"
              value={formData.pronouns}
              onChange={(e) => setField("pronouns", e.target.value)}
              placeholder="e.g. they/them"
              autoComplete="off"
            />
          </div>

          <ImageUploadField
            imageUrl={formData.imageUrl}
            imageBase64={formData.imageBase64}
            imageFilename={formData.imageFilename}
            onUrlChange={(url) => setField("imageUrl", url)}
            onUpload={(base64, filename, previewUrl) => {
              setFormData((prev) => ({
                ...prev,
                imageBase64: base64,
                imageFilename: filename,
                imageUrl: previewUrl, // local preview; server will replace with committed URL
              }))
            }}
            onClear={() => setFormData((prev) => ({
              ...prev,
              imageBase64: "",
              imageFilename: "",
              imageUrl: "",
            }))}
          />

          <div className="wiki-form-field">
            <label className="wiki-form-label" htmlFor="tradition">Tradition</label>
            <select
              id="tradition"
              className="wiki-form-select"
              value={formData.tradition}
              onChange={(e) => setField("tradition", e.target.value)}
            >
              <option value="">— select —</option>
              <option value="Analytic">Analytic</option>
              <option value="Continental">Continental</option>
              <option value="Other">Other</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>

          <div className="wiki-form-field">
            <label className="wiki-form-label" htmlFor="aos">Areas of Specialization</label>
            <textarea
              id="aos"
              className="wiki-form-textarea"
              value={formData.aos}
              onChange={(e) => setField("aos", e.target.value)}
              placeholder="e.g. Epistemology, Meta-ethics, Phil. of Mind"
              rows={2}
            />
          </div>

          <div className="wiki-form-field">
            <label className="wiki-form-label" htmlFor="influences">Influences</label>
            <textarea
              id="influences"
              className="wiki-form-textarea"
              value={formData.influences}
              onChange={(e) => setField("influences", e.target.value)}
              placeholder="e.g. Aristotle, Hume, Kant, Wittgenstein, Lewis"
              rows={2}
            />
          </div>

          <div className="wiki-form-actions">
            <button
              className="wiki-form-btn"
              type="button"
              disabled={!formData.name.trim() || !formData.username.trim()}
              onClick={() => setStep(2)}
            >
              Next: Survey →
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — Survey */}
      {step === 2 && (
        <div>
          <p className="wiki-form-hint">All questions are optional. Select "Other…" to write a custom position.</p>
          <SurveySection
            title="Metaphysics & Epistemology"
            questions={METAPHYSICS_QUESTIONS}
            formData={formData}
            onChange={setField}
          />
          <SurveySection
            title="Value Theory (Ethics, Politics, & Aesthetics)"
            questions={VALUE_QUESTIONS}
            formData={formData}
            onChange={setField}
          />
          <SurveySection
            title="Logic, Language, & Science"
            questions={LOGIC_QUESTIONS}
            formData={formData}
            onChange={setField}
          />
          <SurveySection
            title="Metaphilosophy & Religion"
            questions={METAPHILOSOPHY_QUESTIONS}
            formData={formData}
            onChange={setField}
          />

          <div className="wiki-form-field" style={{ marginTop: "1.5rem" }}>
            <label className="wiki-form-label" htmlFor="additionalNotes">Additional Notes / Nuance</label>
            <textarea
              id="additionalNotes"
              className="wiki-form-textarea"
              value={formData.additionalNotes}
              onChange={(e) => setField("additionalNotes", e.target.value)}
              placeholder="Explain nuances, qualifications, or combinations of positions…"
              rows={4}
            />
          </div>

          <div className="wiki-form-actions">
            <button className="wiki-form-btn wiki-form-btn-secondary" type="button" onClick={() => setStep(1)}>
              ← Back
            </button>
            <button className="wiki-form-btn" type="button" onClick={() => setStep(3)}>
              Next: Page Content →
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Page Body (Markdown editor) */}
      {step === 3 && (
        <div>
          <p className="wiki-form-hint">
            Write the body of your wiki page in{" "}
            <a href="https://www.markdownguide.org/getting-started/" target="_blank" rel="noopener noreferrer" className="wiki-form-link">
              Markdown
            </a>
            . Elaborate on your views, share reading, write a bio. Images, headings, links, blockquotes, and MDX components are all supported. Completely optional.
          </p>
          <MarkdownEditor
            value={formData.bodyContent}
            onChange={(v) => setField("bodyContent", v)}
          />
          <div className="wiki-form-actions">
            <button className="wiki-form-btn wiki-form-btn-secondary" type="button" onClick={() => setStep(2)}>
              ← Back
            </button>
            <button className="wiki-form-btn" type="button" onClick={() => setStep(4)}>
              Next: Review →
            </button>
          </div>
        </div>
      )}

      {/* Step 4 — Review + Submit */}
      {step === 4 && (
        <div>
          <div className="wiki-form-review">
            <div className="wiki-form-terminal-box">
              <p className="wiki-form-prompt">{">"} name: <span className="wiki-form-value">{formData.name}</span></p>
              <p className="wiki-form-prompt">{">"} username: <span className="wiki-form-value">{formData.username}</span></p>
              {formData.pronouns && <p className="wiki-form-prompt">{">"} pronouns: <span className="wiki-form-value">{formData.pronouns}</span></p>}
              {formData.tradition && <p className="wiki-form-prompt">{">"} tradition: <span className="wiki-form-value">{formData.tradition}</span></p>}
              {formData.aos && <p className="wiki-form-prompt">{">"} aos: <span className="wiki-form-value">{formData.aos}</span></p>}
              {formData.influences && <p className="wiki-form-prompt">{">"} influences: <span className="wiki-form-value">{formData.influences}</span></p>}
              <p className="wiki-form-prompt">
                {">"} survey answers:{" "}
                <span className="wiki-form-value">{answeredCount} / {ALL_QUESTIONS.length}</span>
              </p>
              {formData.bodyContent && (
                <p className="wiki-form-prompt">
                  {">"} page body:{" "}
                  <span className="wiki-form-value">
                    {formData.bodyContent.split(/\s+/).filter(Boolean).length} words
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Cloudflare Turnstile */}
          <div className="wiki-form-turnstile">
            <div id="cf-turnstile" />
          </div>

          {error && (
            <div className="wiki-form-error">
              {">"} error: {error}
            </div>
          )}

          <div className="wiki-form-actions" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
            <button className="wiki-form-btn wiki-form-btn-secondary" type="button" onClick={() => setStep(3)}>
              ← Back
            </button>
            <button
              className="wiki-form-btn wiki-form-btn-secondary"
              type="button"
              onClick={() => { saveDraft(formData); setDraftSaved(true); setTimeout(() => setDraftSaved(false), 2000) }}
            >
              {draftSaved ? "Saved ✓" : "Save Draft"}
            </button>
            <button
              className="wiki-form-btn wiki-form-btn-secondary"
              type="button"
              onClick={() => downloadDraft(formData)}
            >
              Download Draft
            </button>
            <button
              className="wiki-form-btn"
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !turnstileToken}
            >
              {submitting ? "Submitting…" : "Submit Profile"}
            </button>
          </div>

          <p className="wiki-form-hint">
            Submissions are reviewed before publishing. A pull request will be opened in the repo.
          </p>
        </div>
      )}
    </div>
  )
}

// Route-level wrapper (keeps the existing named export for router.tsx)
export function WikiSubmitPage() {
  return <WikiSubmitForm />
}
