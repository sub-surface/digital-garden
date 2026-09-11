---
title: "Tractatus Logico-Philosophicus"
description: "A comprehensive structural analysis of Ludwig Wittgenstein's 1921 masterpiece: the seven propositions, the picture theory of meaning, saying versus showing, and the ladder of silence."
tags: [wiki, text, analytic-philosophy, logic, language, wittgenstein]
author: "Ludwig Wittgenstein"
year: 1921
layout: article
---

# Tractatus Logico-Philosophicus

> **Ludwig Wittgenstein**, *Logisch-philosophische Abhandlung* (1921) / *Tractatus Logico-Philosophicus* (1922)  
> Standard translations: C.K. Ogden (Kegan Paul, 1922); D.F. Pears and B.F. McGuinness (Routledge, 1961)[^witt-tlp-ed].

<div className="dropcap">

Written in notebooks between 1914 and 1918 amidst the trenches of the First World War and published in 1921, the *Tractatus Logico-Philosophicus* is the foundational masterpiece of twentieth-century analytic philosophy and formal semantics. Written in a compressed, aphoristic decimal hierarchy radiating from seven cardinal propositions, the text seeks to draw a strict boundary to the expression of thoughts: by determining the logical conditions under which language can represent reality, Wittgenstein demonstrates that traditional metaphysical problems are not false, but strictly nonsensical (*unsinnig*).

</div>

---

## I. The Architecture of the Seven Cardinal Propositions

The *Tractatus* is structured around seven numbered propositions. The decimal numbers indicate the logical importance and explanatory subordination of each remark (e.g., 1.1 is an elaboration of 1; 1.11 and 1.12 elaborate 1.1):

| Proposition | German Original | Canonical Translation |
|-------------|-----------------|----------------------|
| **1** | *Die Welt ist alles, was der Fall ist.* | **The world is all that is the case.** |
| **2** | *Was der Fall ist, die Tatsache, ist das Bestehen von Sachverhalten.* | **What is the case—a fact—is the existence of states of affairs.** |
| **3** | *Das logische Bild der Tatsachen ist der Gedanke.* | **A logical picture of facts is a thought.** |
| **4** | *Der Gedanke ist der sinnvolle Satz.* | **A thought is a proposition with a sense.** |
| **5** | *Der Satz ist eine Wahrheitsfunktion der Elementarsätze.* | **A proposition is a truth-function of elementary propositions.** |
| **6** | *Die allgemeine Form der Wahrheitsfunktion ist: $[\bar{p}, \bar{\xi}, N(\bar{\xi})]$.* | **The general form of a truth-function is: $[\bar{p}, \bar{\xi}, N(\bar{\xi})]$.** |
| **7** | *Wovon man nicht sprechen kann, darüber muss man schweigen.* | **Whereof one cannot speak, thereof one must be silent.** |

---

## II. Ontology: Facts, Objects, and the World (Propositions 1–2)

Wittgenstein opens with an ontology not of material substances, but of logical configurations:

$$\text{"The world is the totality of facts, not of things."} \quad (1.1)$$

1. **Facts versus Things (1.1–1.2)**: The world divides into facts (*Tatsachen*). Any fact can either be the case or not be the case, while everything else remains unchanged.
2. **States of Affairs (*Sachverhalte*, 2.01)**: A state of affairs is a combination of objects (items, things).
3. **The Simplicity of Objects (*Gegenstände*, 2.02)**:
   * Objects are simple; they form the **substance of the world** (*die Substanz der Welt*, 2.021).
   * Objects cannot be compound; they are what exists independently of what is the case.
   * Objects contain the possibility of all situations: if an object is given, the possibility of all its occurrences in states of affairs is also given (*internal properties*, 2.012).
4. **Logical Space (*der logische Raum*, 2.11)**: Facts in logical space are the world.

---

## III. The Picture Theory of Meaning (*Abbildtheorie*, Propositions 2.1–3.4)

How does a string of physical marks or acoustic vibrations represent an external state of affairs? Wittgenstein formulates the **Picture Theory of Meaning**:

```
        REALITY (FACTS)                      LANGUAGE (PROPOSITIONS)
  ┌───────────────────────────┐            ┌───────────────────────────┐
  │     STATE OF AFFAIRS      │            │        PROPOSITION        │
  │  (Configuration of        │   ISOMORPHIC│  (Configuration of        │
  │   Simple Objects)         │◄──────────►│   Simple Names)           │
  └─────────────┬─────────────┘   PROJECTION └─────────────┬─────────────┘
                │                                          │
                └─────────────── LOGICAL FORM ─────────────┘
                            (Form of Representation)
```

1. **A Picture is a Model of Reality (2.12)**: In a picture, pictorial elements correlate one-to-one with the objects of the state of affairs.
2. **Pictorial Form (*Form der Abbildung*, 2.15)**: That the elements of the picture are related to one another in a determinate way represents that things are related to one another in the same way in reality.
3. **Logical Form (2.18)**: What every picture of whatever form must have in common with reality in order to represent it at all is **logical form**.
4. **The Limit of Depiction (2.172)**:
   $$\text{"A picture cannot depict its pictorial form: it displays it."} \quad (2.172)$$
   A proposition can represent reality, but it cannot represent what it must have in common with reality in order to represent it (its logical form).

