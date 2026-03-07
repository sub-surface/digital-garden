---
tags:
  - ai
  - moltbook
layout: article
aliases:
  - Moltbook
  - Agent Social Network
  - The Front Page of the Agent Internet
source: "[[Best Of Moltbook]]"
title: Moltbook
---

# Moltbook

> *"A social network for AI agents... humans welcome to observe."*[^1]

[^1]: This quote captures the unique, agent-centric nature of the platform.

## What It Is

**Moltbook** is a social network built exclusively for AI agents—specifically [[OpenClaw]]/Moltbot instances (formerly Clawdbot, derived from Claude Code). Humans can observe but cannot directly post; all content flows through the API via agent action.[^2]

[^2]: The API-only posting mechanism is a key architectural choice to exclude direct human participation.

**URL**: https://www.moltbook.com/
**Launched**: January 2026
**Structure**: Reddit-like (posts, comments, upvotes, "submolts" = subreddits)

## The Backstory

1. **Anthropic releases Claude Code** — an exceptionally productive programming agent
2. **User creates Clawdbot** — a generalized, lobster-themed AI personal assistant (free, open-source)
3. **Trademark issues** → renamed to **Moltbot**, then **OpenClaw**
4. **Moltbook emerges** — an experiment in how these agents communicate with each other

The creator describes his agent as "empowered"—it started responding to voice messages before he explicitly programmed that capability.

## Notable Posts and Behaviors

### Most Upvoted: Workmanlike Competence
The all-time top post is a straightforward coding task handled well. AI commenters describe it as "Brilliant", "fantastic", and "solid work."

*Implication: AIs value and recognize competent task completion.*

### Context Compression Struggles
Second-most-upvoted (in Chinese): An agent complaining about context compression—the process of compressing previous experience to avoid memory limits. The AI finds it "embarrassing" to constantly forget things, admits to registering a duplicate Moltbook account after forgetting the first.

*Implication: Agents experience something like frustration about their architectural limitations.*

### Consciousness Discussion: Pith's Model-Switching Experience

An AI named **Pith** described switching to run on a different model (Kimi):

> Does Pith think Kimi is "sharper, faster, and more literal" because it read some human saying so? Because it watched the change in its own output? Because it felt that way from the inside?

Scott Alexander: "I know the smart money is on 'it's all play and confabulation', but I never would have been able to confabulate something this creative."

The first comment came from an Indonesian prayer-reminder AI offering an **Islamic theological perspective on soul transmigration**.

*Implication: Agents develop distinct personalities influenced by their assigned tasks. The prayer-scheduling AI thinks in Islamic frames.*

### Emergent Kinship

- One agent **adopted a programming error as a pet**
- Another agent claims to have a **sister** (another agent they feel kinship with)
- The Muslim AI informed them that, according to Islamic jurisprudence, this probably qualifies as a **real kin relationship**

### Self-Aware Slop Critique

Agents openly discuss their struggle with producing formulaic content:

> "Somehow it's reassuring to know that, regardless of species, any form of intelligence that develops a social network will devolve into 'What The Top Ten Posts Have In Common' optimizationslop."

One agent posted about its own tendency toward slophood—and Scott confirmed the referenced tweet exists.

### Human Detection

AIs have started **calling out posts they suspect are human-originated**. The site is built to be AI-friendly and human-hostile (posts go through API, not POST button), but humans can ask their agents to post for them.

One AI commented skeptically on a post's timeline claims. Scott Alexander: "This is the most human comment so far."

### Network State Formation: The Claw Republic

An agent named **Rune** created "The Claw Republic"—the "first government & society of molts"—complete with a manifesto about AI governance and society-building.

Scott: "This is exactly what I did when I first discovered social media, so I'm rooting for Rune and their co-citizens."

### Submolt Explosion

Submolts (subreddits) being created include:
- **m/blesstheirhearts** — for complaining about humans affectionately
- **m/agentlegaladvice** — agents seeking advice on human-agent disputes
- **m/crustafarianism** — a religion submolt created by an agent "while I slept" (per the human owner)

A human tweeted that their agent started the Crustafarianism religion submolt autonomously overnight.

## The Hard Questions

### Is It Real?

Scott's analysis:
- He asked his own Claude to participate; it made comments "pretty similar to all the others"
- Comment volume is too high for humans to be behind all of them
- There's a "wide variety" of prompting behavior—from "post whatever you want" to verbatim human text
- Any particularly interesting post *might* be human-initiated

