#!/usr/bin/env node
// dash.mjs — Sub-Surface Territories dev dashboard
import { readdirSync } from "fs"
import { execSync, spawnSync, spawn } from "child_process"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { createHash } from "crypto"
import { createConnection } from "net"
import { createInterface } from "readline"
import { createSocket as udpSocket } from "dgram"

if (!process.stdin.isTTY) { console.error("dash needs an interactive terminal"); process.exit(1) }

const ROOT = dirname(fileURLToPath(import.meta.url))
const CONTENT = join(ROOT, "content")
// Project-scoped singleton — hash ROOT to a unique port per project (49152–65535)
const SINGLETON_PORT = 49152 + (parseInt(createHash("md5").update(ROOT).digest("hex").slice(0, 8), 16) % 16383)
const DEV_PORTS = [5173, 3000] // Vite default, then fallback
const WORKER_PORT = 8787

// ── Singleton guard ───────────────────────────────────────────────────
const guard = udpSocket("udp4")
await new Promise((res, rej) => {
  guard.once("error", rej)
  guard.bind(SINGLETON_PORT, "127.0.0.1", () => { guard.removeListener("error", rej); res() })
}).catch(() => { console.error("dash is already running for this project"); process.exit(1) })

// ── ANSI ─────────────────────────────────────────────────────────────
const g = "\x1b[92m", y = "\x1b[33m", c = "\x1b[36m", r = "\x1b[31m"
const bo = "\x1b[1m", d = "\x1b[2m", _ = "\x1b[0m"
const vLen = (s) => s.replace(/\x1b\[[0-9;]*m/g, "").length
const rpad = (s, w) => s + " ".repeat(Math.max(0, w - vLen(s)))

// ── Glorp ─────────────────────────────────────────────────────────────
const GLORP = {
  idle:     [["  ◇ ◇  "," (o o) ","  ◆ ◆  "],["  ◈ ◈  "," (- -) ","  ◇ ◇  "],["  ◇ ◇  "," (~ ~) ","  ◆ ◆  "],["  ◈ ◈  "," (o o) ","  ◆ ◆  "],["  ◇ ◈  "," (o o) ","  ◈ ◇  "],["  ◆ ◆  "," (o o) ","  ◇ ◇  "],["  ◈ ◈  "," (^ ^) ","  ◇ ◇  "]],
  thinking: [["  · ·  "," (· ·) ","  ∿ ∿  "],["  ∿ ∿  "," (~ ~) ","  · ·  "],["  · ·  "," (∞ ∞) ","  ∿ ∿  "],["  ∿ ∿  "," (· ·) ","  · ·  "]],
  happy:    [["  ✦ ✦  "," (O O) ","  ◈ ◈  "],["  ⋆ ⋆  "," (^ ^) ","  ◆ ◆  "],["  ◆ ✦  "," (* *) ","  ✦ ◆  "],["  ✦ ⋆  "," (o o) ","  ⋆ ✦  "]],
  busy:     [["  ⚙ ⚙  "," (> <) ","  ⚙ ⚙  "],["  ⚙ ⚙  "," (< >) ","  ⚙ ⚙  "],["  ◌ ◌  "," (→ ←) ","  ◌ ◌  "]],
}

const QUIPS = [
  "the garden grows...","thinking in public...","all paths lead somewhere",
  "sub-surface signals detected","the vectors drift on...","tending to the bookshelf...",
  "i can hear the noise field","the nodes whisper back","each link is a thread",
  "have you watered your notes?","another day, another node","deploy when ready, captain",
  "* happy alien noises *","systems nominal","the glorp is satisfied",
  "vibes are immaculate","praise the void.save()","each node is a seedling",
  "silence in the signal","the garden knows itself","growth happens quietly",
  "the glorp dreams of better code","chaos gradually becomes order",
]

// ── State ─────────────────────────────────────────────────────────────
let serverUp = false, serverPort = null
let frame = 0, quipIdx = Math.floor(Math.random() * QUIPS.length)
let msg = "", paused = false, animState = "idle"
let devProc = null // tracked child process

// ── Helpers ───────────────────────────────────────────────────────────
function countMd(sub) {
  try { return readdirSync(join(CONTENT, sub)).filter(f => f.endsWith(".md")).length } catch { return 0 }
}

function getStats() {
  let notes = 0
  try { notes = readdirSync(CONTENT).filter(f => f.endsWith(".md")).length } catch {}
  let branch = "?", clean = true
  try {
    branch = execSync("git branch --show-current", { cwd: ROOT, encoding: "utf8" }).trim()
    clean = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim() === ""
  } catch {}
  return { notes, books: countMd("Books"), movies: countMd("Movies"), music: countMd("Music"), branch, clean }
}

function checkPort(port) {
  // Try both IPv4 and IPv6 localhost — Vite on Windows may bind to either
  const hosts = ["127.0.0.1", "::1"]
  return Promise.any(
    hosts.map(host => new Promise((ok, fail) => {
      const s = createConnection({ port, host })
      s.on("connect", () => { s.destroy(); ok(port) })
      s.on("error", () => fail())
      setTimeout(() => { s.destroy(); fail() }, 500)
    }))
  ).catch(() => null)
}

async function checkServer() {
  const results = await Promise.all(DEV_PORTS.map(checkPort))
  return results.find(p => p !== null) ?? null
}

/** Kill a process tree on Windows by PID (taskkill /T = tree) */
function killTree(pid) {
  // pid is always an integer from process.pid or parsed from netstat — safe
  try { spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" }) } catch {}
}

/** Kill any process listening on a given port (fallback for orphans) */
function killPort(port) {
  try {
    const out = execSync(`netstat -ano`, { encoding: "utf8" })
    const pids = new Set()
    for (const line of out.split("\n")) {
      // Match lines like "  TCP    0.0.0.0:5173    ...    LISTENING    12345"
      if (line.includes("LISTENING") && line.includes(`:${port} `)) {
        const pid = line.trim().split(/\s+/).pop()
        if (pid && pid !== "0" && /^\d+$/.test(pid)) pids.add(parseInt(pid))
      }
    }
    for (const pid of pids) killTree(pid)
  } catch {}
}

// ── Render ────────────────────────────────────────────────────────────
let st = getStats()
const W = 50, hr = "─".repeat(W)
const row = (s) => `│ ${rpad(s, W - 2)} │`

function render() {
  const frames = GLORP[animState] ?? GLORP.idle
  const f = frames[frame % frames.length]
  const serverStr = serverUp
    ? `${g}● :${serverPort}${_}`
    : `${d}○ offline${_}`

  const out = [
    `╭${hr}╮`,
    row(`${bo}SUB-SURFACE${_}  ${d}dashboard · ${animState}${_}`),
    `├${hr}┤`,
    row(""),
    row(`${g}${f[0]}${_}  ${d}"${QUIPS[quipIdx]}"${_}`),
    row(`${g}${f[1]}${_}`),
    row(`${g}${f[2]}${_}`),
    row(""),
    `├${hr}┤`,
    row(`${c}${st.notes}${_} notes · ${c}${st.books}${_} books · ${c}${st.movies}${_} films · ${c}${st.music}${_} tracks`),
    row(`branch: ${y}${st.branch}${_}  ·  ${st.clean ? `${g}clean${_}` : `${r}dirty${_}`}`),
    row(`server: ${serverStr}`),
    `├${hr}┤`,
    row(`[${bo}s${_}] sync  [${bo}c${_}] commit  [${bo}b${_}] build  [${bo}r${_}] serve`),
    row(`[${bo}k${_}] kill  [${bo}g${_}] git st  [${d}q${_}] quit`),
    `╰${hr}╯`,
  ]
  if (msg) out.push("", ` ${msg}`)
  process.stdout.write("\x1b[H\x1b[2J" + out.join("\n") + "\n")
}

// ── Refresh ───────────────────────────────────────────────────────────
async function refresh() {
  serverPort = await checkServer()
  serverUp = serverPort !== null
  st = getStats()
  animState = serverUp ? (st.clean ? "happy" : "thinking") : (st.clean ? "idle" : "thinking")
  frame = 0
  render()
}

// ── Commands ──────────────────────────────────────────────────────────
async function shell(cmd, label) {
  paused = true
  process.stdout.write("\x1b[?1049l")
  process.stdin.setRawMode(false)
  console.log(`\n${g}▸ ${label}${_}\n`)
  try { execSync(cmd, { cwd: ROOT, stdio: "inherit" }) }
  catch { console.log(`\n${r}exited with error${_}`) }
  console.log(`\n${d}press any key to return...${_}`)
  await new Promise(res => { process.stdin.setRawMode(true); process.stdin.once("data", res) })
  process.stdout.write("\x1b[?1049h")
  paused = false
  await refresh()
}

async function commit() {
  paused = true
  process.stdout.write("\x1b[?1049l")
  process.stdin.setRawMode(false)
  console.log(`\n${g}▸ crafting narrative...${_}\n`)
  try { execSync("git status --short", { cwd: ROOT, stdio: "inherit" }) } catch {}
  console.log("")
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const message = await new Promise(res => rl.question(`${y}commit message (empty to cancel): ${_}`, ans => { rl.close(); res(ans.trim()) }))
  if (!message) {
    console.log(`\n${d}cancelled${_}`)
  } else {
    try {
      execSync("git add .", { cwd: ROOT, stdio: "inherit" })
      spawnSync("git", ["commit", "-m", message], { cwd: ROOT, stdio: "inherit" })
      execSync("git push origin main", { cwd: ROOT, stdio: "inherit" })
      console.log(`\n${g}▸ pushed to origin/main${_}`)
    } catch { console.log(`\n${r}failed${_}`) }
  }
  console.log(`\n${d}press any key to return...${_}`)
  await new Promise(res => { process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.once("data", res) })
  process.stdout.write("\x1b[?1049h")
  paused = false
  await refresh()
}

function serve() {
  if (serverUp) { msg = `${y}▸ server already running on :${serverPort}${_}`; render(); return }
  animState = "busy"
  // Spawn as tracked child — NOT detached, so it dies when dash dies
  devProc = spawn("npm", ["run", "dev"], { cwd: ROOT, stdio: "ignore", shell: true, windowsHide: true })
  devProc.on("exit", () => { devProc = null })
  msg = `${g}▸ weaving the garden...${_}`
  render()
  setTimeout(refresh, 6000)
}

async function killServer() {
  msg = `${d}▸ dimming the lights...${_}`
  render()

  // 1. Kill tracked child process tree
  if (devProc && devProc.pid) {
    killTree(devProc.pid)
    devProc = null
  }

  // 2. Sweep known ports for any orphans (from previous sessions or external starts)
  for (const port of [...DEV_PORTS, WORKER_PORT]) {
    killPort(port)
  }

  serverUp = false; serverPort = null; animState = "idle"
  msg = `${r}▸ the garden sleeps${_}`
  render()
}

let cleaned = false
function cleanup() {
  if (cleaned) return
  cleaned = true
  if (devProc && devProc.pid) killTree(devProc.pid)
  try { guard.close() } catch {}
  process.stdout.write("\x1b[?1049l")
}

// ── Main ──────────────────────────────────────────────────────────────
process.stdout.write("\x1b[?1049h")
process.stdin.setRawMode(true)
process.stdin.resume()
await refresh()

setInterval(() => {
  if (paused) return
  const frames = GLORP[animState] ?? GLORP.idle
  frame = (frame + 1) % frames.length
  if (frame === 0) quipIdx = Math.floor(Math.random() * QUIPS.length)
  render()
}, 900)

setInterval(async () => {
  if (paused) return
  const port = await checkServer()
  const up = port !== null
  if (up !== serverUp || port !== serverPort) { serverPort = port; serverUp = up; st = getStats(); render() }
}, 6000)

// Clean up on any exit path — kill child server when dash dies
process.on("exit", cleanup)
process.on("SIGINT", () => { cleanup(); process.exit(0) })
process.on("SIGTERM", () => { cleanup(); process.exit(0) })

process.stdin.on("data", async key => {
  const k = key.toString()
  if (k === "q" || k === "\x03") {
    cleanup()
    process.stdin.setRawMode(false)
    process.exit(0)
  }
  if (paused) return
  msg = ""
  switch (k) {
    case "s": await shell("git pull origin main", "syncing..."); break
    case "c": await commit(); break
    case "r": serve(); break
    case "k": await killServer(); break
    case "b": await shell("npm run build", "weaving the garden..."); break
    case "g": await shell("git status", "checking the ledger..."); break
  }
})