---

## IV. Propositions and Truth-Functions (Propositions 4–5)

1. **Sense (*Sinn*) versus Meaning (*Bedeutung*, 3.203–4.022)**:
   * A **name** means an object; the object is its meaning (*Bedeutung*).
   * A **proposition** has a sense (*Sinn*): it shows how things stand *if* it is true, and it says *that* they do so stand. Names do not have sense; propositions do not have meaning in the nominal sense.
2. **The Bipolarity of Propositions (4.023)**: A proposition must restrict reality to two alternatives: yes or no. It can be true or false; to understand a proposition means to know what is the case if it is true.
3. **The Elimination of Logical Constants (5.4)**:
   * Logical connectives ("and", "or", "not", "if... then") are **not names** and do not represent objects: *"My fundamental idea is that the 'logical constants' are not representatives; that there can be no representatives of the logic of facts."* (4.0312)
   * Connectives are truth-operations, fully formalized through truth-tables.
4. **Tautology and Contradiction (4.46–4.461)**:
   * **Tautologies** (e.g., $p \lor \neg p$) are true under all truth-value assignments: they have **no sense** (*sinnlos*), they say nothing about the world, but are not nonsensical (*unsinnig*). They represent the empty framework of logical space.
   * **Contradictions** (e.g., $p \land \neg p$) are false under all assignments: they fill all logical space and allow reality no room.
   * Scientific propositions are contingent: true under some assignments, false under others.

---

## V. The Cardinal Distinction: Saying versus Showing (*Sagen und Zeigen*)

The core thesis that unifies the *Tractatus* is the radical separation between what can be said (*gesagt*) and what can only be shown (*gezeigt*):

| Category | Epistemic Domain | Mode of Manifestation | Status in Tractatus |
|----------|------------------|-----------------------|---------------------|
| **What can be Said** | Natural science, empirical facts, contingent states of affairs | Meaningful propositions with truth-values | **Cognitive Language**: 1.0–5.6 |
| **What Shows Itself** | The logical form of reality, mathematics, ethics, aesthetics, metaphysics | Internal structural display (*zeigt sich*) | **The Ineffable (*das Unaussagbare*)**: 6.4–7.0 |

$$\text{"What can be shown cannot be said."} \quad (4.1212)$$

### 1. The Limits of My World (5.6)
$$\text{"The limits of my language mean the limits of my world."} \quad (5.6)$$
Logic pervades the world: the limits of the world are also its limits. We cannot say in logic, "The world has this in it, and this, but not that," for that would presuppose that we could think outside logic. Solipsism, when thought through strictly, coincides with pure realism: the metaphysical self is not an object in the world, but the limit of the world (5.632).

### 2. Ethics, Aesthetics, and the Mystical (6.4–6.522)
* **Ethics cannot be formulated in propositions (6.42)**: All propositions are of equal value (6.4). Since propositions represent contingent empirical facts, and facts contain no value, value must lie outside the world.
* **The Mystical (*das Mystische*, 6.44)**:
  $$\text{"Not how the world is, is the mystical, but that it is."} \quad (6.44)$$
* When all possible scientific questions have been answered, our problems of living remain completely untouched (6.52).

---

## VI. Proposition 6.54 and the Ladder: Self-Transcendence

In the penultimate proposition, Wittgenstein delivers the notorious paradoxical climax of the work:

$$\text{"My propositions serve as elucidations in the following way: anyone who understands me}$$
$$\text{eventually recognizes them as nonsensical, when he has used them—as steps—to climb up beyond them.}$$
$$\text{(He must, so to speak, throw away the ladder after he has climbed up it.)"} \quad (6.54)$$

Having achieved the proper vision of the world, philosophy as a theoretical doctrine ceases to exist; philosophy is not a body of doctrine, but an **activity of logical clarification** (4.112).

### Proposition 7: The Final Seal
$$\text{"Whereof one cannot speak, thereof one must be silent."} \quad (7)$$
*(Wovon man nicht sprechen kann, darüber muss man schweigen.)*

---

## References & Citations

[^witt-tlp-ed]: Ludwig Wittgenstein, *Tractatus Logico-Philosophicus*, trans. C.K. Ogden (London: Kegan Paul, 1922); second translation by D.F. Pears and B.F. McGuinness (London: Routledge & Kegan Paul, 1961). Original German text first appeared as "Logisch-philosophische Abhandlung" in *Annalen der Naturphilosophie* 14 (1921). Cited universally by decimal proposition number. See [[Bibliography#Wittgenstein-TLP-1921]].

## See Also

* [[Ludwig Wittgenstein]] — Biography, transition from Early to Late philosophy, and *Philosophical Investigations*
* [[Logical Positivism]] — The Vienna Circle's appropriation and misreading of the *Tractatus*
* [[Foundationalism vs Coherentism]] — Semantic atomism vs. holistic webs
* [[Bibliography]] — Authoritative editions and primary texts
