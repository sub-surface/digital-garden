import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import mdx from "@mdx-js/rollup"
import { resolve, join } from "path"
import { execSync } from "child_process"
import { readFileSync, existsSync } from "fs"

// Resolve the commit the bundle is built from, for the footer/clock build stamp.
// Precedence: CI-provided SHA (CF sets these) → `git rev-parse` → reading .git directly
// → "dev". The .git read is a PATH-independent fallback (git isn't always on PATH for the
// spawned build process, e.g. some Windows shells) so local dev still shows a real SHA.
function resolveCommitSha(): string {
  const ci =
    process.env.WORKERS_CI_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.GITHUB_SHA
  if (ci) return ci

  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim()
  } catch {
    // fall through to reading .git
  }

  try {
    const gitDir = resolve(__dirname, ".git")
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim()
    const refMatch = head.match(/^ref:\s*(.+)$/)
    if (!refMatch) return head // detached HEAD: HEAD is the SHA itself
    const ref = refMatch[1]
    const refPath = join(gitDir, ref)
    if (existsSync(refPath)) return readFileSync(refPath, "utf8").trim()
    // packed refs fallback
    const packed = readFileSync(join(gitDir, "packed-refs"), "utf8")
    const line = packed.split("\n").find((l) => l.endsWith(" " + ref))
    if (line) return line.split(" ")[0]
  } catch {
    // fall through to "dev"
  }

  return "dev"
}

const COMMIT_SHA = resolveCommitSha()

import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import remarkFrontmatter from "remark-frontmatter"
import remarkMdxFrontmatter from "remark-mdx-frontmatter"
import rehypeKatex from "rehype-katex"
import rehypeSlug from "rehype-slug"
import rehypeRaw from "rehype-raw"

// Import our custom plugins
import { remarkWikilinks } from "./src/lib/remark-wikilinks"
import { remarkTelescopic } from "./src/lib/remark-telescopic"
import { remarkCallouts } from "./src/lib/remark-callouts"
import { remarkSidenotes } from "./src/lib/remark-sidenotes"
import { rehypeImagePaths } from "./src/lib/rehype-image-paths"

export default defineConfig(({ command }) => ({
  define: {
    __COMMIT_SHA__: JSON.stringify(COMMIT_SHA.slice(0, 7)),
    __COMMIT_SHA_FULL__: JSON.stringify(COMMIT_SHA),
  },
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
          remarkMath,
          remarkWikilinks,
          remarkTelescopic,
          remarkCallouts,
          remarkSidenotes,
        ],
        rehypePlugins: [
          rehypeSlug,
          [rehypeRaw, { passThrough: ['mdxjsEsm', 'mdxJsxFlowElement', 'mdxJsxTextElement'] }],
          rehypeKatex,
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
        // Make the compile-time breakpoint variables available in EVERY .scss
        // file, including component `.module.scss` files (ROADMAP §28.4). Without
        // this, `$bp-phone` was only reachable from the handful of stylesheets
        // pulled into global.scss, so ~36 component-module breakpoints were bare
        // `800px` / `560px` literals and the named-breakpoint convention in
        // src/config/breakpoints.ts was unfollowable where it mattered most.
        //
        // Injecting is only safe because `_breakpoints.scss` emits no CSS — @use
        // of a variables-only module is free and idempotent. Never point this at
        // tokens.scss (it emits ~100 lines of `:root` properties, which would be
        // cloned into every module) and never add output to the partial.
        //
        // Function form so the partial does not @use itself, which would be a
        // circular import. Absolute POSIX path so the injected @use resolves the
        // same from any nesting depth.
        additionalData: (source: string, filename: string) => {
          if (filename.replace(/\\/g, "/").endsWith("src/styles/_breakpoints.scss")) return source
          const partial = resolve(__dirname, "src/styles/_breakpoints.scss").replace(/\\/g, "/")
          return `@use "${partial}" as *;\n${source}`
        },
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        // Function form so heavy vendor deps split out of the main entry chunk
        // regardless of where they're imported. Keep Supabase in its own lazy dependency
        // chunk for wiki/chat auth paths. FlexSearch is intentionally not forced into a
        // manual chunk: SearchOverlay imports it dynamically so search stays off the
        // initial preload graph.
        // d3 / pixi.js / chess.js are NOT listed — they co-bundle with their own
        // lazy-loaded pages (GraphView, ChessPage) and never reach the main chunk.
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react-dom") || id.includes("/react/") || id.includes("scheduler")) return "vendor-react"
            if (id.includes("@supabase") || id.includes("@gotrue") || id.includes("gotrue-js") || id.includes("realtime-js") || id.includes("postgrest-js") || id.includes("storage-js")) return "vendor-supabase"
            if (id.includes("@mdx-js")) return "vendor-mdx"
          }
        },
      },
    },
  },
  publicDir: "public",
}))
