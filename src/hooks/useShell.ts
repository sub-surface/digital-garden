const WIKI_HOST = "wiki.subsurfaces.net"
const CHAT_HOST = "chat.subsurfaces.net"

export type Shell = "main" | "wiki" | "chat"

export function useShell(): Shell {
  if (typeof window === "undefined") return "main"
  const host = window.location.hostname
  if (host === WIKI_HOST || import.meta.env.VITE_WIKI_MODE === "true") return "wiki"
  if (host === CHAT_HOST || import.meta.env.VITE_CHAT_MODE === "true") return "chat"
  return "main"
}

export function useIsWiki(): boolean {
  return useShell() === "wiki"
}

export function useIsChat(): boolean {
  return useShell() === "chat"
}
