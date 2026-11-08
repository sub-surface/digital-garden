
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"
import { router } from "./router"
import { useStore } from "./store"
import { MusicProvider } from "@/components/ui/music/MusicContext"
import { AuthProvider } from "@/hooks/useAuth"
import "./styles/global.scss"

// Apply initial theme before render
const theme = useStore.getState().theme
document.documentElement.setAttribute("data-theme", theme)

// Cache pre-rendered HTML before React mounts so NoteBody can render it instantly without a loading spinner
if (typeof document !== "undefined") {
  const prerenderEl = document.getElementById("prerender-root")
  if (prerenderEl) {
    const slug = prerenderEl.getAttribute("data-prerender-slug")
    const bodyEl = prerenderEl.querySelector(".prerendered-body")
    let seed = null
    try {
      seed = JSON.parse(prerenderEl.querySelector("#prerender-seed")?.textContent || "null")
    } catch {
      // A malformed seed only costs the seamless hand-off, not the page.
    }
    ;(window as any).__PRERENDER_CACHE__ = {
      slug,
      bodyHtml: bodyEl ? bodyEl.innerHTML : "",
      seed,
    }
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <MusicProvider>
        <RouterProvider router={router} />
      </MusicProvider>
    </AuthProvider>
  </StrictMode>,
)
