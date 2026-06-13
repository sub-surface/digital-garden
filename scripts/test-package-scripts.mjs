import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"))
const scripts = pkg.scripts ?? {}

assert.equal(
  scripts.build,
  "tsc --noEmit && vite build",
  "build should rely on npm's prebuild lifecycle instead of invoking prebuild manually",
)

assert.equal(
  scripts["typecheck:worker"],
  "tsc -p tsconfig.worker.json",
  "typecheck:worker should typecheck the Cloudflare Worker entry point",
)

assert.match(
  scripts.check ?? "",
  /npm run typecheck:worker/,
  "check should include Worker typechecking",
)

assert.match(
  scripts.check ?? "",
  /npm run build/,
  "check should include the full production build",
)

console.log("Package verification scripts cover build and Worker typecheck.")
