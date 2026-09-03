import { useState } from "react"

interface Props {
  slug: string
  title: string
}

export function CopyWikilinkButton({ slug, title }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    const linkText = `[[${slug}|${title}]]`
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(linkText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <button
      className="wiki-edit-btn"
      onClick={handleCopy}
      title="Copy wikilink syntax for referencing in articles"
      aria-label="Copy wikilink"
      style={{ gap: "4px" }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
      {copied ? "Copied" : "Wikilink"}
    </button>
  )
}
