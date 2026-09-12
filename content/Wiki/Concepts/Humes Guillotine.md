---
title: "Hume's Guillotine"
description: "Foundational meta-ethical dilemma formulated by David Hume; the logical breach between descriptive factual premises (is) and prescriptive normative obligations (ought)."
tags: [wiki, concept, ethics, meta-ethics, epistemology, hume, logic]
type: concept
field: Meta-Ethics
status: Canonical
tradition: "British Empiricism, Analytic Philosophy"
originator: "David Hume (A Treatise of Human Nature, 1739)"
aliases: ["The Is-Ought Problem", "Is-Ought Problem", "Hume's Law"]
key_debates:
  - "Hume's Guillotine"
  - "The Naturalistic Fallacy (G.E. Moore)"
  - "Moral Realism vs Anti-Realism"
  - "Searle's Institutional Facts Counter-Example"
  - "Prior's Dilemma & Autonomous Ethics"
---

# Hume's Guillotine

<div className="dropcap">

**Hume's Guillotine** (also known as the **Is-Ought Problem** or **Hume's Law**) is one of the most celebrated and intractable problems in meta-ethics and philosophical logic. Formulated by Scottish Enlightenment philosopher [[David Hume]] in Book III of *A Treatise of Human Nature* (1739)[^hume-treatise-ref], the thesis demonstrates that no valid deductive inference can proceed from purely descriptive premises concerning how things *are* to prescriptive or normative conclusions concerning how things *ought* to be.

</div>

Any argument that purports to infer a moral obligation, human right, or virtue purely from biological, physical, historical, or metaphysical descriptions commits a logical non sequitur unless an unstated evaluative bridge premise is already presupposed.

---

## 1. Hume's Original Text & Logical Formulation

Hume stated the problem in Book III, Part I, Section I of the *Treatise*:

> "In every system of morality, which I have hitherto met with, I have always remark'd, that the author proceeds for some time in the ordinary way of reasoning, and establishes the being of a God, or makes observations concerning human affairs; when of a sudden I am surpriz'd to find, that instead of the usual copulations of propositions, *is*, and *is not*, I meet with no proposition that is not connected with an *ought*, or an *ought not*.  
> This change is imperceptible; but is, however, of the last consequence. For as this *ought*, or *ought not*, expresses some new relation or affirmation, 'tis necessary that it shou'd be observ'd and explain'd; and at the same time that a reason should be given, for what seems altogether inconceivable, **how this new relation can be a deduction from others, which are entirely different from it**." (*THN* 3.1.1.27)[^hume-treatise-ref]

```
                     HUME'S GUILLOTINE: THE LOGICAL GAP
 ┌──────────────────────────────────────┐     ┌──────────────────────────────────────┐
 │         DESCRIPTIVE DOMAIN           │     │          NORMATIVE DOMAIN            │
 │               ("IS")                 │     │              ("OUGHT")               │
 ├──────────────────────────────────────┤     ├──────────────────────────────────────┤
 │ - Biological facts (evolution, DNA)  │     │ - Moral obligations and duties       │
 │ - Physical laws (gravity, neurons)   │ ──X │ - Human rights and justice           │
 │ - Sociological customs and laws      │     │ - Concepts of intrinsic goodness     │
 │ - Psychological drives and pleasures │     │ - Prescriptive imperatives           │
 └──────────────────────────────────────┘     └──────────────────────────────────────┘
                          ▲
                          │
             LOGICAL LEAP IMPERMISSIBLE
        (No "ought" in the conclusion without
           an "ought" in the premises)
```

### Formal Logical Reconstruction

In formal logic, the principle is a consequence of conservative extension: in any valid deductive argument with non-evaluative premises $P_1, P_2, \dots, P_n$, no non-trivial evaluative conclusion $C$ can be derived:

