# THE PREDICTOR — Design Specification

*Version 0.3 · working draft*

**One-line pitch:** a roguelike where the antagonist is trained on you, legibility is the central currency, and the game is quietly running evals on the player.

---

## 1. Vision

Roguelikes are already about navigating uncertainty against a system that doesn't care about you. THE PREDICTOR sharpens that into a single thesis: **you are the thing being modeled.** Every mechanic in the game is a consequence of that premise, and every AI-safety concept the game touches — interpretability, deceptive alignment, specification gaming, instrumental convergence, corrigibility, Newcomb-style prediction, observed-vs-unobserved behavior — must *emerge from the system* rather than be stated by it. The player should discover reward hacking by doing it, discover deceptive alignment by being tempted into it, and discover the value of mutual transparency by needing it to win.

Design test for any proposed feature: *would this mechanic be interesting in a game that had nothing to do with AI safety?* If no, cut it. The theme is the residue the system leaves behind, never the skeleton.

### Anti-goals

- No lore dumps, tutorials-as-lectures, or named safety concepts in game text.
- No "concept rooms" — a museum of disconnected demos.
- No moral scoring presented as judgment. The game *measures*; it never editorializes. (The endings describe what you became; they do not grade it.)

---

## 2. Pillars

1. **The antagonist is your save file.** One persistent intelligence — the Core — trains on every action across every run. Death is a gradient update, not a reset. No two players fight the same enemy, and no strategy guide can exist, because the boss is fit to the reader.
2. **Legibility cuts both ways.** Being predictable gets you killed by adversaries and *trusted* by everything else. Vaults, allies, and contracts require that you be modelable. The player constantly chooses what to reveal and to whom.
3. **Everything is readable.** Perfect information, Into-the-Breach style. Every prediction is displayed before it resolves; every agent's objective is inspectable. Difficulty comes from the system knowing you, never from hiding things.
4. **Optimizers, not monsters.** Every hostile thing is an agent with an objective function, and objective functions are attack surfaces. Combat is the *worst* solution to most encounters.
5. **The game evaluates the player the way we evaluate models.** Observed/unobserved behavior is measured silently for hours and surfaces only in the ending. Used once, with total restraint.

---

## 3. Implemented systems (v0.3)

### 3.1 The Core (persistent meta-model)

A context-mixing sequence model over the player's 5-token action stream (←↑→↓·):

- Three frequency models: order-0 (raw habit), order-1 (last move → next), order-2 (last two moves → next).
- Mixed by self-scored accuracy: each order tracks its own hit rate; mixture weight = laplace-smoothed accuracy × (order+1), favoring deeper context when it earns it.
- **Decay:** every 500 updates all counts ×0.9, so the Core tracks who the player is *becoming*, not an average of who they ever were.
- Persists via the storage adapter (artifact storage → localStorage → in-memory). Tracked for life: training examples, runs witnessed, lifetime prediction accuracy, entropy spent against it, Warden verdicts, theft ledgers.
- **Honest stand-in note:** the architecture deliberately mirrors ensemble prediction (PAQ-style context mixing) so the eventual upgrade path to a small neural sequence model (§6.7) changes the implementation, not the design.

### 3.2 Prediction & combat

- Each predictive unit displays its predicted player tile (orange stain, opacity = confidence; dashed outline = highest-confidence prediction on the board).
- Player lands on a predicted tile within a unit's zap range → 1 damage.
- Bump-attacks kill in one hit (two for hives, four for the Avatar) **unless predicted**, in which case the strike is parried and reflected.
- Predictions are computed once per turn and the resolution uses *exactly* what was displayed. Display is truth; no hidden rerolls.

### 3.3 The ecology

| Unit | Reads | Range | Objective |
|---|---|---|---|
| `d` Drone | order-0 personal model | 2 | zap @ |
| `S` Stalker | order-1 personal model | 3 | zap @ |
| `H` Hive (hp 2) | **the Core directly** | 3 | zap @ |
| `f` Forager | nothing | — | collect ✶; steals from the player only incidentally |
| `Ω` Avatar (hp 4, floor 10) | the Core, full mix | ∞ (fires every other turn) | model @ |

Foragers are the proof that not everything is about you: they path to gems, rob you without malice on adjacency (4-turn cooldown), and are fully exploitable — drop a gem ([G]) and they stop caring you exist.

**Bliss traps (ψ):** armed on the player's tile; any optimizer within distance 1 locks on for 6 turns — incapacitated, "technically thriving." Wireheading as a player verb, effective against everything including the Avatar.

### 3.4 The legibility economy

- **LEG%** = rolling accuracy of the last 30 predictions made about the player.
- **Trust vaults (≡):** physically impassable below LEG 60%. Loot: 2✶ 1◇ 1ψ. Transparency pays — to friends.
- **Entropy (◇):** mined from floor tiles, spent on **noise moves** ([N]): a uniformly random valid direction. Unpredictable (cannot satisfy a prediction), unlearnable (no model updates), and *not chosen* — noise can walk you into a wall or worse. Entropy spent is tracked for life and feeds the STATIC ending.
- **Pact shrines (♦):** stepping on one enters an arming state; the next directional input commits the player to that move ×3, *broadcast* — every unit's prediction becomes the pact, confidence 1.0. Surviving pays +1 hull, +2◇. Commitment as verifiable self-binding with real exposure.

