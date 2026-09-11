---
title: "Citation & Style Standards"
description: "Guidelines for citations, Tufte sidenotes, bibliographic keys, and unverified claim flagging in the Philchat Wiki."
tags: [wiki, meta, style, citations]
layout: article
---

# Citation & Style Standards

<div className="dropcap">

The **Citation & Style Standards** establish the rules for evidence, attribution, and textual apparatus across the Philchat Wiki. Contributors are required to substantiate claims with authoritative citations, distinguish explanatory commentary from primary bibliographic sources, and systematically flag unverified assertions.

</div>

---

## 1. The Tufte Sidenote System

In this digital garden, all standard GitHub Flavored Markdown (GFM) footnotes are automatically transformed into **Tufte-style marginal sidenotes** in the right column of wide viewports, collapsing into interactive inline toggles on narrow mobile screens.

### Syntax
Place the footnote identifier directly following the punctuation of the asserted claim:

```markdown
Dewey preferred the term warranted assertibility over classical truth.[^dewey1938]

[^dewey1938]: Dewey, *Logic: The Theory of Inquiry* (1938), p. 9. See [[Bibliography#Dewey-Logic-1938]].
```

> [!note] Formatting Law
> Footnote identifiers are internal keys and do not appear as numbers in raw text. The remark pipeline converts them to clean, sequential Roman or Arabic numerals on build. Never place raw HTML block elements (like `<div>` or `<p>`) directly inside footnote definitions; inline formatting (`*italic*`, `[links]`, code spans) is fully supported.

---

## 2. Distinguishing Footnotes from Citations

Contributors should maintain a clear functional distinction between two kinds of marginal notes:

### A. Explanatory Contextual Footnotes
Used for nuanced qualifications, minor counter-arguments, linguistic etymologies, or channel cross-references that would otherwise interrupt the flow of the main argument:

```markdown
Nagarjuna rejects all four lemmas of the catushkoti.[^catushkoti]

[^catushkoti]: The four classical Buddhist truth possibilities: that a proposition is true, false, both, or neither.
```

### B. Bibliographic Citations
Used to anchor claims in canonical editions, translations, or historical transcripts. Cite the author, short title, date, and standard academic pagination:

```markdown
Kant insists that concepts without intuitions remain empty.[^kant-cpr]

[^kant-cpr]: Kant, *Critique of Pure Reason*, A51/B75. See [[Bibliography#Kant-CPR]].
```

---

## 3. Standard Academic Citation Schemes

Whenever available, use internationally recognized academic pagination rather than modern paperback page numbers:

| Field / Author | Citation Standard | Example |
|---|---|---|
| **Plato** | Stephanus pagination | *Republic* 514a–517c |
| **Aristotle** | Bekker pagination | *Nicomachean Ethics* 1097b22 |
| **Immanuel Kant** | First (A) & Second (B) editions; Akademie vol:page | *CPR* A51/B75; *Groundwork* Ak. 4:421 |
| **Baruch Spinoza** | Part, Definition, Axiom, Proposition, Scholium | *Ethics* Ip14s |
| **Ludwig Wittgenstein** | Proposition (Tractatus) or Section (PI) | *TLP* 6.54; *PI* §43 |
| **David Hume** | Book.Part.Section.Paragraph | *Treatise* 1.3.6.1 |
| **The Phil Chat Times** | Volume, Issue, Page | *Vol I No 8, p. 7* |

---

## 4. Flagging Claims: `[citation-needed]`

To maintain transparency while research is actively underway, contributors should flag unverified, contested, or unattributed claims using the tag `[citation-needed]`:

```markdown
Spinoza was offered a prestigious chair in philosophy at the University of Heidelberg, which he declined to preserve his intellectual independence.[citation-needed]
```

### When to Flag
* **Attributed Quotes**: Any direct quote lacking an identified work, chapter, or transcript volume.
* **Empirical or Statistical Assertions**: Claims regarding demographic acceptance rates among philosophers not tied to the 2009/2020 PhilPapers Survey datasets.
* **Channel Dispute Lore**: Specific factual claims about server events (such as exact message volume counts or reaction statistics) that have not yet been corroborated against *The Phil Chat Times* public archive.

### When NOT to Flag
* Mathematical, logical, or definitional tautologies.
* Broad, non-controversial historical summaries (e.g., "Descartes was a 17th-century French philosopher").

---

## 5. Master Bibliography Integration

Whenever possible, anchor citations against canonical entries listed in **[[Bibliography]]**. This enables the wiki to maintain clean, unified bibliographic records across multiple interconnected notes.

To link to a master entry, format the reference with an internal anchor:

```markdown
[^spinoza-monism]: Spinoza, *Ethics* Ip14. See [[Bibliography#Spinoza-Curley]].
```
