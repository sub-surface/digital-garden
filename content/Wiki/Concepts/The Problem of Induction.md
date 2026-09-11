---
title: "The Problem of Induction"
description: "David Hume's foundational skeptical challenge demonstrating that inferences from past regularities to future occurrences cannot be rationally justified without circularity."
tags: [wiki, concept, epistemology, philosophy-of-science]
type: concept
layout: article
---

# Concept: The Problem of Induction

<div className="dropcap">

**The Problem of Induction** is one of the most famous and persistent challenges in epistemology and the philosophy of science, formulated by Scottish philosopher [[David Hume]] in *A Treatise of Human Nature* (1739) and *An Enquiry Concerning Human Understanding* (1748). It questions whether inductive reasoning—the mental transition from observed past instances to unobserved future claims or universal laws—can be given any non-circular rational justification.

</div>

---

## 1. Hume's Skeptical Dilemma

Inductive inference is the bedrock of everyday expectation and natural science:
* Every bread I have eaten has nourished me; therefore, the next piece of bread will nourish me.
* The sun has risen every morning in recorded history; therefore, the sun will rise tomorrow.

Hume asks: What justifies our confidence in this conclusion?

### The Principle of the Uniformity of Nature (PUN)
All inductive inferences rely on an unstated foundational premise: **The Principle of the Uniformity of Nature**—the assumption that the unobserved future will conform to the regularities of the observed past.

Hume points out that there are only two categories of reasoning available (Hume's Fork) to justify PUN:

1. **Demonstrative (Deductive) Reasoning (Relations of Ideas)**:
   * Can we deduce PUN with logical necessity, like a mathematical proof?
   * **No.** It implies no logical contradiction to imagine the course of nature changing tomorrow. A world where the sun does not rise, or where bread suddenly poisons, is entirely conceivable and contains no contradiction ($A \neq \neg A$).
2. **Moral (Probable / Inductive) Reasoning (Matters of Fact)**:
   * Can we argue that nature has always proven uniform in the past, so it will continue to be uniform in the future?
   * **No.** This reasoning is **strictly circular**—it uses an inductive argument to justify the validity of induction itself (begging the question).

$$\text{Justifying Induction via Past Success} \implies \text{Circular Reasoning}$$

Hume's conclusion is skeptical yet pragmatic: our belief in induction is not grounded in rational insight, but in biological **custom and habit** (*"a species of natural instincts, which no reasoning or process of the thought and understanding is able either to produce or to prevent"*).

---

## 2. Goodman's "New Riddle of Induction"

In *Fact, Fiction, and Forecast* (1955), American logician Nelson Goodman showed that the problem is even deeper than Hume realized. Hume assumed we know *which* patterns to project into the future. Goodman showed that induction cannot even be defined formally.

### The "Grue" Paradox
Goodman defined an artificial predicate, **grue**:
$$\text{An object is } \textit{grue} \iff (\text{Observed before time } t \land \text{green}) \lor (\text{Observed after time } t \land \text{blue})$$

Suppose all emeralds examined before time $t$ (say, midnight tonight) have been green.
* This observation supports the hypothesis: *"All emeralds are green."*
* But this exact same observation equally supports the hypothesis: *"All emeralds are grue."*

Both hypotheses are supported by 100% of available empirical evidence. Yet they predict opposite outcomes tomorrow: the green hypothesis predicts tomorrow's emeralds will be green; the grue hypothesis predicts they will be blue. Why is "green" projectable, while "grue" is illegitimate? Goodman concluded that projectability depends on entrenched linguistic habits rather than formal logic.

---

## 3. Major Proposed Solutions

Philosophers of science have proposed several responses to Hume's challenge:

* **Karl Popper's Falsificationism**: Popper accepted Hume's argument, but claimed science does not use induction at all. Science proceeds purely through **deduction**: scientists propose bold conjectures and subject them to empirical tests designed to *falsify* them (Modus Tollens: If $H \implies E$, and $\neg E$, then $\neg H$).
* **Hans Reichenbach's Pragmatic Vindication**: Induction is a wager. If nature is uniform, induction will succeed. If nature is chaotic, no method can succeed. Therefore, using induction is our best practical bet.
* **Peter Strawson's Ordinary Language Dissolution**: Asking whether induction is "rational" is conceptually confused. Being rational *means* conforming our beliefs to inductive evidence, just as being legal means conforming to the law.
* **Quigley's Deweyan Solution**: Truth is not correspondence to a hidden metaphysical uniformity, but [[Warranted Assertibility]]—the provisional stability of hypotheses that successfully guide ongoing inquiry.

---

## References

* Hume, David. *An Enquiry Concerning Human Understanding* (1748), Section IV. See [[Bibliography#[Hume-Enquiry]]].
* Goodman, Nelson. *Fact, Fiction, and Forecast*. Cambridge, MA: Harvard University Press, 1955.

## See Also

* [[David Hume]]
* [[British Empiricism]]
* [[Warranted Assertibility]]
* [[The Six Criteria of Warrant]]
