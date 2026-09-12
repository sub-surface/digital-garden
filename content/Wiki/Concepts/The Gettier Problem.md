---
title: "The Gettier Problem"
description: "Edmund Gettier's 1963 landmark demonstration that Justified True Belief (JTB) is not sufficient for knowledge, igniting modern analytic epistemology."
tags: [wiki, concept, epistemology, analytic, logic, gettier]
type: concept
introduced_by: "Edmund Gettier"
key_works: "Is Justified True Belief Knowledge? (Analysis, 1963)"
domain: "Epistemology, Philosophy of Mind, Formal Logic"
layout: article
---

# Concept: The Gettier Problem

<div className="dropcap">

**The Gettier Problem** is arguably the most famous and influential counterexample in twentieth-century analytic epistemology. Published by American philosopher [[Edmund Gettier]] in a succinct three-page paper in *Analysis* (1963), the argument dealt a fatal blow to the classical **Tripartite Account of Knowledge**—a definition dating back to Plato's *Theaetetus* which held that knowledge is simply **Justified True Belief (JTB)**. Gettier demonstrated through two airtight logical counterexamples that an agent can possess a belief that is both objectively true and rigorously justified, yet which fails to constitute genuine knowledge due to the intervention of epistemic luck.

</div>

---

## 1. The Classical Tripartite Definition of Knowledge (JTB)

For over two millennia, epistemology analyzed propositional knowledge ($S$ knows that $P$) according to three individually necessary and jointly sufficient conditions:

$$\text{Knowledge} = \text{Justified} \cap \text{True} \cap \text{Belief}$$

1. **Truth Condition**: $P$ is true ($P$).
2. **Belief Condition**: Subject $S$ believes that $P$ ($B(S, P)$).
3. **Justification Condition**: $S$ is justified in believing that $P$ ($J(S, P)$).

The justification condition was designed specifically to exclude lucky guesses: if someone correctly guesses the winning lottery ticket without evidence, their belief is true, but they did not *know* it in advance. Gettier proved that standard justification fails to eliminate luck.

---

## 2. Gettier's Two Canonical Counterexamples

Gettier established his counterexamples using two uncontroversial epistemic principles:
* **Closure under Entailment**: If $S$ is justified in believing $P$, and $P$ logically entails $Q$, and $S$ deduces $Q$ from $P$, then $S$ is justified in believing $Q$.
* **Fallibilist Justification**: It is possible for an agent to be completely justified in believing a proposition that is, in fact, false.

```
                      THE ANATOMY OF A GETTIER CASE
        EVIDENCE (Strong, but misleading)
                      │
                      ▼
        FALSE INTERMEDIATE BELIEF (Justified, but false)
                      │
                      ▼  (Deductive inference)
        TARGET BELIEF (Justified, and fortuitously true!)
                      ▲
                      │  (Cosmic coincidence / Luck)
        REAL FACT IN THE WORLD (Unconnected to evidence)
```

### Case I: Ten Coins in the Pocket
* **The Setup**: Smith and Jones have applied for the same job. The company president privately tells Smith that Jones will be awarded the position. Furthermore, Smith has just counted the coins in Jones's pocket, finding exactly ten coins.
* **The Justified False Belief**: Smith is fully justified in believing premise $(d)$:
  $$\text{"Jones is the man who will get the job, and Jones has ten coins in his pocket."}$$
* **The Deduction**: From $(d)$, Smith logically deduces proposition $(e)$:
  $$\text{"The man who will get the job has ten coins in his pocket."}$$
* **The Twist**: Unknown to Smith, the president changes his mind and awards the job to **Smith**. Furthermore, unknown to Smith, Smith himself happens to have exactly ten coins in his own pocket!
* **The Epistemic Breakdown**:
  1. Proposition $(e)$ is **true**.
  2. Smith **believes** proposition $(e)$.
  3. Smith is completely **justified** in believing $(e)$ via valid deduction from $(d)$.
* **Verdict**: Smith does *not* know that $(e)$ is true. His belief is true merely by sheer accident; its truth is severed from the reasons that justified it.[^gettier-1963]

