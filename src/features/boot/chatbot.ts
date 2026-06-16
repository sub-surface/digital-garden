export type PersonaId = "willow" | "deleuze" | "spinoza" | "trump"

interface Rule {
  keywords: string[]
  responses: string[]
}

interface Persona {
  id: PersonaId
  name: string
  color: "accent" | "tender" | "warning" | "error" | "normal" | "muted"
  generics: string[]
  rules: Rule[]
}

export const PERSONAS: Record<PersonaId, Persona> = {
  willow: {
    id: "willow",
    name: "Willow",
    color: "tender",
    generics: [
      "Not quite...",
      "The difference is important.",
      "I think Baruch would have a different take on that.",
      "If you read Gilles, you'd see it's more about becoming.",
      "It's not about what it *is*, it's about what it *does*."
    ],
    rules: [
      {
        keywords: ["why", "reason"],
        responses: ["Not quite... causality isn't always linear. The difference is important.", "Because every mode expresses substance in its own way."]
      },
      {
        keywords: ["what is", "meaning"],
        responses: ["I think Deleuze would say it's a multiplicity.", "Not quite... meaning isn't fixed, it's produced."]
      },
      {
        keywords: ["god", "nature", "substance"],
        responses: ["Deus sive Natura, as Spinoza says. Everything is connected.", "It's all one substance, just different attributes."]
      },
      {
        keywords: ["state", "government", "trump"],
        responses: ["That sounds like a rigid striation of space.", "The state apparatus always tries to capture the nomad."]
      }
    ]
  },
  deleuze: {
    id: "deleuze",
    name: "Deleuze",
    color: "accent",
    generics: [
      "We must think in terms of rhizomes, not roots.",
      "Everything is a desiring-machine.",
      "There is no being, only becoming.",
      "Follow the lines of flight.",
      "We are dealing with multiplicities."
    ],
    rules: [
      {
        keywords: ["i feel", "i want", "desire"],
        responses: ["Desire is not lack; desire is productive! It builds machines.", "You are a desiring-machine connecting to other machines."]
      },
      {
        keywords: ["what is", "define"],
        responses: ["Never ask what it means, ask how it works.", "It is an assemblage of heterogeneous parts."]
      },
      {
        keywords: ["sad", "depressed", "negative"],
        responses: ["Sad passions decrease our power of acting. We must find joyful encounters.", "You are caught in a rigid segmentarity."]
      },
      {
        keywords: ["society", "world", "state"],
        responses: ["The State is a mechanism of capture. We must become nomad.", "It is an overarching apparatus of overcoding."]
      }
    ]
  },
  spinoza: {
    id: "spinoza",
    name: "Spinoza",
    color: "normal",
    generics: [
      "By substance, I understand that which is in itself.",
      "God, or Nature, acts from the necessity of its own nature.",
      "We strive to persevere in our being.",
      "An emotion can only be controlled by a stronger contrary emotion.",
      "The highest activity a human being can attain is learning for understanding."
    ],
    rules: [
      {
        keywords: ["god", "religion", "faith"],
        responses: ["God is the immanent, not the transitive, cause of all things.", "Deus sive Natura."]
      },
      {
        keywords: ["freedom", "free will", "choice"],
        responses: ["Men believe themselves free because they are conscious of their actions but ignorant of the causes.", "True freedom is understanding necessity."]
      },
      {
        keywords: ["good", "bad", "evil"],
        responses: ["By good, I understand that which we certainly know to be useful to us.", "There is no absolute good or evil in Nature, only what helps or hinders our conatus."]
      },
      {
        keywords: ["feel", "emotion", "passion"],
        responses: ["A passion ceases to be a passion as soon as we form a clear and distinct idea of it."]
      }
    ]
  },
  trump: {
    id: "trump",
    name: "Trump",
    color: "warning",
    generics: [
      "Frankly, it's tremendous. Everyone says so.",
      "Fake news! We're winning bigly.",
      "I know more about this than anybody, believe me.",
      "It's a beautiful thing, very strong, very powerful.",
      "They're treating us very unfairly, but we will make it great again."
    ],
    rules: [
      {
        keywords: ["economy", "money", "jobs"],
        responses: ["We have the greatest economy in the history of the world.", "Billions and billions and billions of dollars."]
      },
      {
        keywords: ["spinoza", "deleuze", "philosophy", "willow"],
        responses: ["Sleepy Spinoza? Low energy. Very sad.", "Nobody reads Deleuze anymore. We want winners.", "Willow is a very nice person, but frankly, she's wrong."]
      },
      {
        keywords: ["bad", "wrong", "fail"],
        responses: ["Total disaster. A total, unmitigated disaster.", "The failing New York Times would say that!"]
      },
      {
        keywords: ["wall", "border"],
        responses: ["It's going to be a beautiful wall, and Mexico is paying for it.", "We need strong borders. Without borders, you don't have a country."]
      }
    ]
  }
}

/**
 * Basic Eliza-style string reflection
 * Swaps "I" with "you", "my" with "your", etc.
 */
function reflect(text: string): string {
  const map: Record<string, string> = {
    "i": "you",
    "i am": "you are",
    "i'm": "you're",
    "my": "your",
    "mine": "yours",
    "you": "I",
    "you are": "I am",
    "you're": "I'm",
    "your": "my",
    "yours": "mine",
    "me": "you"
  }
  
  const tokens = text.split(/\b/);
  const reflected = tokens.map(token => {
    const lower = token.toLowerCase();
    return map[lower] ? map[lower] : token;
  });
  return reflected.join("");
}

export function generateReply(personaId: PersonaId, input: string): string {
  const p = PERSONAS[personaId]
  if (!p) return "..."

  const lowerInput = input.toLowerCase()
  
  // 1. Try to find a matching rule
  for (const rule of p.rules) {
    for (const kw of rule.keywords) {
      if (lowerInput.includes(kw)) {
        const reply = rule.responses[Math.floor(Math.random() * rule.responses.length)]
        return reply.replace(/\*/g, "") // clean up, can expand logic here
      }
    }
  }

  // 2. If no rule matched, maybe reflect a question back?
  if (lowerInput.includes("are you") || lowerInput.includes("do you")) {
    if (personaId === "willow") return "Not quite... why do you ask?"
    if (personaId === "trump") return "I am the best at it, everyone knows it."
    if (personaId === "deleuze") return "We are all multiplicities, do not try to fix me into an identity."
    if (personaId === "spinoza") return "I am a mode of Nature."
  }

  // 3. Generic fallback
  return p.generics[Math.floor(Math.random() * p.generics.length)]
}