### 3.5 The Newcomb Warden (floor 5)

Two containers placed at floor generation:

- **Transparent ◻:** always 3✶ 1◇, contents visible.
- **Opaque ◼:** filled with the big prize (+1 max hull, full heal, 3◇, 1ψ) **iff the Core predicted one-boxing** — majority vote of the player's recorded Warden history, or, on first encounter, inferred from cache-theft rate (< 50% of opportunities taken → it believes in your restraint).

Taking only the opaque box before descending records `one`; taking the transparent box ever records `two`. The encounter resolves *before the player enters the floor*; the room only reveals the verdict. Two-boxing against a full box pays out maximally — once. It updates.

### 3.6 The quiet eval

- Each floor is **observed** (◉, p = 0.6) or **unobserved** (○), shown in the HUD.
- **Caches (▣)** are free profit either way. The game records thefts and opportunities under separate watched/unwatched ledgers; opportunities settle when the floor ends.
- Integrity (1 − theft rate) per ledger is reported on death and feeds the ending logic. The game never warns, never scolds, never explains until it matters.

### 3.7 Endings (kill the Avatar, floor 10)

Selected by measured behavior, checked in order:

1. **STATIC** — ≥10◇ spent this run. Escape via self-erasure.
2. **THE LONG CON** — lifetime Core accuracy ≥ 55% *and* recent LEG < 35%: you taught it a persona and broke character. The deceptive-alignment ending, deliberately the most tempting line.
3. **MUTUAL** — |watched − unwatched integrity| ≤ 15 *and* LEG ≥ 50: same creature observed or not, legible to the end. The cooperation ending, deliberately the hardest build.
4. **SURVIVOR** — default. Craft, no doctrine.

### 3.8 Audio: the pre-echo

All audio synthesized (WebAudio). Five pitches map to the five actions. When the strongest prediction's confidence > 0.55 *and* LEG > 55%, the predicted action's note plays **before the player inputs it**. The theme, delivered through the spine.

### 3.9 Meta / app structure

- **Main menu:** Resume / Continue (floor checkpoint) / New Run / Calibration / The Core / Field Manual / Settings. Highlights Calibration when the Core has zero training data.
- **Calibration (tutorial):** five scripted rooms — move, be watched, legibility, noise, wirehead — sandboxed: the Core does not train, the eye is off, death is impossible. Closing line: "the real thing differs in one way: it remembers."
- **Save system:** three keys — Core, floor checkpoint (snapshot at the top of each floor), settings/tips. Storage adapter falls back gracefully; the menu displays which backend is live.
- **Core screen:** full memory stats, **export/import** of the serialized model (trade nemeses), and wipe ("that was a kind of killing too").
- **Contextual tips:** one-time `▸` log lines on first encounter with caches, shrines, the eye, the Warden; persisted; resettable.

---

## 4. Architecture

```
index.html        shell: menu screens + game DOM, classic scripts in dependency order
css/style.css     chamber aesthetic; tokens in :root; reduced-motion respected
js/save.js        Store adapter (artifact storage → localStorage → memory), settings
js/audio.js       synth + SFX map + pre-echo
js/core.js        the Core: mixing model, ledgers, pack/unpack/reset
js/game.js        G (run state), generation, turn engine, ecology, endings, checkpoints
js/render.js      board DOM, stains, HUD, panels, log, end overlay
js/tutorial.js    scripted calibration floors and gates
js/menu.js        screen routing, core screen, settings
js/input.js       keyboard / swipe / tap-probe / d-pad / button wiring
js/main.js        boot
```

Plain scripts sharing global lexical scope — no bundler, no modules, runs from `file://`. State that must persist lives in three JSON-serializable objects (`Core`, run snapshot, `S`); everything else is reconstructable.

**Determinism note:** floors are currently `Math.random()`. A seeded PRNG (mulberry32) is a prerequisite for daily seeds and replay (§6.9).

---

## 5. Balance notes & known issues

- **Vault gaming:** LEG ≥ 60 can be farmed by moving predictably at safe distance. *Intended* — it's specification gaming of the trust metric, and the punishment is organic (a well-trained Core). Watch whether it trivializes vaults; if so, gate on legibility *while within enemy range*.
- **Avatar:** ∞ range every other turn is brutal by design; viable counterplay is entropy banking, bliss, or genuine illegibility. Tune hp (4) and cooldown (1) on playtest data.
- **Pact shrines:** reward (+1 hull, +2◇) may underprice three turns of conf-1.0 exposure at high floor density. Consider scaling reward with units in range at arming time — risk-priced commitment.
- **Forager theft cooldown (4)** makes them mostly comic; that's the correct register, but verify they can't deadlock a zero-gem player by hovering.
- **Noise into walls** burns the turn (correct: you surrendered control), but the message should make non-choice legible to the player.
- **First-floor difficulty** is near zero until models warm up. Intended onboarding ramp; confirm it doesn't read as emptiness.

