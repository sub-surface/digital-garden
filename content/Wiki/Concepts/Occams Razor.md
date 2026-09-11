---
title: "Occam's Razor"
description: "The principle of ontological parsimony: entities must not be multiplied beyond necessity. History from medieval nominalism to modern Bayesian model selection."
tags: [wiki, concept, epistemology, metaphysics, philosophy-of-science, logic]
type: concept
field: Epistemology, Philosophy of Science, Metaphysics
status: Canonical
originator: "William of Ockham (c. 1287–1347)"
aliases: ["Occams Razor", "Principle of Parsimony", "Law of Parsimony", "Lex Parsimoniae"]
key_debates:
  - "Ontological vs. Syntactic Parsimony"
  - "Bayesian Model Selection & Occam Factor"
  - "Chatton's Anti-Razor"
  - "Leibniz's Principle of Plenitude"
---

# Occam's Razor

<div className="dropcap">

**Occam's Razor** (*Novacula Occami*, also known as the **Principle of Parsimony** or *lex parsimoniae*) is a foundational methodological and epistemic maxim stating that when presented with competing hypotheses that explain the data equally well, one should select the hypothesis that introduces the fewest assumptions, theoretical entities, or ontological postulates.

</div>

Popularly attributed to fourteenth-century Franciscan friar and scholastic philosopher **[[William of Ockham]]**, the maxim is canonically summarized in the Latin dictum:

$$\textit{Entia non sunt multiplicanda praeter necessitatem}$$
$$\text{("Entities must not be multiplied beyond necessity")}$$

Although this exact phrase does not appear verbatim in Ockham's surviving manuscripts, equivalent formulations appear throughout his work, notably: *"Plurality should not be posited without necessity"* (*Pluralitas non est ponenda sine necessitate*, *Sentences* I, dist. 2, q. 4) and *"It is futile to do with more things that which can be done with fewer"* (*Frustra fit per plura quod potest fieri per pauciora*, *Summa Totius Logicae* I, c. 12)[^ockham-summa-ref].

---

## 1. Historical Genesis & Scholastic Context

### Pre-Ockham Precedents
The instinct toward theoretical economy predates scholasticism:
* **Aristotle**: In *Posterior Analytics* (I.25), Aristotle writes: *"We may assume that that demonstration is superior which, other things being equal, depends on fewer postulates or hypotheses."* Similarly, *Physics* (VIII.6) maintains that nature operates by the shortest possible path.
* **Robert Grosseteste & Odo Rigaldus**: Thirteenth-century theologians routinely invoked the principle that God does not perform through complex means that which can be accomplished through simple ones (*natura agit per vias brevissimas*).

### Ockham's Nominalist Weapon
For Ockham, the razor was not an abstract aesthetic preference, but a lethal metaphysical weapon deployed against the lush realism of **John Duns Scotus** and the high scholastics:
* **Realist Excess**: Scotus posited real metaphysical distinctions within individual substances: universal natures (*natura communis*), individualizing formal haecceities (*haecceitas* or "thisness"), and formal distinctions (*distinctio formalis*).
* **Ockham's Nominalism**: Ockham eliminated universals entirely. Reality consists exclusively of individual singular things (*res singulares*). Universals are merely mental signs or names (*nomina*) that signify multiple particulars. By cutting away Platonic essences, real universals, and haecceities, Ockham demonstrated that all theological and physical phenomena could be fully explained with a radically streamlined ontology of particulars and qualities.

---

## 2. Epistemic Architecture: Ontological vs. Syntactic Parsimony

Philosopher of science Elliott Sober introduced an essential analytical distinction between two senses of parsimony[^sober-ref]:

```
                       THE DUAL AXES OF PARSIMONY
 ┌──────────────────────────────────────┐     ┌──────────────────────────────────────┐
 │         ONTOLOGICAL PARSIMONY        │     │          SYNTACTIC PARSIMONY         │
 │           (Quantitative/Qualitative) │     │              (Simplicity)            │
 ├──────────────────────────────────────┤     ├──────────────────────────────────────┤
 │ - Number of individual entities      │     │ - Number and elegance of hypotheses  │
 │ - Number of fundamental kinds/types  │     │ - Algorithmic and mathematical brevity│
 │ - Example: Materialism posits fewer  │     │ - Example: Einstein's $E=mc^2$ over  │
 │   substances than Cartesian dualism  │     │   Ptolemaic epicycles                │
 └──────────────────────────────────────┘     └──────────────────────────────────────┘
```

1. **Ontological Parsimony (Quantitative & Qualitative)**:
   * *Qualitative Parsimony*: Minimizing the *kinds* or types of entities postulated (e.g., physicalism posits one kind of substance; dualism posits two).
   * *Quantitative Parsimony*: Minimizing the *number* of individual instances posited within a known kind.
