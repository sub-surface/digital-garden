import { Env, RouteCtx } from "./types"
import { jsonResponse, supabaseRest } from "./lib"
import { checkBanStatus } from "./chat"
import { PERSONAS, generateReply, type PersonaId } from "../features/boot/chatbot"

/** Concurrency lock: room_id -> timestamp (ms) of the last started debate. */
const activeDebatesByRoom = new Map<string, number>()
const DEBATE_COOLDOWN_MS = 35_000

/** Hex color mapping for bot personas matching chat theme palettes. */
export const BOT_COLORS: Record<PersonaId, string> = {
  willow: "#a3be8c",    // tender sage
  deleuze: "#b48ead",   // lavender difference
  spinoza: "#88c0d0",   // ice cyan substance
  trump: "#d08770",     // terracotta
  jeh: "#ebcb8b",       // gold referee
  hpcr: "#bf616a",      // crimson judge
  terry: "#5e81ac",     // deep blue
  nick: "#81a1c1",      // accelerationist slate
  mark: "#4c566a",      // dark slate
  zizek: "#d08770",     // ideology rust
  diogenes: "#a3be8c",  // cynic green
  bostrom: "#88c0d0",   // matrix cyan
  ape: "#ebcb8b",       // foundherentist yellow
}

export const CANONICAL_QUOTES: Array<{ author: string; quote: string }> = [
  { author: "John Dewey", quote: "Inquiry is the controlled or directed transformation of an indeterminate situation into one that is so determinate in its constituent distinctions and relations as to convert the elements of the original situation into a unified whole." },
  { author: "Richard Rorty", quote: "Truth is what your contemporaries let you get away with saying." },
  { author: "Baruch Spinoza", quote: "Substance is that which is in itself and is conceived through itself." },
  { author: "Gilles Deleuze", quote: "Difference is not diversity. Diversity is given, but difference is that by which the given is given." },
  { author: "Susan Haack", quote: "Foundherentism allows mutual support among beliefs without vicious circularity, analogous to the entries in a crossword puzzle." },
  { author: "Nick Land", quote: "Nothing human makes it out of the near-future." },
  { author: "Anthony Quigley", quote: "Except I won." },
  { author: "Hugh Chungus", quote: "I was eating hotdogs out of a bowl with no shirt on and you were citing Rorty." },
  { author: "Don (El Don)", quote: "I care about all of you deeply and whatever disagreements occur in this channel do not change that." },
  { author: "Simon", quote: "The sacred typo is the unconscious of the text." },
  { author: "Pearl", quote: "nuh uh." },
  { author: "Janne", quote: "The zoo principle guarantees that whenever you tap on the glass, someone inside will quote Logic of Sense." },
  { author: "Charlie (Willow)", quote: "Existing absences are existing presences. It is not about what it is, it is about what it does." },
  { author: "aurasurfer", quote: "That deduction warrants a Size 2 Chuckle at best." },
]

function resolvePersona(query: string): PersonaId | null {
  const clean = query.trim().toLowerCase()
  const ids = Object.keys(PERSONAS) as PersonaId[]
  return ids.find((id) => id.toLowerCase() === clean || PERSONAS[id].name.toLowerCase() === clean) ?? null
}