$$
\begin{aligned}
P_1: & \quad \text{Action } X \text{ maximizes reproductive fitness or dopamine secretion.} \quad (\text{Descriptive Fact}) \\
P_2: & \quad \text{Society } S \text{ penalizes the omission of } X. \quad (\text{Sociological Fact}) \\
\hline
\therefore C: & \quad \text{Agents in } S \text{ ought to perform } X. \quad (\text{Invalid deduction without normative bridge premise})
\end{aligned}
$$

The inference becomes logically valid only if one supplements a normative bridge premise ($P_{\text{bridge}}$): *"Agents ought to maximize reproductive fitness or obey social penal codes."* But this premise itself cannot be established empirically, proving the autonomy of ethics from descriptive science.

---

## 2. Moore's Naturalistic Fallacy & The Open Question Argument

In *Principia Ethica* (1903)[^moore-ref], Cambridge philosopher G.E. Moore formulated a related critique targeting ethical naturalism:

* **The Fallacy**: Attempting to identify or define the fundamental moral predicate **"Good"** with some natural property (e.g., *Good is pleasure*, *Good is evolutionary complexity*, *Good is what is commanded by the divine*).
* Moore argued that "Good" is an unanalyzable, non-natural property, analogous to "Yellow": one can point to yellow objects or physical wavelengths, but the phenomenal quality of yellowness cannot be defined in terms of non-visual properties.

### The Open Question Argument
Moore proved this semantic non-identity via the **Open Question Argument**:

1. Let $N$ be any candidate natural property (e.g., *that which produces pleasure*).
2. Consider the question: *"Action $A$ produces pleasure, but is $A$ good?"*
3. If "good" were identical in meaning to "that which produces pleasure," this question would be a closed analytic tautology (identical to asking: *"John is an unmarried man, but is he a bachelor?"*).
4. Because the question remains genuinely **open**, intelligible, and substantive for any natural property $N$, the property of goodness cannot be synonymous with or reducible to $N$.

---

## 3. Searle's Counter-Example: Institutional Facts

The most famous modern challenge to Hume's Guillotine was mounted by **John Searle** in *"How to Derive 'Ought' from 'Is'"* (1964)[^searle-ref].

Searle distinguished between:
* **Brute Facts**: Facts whose existence requires no human institutions (e.g., *The Earth is 93 million miles from the Sun*).
* **Institutional Facts**: Facts whose existence presupposes constitutive social rules of the form *"X counts as Y in context C"* (e.g., *money, touchdowns, promises*).

```
                     SEARLE'S INSTITUTIONAL DERIVATION
 ┌───┬───────────────────────────────────────────────────────────┬──────────┐
 │ 1 │ Jones uttered the words: "I hereby promise to pay you $5" │ Is-fact  │
 ├───┼───────────────────────────────────────────────────────────┼──────────┤
 │ 2 │ Jones promised to pay Smith $5                            │ Is-fact  │
 ├───┼───────────────────────────────────────────────────────────┼──────────┤
 │ 3 │ Jones placed himself under an obligation to pay Smith $5  │ Is-fact  │
 ├───┼───────────────────────────────────────────────────────────┼──────────┤
 │ 4 │ Jones is under an obligation to pay Smith $5              │ Is-fact  │
 ├───┼───────────────────────────────────────────────────────────┼──────────┤
 │ 5 │ Jones ought to pay Smith $5                               │ OUGHT!   │
 └───┴───────────────────────────────────────────────────────────┴──────────┘
```

Searle argued that within the constitutive rules of the institution of promising, making a promise *definitionally* entails placing oneself under an obligation; hence, step 5 follows from step 1 without an external moral premise.

### Critical Rebuttals: Hare and Flew
Critics—notably R.M. Hare and Antony Flew—countered that Searle's argument contains an implicit evaluation of the institution:
* Step 4 merely describes that *according to the rules of promising*, an obligation exists.
* Step 5 makes a genuine moral prescription. One can coherently ask: *"I have placed myself under an institutional obligation to pay Smith, but ought I to pay him?"* (e.g., if Smith will use the money to commit genocide).
* To deduce that one *ought* to fulfill obligations, one must accept the normative premise: *"One ought to keep one's promises."* Thus, the guillotine remains unbroken.

