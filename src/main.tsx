// Polyfill Buffer for gray-matter (runs in browser)
import { Buffer } from "buffer"
;(globalThis as any).Buffer = Buffer

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"
import { router } from "./router"
import { useStore } from "./store"
import "./styles/global.scss"

// Apply initial theme before render
const theme = useStore.getState().theme
document.documentElement.setAttribute("data-theme", theme)

// Load content index on startup
fetch("/content-index.json")
  .then((r) => r.json())
  .then((index) => useStore.getState().setContentIndex(index))
  .catch(() => console.warn("Content index not found — run prebuild first"))

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
