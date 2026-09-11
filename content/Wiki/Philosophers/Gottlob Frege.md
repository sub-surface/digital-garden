---
title: "Gottlob Frege"
description: "German mathematician, logician, and philosopher; founder of modern mathematical logic, father of analytic philosophy, and architect of the sense-reference distinction."
tags: [wiki, philosopher, logic, analytic, language, mathematics, epistemology]
type: philosopher
epoch: Modern
dates: "1848–1925"
tradition: "Analytic Philosophy, Logicism, Philosophy of Language"
major_works:
  - "Begriffsschrift (Concept Script, 1879)"
  - "The Foundations of Arithmetic (Die Grundlagen der Arithmetik, 1884)"
  - "Function and Concept (Funktion und Begriff, 1891)"
  - "On Sense and Reference (Über Sinn und Bedeutung, 1892)"
  - "Basic Laws of Arithmetic (Grundgesetze der Arithmetik, 1893/1903)"
key_concepts:
  - "Sense and Reference (Sinn und Bedeutung)"
  - "Predicate Calculus & Quantifiers (∀, ∃)"
  - "Anti-Psychologism"
  - "Context Principle"
  - "Logicism in Mathematics"
  - "Function and Argument"
---

# Gottlob Frege

<div className="dropcap">

**Friedrich Ludwig Gottlob Frege** (1848–1925) was a German mathematician, logician, and philosopher of the University of Jena whose groundbreaking innovations created modern mathematical logic and laid the foundational cornerstone of the **analytic tradition** in twentieth-century philosophy.

</div>

Prior to Frege, logic had remained largely stagnant since the syllogistic formulation of [[Aristotle]], supplemented only by Stoic propositional logic and Leibnizian hints. In his revolutionary 1879 treatise *Begriffsschrift* (*Concept Script*)[^frege-begriff], Frege invented modern first-order **quantified predicate logic**, replacing traditional subject-predicate grammar with the mathematical paradigm of **function and argument**.

[^frege-begriff]: Gottlob Frege, *Begriffsschrift, eine der arithmetischen nachgebildete Formelsprache des reinen Denkens* (Halle: Louis Nebert, 1879). Translated in Jean van Heijenoort, ed., *From Frege to Gödel: A Source Book in Mathematical Logic, 1879–1931* (Cambridge, MA: Harvard University Press, 1967), 1–82.

---

## 1. The Invention of Modern Predicate Logic

Frege discarded the classical Aristotelian division of propositions into grammatical *subject* and *predicate* (e.g., "Socrates is mortal"), which had crippled logic's ability to analyze multiple quantifiers, relations, and mathematical proofs. 

In its place, Frege imported mathematical concepts:
* **Function** ($f(\dots)$): An unsaturated or incomplete expression containing one or more argument places.
* **Argument** ($x$): A complete saturated entity (an object) plugged into the function.
* **Quantifiers**: The revolutionary introduction of universal quantification ($\forall x$) and existential quantification ($\exists x$), allowing nested quantifiers to clearly differentiate statements like:
  * "Every philosopher admires some logic book" ($\forall x \exists y$)
  * "There is some logic book that every philosopher admires" ($\exists y \forall x$)

```
                  ARISTOTLE vs. FREGEAN REVOLUTION
 ┌──────────────────────────────────────┬──────────────────────────────────────┐
 │       Aristotelian Syllogism         │        Fregean Predicate Logic       │
 ├──────────────────────────────────────┼──────────────────────────────────────┤
 │ Grammar: Subject + Predicate         │ Math: Function + Argument            │
 │ Form: "All S are P"                  │ Form: ∀x (S(x) → P(x))               │
 │ Limited to categorical forms         │ Recursive, multi-place relations     │
 │ Cannot handle nested quantifiers     │ Seamlessly parses ∀x ∃y vs ∃y ∀x     │
 └──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 2. Anti-Psychologism and the Context Principle

In *The Foundations of Arithmetic* (*Die Grundlagen der Arithmetik*, 1884)[^frege-grundlagen], Frege established three methodological maxims that defined analytic methodology:

1. **Always separate sharply the psychological from the logical, the subjective from the objective.**
   * Logic does not describe how human minds empirically happen to think (psychology); it investigates the objective laws of truth (*Wahrsein*).
   * A mathematical number (such as $2$) or a logical proposition is neither a physical object in the external world nor a subjective mental image (*Vorstellung*) in an individual consciousness. Numbers inhabit a "third realm" of objective, non-physical, atemporal truths.
2. **Never ask for the meaning of a word in isolation, but only in the context of a proposition (The Context Principle).**
   * Words obtain significance only through their contribution to the truth conditions of whole sentences.
3. **Never lose sight of the distinction between concept and object.**
   * An **object** is saturated, self-subsistent, and indicated by a proper name.
   * A **concept** (*Begriff*) is unsaturated, functional, and takes objects as arguments, yielding a Truth-Value (The True or The False).

[^frege-grundlagen]: Gottlob Frege, *Die Grundlagen der Arithmetik: eine logisch mathematische Untersuchung über den Begriff der Zahl* (Breslau: Koebner, 1884). Translated by J.L. Austin as *The Foundations of Arithmetic* (Oxford: Blackwell, 1950).

---

## 3. Sense and Reference (*Sinn und Bedeutung*)

In his celebrated 1892 paper *"Über Sinn und Bedeutung"* ("On Sense and Reference")[^frege-sinn-ref], Frege resolved a profound semantic puzzle concerning identity statements:

$$\text{Why is the identity } a = a \text{ trivial and a priori, while } a = b \text{ can be informative and empirical?}$$

Consider the astronomical names **"The Morning Star"** (*Phosphorus*) and **"The Evening Star"** (*Hesperus*):
* The statement *"The Morning Star is the Morning Star"* is a trivial tautology.
* The statement *"The Morning Star is the Evening Star"* represents a significant empirical discovery made by Babylonian astronomers.
* If the meaning of a name were simply the physical object it stands for, both sentences would merely assert the identity of the planet Venus with itself ($Venus = Venus$).

```
                           THE FREGEAN TRIAD
                                 SENSE
                             (Sinn / Mode of
                              Presentation)
                               ┌───────┐
                     ┌────────►│ "The  │
                     │         │Morning│
                     │         │ Star" │
                     │         └───────┘
                     │             │
                     │             ▼
                 SIGN/EXPRESSION  REFERENCE
                   ("Venus")   ──► (Bedeutung /
                     │            The Object)
                     │             ▲
                     │         ┌───┴───┐
                     └────────►│ "The  │
                               │Evening│
                               │ Star" │
                               └───────┘
                                 SENSE
