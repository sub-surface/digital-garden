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

## 4. Kant's Transcendental Response: Causality as Synthetic *A Priori*

In his *Prolegomena* (1783, 4:260)[^kant-prolegomena], [[Immanuel Kant]] famously confessed that it was Hume's skeptical challenge to causality that *"first interrupted my dogmatic slumber and gave my investigations in the field of speculative philosophy a quite new direction."*

* **The Second Analogy of Experience**: In the *Critique of Pure Reason* (A189/B232)[^kant-cpr], Kant demonstrates that causality cannot be an inductive generalization drawn from observing sequences of events in nature. Instead, the category of causality is a **synthetic *a priori* condition for the very possibility of objective experience**.
* **The Ship Floating Downstream**: Kant observes that when we look at a house, our gaze can move from the roof to the cellar, or from the cellar to the roof—the sequence is subjective and reversible. But when we watch a boat drift downstream, the sequence of perceptual representations is irreversible. 
* To experience an objective event as having occurred in objective time, consciousness must necessarily apply the transcendental concept of cause and effect. We do not learn that events have causes through induction; we can experience an objective temporal world only because our cognitive faculty pre-structures appearances through causal necessity.

---

## 5. Speculative Realism: Quentin Meillassoux and Radical Contingency

In *After Finitude* (2006)[^meillassoux-af], contemporary French philosopher [[Quentin Meillassoux]] (prefaced by Alain Badiou) performs a radical speculative inversion of Hume's problem:

* **The Mistake of Both Hume and Kant**: Both Hume (the skeptic) and Kant (the transcendentalist) assumed that if natural laws are genuine, they must be *necessary*. Hume lamented that we cannot prove their necessity; Kant internalized necessity into the human transcendental apparatus.
* **The Thesis of Factiality (*La factualité*)**: Meillassoux demonstrates that the Principle of Sufficient Reason is false: there is **no reason** why physical laws are the way they are rather than another way. 
* The laws of nature are not necessary: they are **radically contingent**. The physical constants could change tomorrow without contradiction. 
* Hume's inductive impasse is not a defect of human epistemic faculties, but an accurate ontological insight into the ultimate nature of reality: **the only necessity is that nothing is necessary**. Stability is a contingent fact of the present epoch, not a metaphysical law.

---

## References

* Hume, David. *An Enquiry Concerning Human Understanding* (1748), Section IV. See [[Bibliography#Hume-Enquiry]].
* Goodman, Nelson. *Fact, Fiction, and Forecast*. Cambridge, MA: Harvard University Press, 1955.
[^kant-prolegomena]: Kant, Immanuel. *Prolegomena to Any Future Metaphysics*, trans. Gary Hatfield (Cambridge: Cambridge University Press, 2004 [1783]), Ak. 4:260. See [[Bibliography#Kant-Prolegomena]].
[^kant-cpr]: Kant, Immanuel. *Critique of Pure Reason*, trans. Paul Guyer and Allen W. Wood (Cambridge: Cambridge University Press, 1998 [1781/1787]). See [[Bibliography#Kant-CPR-1781]].
[^meillassoux-af]: Meillassoux, Quentin. *After Finitude: An Essay on the Necessity of Contingency*, trans. Ray Brassier (London: Continuum, 2008 [2006]). See [[Bibliography#Meillassoux-AF-2006]].

## See Also

* [[David Hume]]
* [[Immanuel Kant]]
* [[Critique of Pure Reason (Kant)]]
* [[British Empiricism]]
* [[Warranted Assertibility]]
* [[The Six Criteria of Warrant]]
* [[Humes Guillotine]]