---

## 4. Prior's Paradox & The Logic of Ought

In 1960, logician A.N. Prior challenged Hume's Guillotine by constructing valid deductive arguments containing only descriptive premises that nevertheless yield evaluative conclusions:

1. Premise: *"Tea drinking is common in England."* ($P$, descriptive)
2. Conclusion: *"Either tea drinking is common in England or all New Zealanders ought to be shot."* ($P \lor Q$, valid by disjunction introduction)

While logically valid, contemporary philosophers (such as Charles Pigden and Frank Jackson) classify Prior's counter-examples as vacuously evaluative: the conclusion is not *substantively* normative because the truth of the conclusion is wholly determined by the descriptive disjunct. Substantive moral guidance cannot be extracted without presupposing normative criteria.

---

---

## 5. Hegel's Dialectical Critique: The Impotence of the *Sollen* (Ought)

In the *Phenomenology of Spirit* (1807) and *Elements of the Philosophy of Right* (1820)[^hegel-pr], [[G.W.F. Hegel]] demonstrates that the rigid analytical separation between *Sein* (Being/Is) and *Sollen* (Ought) is the diagnostic symptom of an alienated, abstract moral consciousness (what Hegel terms ***Moralität***):

* **The Impotence of the Ought**: When morality is reduced to an abstract "ought" suspended above reality, it remains an impotent, endless yearning (*unendliche Sehnsucht*). The moralist eternally scolds the world for failing to match the ideal, while remaining powerless to realize it.
* **Ethical Life (***Sittlichkeit***)**: Hegel resolves the dichotomy by showing that genuine normativity is neither an empirical fact of physics nor an abstract logical command. Norms are realized historically in **Ethical Life**—the living customs, laws, practices, and institutions of a concrete community (the family, civil society, and the state). 
* What *ought* to be is not a detached deduction; it is already implicitly unfolding within the historical dialectic of human freedom: *"What is rational is actual; and what is actual is rational."*

---

## 6. Nietzsche's Genealogical Critique: Debt, Guilt, and Blood

In *On the Genealogy of Morality* (Essay II)[^nietzsche-gm-ed], [[Friedrich Nietzsche]] subjects Hume's logical operator to a visceral historical autopsy:

> *"Have these current genealogists of morality had even the remotest inkling that the major moral concept 'Schuld' (guilt) has its origin in the very material concept 'Schulden' (debts)? Or that punishment as a requital developed entirely independently of any presupposition concerning freedom or lack of freedom of the will?"* (*GM* II:4)

* The analytical tradition treats the "ought" as an innocent, disembodied formal operator. Nietzsche reveals that the moral "ought" has a brutal material pedigree forged in contractual violence: the creditor's right to exact physical punishment on the flesh of the debtor.
* To create an animal capable of making promises—an animal that acknowledges an "ought"—humanity required the terrible apparatus of mnemotechnics: burning obligations into the living body with blood, torture, and public spectacles of cruelty.
* Hume's Guillotine is not a timeless logical puzzle; it is the modern philosophical residue of the internalization of cruelty into the "bad conscience."

---

## 7. Sellars & The Space of Reasons

From the perspective of American post-Kantian naturalism, [[Wilfrid Sellars]] (*Empiricism and the Philosophy of Mind*, 1956)[^sellars-epm-hume] reformulates the breach without mystification:

* Hume is strictly correct that no descriptive statement in physical vocabulary logically entails a normative prescription.
* However, this does not imply that normativity is an occult non-natural property (Moore) or an emotional grunt (Ayer). 
* To characterize an action as what someone *ought* to do is not to describe a state of affairs in the causal order, but to locate the agent within the **social space of reasons**—the communal linguistic practice of justifying, challenging, and holding one another to account.

---

## 8. Meta-Ethical Ramifications