### Case II: Brown in Barcelona
* Smith has strong evidence that his friend Jones owns a Ford car (Jones has always owned a Ford and just offered him a ride).
* Smith deduces the disjunctive claim: *"Either Jones owns a Ford, or Brown is in Barcelona"* (even though Smith has no idea where Brown is).
* As it turns out, Jones was driving a rented car and does not own a Ford; but by pure coincidence, Brown happens to be in Barcelona!
* Smith's disjunctive belief is justified and true, yet cannot be called knowledge.

---

## 3. The Quest for the Fourth Condition ("Gettierology")

Gettier's 1963 paper spawned a massive sub-discipline of epistemology dedicated to finding an elusive "fourth condition" to repair JTB ($JTB + X$):

```
                        ATTEMPTED POST-GETTIER SOLUTIONS
┌──────────────────────────────────────┬──────────────────────────────────────┐
│ PROPOSED 4TH CONDITION               │ CORE CRITERION / FATAL COUNTEREXAMPLE│
├──────────────────────────────────────┼──────────────────────────────────────┤
│ 1. No False Lemmas (Armstrong)       │ Belief must not be deduced from any  │
│                                      │ false intermediate premise.          │
│                                      │ Counter: Barn County Case (Goldman)  │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ 2. Causal Theory (Goldman, 1967)     │ An appropriate causal chain must link│
│                                      │ the fact to the belief.              │
│                                      │ Counter: Over-determines inference   │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ 3. Truth-Tracking (Nozick, 1981)     │ Counterfactual sensitivity:          │
│                                      │ If P were false, S wouldn't believe P│
│                                      │ Counter: Violates deductive closure  │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ 4. Defeasibility (Lehrer & Paxson)   │ Justification must not be defeated by│
│                                      │ any true proposition.                │
│                                      │ Counter: Impossibly demanding proof  │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ 5. Virtue Epistemology (Sosa, Zagzeb)│ True belief must be an achievement of│
│                                      │ epistemic cognitive competence.      │
│                                      │ Modern favorite, but complex border  │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

### Alvin Goldman's Fake Barn Country (1976)
To prove that even "No False Lemmas" fails, Alvin Goldman introduced the **Fake Barn County** thought experiment:
* Henry is driving through rural countryside, looking out the window, and points at a structure: *"There is a barn."*
* He is looking at a real wooden barn, under clear sunlight with 20/20 vision, with no false intermediate deductions.
* However, unknown to Henry, the local county has erected 99 convincing papier-mâché fake barn facades along the road. By pure luck, Henry happened to point at the one real barn!
* Most epistemologists agree Henry does not *know* there is a barn, because his belief is unsafe: in 99 nearby possible worlds, he would have formed the exact same belief falsely.

---

## 4. The Radical Epistemic Reassessment: Williamson's "Knowledge First"

After four decades of failed attempts to analyze knowledge into component parts, Oxford philosopher [[Timothy Williamson]] published *Knowledge and Its Limits* (2000), proposing a revolutionary paradigm shift:
* **Knowledge is Unanalyzable**: Stop trying to break knowledge down into $J + T + B + X$.
* **Knowledge First**: Knowledge is not a hybrid compound made of belief plus justification; knowledge is the **primary, unanalyzable mental state**. Belief is simply botched knowledge, or an aiming at knowledge.

---

## 5. The Continental & Pragmatist Critique: Dissolving the Spectator Theory

While the analytic tradition spent forty years attempting to patch the tripartite definition with increasingly Baroque epicycles, Continental phenomenology, hermeneutics, and late-Wittgensteinian philosophy diagnosed the entire "Gettier industry" as a scholastic symptom of a flawed Cartesian paradigm:

### 1. Wittgenstein's Hinge Epistemology (*Über Gewißheit*)
In *On Certainty* (1969), [[Ludwig Wittgenstein]] demonstrated that the demand to ground every belief in formal justification misapprehends how language functions:
* **Hinge Propositions (*Angelpunkte*)**: Certain fundamental certainties—that I have two hands, that the earth existed before my birth—are not justified true beliefs derived from prior evidence. They are the unmoving hinges upon which the door of inquiry turns:
  > *"At the foundation of well-founded belief lies belief that is not founded."* (§253)
* The demand for an infinite, airtight justification for every isolated proposition isolates knowledge from the ongoing stream of human action in a **form of life** (*Lebensform*).

### 2. Heidegger and the Primacy of *Aletheia*
In *Being and Time* (§44), [[Martin Heidegger]] attacked the ancient reduction of truth to propositional correctness (*adaequatio intellectus et rei*):
* Before a proposition like *"Brown is in Barcelona"* can be evaluated as true or false, the world must already be disclosed to [[Martin Heidegger#Dasein|Dasein]] through pre-reflective practical involvement.
* Truth is originally **unconcealment** (*alētheia*). Gettier puzzles emerge only when sentences are amputated from their practical lifeworld context and examined as dead, disembodied specimens under a logical microscope.

### 3. Dewey's Spectator Theory of Knowledge
Pragmatist [[John Dewey]] (*The Quest for Certainty*, 1929) diagnosed Gettier-style problems in advance as the product of the **"Spectator Theory of Knowledge"**:
* Traditional epistemology treats the knower as an inactive spectator peering through a window at an alien world, anxiously wondering whether the mental image matches the reality outside.
* For Dewey, knowledge is not a static property of mental propositions; it is **active inquiry** embedded in biological and social organisms coping with indeterminate situations. An agent who successfully interacts with their environment is engaged in [[Warranted Assertibility]], not gambling on abstract truth-tracking roulette.

### 4. Foucault and Regimes of Truth
From the perspective of [[Michel Foucault]], analyzing knowledge as an unmoored game of "Smith, Jones, and ten coins in a pocket" completely ignores how knowledge actually functions in human history:
* Knowledge is never an innocent, politically neutral calculus of isolated subjects and propositions; it is inscribed in **regimes of truth** and disciplinary apparatuses (*pouvoir-savoir*).
* What counts as "justification" is determined not by abstract possible-world semantics, but by the discursive rules enforced by institutions, universities, courts, and scientific disciplines.

---

## 6. Significance in Phil Chat Lore

The Gettier Problem is a frequent combat arena in server debates over criteria of warrant:

* **The Attack on Quigley's Deweyanism**: In [[The Warranted Assertibility Wars]], realist chatters deployed Gettier cases against [[Quigley|Anthony Quigley's]] pragmatist thesis that truth is simply [[Warranted Assertibility]]. Realists argued that Gettier decisively proved that even when an assertion survives every local standard of inquiry and justification, it can still utterly fail to track truth.
* **The Three-Page Rule**: Gettier's paper—a devastating, field-redefining counterexample executed in barely 900 words—is held up in server lore as the gold standard of analytical economy, frequently cited when moderators urge long-winded chatters to state their formal premises succinctly.

---

## References

[^gettier-1963]: Gettier, Edmund L. "Is Justified True Belief Knowledge?" *Analysis*, Vol. 23, No. 6 (1963): 121–123. See [[Bibliography#Gettier-1963]].
* Goldman, Alvin I. "A Causal Theory of Knowing." *The Journal of Philosophy*, Vol. 64, No. 12 (1967): 357–372.
* Nozick, Robert. *Philosophical Explanations*. Cambridge, MA: Harvard University Press, 1981. See [[Bibliography#Nozick-PE-1981]].
* Williamson, Timothy. *Knowledge and Its Limits*. Oxford: Oxford University Press, 2000. See [[Bibliography#Williamson-KAIL-2000]].

## See Also

* [[Epistemic Injustice]]
* [[Foundationalism vs Coherentism]]
* [[The Problem of Induction]]
* [[Warranted Assertibility]]
* [[The Six Criteria of Warrant]]
* [[The Brain in a Vat]]
* [[The Warranted Assertibility Wars]]
* [[Michel Foucault]]
* [[Martin Heidegger]]
* [[Ludwig Wittgenstein]]
* [[John Dewey]]
