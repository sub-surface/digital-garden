import { useState, useEffect, useCallback } from "react"
import { useAuth } from "./useAuth"
import { supabase } from "@/lib/supabase"

const STORAGE_KEY = "dg_notif_dismissed"

export type NotificationType = "warn" | "info" | "error" | "success" | "neutral"

export interface AppNotification {
  id: string
  type: NotificationType
  message: string
  action?: { label: string; onClick: () => void }
  /** true = persisted to localStorage; false/absent = session-only */
  persistent?: boolean
  /** success notifications auto-dismiss after 5s */
  autoDismiss?: boolean
}

function getPersistedDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function persistDismiss(id: string) {
  try {
    const existing = getPersistedDismissed()
    existing.add(id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing]))
  } catch {
    // localStorage unavailable — ignore
  }
}

export function useNotifications(): {
  notifications: AppNotification[]
  dismiss: (id: string) => void
} {
  const { session } = useAuth()
  const [sessionDismissed, setSessionDismissed] = useState<Set<string>>(new Set())
  const [persistedDismissed] = useState<Set<string>>(getPersistedDismissed)

  // Build the full dismissed set (session + persisted)
  const dismissed = new Set([...sessionDismissed, ...persistedDismissed])

  const dismiss = useCallback((id: string) => {
    // Check if this notification is persistent
    const all = buildAll(session, () => {})
    const notif = all.find(n => n.id === id)
    if (notif?.persistent) {
      persistDismiss(id)
      // Also add to session state to trigger re-render
      setSessionDismissed(prev => new Set([...prev, id]))
    } else {
      setSessionDismissed(prev => new Set([...prev, id]))
    }
  }, [session])

  // Build notification list with actions wired up
  const all = buildAll(session, dismiss)
  const notifications = all.filter(n => !dismissed.has(n.id))

  // Auto-dismiss success notifications after 5s
  useEffect(() => {
    const successNotifs = notifications.filter(n => n.autoDismiss)
    if (successNotifs.length === 0) return
    const timers = successNotifs.map(n =>
      setTimeout(() => dismiss(n.id), 5000)
    )
    return () => timers.forEach(clearTimeout)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications.map(n => n.id).join(",")])

  return { notifications, dismiss }
}

function buildAll(
  session: ReturnType<typeof useAuth>["session"],
  dismiss: (id: string) => void
): AppNotification[] {
  const notifs: AppNotification[] = []

  // ── email-unverified ──────────────────────────────────────
  if (session && !session.user.email_confirmed_at) {
    notifs.push({
      id: "email-unverified",
      type: "warn",
      message: "Please verify your email to complete signup — check your inbox for a confirmation link.",
      persistent: false,
      action: supabase && session.user.email
        ? {
            label: "Resend",
            onClick: async () => {
              await supabase!.auth.resend({
                type: "signup",
                email: session.user.email!,
              })
              // Dismiss after resend so a "sent" success could replace it
              // (for now just dismiss)
              dismiss("email-unverified")
            },
          }
        : undefined,
    })
  }

  // ── gdpr-cookies ─────────────────────────────────────────
  notifs.push({
    id: "gdpr-cookies",
    type: "neutral",
    message: "This site uses cookies for session management only — no tracking or advertising.",
    persistent: true,
  })

  // Future: stonks-ticker goes here (Phase 2)

  return notifs
}