2. **Syntactic Parsimony (Simplicity)**:
   * Minimizing the number, complexity, and arbitrary parameters of axioms or equations within a formal theory.

---

## 3. Mathematical & Bayesian Formalization

In modern epistemology, probability theory, and computer science, Occam's Razor is not a metaphysical dogma about the simplicity of the cosmos, but a mathematically demonstrable consequence of **Bayesian Model Selection** and **Algorithmic Information Theory**.

### The Bayesian "Occam Factor"

Given observed evidence $D$ and competing models $M_1$ (simple, few parameters) and $M_2$ (complex, highly parameterized):

$$P(M|D) = \frac{P(D|M) P(M)}{P(D)}$$

The marginal likelihood (evidence) for a model integrates over its parameter space $\theta$:

$$P(D|M) = \int P(D|\theta, M) P(\theta|M) \, d\theta$$

```
   Marginal Likelihood
         ▲
         │          Model M1 (Simple)
         │               ╭───╮
         │              ╭╯   ╰╮       Model M2 (Overparameterized)
         │             ╭╯     ╰╮   ╭─────────────────────────────╮
         │            ╭╯       ╰╮  │                             │
         └────────────┴─────────┴──┴─────────────────────────────┴──────► Possible Data D
                                   ▲
                                   Observed Data
```

* A complex model with $k$ free parameters can accommodate a vast range of possible datasets; consequently, its prior probability mass is spread very thinly over data space.
* A simple model with few parameters can only fit a narrow range of datasets; therefore, if the observed data falls within that narrow window, $P(D|M_1)$ is substantially higher than $P(D|M_2)$.
* This automatic penalty for unnecessary parameterization is the **Occam Factor**.

### Kolmogorov Complexity & Minimum Description Length (MDL)
In algorithmic information theory (Solomonoff, Kolmogorov, Chaitin), the prior probability of an object or hypothesis is inversely exponential to the length of the shortest computer program $p$ that produces it:

$$P(x) \approx 2^{-K(x)}$$

Occam's razor is thus equivalent to selecting the program that minimizes the description length of the model plus the description length of the data given the model (**Minimum Description Length Principle**).

---

## 4. Counter-Principles & Philosophical Anti-Razors

Philosophers have repeatedly cautioned against the uncritical fetishization of simplicity, warning that the universe possesses no obligation to conform to human cognitive aesthetic preferences:

### 1. Chatton's Anti-Razor
Ockham's contemporary, Franciscan theologian **Walter Chatton**, formulated an explicit counter-maxim in 1323:

> *"If three things are not enough to verify an affirmative proposition about things, a fourth must be added, and so on."* (*Sentences* I, dist. 3, q. 1)

Chatton argued that the desire for parsimony must never cause a thinker to under-describe reality or deny genuine complexity required by empirical phenomena.

### 2. Leibniz's Principle of Plenitude
G.W. Leibniz contested pure parsimony by pairing it with maximal abundance: God maximizes variety while minimizing the complexity of underlying laws. Nature exhibits an infinity of monads; reality is ontologically maximal while mathematically simplest.

### 3. Kant's Regulative Dialectic
In the *Critique of Pure Reason* (A652/B680–A656/B684), [[Immanuel Kant]] demonstrated that reason possesses two opposing regulative maxims that must balance one another:
1. **The Principle of Homogeneity (The Razor)**: Seek unity and parsimony among kinds (*Entia praeter necessitatem non esse multiplicanda*).
2. **The Principle of Specification (The Anti-Razor)**: Acknowledge manifold distinctions and sub-species (*Entium varietates non temere esse minuendas*—variety in nature must not be rashly diminished).

Neither principle is an objective fact about nature; both are heuristic, regulative ideals guiding human inquiry.

---

## Related Notes & Concepts

* **Philosophers**: [[William of Ockham]], [[Aristotle]], [[David Hume]], [[Immanuel Kant]], [[G.W.F. Leibniz]], [[W.V.O. Quine]]
* **Concepts**: [[Hanlons Razor]], [[Hitchens Razor]], [[The Problem of Induction]], [[Foundationalism vs Coherentism]], [[Substance Monism]]
* **Movements**: [[British Empiricism]], [[Continental Rationalism]], [[Logical Positivism]]
* **Bibliography**: [[Bibliography#Ockham-Summa]], [[Bibliography#Sober-Simplicity]]

[^ockham-summa-ref]: William of Ockham, *Summa Logicae*, edited by Philotheus Boehner (St. Bonaventure, NY: The Franciscan Institute, 1974), Pars Prima, Cap. 12. See [[Bibliography#Ockham-Summa]].
[^sober-ref]: Elliott Sober, *Simplicity* (Oxford: Clarendon Press, 1975); and *Ockham's Razors: A User's Manual* (Cambridge: Cambridge University Press, 2015).
