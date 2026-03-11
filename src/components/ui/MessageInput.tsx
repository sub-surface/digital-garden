import { useState, useRef, useEffect } from "react"
import type { ChatMessage } from "@/types/chat"
import { EmotePicker } from "./EmotePicker"
import { GifPicker } from "./GifPicker"
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

export function MessageInput({ onSend, replyTo, onCancelReply, onTyping }: Props) {
  const [body, setBody] = useState("")
  const [showEmotePicker, setShowEmotePicker] = useState(false)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    <div className={styles.inputArea} style={{ position: "relative" }}>
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
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          rows={1}
          maxLength={CHAR_LIMIT}
        />
        <button
          className={`${styles.pickerBtn} ${showEmotePicker ? styles.pickerBtnActive : ""}`}
          onClick={() => {
            setShowGifPicker(false)
            setShowEmotePicker((v) => !v)
          }}
          type="button"
          aria-label="Emote picker"
        >
          emote
        </button>
        <button
          className={`${styles.pickerBtn} ${showGifPicker ? styles.pickerBtnActive : ""}`}
          onClick={() => {
            setShowEmotePicker(false)
            setShowGifPicker((v) => !v)
          }}
          type="button"
          aria-label="GIF picker"
        >
          gif
        </button>
        <button
          className={styles.sendBtn}
          onClick={handleSubmit}
          disabled={!body.trim() || body.length > CHAR_LIMIT}
        >
          Send
        </button>
      </div>

      {showEmotePicker && (
        <EmotePicker
          onSelect={(code) => {
            appendText(code)
            setShowEmotePicker(false)
          }}
          onClose={() => setShowEmotePicker(false)}
        />
      )}

      {showGifPicker && (
        <GifPicker
          onSelect={(md) => {
            appendText(md)
            setShowGifPicker(false)
          }}
          onClose={() => setShowGifPicker(false)}
        />
      )}

      {showCounter && (
        <div className={`${styles.charCount} ${remaining < 100 ? styles.charCountWarn : ""}`}>
          {remaining} remaining
        </div>
      )}
    </div>
  )
}
