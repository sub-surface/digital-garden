/**
 * Glorp: the garden's resident alien. One definition of its faces, moods and
 * words, shared by the homepage avatar, the OS pet, the prompt's `glorp`
 * command and its occasional visits around the site (GlorpPeek).
 *
 * Each frame is [antennae, face, body].
 */

/** Glorp green, the same in every theme. */
export const GLORP_GREEN = "#42b464"

export const MOODS = {
  idle: [
    ["  ◇ ◇  ", " (o o) ", "  ◆ ◆  "],
    ["  ◈ ◈  ", " (- -) ", "  ◇ ◇  "],
    ["  ◇ ◇  ", " (~ ~) ", "  ◆ ◆  "],
    ["  ◈ ◈  ", " (o o) ", "  ◆ ◆  "],
    ["  ◇ ◈  ", " (o o) ", "  ◈ ◇  "],
    ["  ◆ ◆  ", " (o o) ", "  ◇ ◇  "],
    ["  ◈ ◈  ", " (^ ^) ", "  ◇ ◇  "],
    ["  ◇ ◇  ", " (· ·) ", "  ◈ ◈  "],
    ["  ◆ ◇  ", " (o o) ", "  ◇ ◆  "],
    ["  ◇ ◇  ", " (o -) ", "  ◆ ◆  "],
    ["  ◈ ◇  ", " (- o) ", "  ◇ ◈  "],
  ],
  happy: [
    ["  ✦ ✦  ", " (O O) ", "  ◈ ◈  "],
    ["  ⋆ ⋆  ", " (^ ^) ", "  ◆ ◆  "],
    ["  ◆ ✦  ", " (* *) ", "  ✦ ◆  "],
    ["  ✦ ⋆  ", " (o o) ", "  ⋆ ✦  "],
    ["  ✦ ✦  ", " (≧◡≦)", "  ◈ ◈  "],
    ["  ⋆ ✦  ", " (^o^) ", "  ✦ ⋆  "],
    ["  ◈ ✦  ", " (>_<) ", "  ✦ ◈  "],
  ],
  thinking: [
    ["  · ·  " , " (· ·) ", "  ∿ ∿  "],
    ["  ∿ ∿  " , " (~ ~) ", "  · ·  "],
    ["  · ·  " , " (∞ ∞) ", "  ∿ ∿  "],
    ["  ∿ ∿  " , " (· ·) ", "  · ·  "],
    ["  ∿ ·  " , " (? ?) ", "  · ∿  "],
    ["  · ·  " , " (o ~) ", "  ∿ ∿  "],
    ["  ∿ ∿  " , " (~ o) ", "  · ·  "],
  ],
  sleepy: [
    ["  ◇ ◇  ", " (- -) ", "  ◇ ◇  "],
    ["  ◇ ◇  ", " (= =) ", "  ◆ ◆  "],
    ["  · ·  " , " (-_-) ", "  · ·  "],
    ["  ◇ ◇  ", " (u u) ", "  ◇ ◇  "],
    ["  · ·  " , " (z z) ", "  · ·  "],
    ["  ◆ ◆  ", " (-.-) ", "  ◆ ◆  "],
  ],
  curious: [
    ["  ◈ ◇  ", " (o ?) ", "  ◆ ◈  "],
    ["  ◇ ◈  ", " (? o) ", "  ◈ ◆  "],
    ["  ◆ ◆  ", " (O o) ", "  ◇ ◇  "],
    ["  ◈ ◈  ", " (o O) ", "  ◆ ◆  "],
    ["  ✦ ◇  ", " (^ ?) ", "  ◈ ◆  "],
    ["  ◇ ✦  ", " (? ^) ", "  ◆ ◈  "],
  ],
  excited: [
    ["  ✦ ✦  ", " (!_!) ", "  ✦ ✦  "],
    ["  ⋆ ⋆  ", " (★ ★) ", "  ⋆ ⋆  "],
    ["  ✦ ⋆  ", " (! !) ", "  ⋆ ✦  "],
    ["  ◈ ✦  ", " (>o<) ", "  ✦ ◈  "],
    ["  ✦ ✦  ", " (*_*) ", "  ✦ ✦  "],
  ],
  spooked: [
    ["  ◇ ◇  ", " (o_o) ", "  ◇ ◇  "],
    ["  · ·  " , " (O_O) ", "  · ·  "],
    ["  ◈ ◈  ", " (◉_◉)", "  ◈ ◈  "],
    ["  ◇ ◇  ", " (°_°) ", "  ◇ ◇  "],
  ],
  // The OS pet's needs (Petri), drawn as glorp.
  hungry: [
    ["  ◇ ◇  ", " (o o) ", "  ◇ ◇  "],
    ["  ◇ ◇  ", " (o ﹏o)", "  ◇ ◇  "],
    ["  · ·  ", " (° °) ", "  ◇ ◇  "],
  ],
  lonely: [
    ["  · ·  ", " (. .) ", "  ◇ ◇  "],
    ["  · ·  ", " (._.) ", "  · ·  "],
    ["  ◇ ·  ", " (. .) ", "  · ◇  "],
  ],
  grubby: [
    ["  ◇ ◇  ", " (o o) ", "  ░ ░  "],
    ["  ◈ ◇  ", " (- o) ", "  ▒ ░  "],
    ["  ◇ ◇  ", " (o o) ", "  ░ ▒  "],
  ],
  dancing: [
    ["  ♪ ◇  ", " (^ ^) ", " ◆   ◆ "],
    ["  ◇ ♫  ", " (^o^) ", "  ◆ ◆  "],
    ["  ♫ ♪  ", " (> <) ", "◆     ◆"],
    ["  ◇ ◇  ", " (^ ^) ", "  ◆ ◆  "],
  ],
} as const

