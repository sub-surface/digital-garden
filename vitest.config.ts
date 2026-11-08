import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: { url: "http://localhost/" },
    },
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
    // Agent worktrees (.claude/worktrees/*) are whole second copies of the
    // repo; without this their tests run against their own React copy.
    exclude: ["**/node_modules/**", "**/dist/**", ".claude/**"],
  },
})
