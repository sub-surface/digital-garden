import { useEffect } from "react"

function setOpen(node: Element, open: boolean) {
  node.classList.toggle("open", open)
  node.classList.toggle("closed", !open)
}

/**
 * Telescopic text interactivity for a rendered container, by event
 * delegation: one click listener on the root handles every
 * .telescopic-container inside it.
 *
 * - Click a closed node to expand it
 * - .telescopic-expand opens every node in its container
 * - .telescopic-replay closes them again
 *
 * The old version queried every container and bound three listeners each,
 * re-doing it on every render of the host (NoteBody / PanelCard re-render on
 * music and store updates). Delegation binds one listener, and content that
 * arrives after mount (lazy MDX) needs no rebinding. The effect stays
 * dependency-free because the ref's element can mount after the first render.
 */
export function useTelescopicHandlers(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current
    if (!root) return

    const onClick = (e: Event) => {
      const target = e.target as HTMLElement | null
      const container = target?.closest(".telescopic-container")
      if (!container || !root.contains(container)) return

      if (target!.closest(".telescopic-expand")) {
        container.querySelectorAll(".telescopic-node.closed").forEach((node) => setOpen(node, true))
        return
      }
      if (target!.closest(".telescopic-replay")) {
        container.querySelectorAll(".telescopic-node.open").forEach((node) => setOpen(node, false))
        return
      }
      const node = target!.closest(".telescopic-node")
      if (node?.classList.contains("closed") && target!.closest(".telescopic-content")) {
        // Stop here so the panel link interceptor doesn't also act on it.
        e.stopPropagation()
        setOpen(node, true)
      }
    }

    root.addEventListener("click", onClick)
    return () => root.removeEventListener("click", onClick)
  })
}
