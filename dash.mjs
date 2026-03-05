#!/usr/bin/env node
// dash.mjs — Sub-Surface Territories dev dashboard
import { readdirSync } from "fs"
import { execSync, spawnSync, spawn } from "child_process"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { createConnection } from "net"
import { createInterface } from "readline"

if (!process.stdin.isTTY) { console.error("dash.mjs needs an interactive terminal"); process.exit(1) }
const ROOT = dirname(fileURLToPath(import.meta.url))
const CONTENT = join(ROOT, "content")

// ── ANSI ─────────────────────────────────────────────────────────────
const g = "\x1b[92m", y = "\x1b[33m", c = "\x1b[36m", red = "\x1b[31m"
const bo = "\x1b[1m", d = "\x1b[2m", _ = "\x1b[0m"
const vLen = (s) => s.replace(/\x1b\[[0-9;]*m/g, "").length
const rpad = (s, w) => s + " ".repeat(Math.max(0, w - vLen(s)))

// ── The Glorp ────────────────────────────────────────────────────────
// idle frames: contemplative glorp — serene observer
const FRAMES_IDLE = [
  ["  ◇ ◇  ", " (o o) ", "  ◆ ◆  "],
  ["  ◈ ◈  ", " (- -) ", "  ◇ ◇  "],
  ["  ◇ ◇  ", " (~ ~) ", "  ◆ ◆  "],
  ["  ◈ ◈  ", " (o o) ", "  ◆ ◆  "],
  ["  ◇ ◈  ", " (o o) ", "  ◈ ◇  "],
  ["  ◆ ◆  ", " (o o) ", "  ◇ ◇  "],
  ["  ◇ ◇  ", " (o o) ", "  ◆ ◆  "],
  ["  ◈ ◈  ", " (^ ^) ", "  ◇ ◇  "],
]

// thinking frames: contemplative, processing deep thoughts
const FRAMES_THINKING = [
  ["  · ·  ", " (· ·) ", "  ∿ ∿  "],
  ["  ∿ ∿  ", " (~ ~) ", "  · ·  "],
  ["  · ·  ", " (∞ ∞) ", "  ∿ ∿  "],
  ["  ∿ ∿  ", " (· ·) ", "  · ·  "],
  ["  · ·  ", " (~ ~) ", "  ∿ ∿  "],
]

// happy frames: celebrating, joyful success
const FRAMES_HAPPY = [
  ["  ✦ ✦  ", " (O O) ", "  ◈ ◈  "],
  ["  ⋆ ⋆  ", " (^ ^) ", "  ◆ ◆  "],
  ["  ◆ ✦  ", " (* *) ", "  ✦ ◆  "],
  ["  ✦ ⋆  ", " (o o) ", "  ⋆ ✦  "],
]

// busy frames: active processing, churning thoughtfully
const FRAMES_BUSY = [
  ["  ⚙ ⚙  ", " (> <) ", "  ⚙ ⚙  "],
  ["  ⚙ ⚙  ", " (< >) ", "  ⚙ ⚙  "],
  ["  ⚙ ⚙  ", " (> <) ", "  ⚙ ⚙  "],
  ["  ◌ ◌  ", " (→ ←) ", "  ◌ ◌  "],
]

const QUIPS = [
  // philosophical & poetic
  "the garden grows...",
  "thinking in public...",
  "all paths lead somewhere",
  "sub-surface signals detected",
  "the vectors drift on...",
  "tending to the bookshelf...",
  "i can hear the noise field",
  "the nodes whisper back",
  "unfolding the deep structure",
  "each link is a thread",
  "knowledge blooms in silence",
  
  // silly & playful
  "have you watered your notes?",
  "another day, another node",
  "deploy when ready, captain",
  "* happy alien noises *",
  "systems nominal",
  "beep boop—notes deployed",
  "the glorp is satisfied",
  "vibes are immaculate",
  "we are the music makers",
  "chaos gradually becomes order",
  "praise the void.save()",
  
  // zen & garden
  "each node is a seedling",
  "silence in the signal",
  "the garden knows itself",
  "growth happens quietly",
  "tend the intellectual soil",
  "patterns emerge from chaos",
  "the web remembers",
  "thoughts take root here",
  "in the margins, meaning grows",
  "the glorp dreams of better code",
]

// ── State ────────────────────────────────────────────────────────────
let serverUp = false
let frame = 0
let quipIdx = Math.floor(Math.random() * QUIPS.length)
let msg = ""
let paused = false
let animState = "idle" // idle, thinking, happy, busy
// ── Helpers ──────────────────────────────────────────────────────────
function countMd(sub) {
  try { return readdirSync(join(CONTENT, sub)).filter((f) => f.endsWith(".md")).length }
  catch { return 0 }
}

function getStats() {
  let notes = 0
  try { notes = readdirSync(CONTENT).filter((f) => f.endsWith(".md")).length } catch {}
  const books = countMd("Books"), movies = countMd("Movies"), music = countMd("Music")
  let branch = "?", clean = true
  try {
    branch = execSync("git branch --show-current", { cwd: ROOT, encoding: "utf8" }).trim()
    clean = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim() === ""
  } catch {}
  return { notes, books, movies, music, branch, clean }
}

function checkPort(port) {
  return new Promise((ok) => {
    const s = createConnection({ port, host: "127.0.0.1" })
    s.on("connect", () => { s.destroy(); ok(true) })
    s.on("error", () => ok(false))
    setTimeout(() => { s.destroy(); ok(false) }, 300)
  })
}

// ── Render ───────────────────────────────────────────────────────────
let st = getStats()

function render() {
  const W = 50, hr = "─".repeat(W)
  const row = (s) => `│ ${rpad(s, W - 2)} │`
  
  // select frame set based on animation state
  let frameSet = FRAMES_IDLE
  if (animState === "thinking") frameSet = FRAMES_THINKING
  else if (animState === "happy") frameSet = FRAMES_HAPPY
  else if (animState === "busy") frameSet = FRAMES_BUSY
  
  const f = frameSet[frame % frameSet.length]
  const q = QUIPS[quipIdx]
  
  // state label
  const stateLabel = `${d}[${animState}]${_}`
  const titleLine = `${bo}SUB-SURFACE TERRITORIES${_}  ·  dashboard${d}${"-".repeat(Math.max(0, W - 35 - vLen(animState) - 2))}${stateLabel}`

  const out = [
    `╭${hr}╮`,
    row(titleLine),
    `├${hr}┤`,
    row(""),
    row(`${g}${f[0]}${_}  ${d}"${q}"${_}`),
    row(`${g}${f[1]}${_}`),
    row(`${g}${f[2]}${_}`),
    row(""),
    `├${hr}┤`,
    row(`${c}${st.notes}${_} notes · ${c}${st.books}${_} books · ${c}${st.movies}${_} films · ${c}${st.music}${_} tracks`),
    row(`branch: ${y}${st.branch}${_} · ${st.clean ? `${g}clean${_}` : `${red}dirty${_}`}`),
    row(`server: ${serverUp ? `${g}● :3000${_}` : `${d}○ offline${_}`}`),
    `├${hr}┤`,
    row(`[${bo}s${_}] sync    [${bo}c${_}] commit  [${bo}r${_}] serve`),
    row(`[${bo}b${_}] build   [${bo}k${_}] kill    [${bo}g${_}] git st`),
    row(`${d}[q] quit${_}`),
    `╰${hr}╯`,
  ]
  if (msg) out.push("", ` ${msg}`)
  process.stdout.write("\x1b[H\x1b[2J" + out.join("\n") + "\n")
}

// ── Refresh stats + port ─────────────────────────────────────────────
async function refresh() {
  const wasUp = serverUp
  serverUp = await checkPort(3000)
  st = getStats()
  
  // set animation state based on status
  if (serverUp) {
    animState = st.clean ? "happy" : "thinking"
  } else {
    animState = st.clean ? "idle" : "thinking"
  }
  frame = 0 // reset animation on state change
  render()
}

// ── Commands ─────────────────────────────────────────────────────────
async function shell(cmd, label) {
  paused = true
  animState = "busy"
  process.stdout.write("\x1b[?1049l")
  process.stdin.setRawMode(false)
  console.log(`\n${g}▸ ${label}${_}\n`)
  try { execSync(cmd, { cwd: ROOT, stdio: "inherit" }) }
  catch { console.log(`\n${red}exited with error${_}`) }
  console.log(`\n${d}press any key to return...${_}`)
  await new Promise((r) => { process.stdin.setRawMode(true); process.stdin.once("data", r) })
  process.stdout.write("\x1b[?1049h")
  paused = false
  await refresh()
}

async function commit() {
  paused = true
  animState = "busy"
  process.stdout.write("\x1b[?1049l")
  process.stdin.setRawMode(false)
  console.log(`\n${g}▸ ✦ Crafting narrative...${_}\n`)
  try { execSync("git status --short", { cwd: ROOT, stdio: "inherit" }) } catch {}
  console.log("")
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const message = await new Promise((resolve) => {
    rl.question(`${y}commit message (empty to cancel): ${_}`, (ans) => {
      rl.close()
      resolve(ans.trim())
    })
  })
  if (!message) {
    console.log(`\n${d}cancelled${_}`)
  } else {
    try {
      execSync("git add .", { cwd: ROOT, stdio: "inherit" })
      spawnSync("git", ["commit", "-m", message], { cwd: ROOT, stdio: "inherit" })
      execSync("git push origin main", { cwd: ROOT, stdio: "inherit" })
      console.log(`\n${g}▸ pushed to origin/main${_}`)
    } catch { console.log(`\n${red}failed${_}`) }
  }
  console.log(`\n${d}press any key to return...${_}`)
  await new Promise((r) => { process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.once("data", r) })
  process.stdout.write("\x1b[?1049h")
  paused = false
  await refresh()
}

function serve() {
  if (serverUp) { msg = `${y}▸ server already running${_}`; return }
  animState = "busy"
  spawn("npm", ["run", "dev"], {
    cwd: ROOT, detached: true, stdio: "ignore", shell: true, windowsHide: true,
  }).unref()
  msg = `${g}▸ ◈ weaving the garden...${_}`
  setTimeout(refresh, 5000)
}

async function kill() {
  animState = "busy"
  msg = `${d}▸ dimming the lights...${_}`
  render()
  try { execSync("npx kill-port 3000", { cwd: ROOT, stdio: "ignore" }) } catch {}
  serverUp = false
  animState = "idle"
  msg = `${red}▸ the garden sleeps${_}`
}

// ── Main ─────────────────────────────────────────────────────────────
process.stdout.write("\x1b[?1049h")
process.stdin.setRawMode(true)
process.stdin.resume()
await refresh()

// Animate the glorp
const tick = setInterval(() => {
  if (paused) return
  const currentFrameSet = animState === "thinking" ? FRAMES_THINKING : animState === "happy" ? FRAMES_HAPPY : animState === "busy" ? FRAMES_BUSY : FRAMES_IDLE
  frame = (frame + 1) % currentFrameSet.length
  if (frame === 0) quipIdx = Math.floor(Math.random() * QUIPS.length)
  render()
}, 1000)

// Periodic server check
setInterval(async () => {
  if (paused) return
  const up = await checkPort(5173) || await checkPort(3000)
  if (up !== serverUp) { serverUp = up; render() }
}, 8000)

// Keypress handler
process.stdin.on("data", async (key) => {
  const k = key.toString()
  if (k === "q" || k === "\x03") {
    clearInterval(tick)
    process.stdout.write("\x1b[?1049l")
    process.stdin.setRawMode(false)
    process.exit(0)
  }
  if (paused) return
  msg = ""
  switch (k) {
    case "s": await shell("git pull origin main", "⛩ Crossing to the other side..."); break
    case "c": await commit(); break
    case "r": serve(); render(); break
    case "k": await kill(); render(); break
    case "b": await shell("npm run build", "◈ Weaving the garden..."); break
    case "g": await shell("git status", "📖 Checking the ledger..."); break
  }
})
