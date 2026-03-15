import { useState, useRef, useEffect, useImperativeHandle, forwardRef } from "react"
import type { ChatMessage } from "@/types/chat"
import { EmotePicker } from "./EmotePicker"
import styles from "./Chat.module.scss"

const CHAR_LIMIT = 2000
const CHAR_WARN = 1500

interface Props {
  roomId: string
  onSend: (body: string, replyTo?: string) => void
  replyTo?: ChatMessage | null
  onCancelReply?: () => void
  onTyping?: (typing: boolean) => void
}

export interface MessageInputHandle {
  focus: () => void
}

export const MessageInput = forwardRef<MessageInputHandle, Props>(function MessageInput(
  { onSend, replyTo, onCancelReply, onTyping },
  ref
) {
  const [body, setBody] = useState("")
  const [showPicker, setShowPicker] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useImperativeHandle(ref, () => ({
    focus() {
      textareaRef.current?.focus()
    },
  }))

  // Focus textarea when replyTo changes
  useEffect(() => {
    if (replyTo) {
      textareaRef.current?.focus()
    }
  }, [replyTo])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setBody(e.target.value)
    if (onTyping) {
      onTyping(true)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => onTyping(false), 3000)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    // Escape while focused: blur textarea
    if (e.key === "Escape") {
      textareaRef.current?.blur()
    }
  }

  function handleSubmit() {
    const trimmed = body.trim()
    if (!trimmed || trimmed.length > CHAR_LIMIT) return
    onSend(trimmed, replyTo?.id ?? undefined)
    setBody("")
    if (onTyping) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      onTyping(false)
    }
  }

  function appendText(text: string) {
    setBody((prev) => {
      const needsSpace = prev.length > 0 && !prev.endsWith(" ")
      return needsSpace ? `${prev} ${text}` : `${prev}${text}`
    })
    textareaRef.current?.focus()
  }

  const remaining = CHAR_LIMIT - body.length
  const showCounter = body.length > CHAR_WARN

  return (
    <div className={styles.inputAreaOuter}>
    <div className={styles.inputArea} style={{ position: "relative" }}>
      {replyTo && (
        <div className={styles.replyPreview}>
          <span>
            Replying to <strong>@{replyTo.profiles?.username ?? "unknown"}</strong>:{" "}
            {replyTo.body.slice(0, 60)}{replyTo.body.length > 60 ? "..." : ""}
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
          id="chat-message-input"
          name="chat-message"
          className={styles.textarea}
          value={body}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Message... (press / to focus)"
          rows={1}
          maxLength={CHAR_LIMIT}
          autoComplete="off"
        />
        <button
          className={`${styles.pickerBtn} ${showPicker ? styles.pickerBtnActive : ""}`}
          onClick={() => setShowPicker((v) => !v)}
          type="button"
          aria-label="Emote & GIF picker"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
            <line x1="9" y1="9" x2="9.01" y2="9"/>
            <line x1="15" y1="9" x2="15.01" y2="9"/>
          </svg>
        </button>
        <button
          className={styles.sendBtn}
          onClick={handleSubmit}
          disabled={!body.trim() || body.length > CHAR_LIMIT}
        >
          Send
        </button>
      </div>

      {showPicker && (
        <EmotePicker
          onSelect={(code) => {
            appendText(code)
            setShowPicker(false)
          }}
          onSelectGif={(md) => {
            appendText(md)
            setShowPicker(false)
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {showCounter && (
        <div className={`${styles.charCount} ${remaining < 100 ? styles.charCountWarn : ""}`}>
          {remaining} remaining
        </div>
      )}
    </div>
    </div>
  )
})
