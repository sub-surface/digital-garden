import { useState, useRef, useEffect, useMemo, useImperativeHandle, forwardRef, type ReactNode } from "react"
import type { ChatMessage } from "@/types/chat"
import { parseMessageBody } from "@/lib/parseMessageBody"
import { emoteSrc } from "@/lib/emoteIndex"
import { EmotePicker } from "./EmotePicker"
import { ChatAutocomplete, useAutocomplete, CHAT_COMMANDS } from "./ChatAutocomplete"
import styles from "./Chat.module.scss"

function renderReplySnippet(body: string, maxLen: number): ReactNode[] {
  const truncated = body.length > maxLen ? body.slice(0, maxLen) + "..." : body
  const tokens = parseMessageBody(truncated)
  return tokens.map((tok, i) => {
    if (tok.type === "emote") {
      return (
        <img
          key={i}
          src={emoteSrc(tok.name)}
          alt={`:${tok.name}:`}
          className={styles.emote}
          style={{ height: "1em" }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none"
          }}
        />
      )
    }
    if (tok.type === "text") return <span key={i}>{tok.value}</span>
    if (tok.type === "url") return <span key={i}>{tok.label}</span>
    return null
  })
}

const CHAR_LIMIT = 2000
const CHAR_WARN = 1500

interface Props {
  roomId: string
  onSend: (body: string, replyTo?: string) => void
  onEditLast?: () => void
  replyTo?: ChatMessage | null
  onCancelReply?: () => void
  onTyping?: (typing: boolean) => void
  knownUsers?: string[]
  onOpenGifPicker?: () => void
  onCommand?: (cmd: string, args: string[]) => Promise<{ output?: string } | void>
  isAdmin?: boolean
}

export interface MessageInputHandle {
  focus: () => void
}

export const MessageInput = forwardRef<MessageInputHandle, Props>(function MessageInput(
  { onSend, onEditLast, replyTo, onCancelReply, onTyping, knownUsers = [], onOpenGifPicker, onCommand, isAdmin },
  ref
) {
  const [body, setBody] = useState("")
  const [cursorPos, setCursorPos] = useState(0)
  const [showPicker, setShowPicker] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const autocomplete = useAutocomplete({ body, cursorPos, knownUsers, isAdmin })

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
    setCursorPos(e.target.selectionStart ?? e.target.value.length)
    if (onTyping) {
      onTyping(true)
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => onTyping(false), 3000)
    }
  }

  function handleSelect(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    setCursorPos((e.target as HTMLTextAreaElement).selectionStart ?? 0)
  }

  function applyAutocomplete(item: ReturnType<typeof autocomplete.getSelected>) {
    if (!item || !autocomplete.trigger) return
    const before = body.slice(0, autocomplete.trigger.start)
    const after = body.slice(cursorPos)

    // Handle /command special actions
    if (item.type === "command") {
      const cmdName = item.value.trim().slice(1) // remove /
      if (cmdName === "shrug") {
        const newBody = before + "¯\\_(ツ)_/¯" + after
        setBody(newBody)
        setCursorPos(newBody.length - after.length)
        return
      }
      if (cmdName === "flip") {
        const newBody = before + "(╯°□°）╯︵ ┻━┻" + after
        setBody(newBody)
        setCursorPos(newBody.length - after.length)
        return
      }
      if (cmdName === "gif") {
        setBody("")
        setCursorPos(0)
        setShowPicker(true)
        return
      }
      if (cmdName === "me") {
        setBody(before + "/me " + after)
        setCursorPos((before + "/me ").length)
        return
      }
      // For commands that need arguments, insert the command text so user can type args
      setBody(before + item.value + after)
      setCursorPos((before + item.value).length)
      return
    }

    const newBody = before + item.value + after
    setBody(newBody)
    const newCursor = (before + item.value).length
    setCursorPos(newCursor)
    // Set cursor position in textarea
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = newCursor
        textareaRef.current.selectionEnd = newCursor
      }
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Autocomplete takes priority when active
    if (autocomplete.isActive) {
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault()
        const selected = autocomplete.getSelected()
        if (selected) applyAutocomplete(selected)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        autocomplete.moveSelection(-1)
        return
      }
      if (e.key === "ArrowDown") {
        e.preventDefault()
        autocomplete.moveSelection(1)
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        // Clear the trigger by adding a space
        setCursorPos(-1) // force re-eval
        return
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    // Up arrow on empty input → edit last own message
    if (e.key === "ArrowUp" && body === "" && onEditLast) {
      e.preventDefault()
      onEditLast()
    }
    if (e.key === "Escape") {
      textareaRef.current?.blur()
    }
  }

  function handleSubmit() {
    const trimmed = body.trim()
    if (!trimmed || trimmed.length > CHAR_LIMIT) return

    if (trimmed.startsWith("/")) {
      const parts = trimmed.split(" ")
      const cmd = parts[0].toLowerCase()

      if (cmd === "/shrug") {
        setBody(""); setCursorPos(0)
        onSend("¯\\_(ツ)_/¯", replyTo?.id)
        return
      }
      if (cmd === "/flip") {
        setBody(""); setCursorPos(0)
        onSend("(╯°□°）╯︵ ┻━┻", replyTo?.id)
        return
      }
      if (cmd === "/me") {
        const action = parts.slice(1).join(" ")
        if (action) { setBody(""); setCursorPos(0); onSend(`* ${action}`, replyTo?.id) }
        return
      }
      if (cmd === "/mock") {
        const text = parts.slice(1).join(" ")
        if (text) {
          const mocked = text.split("").map((c, i) => i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()).join("")
          setBody(""); setCursorPos(0); onSend(mocked, replyTo?.id)
        }
        return
      }
      // Delegate everything else to onCommand
      if (onCommand) {
        const args = parts.slice(1)
        setBody(""); setCursorPos(0)
        onCommand(cmd, args)
        return
      }
    }

    onSend(trimmed, replyTo?.id ?? undefined)
    setBody("")
    setCursorPos(0)
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

  // Extract emote names from body for preview strip
  const emoteTokens = useMemo(() => {
    const matches = body.match(/:([a-zA-Z0-9_-]+):/g)
    if (!matches) return []
    return [...new Set(matches.map((m) => m.slice(1, -1)))]
  }, [body])

  const remaining = CHAR_LIMIT - body.length
  const showCounter = body.length > CHAR_WARN

  return (
    <div className={styles.inputAreaOuter}>
    {/* Emote preview strip */}
    {emoteTokens.length > 0 && (
      <div className={styles.emotePreviewStrip}>
        {emoteTokens.map((name) => (
          <img
            key={name}
            src={emoteSrc(name)}
            alt={`:${name}:`}
            className={styles.emotePreviewImg}
            title={`:${name}:`}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none"
            }}
          />
        ))}
      </div>
    )}
    <div className={styles.inputArea} style={{ position: "relative" }}>
      {replyTo && (
        <div className={styles.replyPreview}>
          <span>
            Replying to <strong>@{replyTo.profiles?.username ?? "unknown"}</strong>:{" "}
            {renderReplySnippet(replyTo.body, 60)}
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

      {/* Autocomplete popup */}
      {autocomplete.isActive && (
        <ChatAutocomplete
          items={autocomplete.items}
          selectedIndex={autocomplete.selectedIndex}
          onSelect={applyAutocomplete}
          position={{ bottom: 48, left: 0 }}
        />
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
          onSelect={handleSelect}
          onClick={handleSelect}
          placeholder="Message... (press / for commands)"
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
