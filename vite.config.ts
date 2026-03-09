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

export default defineConfig({
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
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-mdx": ["@mdx-js/react"],
          // d3, pixi.js, flexsearch, chess.js intentionally NOT listed here —
          // they co-bundle with their lazy-loaded pages (GraphView, ChessPage, SearchOverlay)
        },
      },
    },
  },
  publicDir: "public",
})
