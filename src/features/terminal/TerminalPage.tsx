/**
 * The terminal's main-site surface: /terminal, fullscreen.
 *
 * The only thing this adds over <Terminal> is the bridge: `open` routes
 * in-app here, where in the OS the same call opens a window.
 */

import { useCallback } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Terminal } from "./Terminal"

export function TerminalPage() {
  const navigate = useNavigate()

  const onOpen = useCallback(
    (slug: string) => {
      // Same shape QuickControls uses for the catch-all note route.
      navigate({ to: "/$", params: { _splat: slug } as any })
    },
    [navigate],
  )

  return (
    <Terminal
      surface="page"
      onOpen={onOpen}
      header={
        <>
          <a href="/">subsurfaces.net</a>
          <a href="https://os.subsurfaces.net">os</a>
        </>
      }
    />
  )
}
