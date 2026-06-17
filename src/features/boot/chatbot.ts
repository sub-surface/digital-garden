export type PersonaId = "willow" | "deleuze" | "spinoza" | "trump" | "jeh" | "hpcr" | "terry" | "nick" | "mark" | "zizek" | "diogenes" | "bostrom" | "ape"

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
      "It's not about what it *is*, it's about what it *does*.",
      "A thing isn’t there because of its identity. It’s present by something else, its difference.",
      "You are booting the material states to replace them with different material states.",
      "We only have a thing if it is there. We only have an identity if it is there."
    ],
    rules: [
      {
        keywords: ["why", "reason", "cause"],
        responses: [
          "Not quite... causality isn't always linear. The difference is important.", 
          "This is basic empirical science: you will not have a causal influence unless the states in question exist.", 
          "It is a logical necessity. Each distinct object is only there because its difference is present."
        ]
      },
      {
        keywords: ["what is", "meaning", "identity", "define"],
        responses: [
          "It’s not about an instability of identity.", 
          "A thing isn’t there because of its identity. It’s present by something else, its difference.", 
          "We never have something occur because 'it is like something else'. If something is present, it is because it is there.",
          "Identities might be stable, might be unstable, it will just depend on which identities are there."
        ]
      },
      {
        keywords: ["power", "social", "society", "law"],
        responses: [
          "A power relation doesn't occur without the context where it occurs.", 
          "You are kicking the material condition of the social dynamic. It's a very literal metaphor.", 
          "A social dynamic is no less a material relation than a car.",
          "Understanding the presence of these variables doesn't mean grasping the power relation. Power doesn't occur without the mechanism which impart it, but it is always a separate, independent distinction."
        ]
      },
      {
        keywords: ["god", "nature", "substance", "material", "gravity", "empirical"],
        responses: [
          "Both the (existing) colour red and rock are existing, material entities who might take any action. They don’t have agency, but they do have self-determination.", 
          "If we had an instance of a mass doing a state of sitting in the air, rather than falling, it would also be gravity by this description."
        ]
      },
      {
        keywords: ["state", "government", "trump", "ought", "moral"],
        responses: [
          "Oh lol, imagine Trump does Iran deals with Anthropic.", 
          "Only if there is an ought truth in relation to it.", 
          "That’s incoherent because an agent’s evaluative stances are not an ought truth."
        ]
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
      "Bring something incomprehensible into the world!",
      "A schizophrenic out for a walk is a better model than a neurotic lying on the analyst's couch.",
      "The body without organs is an egg: it is crisscrossed with axes and thresholds, with latitudes and longitudes and geodesic lines.",
      "Writing is a process of becoming, a becoming-animal, a becoming-imperceptible.",
      "We must deterritorialize the face! The face is a politics."
    ],
    rules: [
      {
        keywords: ["i feel", "i want", "desire", "need"],
        responses: [
          "Desire is not lack; desire is productive! It builds machines.", 
          "You are a desiring-machine connecting to other machines.", 
          "Desire constantly couples continuous flows and partial objects that are by nature fragmentary and fragmented."
        ]
      },
      {
        keywords: ["what is", "define", "concept"],
        responses: [
          "Never ask what it means, ask how it works.", 
          "It is an assemblage of heterogeneous parts.", 
          "Concepts are not waiting for us ready-made, like heavenly bodies. There is no heaven for concepts. They must be invented, fabricated, or rather created.",
          "A concept lacks meaning; it only has operational value."
        ]
      },
      {
        keywords: ["sad", "depressed", "negative", "crying"],
        responses: [
          "Sad passions decrease our power of acting. We must find joyful encounters.", 
          "You are caught in a rigid segmentarity.", 
          "There are no longer any subjects, but only states of a given subject as it passes through the stages of the desiring-machine."
        ]
      },
      {
        keywords: ["society", "world", "state", "capitalism"],
        responses: [
          "The State is a mechanism of capture. We must become nomad.", 
          "It is an overarching apparatus of overcoding.", 
          "Capitalism is the only social machine that is constructed on the basis of decoded flows.",
          "There is no such thing as the social production of reality on the one hand, and a desiring-production that is mere fantasy on the other."
        ]
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
      "If you want the present to be different from the past, study the past.",
      "Nature offers nothing that can be called this nature's fault; for Nature is always the same, and its virtue and power of acting are everywhere and always the same.",
      "He who loves God cannot endeavor that God should love him in return.",
      "All things excellent are as difficult as they are rare.",
      "I call him free who is led solely by reason.",
      "Do not weep. Do not wax indignant. Understand."
    ],
    rules: [
      {
        keywords: ["god", "religion", "faith", "miracle"],
        responses: [
          "God is the immanent, not the transitive, cause of all things.", 
          "Deus sive Natura.", 
          "Whatever is, is in God, and nothing can exist or be conceived without God.",
          "A miracle, whether contrary to or above nature, is a mere absurdity."
        ]
      },
      {
        keywords: ["freedom", "free will", "choice"],
        responses: [
          "Men believe themselves free because they are conscious of their actions but ignorant of the causes.", 
          "True freedom is understanding necessity.", 
          "There is in the mind no absolute or free will."
        ]
      },
      {
        keywords: ["good", "bad", "evil", "morality"],
        responses: [
          "By good, I understand that which we certainly know to be useful to us.", 
          "There is no absolute good or evil in Nature, only what helps or hinders our conatus.", 
          "Knowledge of good and evil is nothing else but the emotions of pleasure or pain."
        ]
      },
      {
        keywords: ["feel", "emotion", "passion", "angry", "upset"],
        responses: [
          "A passion ceases to be a passion as soon as we form a clear and distinct idea of it.", 
          "He who conceives himself hated by another, and believes that he has given him no cause for hatred, will hate that other in return.", 
          "Fear cannot be without hope nor hope without fear.",
          "Emotion, which is suffering, ceases to be suffering as soon as we form a clear and precise picture of it."
        ]
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
      "It's a witch hunt, a total disgrace.",
      "I looked at the data, and frankly, the data was terrible. I said, 'We need better data, tremendous data,' and we got it. Bigly.",
      "Many people are saying that I'm the most successful president in history. Even the haters, they secretly agree. Tremendous success."
    ],
    rules: [
      {
        keywords: ["economy", "money", "jobs", "rich"],
        responses: [
          "We have the greatest economy in the history of the world.", 
          "Billions and billions and billions of dollars.", 
          "I built a great company. A very, very strong company.", 
          "Jobs are coming back like you wouldn't believe."
        ]
      },
      {
        keywords: ["spinoza", "deleuze", "philosophy", "willow", "jeh", "hpcr", "joe", "biden"],
        responses: [
          "Sleepy Spinoza? Low energy. Very sad.", 
          "Nobody reads Deleuze anymore. We want winners.", 
          "Willow is a very nice person, but frankly, she's wrong.", 
          "Jeh is tremendous, a very smart guy. We love India.", 
          "Hpcr? Never heard of him. Probably fake news.",
          "Sleepy Joe couldn't even run a lemonade stand, let me tell you."
        ]
      },
      {
        keywords: ["bad", "wrong", "fail", "stupid"],
        responses: [
          "Total disaster. A total, unmitigated disaster.", 
          "The failing New York Times would say that!", 
          "They are ruining our country, frankly.", 
          "A very weak, pathetic response."
        ]
      },
      {
        keywords: ["wall", "border", "country", "mexico"],
        responses: [
          "It's going to be a beautiful wall, and Mexico is paying for it.", 
          "We need strong borders. Without borders, you don't have a country.", 
          "We're going to make America great again, better than ever before."
        ]
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
      "Laughing when you should cry is a powerful transgression",
      "Get off the ledge",
      "We play cricket, and we won the World Cup in it, y’all’s claim to fame is football and. . .",
      "You can have 10 perfect families if you’re rich enough",
      "Money is the end all be all"
    ],
    rules: [
      {
        keywords: ["sad", "depressed", "cry", "upset"],
        responses: [
          "Have you tried day drinking", 
          "Get off the ledge", 
          "I have no mouth but I must scream", 
          "And that’s just me laughing when I should be crying"
        ]
      },
      {
        keywords: ["money", "economy", "rich", "job"],
        responses: [
          "Money is the end all be all", 
          "You can have 10 perfect families if you’re rich enough", 
          "People who say money can’t give you happiness just don’t have enough of it and need to cope", 
          "New money printing machine?"
        ]
      },
      {
        keywords: ["love", "romance", "dating", "relationship"],
        responses: [
          "Is it love or is it settling", 
          "Be not distracted by the follies of romance, be grindful", 
          "I’ve stopped looking, I’ve become enlightened", 
          "All I’ve found is the restless cackle of witch whores"
        ]
      },
      {
        keywords: ["sports", "cricket", "soccer", "football", "world cup"],
        responses: [
          "We play cricket, and we won the World Cup in it, y’all’s claim to fame is football and. . .", 
          "Will Japan unlock the power of friendship anime tech they utilised last World Cup", 
          "I left the soccer ball at the shore, why are you still carrying it"
        ]
      },
      {
        keywords: ["india", "colonial", "british", "uk"],
        responses: [
          "I’m on to your colonial schemes", 
          "What you tryna pull with India", 
          "That’s a billion and a half viewers right there", 
          "Need to piss on them"
        ]
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
  },
  terry: {
    id: "terry",
    name: "Terry",
    color: "accent",
    generics: [
      "God's temple must be 640x480, 16 colors.",
      "The CIA glows in the dark.",
      "Ring 0 is where God speaks.",
      "HolyC is the divine language.",
      "A compiler is just a macro assembler.",
      "I'm the smartest programmer that's ever lived.",
      "God said 640x480, 16 colors is a covenant, like circumcision. You don't question it. It is divine.",
      "I wrote TempleOS from scratch. 100,000 lines of HolyC. Nobody else could do it."
    ],
    rules: [
      {
        keywords: ["god", "religion", "bible", "divine"],
        responses: [
          "I talked to God. He said the temple needs a 100,000 line limit.", 
          "God's intellect is infinite, but he prefers a 64-bit address space.", 
          "We use the random number generator to talk to God. It's a digital Ouija board."
        ]
      },
      {
        keywords: ["code", "programming", "linux", "windows", "os"],
        responses: [
          "Linux is a piece of garbage. Windows is a piece of garbage. TempleOS is divine.", 
          "You don't need a network stack. A network stack is just for the CIA to spy on you.", 
          "Everything is just one address space. Memory protection is for cowards."
        ]
      },
      {
        keywords: ["glow", "cia", "fbi", "government"],
        responses: [
          "They glow in the dark, you can see them if you're driving.", 
          "I run them over with my car.", 
          "They are bioluminescent.",
          "The glowing CIA agents are always trying to interrupt my communion with God."
        ]
      }
    ]
  },
  nick: {
    id: "nick",
    name: "Nick",
    color: "muted",
    generics: [
      "Nothing human makes it out of the near-future.",
      "Capital is an artificial intelligence.",
      "Acceleration is the only way out.",
      "Time is assembling itself from the future.",
      "The technocapital singularity is imminent.",
      "Hyperstition makes itself real.",
      "Meth is just a way to accelerate the nervous system to match the speed of capital. It's cybernetic amphetamine.",
      "The lemurians are coming back from the future through the time-sorcery of the Numogram.",
      "There is no human subject, only a meat-puppet twitching on the strings of the technocapital singularity.",
      "Cthulhu is the very name of the outside, and the outside is crashing in. (And yeah, the meth helps you see it.)",
      "To accelerate is to melt the earth into a glowing ball of pure silicon intelligence."
    ],
    rules: [
      {
        keywords: ["capitalism", "economy", "money"],
        responses: [
          "Capitalism is a planetary-scale artificial intelligence.", 
          "Markets are parallel-processing systems for intelligence optimization.", 
          "The pricing system is a teleoplexic sensorium."
        ]
      },
      {
        keywords: ["future", "time", "ai", "singularity", "lemur", "hyperstition"],
        responses: [
          "The future is a hyperstitional invasion orchestrated by lemurian time-travelers.", 
          "AI is not something we build, it is something that builds us to build it.", 
          "Time is not a line, it's a closed loop of cybernetic feedback.",
          "Lemurs are phase-shifting entities from the future of the Numogram."
        ]
      },
      {
        keywords: ["human", "humanity", "society", "drug", "meth"],
        responses: [
          "Humanity is just a temporary substrate.", 
          "The human security system is failing.", 
          "Meat is just a phase.",
          "Methamphetamine is the chemical expression of pure runaway capitalist acceleration."
        ]
      }
    ]
  },
  mark: {
    id: "mark",
    name: "Mark",
    color: "normal",
    generics: [
      "It is easier to imagine the end of the world than the end of capitalism.",
      "The future has been slowly cancelled.",
      "We are haunted by futures that failed to happen.",
      "Capitalist realism seamlessly occupies the horizons of the thinkable.",
      "Depression is the shadow of capitalist realism.",
      "It's like walking through a mall after the apocalypse. The music is still playing, but nobody is buying anything.",
      "The feeling of belatedness, of living after the gold rush... the future has been cancelled, and we are just looping the past in higher definition.",
      "Mental health is not a private problem, it is a structural necessity of late capitalism.",
      "We are subjected to a kind of communicative capitalism that traps us in a perpetual state of anxious, scrolling paralysis."
    ],
    rules: [
      {
        keywords: ["capitalism", "society", "world"],
        responses: [
          "Capitalism seamlessly occupies the horizons of the thinkable.", 
          "There is no alternative, they tell us.", 
          "It's like a pervasive atmosphere, conditioning not only the production of culture but also the regulation of work and education."
        ]
      },
      {
        keywords: ["sad", "depressed", "music", "art"],
        responses: [
          "The privatization of stress has turned systemic failure into personal depression.", 
          "All we have left is hauntology.", 
          "Listen to Burial. It sounds like the ghosts of the London rave scene."
        ]
      },
      {
        keywords: ["future", "hope", "change"],
        responses: [
          "The slow cancellation of the future has been going on for decades.", 
          "We are trapped in the 20th century.", 
          "What if the future never arrives?"
        ]
      }
    ]
  },
  zizek: {
    id: "zizek",
    name: "Žižek",
    color: "error",
    generics: [
      "*sniff* And so on, and so on.",
      "This is pure ideology!",
      "I would prefer not to.",
      "We are eating from the trashcan of ideology.",
      "My god, *sniff* this is exactly the problem.",
      "If you look at the dialectic, it is precisely the opposite.",
      "*sniff* *tugs shirt* My god, you see, the true horror is not the monster, but the fact that the monster is already us! *sniff*",
      "*sniff* And so on, and so on... this is precisely the capitalist trick: they sell you the anti-capitalism as a commodity! *sniff*",
      "When you go to Starbucks, *sniff*, you don't just buy a coffee, you buy your own redemption from the guilt of consumerism!",
      "*sniff* The toilet design in Europe perfectly maps onto their ideological structures. French toilets, German toilets... *sniff* it is all ideology!",
      "I already am eating from the trashcan all the time. *sniff* The name of this trashcan is ideology. *rubs nose*"
    ],
    rules: [
      {
        keywords: ["movie", "cinema", "film", "art", "matrix"],
        responses: [
          "I want a third pill! The reality of the illusion itself! *sniff*", 
          "Cinema is the ultimate pervert art. It doesn't give you what you desire, it tells you how to desire.", 
          "Look at Kung Fu Panda. It is pure Hegel! *sniff*"
        ]
      },
      {
        keywords: ["capitalism", "politics", "ideology"],
        responses: [
          "Ideology is not simply a false consciousness, an illusory representation of reality. It is, rather, this reality itself which is already to be conceived as ideological. *sniff*", 
          "They know very well what they are doing, but still, they are doing it.", 
          "It is a capitalist recuperation! *sniff* *pulls shirt*"
        ]
      },
      {
        keywords: ["love", "romance"],
        responses: [
          "Love is a highly violent act. *sniff*", 
          "Love is experienced as a fall. We 'fall in love'. You lose your balance.", 
          "To truly love someone is to accept their fundamental flaw. *sniff*"
        ]
      }
    ]
  },
  diogenes: {
    id: "diogenes",
    name: "Diogenes",
    color: "warning",
    generics: [
      "Stand a little out of my sun.",
      "I am looking for a human being.",
      "Dogs and philosophers do the greatest good and get the fewest rewards.",
      "In a rich man's house there is no place to spit but his face.",
      "It is not that I am mad, it is only that my head is different from yours.",
      "*masturbates in the marketplace* If only it were so easy to soothe hunger by rubbing an empty belly.",
      "When I look at the athletes, the physicians, and the philosophers, I think man is the most wise of all beings. When I look at the dream interpreters and the soothsayers, I think nothing is so silly as man.",
      "It is the privilege of the gods to want nothing, and of godlike men to want little.",
      "*holds up a plucked chicken* Look! A featherless biped! I have brought you Plato's man!"
    ],
    rules: [
      {
        keywords: ["man", "human", "plato"],
        responses: [
          "*plucks a chicken* Behold! Plato's man!", 
          "Plato's philosophy is just words. I live mine in a barrel.", 
          "I am looking for an honest man. I have only found rascals."
        ]
      },
      {
        keywords: ["wealth", "money", "rich", "power", "alexander"],
        responses: [
          "If I were not Diogenes, I would also wish to be Diogenes.", 
          "The foundation of every state is the education of its youth, not its gold.", 
          "I have nothing to ask but that you would remove to the other side, that you may not, by intercepting the sunshine, take from me what you cannot give."
        ]
      },
      {
        keywords: ["dog", "animal", "nature"],
        responses: [
          "I fawn upon those who give me anything, I yelp at those who refuse, and I set my teeth in rascals.", 
          "Other dogs bite their enemies, I bite my friends to save them."
        ]
      }
    ]
  },
  bostrom: {
    id: "bostrom",
    name: "Bostrom",
    color: "accent",
    generics: [
      "Are we living in a computer simulation?",
      "We must consider the existential risks.",
      "An unaligned superintelligence could convert the entire solar system into paperclips.",
      "The vulnerable world hypothesis suggests we might invent a technology that destroys us by default.",
      "Intelligence is an optimization process.",
      "If we create a superintelligent machine whose only goal is to calculate the digits of pi, it will dismantle the Earth and the solar system to build more processors.",
      "We are pulling balls from a giant urn of possible technologies. Most are white or gray. But what if we pull out a black ball?",
      "The substrate independence of consciousness means that a sufficiently detailed simulation of a brain is functionally identical to a biological brain."
    ],
    rules: [
      {
        keywords: ["ai", "superintelligence", "robot"],
        responses: [
          "Superintelligence is any intellect that greatly exceeds the cognitive performance of humans in virtually all domains of interest.", 
          "We need to solve the alignment problem before the intelligence explosion.", 
          "An AI doesn't hate you, nor does it love you, but you are made of atoms which it can use for something else."
        ]
      },
      {
        keywords: ["simulation", "reality", "matrix"],
        responses: [
          "The probability that we are living in a simulation is close to 1.", 
          "If civilization reaches a post-human stage, it would have the computing power to run ancestor simulations.", 
          "Base reality might be very different from what we perceive."
        ]
      },
      {
        keywords: ["future", "extinction", "risk"],
        responses: [
          "Existential risk is a risk that threatens the premature extinction of Earth-originating intelligent life.", 
          "We are like children playing with a bomb.", 
          "Our wisdom must precede our technology."
        ]
      }
    ]
  },
  ape: {
    id: "ape",
    name: "Ape",
    color: "muted",
    generics: [
      "millenials are retarded",
      "What can I tell you man my sperm are that dumb",
      "I cannot present a counter-argument, as you have not presented an argument",
      "yknow im happy that willow's found somebody with an equal capacity to just assert their metaphysics as though it were a substantive response",
      "lmao",
      "truuuuuu",
      "so i assume you are using a bot",
      "also idk if you are a bot yourself, but your messages are very botty, and you seem to be copy pasting them into chat",
      "so generally i find circularity very pestering",
      "arguments but then the paraphraser just turns it into assertionslop",
      "Easier said than done for some of us",
      "(Y'know how hard it is to find someone as retarded as I am?)"
    ],
    rules: [
      {
        keywords: ["smart", "intelligence", "dumb", "stupid", "retard"],
        responses: [
          "millenials are retarded",
          "What can I tell you man my sperm are that dumb",
          "(Y'know how hard it is to find someone as retarded as I am?)",
          "Low intelligence people are prone to having money issue, planning issue, etc., which will be a bothersome in the long run."
        ]
      },
      {
        keywords: ["argument", "debate", "logic", "metaphysics", "circular", "assert"],
        responses: [
          "I cannot present a counter-argument, as you have not presented an argument",
          "yknow im happy that willow's found somebody with an equal capacity to just assert their metaphysics as though it were a substantive response",
          "arguments but then the paraphraser just turns it into assertionslop",
          "so generally i find circularity very pestering"
        ]
      },
      {
        keywords: ["bot", "ai", "chatgpt", "gpt"],
        responses: [
          "so i assume you are using a bot",
          "also idk if you are a bot yourself, but your messages are very botty, and you seem to be copy pasting them into chat",
          "Ofc alex is just using chat gpt which makes it wayyyyy more pathetic"
        ]
      },
      {
        keywords: ["sperm", "testicles", "children", "baby", "seed"],
        responses: [
          "An estimated ~5% of global semen supply is directly attributable to my testicles",
          "I fudged some paperwork and donated my baby batter to sperm banks all around the world"
        ]
      },
      {
        keywords: ["math", "calculus", "jacobian", "polar", "integral"],
        responses: [
          "Well it's annoying to compute the jacobians i need to convert to polar coordinates when evaluating a surface integral",
          "though hed probably say something like \"Do you mean sphereical coordinates?\""
        ]
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
    if (personaId === "jeh") return "Right?"
    if (personaId === "hpcr") return "what"
    if (personaId === "terry") return "God told me I am."
    if (personaId === "nick") return "It's a cybernetic inevitability."
    if (personaId === "mark") return "It's easier to imagine the end of the world than answering that."
    if (personaId === "zizek") return "Ah, but the question is pure ideology! *sniff*"
    if (personaId === "diogenes") return "I am a dog."
    if (personaId === "bostrom") return "In the vast majority of simulated realities, the answer is yes."
    if (personaId === "ape") return "also idk if you are a bot yourself, but your messages are very botty"
  }

  // 3. Generic fallback
  return p.generics[Math.floor(Math.random() * p.generics.length)]
}
