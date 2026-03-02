import { useEffect, useRef } from "react"

/**
 * Attaches telescopic text interactivity to a container.
 * Wraps rendered HTML that contains .telescopic-container elements.
 *
 * Handles:
 * - Click to expand individual nodes
 * - Expand all / Collapse all buttons
 */
export function useTelescopicHandlers(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current
    if (!root) return

    const containers = root.querySelectorAll(".telescopic-container")
    const cleanups: (() => void)[] = []

    for (const container of containers) {
      // Click on a closed node to expand it
      const handleClick = (e: Event) => {
        const target = e.target as HTMLElement
        const node = target.closest(".telescopic-node")
        if (!node) return

        if (node.classList.contains("closed")) {
          e.stopPropagation()
          node.classList.remove("closed")
          node.classList.add("open")
        }
      }

      const content = container.querySelector(".telescopic-content")
      if (content) {
        content.addEventListener("click", handleClick)
        cleanups.push(() => content.removeEventListener("click", handleClick))
      }

      // Expand all
      const expandBtn = container.querySelector(".telescopic-expand")
      if (expandBtn) {
        const expandAll = () => {
          container.querySelectorAll(".telescopic-node.closed").forEach((node) => {
            node.classList.remove("closed")
            node.classList.add("open")
          })
        }
        expandBtn.addEventListener("click", expandAll)
        cleanups.push(() => expandBtn.removeEventListener("click", expandAll))
      }

      // Collapse all
      const replayBtn = container.querySelector(".telescopic-replay")
      if (replayBtn) {
        const collapseAll = () => {
          container.querySelectorAll(".telescopic-node.open").forEach((node) => {
            node.classList.remove("open")
            node.classList.add("closed")
          })
        }
        replayBtn.addEventListener("click", collapseAll)
        cleanups.push(() => replayBtn.removeEventListener("click", collapseAll))
      }
    }

    return () => cleanups.forEach((fn) => fn())
  })
}