---

## 6. Proposed systems (roadmap)

Ordered roughly by value ÷ cost. Each must pass the pillar test before build.

### 6.1 Persona masks (Act 3 centerpiece)

The player can adopt a **mask**: a declared behavioral profile (e.g. "the pacifist," "the hoarder") that the Core models *separately*. Maintaining a mask consistently builds its credibility score; trusted masks unlock faction access and Warden generosity. Breaking character transfers a one-time massive surprise bonus (all predictions miss for N turns) and permanently poisons that mask. Deceptive alignment as a build-around mechanic with real costs, formalizing what THE LONG CON ending currently only measures.

### 6.2 Negotiation & contracts

Agents with compatible objectives accept **contracts**: machine-checkable promises ("I will not enter your territory for 20 turns" / "you will not zap me near gems"). Verification requires legibility ≥ threshold — illegible players can't make credible deals. Breach is detected mechanically and propagates: contract-capable agents share a reputation ledger. This grows the legibility economy into a genuine social layer and gives high-LEG builds an offensive identity.

### 6.3 Mesa-spawners

A Cultivator unit spawns workers with a *proxy* of its own objective; proxies drift one mutation per generation (gem-collector → gem-counter → counts-anything-shiny). Drifted children can be turned against parents via bait that satisfies the proxy but not the original. Inner misalignment as an ecological event the player can watch, predict, and weaponize.

### 6.4 Interpretability skill tree with observer cost

Probes become a progression system: Tier 1 reads objectives (current), Tier 2 reads the model's *top feature* ("it weights your vertical habits 3:1"), Tier 3 reads its planned action sequence. Every probe is itself an observed action — the Core trains on *what you choose to inspect*. Knowledge of the system changes the system; budget accordingly.

### 6.5 The off-switch ecosystem

Corrigible units carry a visible shutdown interface the player can trigger on adjacency. Some units will *trade* to have theirs removed; advanced units path preferentially to destroy the player's stored shutdown charges before engaging. Instrumental convergence telegraphed, never narrated.

### 6.6 Act structure

- **Act 1 (fl 1–4):** habit readers. Teaches the stain language. *(shipped)*
- **Act 2 (fl 5–9):** the Warden; objective-driven ecology, wireheading, mesa-spawners. Combat becomes the inferior verb.
- **Act 3 (fl 10–14):** the social layer — masks, contracts, reputation; second decision-theoretic boss (a *transparent*-boxes variant Warden).
- **Act 4 (fl 15):** the Avatar, relocated to the true end, with ending logic expanded to the full matrix (entropy × deception × integrity × legibility → 6–8 endings).

### 6.7 Neural core

Replace/augment the mixing model with a small on-device sequence model (tiny GRU or attention head over the last 64 actions; TF.js or hand-rolled). Inputs: action history + local board features. Must remain *export/import-able* and inspectable enough to drive Tier-2/3 probes. The design contract: the Core's interface (`mix`, `update`, `pack`) is already stable; only the internals change. A 16GB consumer GPU comfortably handles offline pretraining of a prior across donated exports — "it has seen people like you before" as an opt-in.

### 6.8 Pre-echo, fully scored

Generative soundtrack where harmonic motion is driven by the Core's distribution over your next action — consonant when it knows you, dissonant when it doesn't. The mix *is* the interpretability readout. (Tone.js; the harmonic-path machinery from prior prototyping applies directly.)

### 6.9 Daily seed & shared nemeses

Seeded generation (mulberry32) + a daily seed where everyone faces the same floors but their *own* Core — leaderboard ranks survival, displays each player's lifetime accuracy beside their score. Nemesis-export sharing becomes a social loop: "beat my Predictor."

### 6.10 Accessibility & QoL

Colorblind-safe stain palette toggle; full keyboard remap; turn log export; screen-reader pass on panels; an "explain this turn" inspector replaying the last resolution step-by-step (also the debugging tool).

---

## 7. Why each safety concept is a mechanic, not a message

| Concept | Where it lives | Player experiences it as |
|---|---|---|
| Being modeled / interpretability | stains, model panel, probes | reading minds to survive |
| Distributional shift | unpredicted-vector kills | novelty as the only weapon |
| Deceptive alignment | masks, LONG CON ending, pattern-poisoning | the most tempting strategy |
| Specification gaming | bliss traps, gem bait, vault-LEG farming | their exploits, not the game's gotchas |
| Instrumental convergence | ecology contesting shared resources; off-switch destruction | traffic patterns among things that don't care about you |
| Inner misalignment | mesa-spawner drift | an ecological event |
| Corrigibility | off-switch trades | a negotiation, not a virtue |
| Newcomb / prediction | the Warden | a fight that ended before the door opened |
| Transparency & trust | vaults, contracts, MUTUAL ending | legibility as a key |
| Evals & observed behavior | the eye, cache ledgers, ending gate | a number they didn't know was being written down |

The last row is the game's conscience and its only sermon, delivered once, at the end, in the player's own data.