```

To solve this, Frege distinguished three dimensions:
1. **Sign** (*Zeichen*): The linguistic token or symbol (e.g., "The Morning Star").
2. **Sense** (*Sinn*): The objective "mode of presentation" (*Art des Gegebenseins*) through which the object is given to the mind.
3. **Reference** (*Bedeutung*): The actual external object in reality designated by the expression (the planet Venus).

Frege applied this distinction to entire declarative sentences:
* The **Sense of a Sentence** is the **Thought** (*Gedanke*) it expresses.
* The **Reference of a Sentence** is its **Truth-Value** (*Wahrheitswert*): either **The True** (*Das Wahre*) or **The False** (*Das Falsche*).

[^frege-sinn-ref]: Gottlob Frege, "Über Sinn und Bedeutung," *Zeitschrift für Philosophie und philosophische Kritik* 100 (1892): 25–50. See [[Bibliography#Frege-Sinn-1892]].

---

## 4. Logicism and Russell's Paradox

Frege dedicated his life to **Logicism**: the philosophical thesis that mathematics—specifically arithmetic—is not synthetic a priori (as [[Immanuel Kant]] held) or empirical (as Mill held), but is entirely reducible to pure, analytic logical axioms.

In his two-volume *Grundgesetze der Arithmetik* (*Basic Laws of Arithmetic*, 1893, 1903), Frege set out to formally deduce all of arithmetic from basic logical laws. However, as the second volume was in the press in June 1902, young British philosopher Bertrand Russell sent Frege a devastating letter identifying **Russell's Paradox**:

$$\text{Consider the set of all sets that are not members of themselves: } R = \{ x \mid x \notin x \}$$
$$\text{Is } R \text{ a member of itself? } R \in R \iff R \notin R$$

Frege's **Basic Law V** (which permitted forming the set/extension of any concept whatsoever) was fatally inconsistent, deriving a direct contradiction within his formal system. Frege heroically added an appendix acknowledging the catastrophe:
> "Hardly anything more unwelcome can befall a scientific writer than to have one of the foundations of his edifice shaken after the work is finished. This was the position I was placed in by a letter of Mr. Bertrand Russell..." (*Grundgesetze*, Vol. II, Appendix)

---

## 5. Philosophical Legacy and Analytic Lineage

Though largely unrecognized by his mathematical contemporaries during his lifetime, Frege's work was championed and synthesized by [[Ludwig Wittgenstein]] and Bertrand Russell:
* **Russell & Whitehead**: Reconstructed logicism using the Theory of Types in the monumental *Principia Mathematica* (1910–1913).
* **Early Wittgenstein**: Traveled to Jena to consult Frege, whose critique of psychologism and semantic distinction between saying and showing deeply shaped the *Tractatus Logico-Philosophicus*.
* **Philosophy of Language**: Directly inspired Rudolf Carnap, W.V.O. Quine, Michael Dummett (who wrote *Frege: Philosophy of Language*), and Saul Kripke.

Frege permanently redirected philosophy away from psychologistic theories of ideas toward the objective analysis of linguistic structures, logic, and truth-conditions.

---

## Related Notes & Concepts

* **Traditions**: [[Map of Philosophy]], [[Logical Positivism]], [[British Empiricism]]
* **Philosophers**: [[Ludwig Wittgenstein]], [[Immanuel Kant]], [[Aristotle]], [[René Descartes]]
* **Concepts**: [[Foundationalism vs Coherentism]], [[The Problem of Induction]]
* **Bibliography**: [[Bibliography#Frege-Sinn-1892]], [[Bibliography#Wittgenstein-TLP-1921]]