export type Mood = keyof typeof MOODS

// Weighted mood selection — idle is most common
const MOOD_WEIGHTS: [Mood, number][] = [
  ["idle",     45],
  ["happy",    20],
  ["thinking", 15],
  ["sleepy",   10],
  ["curious",  10],
  ["excited",   7],
  ["spooked",   3],
]

export const QUIPS: Record<Mood, string[]> = {
  idle: [
    "the garden grows...",
    "thinking in public...",
    "all paths lead somewhere",
    "sub-surface signals detected",
    "the vectors drift on...",
    "tending to the bookshelf...",
    "i can hear the noise field",
    "the nodes whisper back",
    "each link is a thread",
    "have you watered your notes?",
    "another day, another node",
    "systems nominal",
    "silence in the signal",
    "the garden knows itself",
    "growth happens quietly",
    "chaos gradually becomes order",
    "each node is a seedling",
  ],
  happy: [
    "* happy alien noises *",
    "the glorp is satisfied",
    "vibes are immaculate",
    "praise the void.save()",
    "glad you're here",
    "something good is happening",
    "the signal is clear today",
    "✦ optimal conditions ✦",
  ],
  thinking: [
    "processing the void...",
    "computing the ineffable...",
    "have you considered quasars?",
    "what is light, really?",
    "the glorp dreams of better code",
    "running inference on existence",
    "philosophical.exe is loading",
    "i wonder about things",
  ],
  sleepy: [
    "the glorp needs tea",
    "low power mode...",
    "resting between transmissions",
    "* distant alien snoring *",
    "z z z . . .",
    "dreaming of graph theory",
  ],
  curious: [
    "what's over there?",
    "have you clicked everything?",
    "the graph has secrets",
    "follow the links...",
    "something is connected to this",
    "i noticed something",
    "explore the margins",
  ],
  excited: [
    "new note detected!!",
    "the garden is growing!",
    "a connection has been made!",
    "signal strength: maximum",
    "* glorp excitement noises *",
  ],
  hungry: ["could a crumb fall in here by coincidence?", "my tummy is a small void", "is that a crumb? no. sadly."],
  lonely: ["I kept a place for your pointer.", "it's quiet in the dish", "oh! you're here."],
  grubby: ["the ecosystem is becoming… textural.", "I am mostly agar now", "a little wash wouldn't hurt"],
  dancing: ["wibble wibble", "this one has a good beat", "* rhythmic alien noises *"],
  spooked: [
    "did you hear that?",
    "something moved in the graph",
    "unexpected signal detected",
    "the void looked back",
    "* startled alien noise *",
  ],
}

export function pickMood(): Mood {
  const total = MOOD_WEIGHTS.reduce((s, [, w]) => s + w, 0)
  let r = Math.random() * total
  for (const [mood, weight] of MOOD_WEIGHTS) {
    r -= weight
    if (r <= 0) return mood
  }
  return "idle"
}

export function pickFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}


/** Things glorp might say about right now: the hour, the season, the music, the page. */
export function contextualQuip(ctx: {
  date?: Date
  season?: string
  moon?: string
  song?: string | null
  noteTitle?: string | null
  readingMinutes?: number | null
}): string | null {
  const date = ctx.date ?? new Date()
  const hour = date.getHours()
  const lines: string[] = []
  if (hour < 5) lines.push("a secret hour. everything is quieter at this size.", "the nodes are asleep. we could tiptoe.")
  else if (hour < 9) lines.push("early! the links are still dewy.", "good morning from the margin.")
  else if (hour >= 22) lines.push("late reading is the best reading.", "the graph glows a bit at night, I think.")
  if (ctx.season) lines.push(`it smells like ${ctx.season} in here.`)
  if (ctx.moon === "full moon") lines.push("full moon. I get a bit wiggly.")
  if (ctx.moon === "new moon") lines.push("new moon. very good for stargazing, if I had a neck.")
  if (ctx.song) lines.push(`ooh, “${ctx.song}”. wibble.`)
  if (ctx.noteTitle) {
    lines.push(`I've been reading “${ctx.noteTitle}” too.`, `“${ctx.noteTitle}”! one of my favourite nodes.`)
    if (ctx.readingMinutes && ctx.readingMinutes >= 15) lines.push(`${ctx.readingMinutes} minutes? I'll make tea.`)
  }
  return lines.length ? pickFrom(lines) : null
}
