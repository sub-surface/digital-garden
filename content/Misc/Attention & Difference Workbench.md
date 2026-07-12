---
title: Attention & Difference — Workbench
tags:
  - scratchpad
  - writing
private: true
---

# Workbench for [[Attention & Difference]]

Rough draft + apparatus. Not published (`Misc/` excluded + `private: true`). Provenance: working conversation with Claude (Fable 5), 2026-07-11 — transcript in [[A&D Colophon]].

`[LEON: ...]` marks decisions or voice-seams for you. Footnotes carry citations + technical care (they render as sidenotes via rehype-sidenotes — kept as single paragraphs, no block elements).

---

## Abstract

Attention, in three modalities — the machine, the mind, and the photograph — is the operation that converts difference into weight: a difference that makes a difference (Bateson). The photograph has been the index par excellence (Barthes' *ça-a-été*: light as carnal contact), and contemporary discourse — post-photography, post-representational art, speculative documentary — endlessly laments the index's death at the hands of generated images. The essay argues the lament mistakes what an index ever was. Barthes (the imaged pricks) and Sontag (the imager preys) each arm one pole of the encounter, and both remain trapped in a frame of fixed identities for whom death is the only common currency. Deleuze and Spinoza dissolve the standoff: identity is an optical effect of difference; the event does not spend possibility; the virtual and the actual are both real and distinct in their own right. Photography as event was always both a fake and a pure authenticity — the mask affirmed, not unmasked. The transformer, far from being a symbol-machine sealed off from the world, may be the most indexical object we have produced: a long exposure of a language. The arrows of attention run both ways, and always did.

---

# THE DRAFT

*(§0–§1 are your existing text, lightly corrected. §2–§6 are new, written toward your voice with your own sentences lifted where you supplied them — rework freely.)*

---

## §0 — Cold open *(unchanged)*

> Catastrophe is the past coming apart.
> Anastrophe is the future coming together.
> —Nick Land & Sadie Plant, *Cyberpositive*.[^landplant]

What a strange time it is, to be caught between informational, cultural, political revolutions. Better yet, what awaits the [[rosi-braidotti|convergence]] between a billion micro-revolutions each anastrophising molecular orderings, coalescing into broiling molar reconfigurations at every opportunity.

Have we seen something yet, have you been paying attention?

*(Keep the etymology callout here as scene-setting — attention as* ad + tendere*, a stretching-toward — but let it sit as a note, not a method.)*

---

## §1 — A Tension Is All You Need

*Stage: Can a word stretched across minds, machines and images still mean anything? Is it reasonable to interpret the functional description of a machine-learning term back to its anthropomorphic root — and what would we owe the word if we did?*

*(Your existing section, with fixes: "motiving" → "motivating"; "through with a query" → "through which a query"; move the Sontag line out — it now anchors §4. The D&G pullquote stays as epigraph here but gets its payoff in §3.)*

Existing content retained: AIAYN as anastrophe of "All You Need Is Love"; the three modes (Transformer / Cognitive / Photographic); SEP's "selective directedness" against Vaswani's "mapping a query and a set of key-value pairs to an output"; the pivot through the [[Roland Barthes|dead author]] to the punctum ("sting, speck, cut, little hole — and also a cast of the dice"); the powder box passage; the [[the noumenon has fangs|fanged noumenon]] — "an outside with its own ideas of what I will become."

End the section on the transformer diagram, captioned as a *Camera Lucida* plate:

> ![](https://upload.wikimedia.org/wikipedia/commons/8/8f/The-Transformer-model-architecture.png)
> *The Transformer architecture. It does not prick me.*

`[LEON: §6 undercuts this caption — that's the plant. Also consider downloading the image to content/Media/ (CF case-sensitivity + CLS dimensions) rather than hotlinking Wikimedia.]`

---

[[Attention & Difference]]

[[Attention & Difference]]

[[Attention & Difference]]

[[Attention & Difference]]

[[Attention & Difference]]

[[Attention & Difference]]

[[Attention & Difference]]

---

## Quote bank (supplementary — items not already in the footnotes)

**Weil**, letter to Joë Bousquet (1942): "Attention is the rarest and purest form of generosity." / *Gravity and Grace*: "Attention, taken to its highest degree, is the same thing as prayer."

**Paglen**, "Invisible Images (Your Pictures Are Looking at You)," *The New Inquiry*, Dec 2016 — images increasingly made by machines for machines; the human viewer now the exception. The title alone is §6's thesis in five words; currently unused in the draft — consider a footnote in §6.

**Flusser**, *Towards a Philosophy of Photography* — camera as programmed black box, photographer as "functionary." The only canonical photography theorist who is natively computational. One sidenote max; resist a section.

**Barthes**, *Camera Lucida* §5: "Death is the eidos of that Photograph" `[verify placement]`; §38 on "flat Death."

**CUT — Lacan's sardine can** (Seminar XI: "You see that can? Well, it doesn't see you!"). Cut per your call: the Deleuzian inheritance in this essay carries the anti-psychoanalysis critique, and importing Lacan's gaze would smuggle the identitarian frame back in through the service entrance. The can's work is done better by Descartes' ox and Paglen's title. Kept here in case you ever want it for a separate note on the gaze.

---

## Voice & apparatus conventions

- **Pullquotes** (`className="pullquote"`): poetic, standalone, no argumentative load — Land/Plant, the D&G epigraph.
- **Plain blockquotes**: working passages the prose directly chews on — Barthes' emanation, the mask, Deleuze's lightning.
- **Callouts** (`>[!note]`): definitions and scene-setting — the etymology.
- **Footnotes/sidenotes**: citations + technical care (derivations, verify-flags, the necessity landmine). Main column never pauses for the maths.
- Voice: puns carry argument weight; direct address with stakes; register-drops as anti-pomposity valve; British spellings; no emojis; no "this essay argues" scaffolding. *An essay about the punctum cannot be written in a voice that has no punctum.*

---

## Publish checklist / QoL

- [x] **The page is currently LIVE** (`published: "true"`, growth: larval) — edits ship on push. Either work in this file and paste over when ready, or set `published: false` during the overhaul.
- [x] Frontmatter description reads truncated ("Thoughts on the philosophy & computation") — suggest: *"Attention, in three registers — the machine, the mind, and the photograph."*
- [x] **Verify all quotes flagged VERIFY** against vault copies before publishing (Husserl ×2, Weil, Fontcuberta, Derrida ×2, Mole/SEP, CL section numbers).
- [x] Wikilink audit — your `/inbox` page surfaces broken links: [[Camera Lucida]] (consider a book note via Book Template), [[the image as supreme metaphor for knowledge]], [[the noumenon has fangs]], [[rosi-braidotti]] — check which resolve.
- [x] **[[On-Attention]] removal**: the essay currently links `[[On-Attention|intentionality]]` — §2's Husserl material now covers this in-house; relink or drop before deleting the old essay.
- [x] Transformer diagram: download to `content/Media/` (hotlink fragility + CLS dimensions + CF case-sensitivity). - FIXED (hotlink is fine)
- [ ] OG image generation should be active on next build/verify to build the new article OGs
- [x] Attention-viz artwork (optional, satellite): Neuronpedia (browser, GPT-2 small, zero setup), BertViz via free Colab, exBERT on HF — run the powder-box passage, render the heatmap, *Camera Lucida* caption. Paglen/Fontcuberta lineage.
- [x] Colophon: [[A&D Colophon]] created in content root, published — link it from the essay's footer or a final footnote.

## Satellites

- [ ] [[Joan Fontcuberta]] review — *[[The Eye and the Index (review)]]* (on arrival); his hoaxes (*Fauna*, *Sputnik*) as prior art for witness-or-performance.
- [ ] [[Susan Sontag]] / [[The Predatory Gaze]] — deep-dive note (essay takes one section; the note takes the rest).
- [ ] The gaze (Lacan/Bataille material, cut from this essay) — if ever, as its own quarantined note.
- [ ] "Différance is all you need?" — autoregression as deferral; separate note, would destabilise the index-focus here.
- [ ] Attention-map artwork as its own piece.

## Outstanding questions for Leon

1. **§6's "long exposure" move** — model as index-at-scale. It's the strongest anti-lament ending I could build from your dispatch of the prick question, but it's also the most assertable-with-a-straight-face claim in the essay. Does it land, or does it need more hedge/stress-test in the main column rather than the footnote?
2. **§5 stakes the radical-contingency claim hard** (your words, mostly). The necessity landmine is footnoted — enough, or do you want a paragraph in the main column owning the fight?
3. **Ending**: question-ending vs anastrophe-ending (marked in §6).
4. **The bull's eye**: if the hunt turns up the real quote, swap it in; if it's the Bataille/Barthes contaminant, do you still want the Descartes ox in the main column? (I think yes regardless.)
5. **Colophon transcript kept verbatim, typos and all** — authenticity read as the point. Veto if you'd rather it cleaned.
