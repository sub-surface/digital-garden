import { spawn } from "node:child_process"

const isOs = process.argv.includes("--os")

const procs = [
  { name: "worker", cmd: "npx wrangler dev --config wrangler.dev.toml --port 8787", color: "\x1b[35m" },
  { name: isOs ? "os" : "vite", cmd: isOs ? "npx vite --mode os" : "npx vite", color: "\x1b[36m" },
  { name: "watch", cmd: "npx nodemon --watch content -e md,mdx,yaml --exec \"npm run prebuild\"", color: "\x1b[33m" },
]

const reset = "\x1b[0m"
const children = []

function cleanup() {
  for (const child of children) {
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", child.pid.toString(), "/f", "/t"], { stdio: "ignore" })
      } else {
        child.kill("SIGTERM")
      }
    } catch {}
  }
  process.exit(0)
}

process.on("SIGINT", cleanup)
process.on("SIGTERM", cleanup)
process.on("exit", cleanup)

for (const { name, cmd, color } of procs) {
  const child = spawn(cmd, { shell: true, stdio: ["inherit", "pipe", "pipe"] })
  children.push(child)

  const prefix = `${color}[${name}]${reset} `

  child.stdout?.on("data", (data) => {
    process.stdout.write(data.toString().replace(/^/gm, prefix))
  })

  child.stderr?.on("data", (data) => {
    process.stderr.write(data.toString().replace(/^/gm, prefix))
  })

  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`${prefix}exited with code ${code}`)
    }
  })
}
