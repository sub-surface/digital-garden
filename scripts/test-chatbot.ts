/**
 * Persona reply invariants for the terminal's `chat` / `debate` commands.
 *
 * The regression this mainly guards is real and was shipping: keywords used to
 * match as bare substrings, so "ai" fired on said/again/explain, "bot" on both,
 * "cause" on because, and "code" on Deleuze's own "overcoding". `debate` feeds
 * every reply back in as the next input, so one false match compounded each
 * turn and made correctly written rules read as free association.
 *
 * Checks:
 *  - keywords never match inside a longer word
 *  - rules that should fire, do
 *  - the best-scoring rule wins and the standing topic is a fallback
 *  - every persona answers everything with a non-empty string
 *  - no line is both a generic and a rule response (the two tiers must differ)
 *  - `recent` suppression holds while any alternative exists
 */
import { PERSONAS, generateReply, type PersonaId } from "../src/features/boot/chatbot"

let failures = 0
const fail = (msg: string) => {
  console.error(`FAIL ${msg}`)
  failures++
}

const ids = Object.keys(PERSONAS) as PersonaId[]
const RUNS = 200

/** Every response belonging to a rule of `id` that declares `keyword`. */
function responsesFor(id: PersonaId, keyword: string): string[] {
  return PERSONAS[id].rules.filter((r) => r.keywords.includes(keyword)).flatMap((r) => r.responses)
}

// 1. Word boundaries. Each input contains the keyword only as part of a longer
//    word, and contains no other keyword of that persona.
const boundary: Array<[PersonaId, string, string]> = [
  ["bostrom", "ai", "he said it would happen again"],
  ["ape", "bot", "both of those are fine"],
  ["willow", "cause", "because it is there"],
  ["terry", "code", "capitalism is built on decoded flows"],
  ["diogenes", "man", "the demands of many"],
]

for (const [id, keyword, input] of boundary) {
  const banned = new Set(responsesFor(id, keyword))
  if (!banned.size) {
    fail(`${id}: no rule declares '${keyword}' — this case is stale`)
    continue
  }
  for (let i = 0; i < RUNS; i++) {
    const reply = generateReply(id, input)
    if (banned.has(reply)) {
      fail(`${id}: '${keyword}' matched inside a longer word in "${input}" → "${reply}"`)
      break
    }
  }
}

// 2. Positive control — the same rules still fire on real occurrences.
const positive: Array<[PersonaId, string, string]> = [
  ["ape", "chatgpt", "do you use chatgpt for this"],
  ["willow", "truth", "is that true when nobody is looking"],
  ["hpcr", "sure", "sure, whatever you say"],
  ["jeh", "tiger", "what do you think about tiger conservation"],
]

for (const [id, keyword, input] of positive) {
  const expected = new Set(responsesFor(id, keyword))
  let hit = false
  for (let i = 0; i < RUNS && !hit; i++) hit = expected.has(generateReply(id, input))
  if (!hit) fail(`${id}: '${keyword}' rule never fired for "${input}"`)
}

// 2b. Inflection. Strict boundaries broke plurals — a `debate jeh willow tigers`
//     never reached the "tiger" rule — so the pattern allows a trailing s/es.
const plural: Array<[PersonaId, string, string]> = [
  ["jeh", "tiger", "tigers"],
  ["ape", "model", "models"],
  ["willow", "fact", "facts"],
]

for (const [id, keyword, input] of plural) {
  const expected = new Set(responsesFor(id, keyword))
  let hit = false
  for (let i = 0; i < RUNS && !hit; i++) hit = expected.has(generateReply(id, input))
  if (!hit) fail(`${id}: plural "${input}" did not reach the '${keyword}' rule`)
}

// 3. Rule selection and standing-topic fallback. The first input hits Willow's
//    earlier causality rule twice and later truth rule three times; scoring must
//    choose the latter. A direct input match must still beat the topic fallback.
const willowTruth = new Set(responsesFor("willow", "truth"))
const willowCause = new Set(responsesFor("willow", "cause"))

const bestScored = generateReply("willow", "why cause truth belief observe")
if (!willowTruth.has(bestScored)) fail("willow: best-scoring truth rule did not beat the earlier cause rule")

const fromTopic = generateReply("willow", "qqq zzz xyzzy", { topic: "truth belief observe" })
if (!willowTruth.has(fromTopic)) fail("willow: standing topic was not used when input matched no rule")

const inputFirst = generateReply("willow", "why cause", { topic: "truth belief observe" })
if (!willowCause.has(inputFirst)) fail("willow: standing topic overrode a direct input match")

// 4. Everyone answers everything.
const battery = ["", "hello", "what is truth", "do you think it will kill us", "money", "why"]
for (const id of ids) {
  for (const input of battery) {
    const reply = generateReply(id, input)
    if (typeof reply !== "string" || !reply.trim()) fail(`${id}: empty reply for "${input}"`)
  }
}

// 5. Generics and rule responses must be disjoint, or a match looks identical
//    to a failure to match.
for (const id of ids) {
  const inRules = new Set(PERSONAS[id].rules.flatMap((r) => r.responses))
  for (const generic of PERSONAS[id].generics) {
    if (inRules.has(generic)) fail(`${id}: "${generic.slice(0, 48)}" is both a generic and a rule response`)
  }
}

// 6. `recent` is honoured while an alternative exists.
for (const id of ids) {
  const generics = PERSONAS[id].generics
  if (generics.length < 2) continue
  const avoid = [generics[0]]
  for (let i = 0; i < RUNS; i++) {
    if (generateReply(id, "qqq zzz xyzzy", { recent: avoid }) === avoid[0]) {
      fail(`${id}: returned a 'recent' line while alternatives existed`)
      break
    }
  }
}

if (failures > 0) {
  console.error(`${failures} chatbot failure(s)`)
  process.exit(1)
}
console.log(`chatbot ok — ${ids.length} personas`)