async function insertBotMessage(
  env: Env,
  roomId: string,
  userId: string,
  username: string,
  nameColor: string,
  body: string
) {
  const row = {
    room_id: roomId,
    user_id: userId,
    body: body.trim(),
    reply_to: null,
    username,
    name_color: nameColor,
    avatar_url: null,
  }
  return supabaseRest(env, "messages", "POST", row)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function handleChatCommand({ request, env, auth, waitUntil }: RouteCtx): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  const ban = await checkBanStatus(env, auth!.id)
  if (ban.banned) return jsonResponse({ error: ban.reason ?? "You are banned" }, 403)

  let payload: { room_id?: string; command?: string; args?: string[] }
  try {
    payload = await request.json()
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400)
  }

  const roomId = payload.room_id?.trim()
  const command = payload.command?.trim().toLowerCase()
  const args = (payload.args ?? []).map((a) => a.trim()).filter(Boolean)

  if (!roomId || !command) {
    return jsonResponse({ error: "room_id and command required" }, 400)
  }

  // 1. /debate <a> <b> [topic]
  if (command === "debate") {
    if (args.length < 2) {
      const personaList = (Object.keys(PERSONAS) as PersonaId[]).map((id) => PERSONAS[id].name).join(", ")
      return jsonResponse({
        error: `usage: /debate <a> <b> [topic]. Available personas: ${personaList}`,
      }, 400)
    }

    const aId = resolvePersona(args[0])
    const bId = resolvePersona(args[1])
    if (!aId) return jsonResponse({ error: `debate: nobody called '${args[0]}'` }, 400)
    if (!bId) return jsonResponse({ error: `debate: nobody called '${args[1]}'` }, 400)
    if (aId === bId) return jsonResponse({ error: "debate: they already agree with themselves" }, 400)

    const now = Date.now()
    const lastDebate = activeDebatesByRoom.get(roomId) ?? 0
    if (now - lastDebate < DEBATE_COOLDOWN_MS) {
      const remainingSec = Math.ceil((DEBATE_COOLDOWN_MS - (now - lastDebate)) / 1000)
      return jsonResponse({
        error: `A debate is currently active in this room. Please wait ${remainingSec}s before initiating another.`,
      }, 429)
    }
    activeDebatesByRoom.set(roomId, now)

    const topic = args.slice(2).join(" ") || "the difference between things"
    const pA = PERSONAS[aId]
    const pB = PERSONAS[bId]

    // Dispatch background debate sequence
    waitUntil((async () => {
      // Opening announcement
      await insertBotMessage(
        env,
        roomId,
        auth!.id,
        "Omnius [Witness]",
        "#88c0d0",
        `— Scripted Debate: ${pA.name} vs ${pB.name}: "${topic}" —`
      )

      const saidByA: string[] = []
      const saidByB: string[] = []
      let utterance = topic
      let speaker = Math.random() < 0.5 ? aId : bId

      for (let turn = 0; turn < 6; turn++) {
        await sleep(turn === 0 ? 1600 : 2000)
        const recent = speaker === aId ? saidByA : saidByB
        const reply = generateReply(speaker, utterance, { topic, recent })
        recent.push(reply)

        const speakerObj = PERSONAS[speaker]
        const color = BOT_COLORS[speaker] ?? "#88c0d0"

        await insertBotMessage(
          env,
          roomId,
          auth!.id,
          `${speakerObj.name} [Bot]`,
          color,
          reply
        )

        utterance = reply
        speaker = speaker === aId ? bId : aId
      }

      await sleep(1500)
      await insertBotMessage(
        env,
        roomId,
        auth!.id,
        "Omnius [Witness]",
        "#88c0d0",
        "— Debate concluded: neither conceded —"
      )
    })())

    return jsonResponse({ ok: true, status: "debate_started" })
  }

  // 2. /ask <who> <question> (or /chat <who> <question>)
  if (command === "ask" || command === "chat") {
    if (args.length < 2) {
      return jsonResponse({ error: "usage: /ask <who> <question>" }, 400)
    }

    const personaId = resolvePersona(args[0])
    if (!personaId) return jsonResponse({ error: `ask: nobody called '${args[0]}'` }, 400)

    const question = args.slice(1).join(" ")
    const persona = PERSONAS[personaId]
    const color = BOT_COLORS[personaId] ?? "#88c0d0"
    const reply = generateReply(personaId, question)

    waitUntil((async () => {
      await sleep(500)
      await insertBotMessage(
        env,
        roomId,
        auth!.id,
        `${persona.name} [Bot]`,
        color,
        reply
      )
    })())

    return jsonResponse({ ok: true })
  }

  // 3. /yellowcard <user> [reason]
  if (command === "yellowcard") {
    if (args.length === 0) {
      return jsonResponse({ error: "usage: /yellowcard <username> [reason]" }, 400)
    }

    const target = args[0].replace(/^@/, "")
    const reason = args.slice(1).join(" ") || "procedural foul and self-contradiction"

    waitUntil((async () => {
      await insertBotMessage(
        env,
        roomId,
        auth!.id,
        "Referee Jere",
        "#ebcb8b",
        `[YELLOW CARD] @${target}: booked by Referee Jere for "${reason}". Play to resume from the spot.`
      )
    })())

    return jsonResponse({ ok: true })
  }

  // 4. /quote [author]
  if (command === "quote") {
    const authorQuery = args.join(" ").toLowerCase()
    let pool = CANONICAL_QUOTES
    if (authorQuery) {
      const filtered = CANONICAL_QUOTES.filter(
        (q) => q.author.toLowerCase().includes(authorQuery) || q.quote.toLowerCase().includes(authorQuery)
      )
      if (filtered.length > 0) pool = filtered
    }

    const chosen = pool[Math.floor(Math.random() * pool.length)]

    waitUntil((async () => {
      await insertBotMessage(
        env,
        roomId,
        auth!.id,
        "The Phil Chat Times",
        "#d08770",
        `"${chosen.quote}" — ${chosen.author}`
      )
    })())

    return jsonResponse({ ok: true })
  }

  // 5. /tape <userA> <userB>
  if (command === "tape") {
    if (args.length < 2) {
      return jsonResponse({ error: "usage: /tape <userA> <userB>" }, 400)
    }

    const uA = args[0].replace(/^@/, "")
    const uB = args[1].replace(/^@/, "")

    const stances = [
      "Deweyan Pragmatist",
      "Biophile Realist",
      "Deleuzo-Spinozist",
      "Analytic Purist",
      "Spawnpill Determinist",
      "Foundherentist",
      "Accelerationist",
      "Truth Janitor",
    ]
    const stanceA = stances[Math.floor(Math.random() * stances.length)]
    const stanceB = stances[Math.floor(Math.random() * stances.length)]
    const hitRateA = (60 + Math.floor(Math.random() * 35)).toFixed(1)
    const hitRateB = (60 + Math.floor(Math.random() * 35)).toFixed(1)

    waitUntil((async () => {
      await insertBotMessage(
        env,
        roomId,
        auth!.id,
        "Sports Desk",
        "#b48ead",
        `[TALE OF THE TAPE] ${uA} vs ${uB} | Reach: Infinite | Hit Rate: ${hitRateA}% vs ${hitRateB}% | Stance: ${stanceA} vs ${stanceB} | Verdict: Unanimous Draw`
      )
    })())

    return jsonResponse({ ok: true })
  }

  // 6. /bothelp
  if (command === "bothelp") {
    const list = (Object.keys(PERSONAS) as PersonaId[]).map((id) => PERSONAS[id].name).join(", ")
    waitUntil((async () => {
      await insertBotMessage(
        env,
        roomId,
        auth!.id,
        "The Phil Chat Times",
        "#88c0d0",
        `Commands: /debate <a> <b> [topic], /ask <who> <question>, /yellowcard <user> [reason], /quote [author], /tape <a> <b>. Personas: ${list}`
      )
    })())
    return jsonResponse({ ok: true })
  }

  return jsonResponse({ error: `Unknown bot command: /${command}` }, 400)
}
