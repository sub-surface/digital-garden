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
import { rehypeSidenotes } from "./src/lib/rehype-sidenotes"

export default defineConfig({
  plugins: [
    {
      enforce: 'pre',
      ...mdx({
        remarkPlugins: [
          remarkFrontmatter,
          remarkMdxFrontmatter,
          remarkGfm,
          remarkWikilinks,
          remarkTelescopic,
          remarkCallouts,
        ],
        rehypePlugins: [
          rehypeSlug,
          [rehypeRaw, { passThrough: ['mdxjsEsm', 'mdxJsxFlowElement', 'mdxJsxTextElement'] }],
          rehypeSidenotes,
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
    sourcemap: true,
  },
  publicDir: "public",
})
