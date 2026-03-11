import { useState, useRef, useEffect } from "react"
import type { ChatMessage } from "@/types/chat"
import styles from "./Chat.module.scss"

const CHAR_LIMIT = 2000
const CHAR_WARN = 1500

interface Props {
  roomId: string
  onSend: (body: string, replyTo?: string) => void
  replyTo?: ChatMessage | null
  onCancelReply?: () => void
}

export function MessageInput({ onSend, replyTo, onCancelReply }: Props) {
  const [body, setBody] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus textarea when replyTo changes
  useEffect(() => {
    if (replyTo) {
      textareaRef.current?.focus()
    }
  }, [replyTo])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleSubmit() {
    const trimmed = body.trim()
    if (!trimmed || trimmed.length > CHAR_LIMIT) return
    onSend(trimmed, replyTo?.id ?? undefined)
    setBody("")
  }

  const remaining = CHAR_LIMIT - body.length
  const showCounter = body.length > CHAR_WARN

  return (
    <div className={styles.inputArea}>
      {replyTo && (
        <div className={styles.replyPreview}>
          <span>
            Replying to <strong>@{replyTo.profiles?.username ?? "unknown"}</strong>:{" "}
            {replyTo.body.slice(0, 60)}{replyTo.body.length > 60 ? "…" : ""}
          </span>
          <button
            className={styles.replyPreviewCancel}
            onClick={onCancelReply}
            aria-label="Cancel reply"
          >
            &times;
          </button>
        </div>
      )}

      <div className={styles.inputRow}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          rows={1}
          maxLength={CHAR_LIMIT}
        />
        <button
          className={styles.sendBtn}
          onClick={handleSubmit}
          disabled={!body.trim() || body.length > CHAR_LIMIT}
        >
          Send
        </button>
      </div>

      {showCounter && (
        <div className={`${styles.charCount} ${remaining < 100 ? styles.charCountWarn : ""}`}>
          {remaining} remaining
        </div>
      )}
    </div>
  )
}