Hume's Guillotine forms the primary watershed of modern value theory:

| Meta-Ethical Tradition | Strategy Regarding Hume's Guillotine | Leading Proponents |
|---|---|---|
| **Emotivism & Non-Cognitivism** | Concedes the gap: moral claims do not state propositions; they express affective sentiments or commands (*"Boo on murder!"*). | [[Logical Positivism\|A.J. Ayer]], C.L. Stevenson |
| **Expressivism & Quasi-Realism** | Agrees that moral claims are not descriptive facts, but explains how moral language mimics truth-evaluable propositions. | Simon Blackburn, Allan Gibbard |
| **Error Theory** | Acknowledges that moral claims claim objectivity, but asserts they are systematically false because objective normative "oughts" do not exist. | J.L. Mackie, Richard Joyce |
| **Non-Naturalist Moral Realism** | Accepts the gap, holding that moral properties are sui generis, irreducible non-natural realities accessible via rational intuition. | G.E. Moore, W.D. Ross, Russ Shafer-Landau |
| **Dialectical Historicism** | Overcomes the abstract gap: norms are immanently realized within the historical institutions of ethical life (*Sittlichkeit*). | [[G.W.F. Hegel]] |
| **Genealogy of Power** | Deconstructs the gap: "ought" is a sublimation of material debt (*Schuld*) and disciplinary cruelty. | [[Friedrich Nietzsche]], [[Michel Foucault]] |
| **Normative Functionalism** | Reframes the gap: normativity belongs to the communal space of reasons rather than causal explanation. | [[Wilfrid Sellars]], Robert Brandom |
| **Constructivism** | Replaces metaphysical derivation with procedural justification: moral principles are valid because they survive ideal rational agreement. | [[Immanuel Kant]], [[John Rawls]] |

---

## Related Notes & Concepts

* **Philosophers**: [[David Hume]], [[Immanuel Kant]], [[G.W.F. Hegel]], [[Friedrich Nietzsche]], [[Michel Foucault]], [[John Searle]]
* **Movements**: [[British Empiricism]], [[Utilitarianism]], [[Deontology]], [[Virtue Ethics]], [[Logical Positivism]], [[German Idealism]]
* **Concepts**: [[The Problem of Induction]], [[The Trolley Problem]], [[The Veil of Ignorance]], [[Occams Razor]]
* **Bibliography**: [[Bibliography#Hume-Treatise]], [[Bibliography#Ayer-LTL-1936]], [[Bibliography#Kant-GMM]], [[Bibliography#Nietzsche-Genealogy]], [[Bibliography#Hegel-PR-1820]]

[^hume-treatise-ref]: David Hume, *A Treatise of Human Nature*, edited by David Fate Norton and Mary J. Norton (Oxford: Oxford University Press, 2000), 302 (THN 3.1.1.27). See [[Bibliography#Hume-Treatise]].
[^moore-ref]: G.E. Moore, *Principia Ethica* (Cambridge: Cambridge University Press, 1903), Chapter 1.
[^searle-ref]: John R. Searle, "How to Derive 'Ought' from 'Is'," *The Philosophical Review* 73, no. 1 (1964): 43–58.
[^hegel-pr]: Hegel, G.W.F. *Elements of the Philosophy of Right*, ed. Allen W. Wood, trans. H.B. Nisbet (Cambridge: Cambridge University Press, 1991 [1820]). See [[Bibliography#Hegel-PR-1820]].
[^nietzsche-gm-ed]: Nietzsche, Friedrich. *On the Genealogy of Morality*, trans. Carol Diethe (Cambridge: Cambridge University Press, 2006 [1887]), Second Essay: "'Guilt', 'Bad Conscience' and Related Matters," pp. 35–66. See [[Bibliography#Nietzsche-Genealogy]].
[^sellars-epm-hume]: Sellars, Wilfrid. *Empiricism and the Philosophy of Mind* (Cambridge, MA: Harvard University Press, 1997 [1956]), §36.
