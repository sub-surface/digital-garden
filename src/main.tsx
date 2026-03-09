// Polyfill Buffer for gray-matter (runs in browser)
import { Buffer } from "buffer"
;(globalThis as any).Buffer = Buffer

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"
import { router } from "./router"
import { useStore } from "./store"
import { MusicProvider } from "@/components/ui/MusicContext"
import "./styles/global.scss"

// Apply initial theme before render
const theme = useStore.getState().theme
document.documentElement.setAttribute("data-theme", theme)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MusicProvider>
      <RouterProvider router={router} />
    </MusicProvider>
  </StrictMode>,
)
