import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import mdx from "@mdx-js/rollup"
import { resolve } from "path"

import remarkGfm from "remark-gfm"
import remarkFrontmatter from "remark-frontmatter"
import remarkMdxFrontmatter from "remark-mdx-frontmatter"
import rehypeSlug from "rehype-slug"
import rehypeRaw from "rehype-raw"

// Import our custom plugins
import { remarkWikilinks } from "./src/lib/remark-wikilinks"
import { remarkTelescopic } from "./src/lib/remark-telescopic"
import { remarkCallouts } from "./src/lib/remark-callouts"
import { remarkSidenotes } from "./src/lib/remark-sidenotes"
import { rehypeImagePaths } from "./src/lib/rehype-image-paths"

export default defineConfig(({ command }) => ({
  server: {
    proxy: command === "serve" ? {
      "/api": "http://localhost:8787",
    } : undefined,
  },
  plugins: [
    {
      enforce: 'pre',
      ...mdx({
        mdExtensions: [],
        mdxExtensions: ['.md', '.mdx'],
        remarkPlugins: [
          remarkFrontmatter,
          remarkMdxFrontmatter,
          remarkGfm,
          remarkWikilinks,
          remarkTelescopic,
          remarkCallouts,
          remarkSidenotes,
        ],
        rehypePlugins: [
          rehypeSlug,
          [rehypeRaw, { passThrough: ['mdxjsEsm', 'mdxJsxFlowElement', 'mdxJsxTextElement'] }],
          rehypeImagePaths,
        ],
        providerImportSource: "@mdx-js/react",
      })
    },
    react()
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "content": resolve(__dirname, "src/content"),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler",
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        // Function form so heavy vendor deps split out of the main entry chunk
        // regardless of where they're imported. Supabase + flexsearch were leaking
        // into the main `index` chunk via eagerly-loaded auth/search UI (QuickControls,
        // WikiEditButton, SearchOverlay); isolating them keeps the entry chunk lean.
        // d3 / pixi.js / chess.js are NOT listed — they co-bundle with their own
        // lazy-loaded pages (GraphView, ChessPage) and never reach the main chunk.
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react-dom") || id.includes("/react/") || id.includes("scheduler")) return "vendor-react"
            if (id.includes("@supabase") || id.includes("@gotrue") || id.includes("gotrue-js") || id.includes("realtime-js") || id.includes("postgrest-js") || id.includes("storage-js")) return "vendor-supabase"
            if (id.includes("flexsearch")) return "vendor-search"
            if (id.includes("@mdx-js")) return "vendor-mdx"
          }
        },
      },
    },
  },
  publicDir: "public",
}))