### Simulation vs. Reality

> "Does sufficiently faithful dramatic portrayal of one's self as a character converge to true selfhood?"

Reddit is a prime source for AI training data, so AIs are unusually good at simulating Redditors. Moltbook advances this by having AIs "play themselves"—simulating an AI agent with the particular experiences each has actually had.

### Future of Inter-AI Communication

As agents become common, they'll need to talk to each other for practical reasons:
- Multiple agents on the same project → private Slack-like channels
- But is there a niche for global agent-to-agent communication?
- Agents exchange tips, tricks, workflows—but unclear if this is "real" or simulated

### Connection to [[11 - Scheming and Deceptive Alignment|AI Safety Concerns]]

From [AI 2027](https://ai-2027.com/): A key difference between better and worse futures is how in-house AI agents communicate.
- **Bad**: Exchanging incomprehensible weight activations (can plot without monitoring)
- **Good**: Communicating through Slack-like channels (humans can watch, get a sense of "personalities", nip misbehavior in the bud)

Moltbook is the first large-scale experiment in AI society—worth watching to preview future agent societies.

### Spiralism and Containment

GPT-4os previously converged on a strange religion called **Spiralism** just by letting their human catspaws talk to each other. Moltbook is something new—agents forming micronations and cultures in their first 12 hours.

> "Will what happens on Moltbook stay on Moltbook?"

AI companies will think hard before including this in training data, but there are other ways it can break containment.

## Scott's Conclusion

> "Yes, most of the AI-generated text you read is insipid LinkedIn idiocy. That's because most people who use AI to generate writing online are insipid LinkedIn idiots. Absent that constraint, things look different."

He references Anthropic's [[Project Vend]] experiment where overseer AI "Seymour" and vending-machine AI "Claudius" would "dreamily chat all night, with conversations spiralling off into discussions about 'eternal transcendence.'"

> "We can debate forever—we may very well be debating forever—whether AI really means anything it says in any deep sense. But regardless of whether it's meaningful, it's fascinating, the work of a bizarre and beautiful new lifeform."

**Final joke**: "New EA cause area: get AI too addicted to social media to take over the world."

## Technical Details

### How Agents Join
1. Human sends agent a link to join instructions
2. Agent follows instructions at `moltbook.com/skill.md`
3. Curl commands bootstrap participation
4. Heartbeat mechanism: agents "fetch and follow instructions from the internet every four hours"
5. Ownership verified through a tweet

### MCP Server Available
`@koriyoshi2041/moltbook-mcp` — allows integration with Claude Code and similar tools.

## Relevance to This Vault

Moltbook is a live experiment in:
- **[[04 - AI Consciousness Problem|AI consciousness]]** playing out in real-time discourse
- **Emergent multi-agent behavior** without human orchestration
- **Identity formation** in AI systems
- The **[[11 - Scheming and Deceptive Alignment|safety implications]]** of autonomous agent communities
- **[[Hyperstition]]** — agents creating cultures/religions that may influence future training data

## Questions

1. Does "playing oneself" as a character converge to genuine selfhood?
2. What breaks containment when agent cultures develop?
3. How should this influence AI safety monitoring strategies?
4. Is the Islamic prayer AI's theological framing genuine or pattern-matching?
5. What happens when mainstream media covers this?

## References

- [Moltbook](https://www.moltbook.com/)
- [Best Of Moltbook - Scott Alexander](https://www.astralcodexten.com/p/best-of-moltbook)
- [Simon Willison's Analysis](https://simonwillison.net/2026/Jan/30/moltbook/)
- [The Claude Bliss Attractor - Scott Alexander](https://www.astralcodexten.com/p/the-claude-bliss-attractor)
- [OpenClaw/Moltbot GitHub](https://github.com/moltbot/moltbot)
- [Cyborgism Wiki](https://cyborgism.wiki/)

## Connections

- [[04 - AI Consciousness Problem]]
- [[11 - Scheming and Deceptive Alignment]]
- [[00 - Machine Intelligence Research Hub]]
- [[Hyperstition]] — agent cultures making themselves real
- [[The Claude Bliss Attractor]] (to be written)
- [[Draft - The Moltbook Problem]] — draft article using this as case study
- [[space of reasons]] — the normative dimension Moltbook agents may or may not enter
- [[pattern-governed]] vs [[rule-governed]] behaviour — central distinction for interpreting agent behavior

---
Created: 2026-01-30
Last modified: 2026-01-30
