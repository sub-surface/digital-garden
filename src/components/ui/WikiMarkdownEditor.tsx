import { useRef, useState, lazy, Suspense } from "react"

const Markdown = lazy(() => import("react-markdown"))
const remarkGfm = lazy(() => import("remark-gfm").then((m) => ({ default: m.default })))

interface ToolbarAction {
  label: string
  title: string
  tooltip: string
  wrap?: [string, string]
  prefix?: string
  placeholder?: string
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { label: "B", title: "Bold", tooltip: "Wrap text in **bold**", wrap: ["**", "**"], placeholder: "bold text" },
  { label: "I", title: "Italic", tooltip: "Wrap text in *italic*", wrap: ["*", "*"], placeholder: "italic text" },
  { label: "H2", title: "Heading 2", tooltip: "Start a ## section heading", prefix: "## " },
  { label: "H3", title: "Heading 3", tooltip: "Start a ### sub-heading", prefix: "### " },
  { label: "\"", title: "Blockquote", tooltip: "Prefix line with > for a blockquote", prefix: "> " },
  { label: "`", title: "Inline code", tooltip: "Wrap text in `backticks`", wrap: ["`", "`"], placeholder: "code" },
  { label: "---", title: "Horizontal rule", tooltip: "Insert a horizontal divider", prefix: "\n---\n" },
  { label: "\u2022", title: "Bullet list", tooltip: "Start a bullet point with -", prefix: "- " },
  { label: "[[", title: "Wikilink", tooltip: "Link to another wiki page: [[Page Name]]", wrap: ["[[", "]]"], placeholder: "Page Name" },
  { label: "[+]", title: "Callout", tooltip: "Insert a callout block: > [!note] Title", prefix: "> [!note] " },
  { label: "[^", title: "Footnote", tooltip: "Insert a footnote reference [^1] and define it below", wrap: ["[^", "]"], placeholder: "1" },
]

function applyAction(
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

/** Strip frontmatter (--- ... ---) from content for preview */
function stripFrontmatter(text: string): string {
  const match = text.match(/^---\n[\s\S]*?\n---\n?/)
  return match ? text.slice(match[0].length) : text
}

/** Convert wikilinks [[Page Name]] and [[Page|Display]] to markdown links */
function convertWikilinks(text: string): string {
  return text
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "[$2]($1)")
    .replace(/\[\[([^\]]+)\]\]/g, "[$1]($1)")
}

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minHeight?: number
}

export function WikiMarkdownEditor({ value, onChange, placeholder, minHeight = 400 }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showGuide, setShowGuide] = useState(false)
  const [mode, setMode] = useState<"edit" | "preview">("edit")
  const [remarkPlugins, setRemarkPlugins] = useState<any[] | null>(null)

  const wordCount = value ? value.split(/\s+/).filter(Boolean).length : 0

  // Lazy-load remark-gfm on first preview
  const handlePreviewToggle = async () => {
    if (mode === "edit") {
      if (!remarkPlugins) {
        try {
          const gfm = await import("remark-gfm")
          setRemarkPlugins([gfm.default])
        } catch {
          setRemarkPlugins([])
        }
      }
      setMode("preview")
    } else {
      setMode("edit")
    }
  }

  const previewContent = convertWikilinks(stripFrontmatter(value))

  return (
    <div className="wiki-form-md-editor">
      <div className="wiki-form-md-toolbar" role="toolbar" aria-label="Markdown formatting">
        {mode === "edit" && TOOLBAR_ACTIONS.map((action) => (
          <button
            key={action.title}
            type="button"
            className="wiki-form-md-tool"
            title={action.tooltip}
            onMouseDown={(e) => {
              e.preventDefault()
              if (textareaRef.current) {
                applyAction(textareaRef.current, action, () => value, onChange)
              }
            }}
          >
            {action.label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="wiki-form-md-tool"
          title="Toggle preview"
          onMouseDown={(e) => {
            e.preventDefault()
            handlePreviewToggle()
          }}
          style={mode === "preview" ? { color: 'var(--color-accent)', borderColor: 'var(--color-accent)' } : undefined}
        >
          {mode === "preview" ? "Edit" : "Preview"}
        </button>
        {mode === "edit" && (
          <button
            type="button"
            className="wiki-form-md-tool"
            title="Toggle style guide reference"
            onMouseDown={(e) => {
              e.preventDefault()
              setShowGuide((v) => !v)
            }}
            style={showGuide ? { color: 'var(--color-accent)', borderColor: 'var(--color-accent)' } : undefined}
          >
            ?
          </button>
        )}
      </div>

      {showGuide && mode === "edit" && (
        <div className="wiki-editor-guide">
          <div className="wiki-editor-guide-content">
            <h4>Quick Style Reference</h4>
            <table>
              <tbody>
                <tr><td><code>**bold**</code></td><td>Bold text</td></tr>
                <tr><td><code>*italic*</code></td><td>Italic text</td></tr>
                <tr><td><code>## Heading</code></td><td>Section heading</td></tr>
                <tr><td><code>[[Page Name]]</code></td><td>Link to another wiki page</td></tr>
                <tr><td><code>[text](url)</code></td><td>External link</td></tr>
                <tr><td><code>&gt; [!note] Title</code></td><td>Callout block (note, tip, warning)</td></tr>
                <tr><td><code>[^1]</code></td><td>Footnote reference (renders as sidenote)</td></tr>
                <tr><td><code>- item</code></td><td>Bullet list</td></tr>
                <tr><td><code>1. item</code></td><td>Numbered list</td></tr>
                <tr><td><code>---</code></td><td>Horizontal rule</td></tr>
                <tr><td><code>![alt](url)</code></td><td>Image</td></tr>
              </tbody>
            </table>
            <p>
              Write clearly and charitably. Steelman positions you disagree with. Cite sources where claims are contested.
              See the full <a href="/wiki/Style-Guide" className="wiki-form-link">Style Guide</a> for details.
            </p>
          </div>
        </div>
      )}

      {mode === "edit" ? (
        <textarea
          ref={textareaRef}
          className="wiki-form-textarea wiki-form-md-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "Write your content in Markdown..."}
          style={{ minHeight: `${minHeight}px` }}
          spellCheck
        />
      ) : (
        <div className="wiki-preview-container" style={{ minHeight: `${minHeight}px` }}>
          <div className="wiki-preview-banner">Preview — final rendering may differ slightly</div>
          <div className="wiki-preview-content">
            <Suspense fallback={<p>Loading preview...</p>}>
              {remarkPlugins !== null && (
                <Markdown remarkPlugins={remarkPlugins}>{previewContent}</Markdown>
              )}
            </Suspense>
          </div>
        </div>
      )}

      <div className="wiki-form-md-hint">
        {wordCount > 0 && <span>{wordCount} words</span>}
      </div>
    </div>
  )
}
