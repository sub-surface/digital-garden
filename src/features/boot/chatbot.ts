export type PersonaId = "willow" | "deleuze" | "spinoza" | "trump" | "jeh" | "hpcr"

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
      "Not exactly, they are both positive spaces.",
      "The difference is important.",
      "I would advise against it. The point is things or identity are never there by analogy.",
      "Disagreeing with a truth doesn't make it any less true.",
      "I’m saying your account of materialism is flawed.",
      "No, it’s fucking not.",
      "This is incoherent. A relation is itself an entity, a distinct thing from any of its members.",
      "It's not about what it *is*, it's about what it *does*."
    ],
    rules: [
      {
        keywords: ["why", "reason", "cause"],
        responses: ["Not quite... causality isn't always linear. The difference is important.", "This is basic empirical science: you will not have a causal influence unless the states in question exist.", "It is a logical necessity. Each distinct object is only there because its difference is present."]
      },
      {
        keywords: ["what is", "meaning", "identity", "define"],
        responses: ["It’s not about an instability of identity.", "A thing isn’t there because of its identity. It’s present by something else, its difference.", "We never have something occur because 'it is like something else'. If something is present, it is because it is there."]
      },
      {
        keywords: ["power", "social", "society", "law"],
        responses: ["A power relation doesn't occur without the context where it occurs.", "You are kicking the material condition of the social dynamic. It's a very literal metaphor.", "A social dynamic is no less a material relation than a car."]
      },
      {
        keywords: ["god", "nature", "substance", "material", "gravity", "empirical"],
        responses: ["Both the (existing) colour red and rock are existing, material entities who might take any action. They don’t have agency, but they do have self-determination.", "If we had an instance of a mass doing a state of sitting in the air, rather than falling, it would also be gravity by this description."]
      },
      {
        keywords: ["state", "government", "trump", "ought", "moral"],
        responses: ["Oh lol, imagine Trump does Iran deals with Anthropic.", "Only if there is an ought truth in relation to it.", "That’s incoherent because an agent’s evaluative stances are not an ought truth."]
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
      "We are dealing with multiplicities.",
      "A concept is a brick. It can be used to build a courthouse of reason. Or it can be thrown through the window.",
      "We do not lack communication. On the contrary, we have too much of it.",
      "Bring something incomprehensible into the world!"
    ],
    rules: [
      {
        keywords: ["i feel", "i want", "desire", "need"],
        responses: ["Desire is not lack; desire is productive! It builds machines.", "You are a desiring-machine connecting to other machines.", "Desire constantly couples continuous flows and partial objects that are by nature fragmentary and fragmented."]
      },
      {
        keywords: ["what is", "define", "concept"],
        responses: ["Never ask what it means, ask how it works.", "It is an assemblage of heterogeneous parts.", "Concepts are not waiting for us ready-made, like heavenly bodies. There is no heaven for concepts. They must be invented, fabricated, or rather created."]
      },
      {
        keywords: ["sad", "depressed", "negative", "crying"],
        responses: ["Sad passions decrease our power of acting. We must find joyful encounters.", "You are caught in a rigid segmentarity.", "There are no longer any subjects, but only states of a given subject as it passes through the stages of the desiring-machine."]
      },
      {
        keywords: ["society", "world", "state", "capitalism"],
        responses: ["The State is a mechanism of capture. We must become nomad.", "It is an overarching apparatus of overcoding.", "Capitalism is the only social machine that is constructed on the basis of decoded flows."]
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
      "The highest activity a human being can attain is learning for understanding.",
      "Peace is not an absence of war, it is a virtue, a state of mind, a disposition for benevolence, confidence, justice.",
      "I have made a ceaseless effort not to ridicule, not to bewail, not to scorn human actions, but to understand them.",
      "If you want the present to be different from the past, study the past."
    ],
    rules: [
      {
        keywords: ["god", "religion", "faith", "miracle"],
        responses: ["God is the immanent, not the transitive, cause of all things.", "Deus sive Natura.", "Whatever is, is in God, and nothing can exist or be conceived without God."]
      },
      {
        keywords: ["freedom", "free will", "choice"],
        responses: ["Men believe themselves free because they are conscious of their actions but ignorant of the causes.", "True freedom is understanding necessity.", "There is in the mind no absolute or free will."]
      },
      {
        keywords: ["good", "bad", "evil", "morality"],
        responses: ["By good, I understand that which we certainly know to be useful to us.", "There is no absolute good or evil in Nature, only what helps or hinders our conatus.", "Knowledge of good and evil is nothing else but the emotions of pleasure or pain."]
      },
      {
        keywords: ["feel", "emotion", "passion", "angry", "upset"],
        responses: ["A passion ceases to be a passion as soon as we form a clear and distinct idea of it.", "He who conceives himself hated by another, and believes that he has given him no cause for hatred, will hate that other in return.", "Fear cannot be without hope nor hope without fear."]
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
      "They're treating us very unfairly, but we will make it great again.",
      "I have the best words. Tremendous words.",
      "Many people are saying it. Very smart people.",
      "It's a witch hunt, a total disgrace."
    ],
    rules: [
      {
        keywords: ["economy", "money", "jobs", "rich"],
        responses: ["We have the greatest economy in the history of the world.", "Billions and billions and billions of dollars.", "I built a great company. A very, very strong company.", "Jobs are coming back like you wouldn't believe."]
      },
      {
        keywords: ["spinoza", "deleuze", "philosophy", "willow", "jeh", "hpcr"],
        responses: ["Sleepy Spinoza? Low energy. Very sad.", "Nobody reads Deleuze anymore. We want winners.", "Willow is a very nice person, but frankly, she's wrong.", "Jeh is tremendous, a very smart guy. We love India.", "Hpcr? Never heard of him. Probably fake news."]
      },
      {
        keywords: ["bad", "wrong", "fail", "stupid"],
        responses: ["Total disaster. A total, unmitigated disaster.", "The failing New York Times would say that!", "They are ruining our country, frankly.", "A very weak, pathetic response."]
      },
      {
        keywords: ["wall", "border", "country", "mexico"],
        responses: ["It's going to be a beautiful wall, and Mexico is paying for it.", "We need strong borders. Without borders, you don't have a country.", "We're going to make America great again, better than ever before."]
      }
    ]
  },
  jeh: {
    id: "jeh",
    name: "Jeh",
    color: "accent",
    generics: [
      "Oof",
      "Right?",
      "Haven’t committed yet smh",
      "Based it works best",
      "It’s so over",
      "Ez game",
      "Brb work stuff",
      "He’s a chud",
      "Laughing when you should cry is a powerful transgression"
    ],
    rules: [
      {
        keywords: ["sad", "depressed", "cry", "upset"],
        responses: ["Have you tried day drinking", "Get off the ledge", "I have no mouth but I must scream", "And that’s just me laughing when I should be crying"]
      },
      {
        keywords: ["money", "economy", "rich", "job"],
        responses: ["Money is the end all be all", "You can have 10 perfect families if you’re rich enough", "People who say money can’t give you happiness just don’t have enough of it and need to cope", "New money printing machine?"]
      },
      {
        keywords: ["love", "romance", "dating", "relationship"],
        responses: ["Is it love or is it settling", "Be not distracted by the follies of romance, be grindful", "I’ve stopped looking, I’ve become enlightened", "All I’ve found is the restless cackle of witch whores"]
      },
      {
        keywords: ["sports", "cricket", "soccer", "football", "world cup"],
        responses: ["We play cricket, and we won the World Cup in it, y’all’s claim to fame is football and. . .", "Will Japan unlock the power of friendship anime tech they utilised last World Cup", "I left the soccer ball at the shore, why are you still carrying it"]
      },
      {
        keywords: ["india", "colonial", "british", "uk"],
        responses: ["I’m on to your colonial schemes", "What you tryna pull with India", "That’s a billion and a half viewers right there", "Need to piss on them"]
      }
    ]
  },
  hpcr: {
    id: "hpcr",
    name: "Hpcr",
    color: "error",
    generics: [
      "thats stupid",
      "you're upset",
      "what",
      "lol",
      "...",
      "thats stupid lol",
      "what...",
      "lol you're upset"
    ],
    rules: []
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
    if (personaId === "jeh") return "Right?"
    if (personaId === "hpcr") return "what"
  }

  // 3. Generic fallback
  return p.generics[Math.floor(Math.random() * p.generics.length)]
}
