const WIKI_HOST = "wiki.subsurfaces.net"

export function useIsWiki(): boolean {
  if (typeof window === "undefined") return false
  return (
    window.location.hostname === WIKI_HOST ||
    import.meta.env.VITE_WIKI_MODE === "true"
  )
}
