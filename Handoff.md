# Engineering Handoff & Implementation Specification

**Date:** 2026-09-11  
**Status:** In Progress / Ready for Execution in Refreshed Session  
**Branch:** `master` (All prior work committed up to `bb21b08` and pushed to remote)  
**Corpus:** `sub-surface/digital-garden` (`C:\Users\Leon\Desktop\Psychograph\digital-garden`)

---

## 1. Executive Summary & Goals

This document synthesizes the exact state, discovered root causes, and implementation blueprints for the next agent session. The overarching mission is to transform the Philchat Wiki into an academically rigorous, aesthetically refined, deeply interconnected philosophical knowledge engine, while resolving critical runtime issues and layout deficiencies.

### Guiding Principles
- **Academic Rigor:** Follow the gold standard set by [`content/Wiki/Logic of Sense.md`](file:///C:/Users/Leon/Desktop/Psychograph/digital-garden/content/Wiki/Logic%20of%20Sense.md). Every article must treat texts and concepts with primary source citations, formal formulations, and dialectical counter-arguments.
- **Zero Emojis:** Strict enforcement across all UI, markdown notes, frontmatter, and navigation cards.
- **Linus Torvalds Code Quality:** Zero per-frame allocations in render loops, strict memory cleanup, zero unnecessary dependencies, and standard web compliance.
- **Obsidian / Markdown Compatibility:** Internal section references must use standard Obsidian syntax: `[[Note#Section]]` or `[[Note#Section|Label]]`.

---

## 2. Issues Diagnosed & Ready for Resolution

### Issue A: Map of Philosophy Graph Crash (`WikiGraph.tsx` & Pixi.js CSP)
- **Symptom:** Opening [`content/Wiki/Map of Philosophy.mdx`](file:///C:/Users/Leon/Desktop/Psychograph/digital-garden/content/Wiki/Map%20of%20Philosophy.mdx) throws an uncaught runtime error in the browser console:
  ```
  index-ZgrkgQyq.js:23 Uncaught (in promise) Error: Current environment does not allow unsafe-eval, please use pixi.js/unsafe-eval module to enable support.
      at zt._unsafeEvalCheck ... at async Y (WikiGraph-CNih1RZq.js:1:2592)
  ```
- **Root Cause:** `WikiGraph.tsx` relies on `pixi.js` v8, which dynamically compiles shaders using `new Function()` / `eval`. Cloudflare Pages enforces a strict Content Security Policy (`script-src 'self'`) blocking `eval`.
- **Solution:**
  1. Completely replace `pixi.js` inside [`src/components/mdx/WikiGraph.tsx`](file:///C:/Users/Leon/Desktop/Psychograph/digital-garden/src/components/mdx/WikiGraph.tsx) with the pure Canvas 2D + D3 force simulation engine developed in [`src/components/ui/graph/ConstellationPage.tsx`](file:///C:/Users/Leon/Desktop/Psychograph/digital-garden/src/components/ui/graph/ConstellationPage.tsx).
  2. Canvas 2D requires zero `eval`, has zero CSP friction, renders twinkling star aesthetics and force physics at 60fps, and has zero bundle-weight overhead.
  3. Support sub-graph embedding props: `<WikiGraph cluster="philosophy" />` or `<WikiGraph tag="ethics" />` (satisfying Roadmap / Suggestion 2).

### Issue B: ASCII Diagrams & Code Block Highlighting Bug
- **Symptom:** Fenced code blocks used for ASCII diagrams (e.g. in [`content/Wiki/Movements/Deontology.md`](file:///C:/Users/Leon/Desktop/Psychograph/digital-garden/content/Wiki/Movements/Deontology.md)) render text lines with broken grey background pills behind words.
- **Root Cause:** In [`src/styles/base.scss`](file:///C:/Users/Leon/Desktop/Psychograph/digital-garden/src/styles/base.scss):
  ```scss
  code:not([class]) {
    background: var(--color-highlight);
    padding: 0.2em 0.4em;
    border-radius: 3px;
    font-size: 0.9em;
    font-family: var(--font-code);
  }
  ```
  Markdown fences without language tags compile to `<pre><code>...</code></pre>`. Because `<code>` lacks a class, `code:not([class])` applies to `<code>` inside `<pre>`, causing inline text boxes to receive individual background highlights.
- **Solution:** Update [`src/styles/base.scss`](file:///C:/Users/Leon/Desktop/Psychograph/digital-garden/src/styles/base.scss):
  ```scss
  :not(pre) > code:not([class]) {
    background: var(--color-highlight);
    padding: 0.2em 0.4em;
    border-radius: 3px;
    font-size: 0.9em;
    font-family: var(--font-code);
  }

  pre code {
    background: transparent;
    padding: 0;
    border-radius: 0;
    font-size: inherit;
  }
  ```

### Issue C: Citation Format & Footnote Link Parsing
- **Symptom:**
  1. Citations formatted as `[[Bibliography#[Plato-Republic]]]` fail link parsing because the wikilink regex `[^\[\]\|#\\]+` in [`src/lib/remark-wikilinks.ts`](file:///C:/Users/Leon/Desktop/Psychograph/digital-garden/src/lib/remark-wikilinks.ts) stops at the inner brackets `[`.
  2. In [`content/Wiki/Bibliography.md`](file:///C:/Users/Leon/Desktop/Psychograph/digital-garden/content/Wiki/Bibliography.md), `[Plato-Republic]` renders as plaintext with square brackets and has no anchor `id`.
  3. Footnote references like `[^kant-gmm-ref]` render as literal text because they lack matching `[^kant-gmm-ref]: ...` definitions at the bottom of the file.
- **Solution:**
  1. **Standardize Obsidian section anchors:** Clean up all citation references to standard Obsidian anchors: `[[Bibliography#Plato-Republic]]` or `[[Bibliography#Kant-GMM|Kant (1785)]]`.
  2. **Anchor Generation in Bibliography:** Update [`content/Wiki/Bibliography.md`](file:///C:/Users/Leon/Desktop/Psychograph/digital-garden/content/Wiki/Bibliography.md) so each entry uses clean heading anchors or spans with explicit IDs:
     ```markdown
     ### Plato-Republic
     * **Plato-Republic**: Plato. *The Republic*...
     ```
     Or semantic HTML list items:
     ```markdown
     * <span id="Plato-Republic">**Plato-Republic**</span>: Plato. *The Republic*...
     ```
  3. **Footnote Definitions:** Ensure every footnote reference `[^key]` across wiki notes has its corresponding `[^key]: Citation text. See [[Bibliography#Key]].` definition.
  4. **Footnote Preview Activation:** In [`src/lib/remark-sidenotes.ts`](file:///C:/Users/Leon/Desktop/Psychograph/digital-garden/src/lib/remark-sidenotes.ts), add `data-footnote-ref` to the emitted `<a>` tag so [`LinkPreview.tsx`](file:///C:/Users/Leon/Desktop/Psychograph/digital-garden/src/components/ui/reader/LinkPreview.tsx) recognizes footnote markers and opens instant hover cards.

### Issue D: Wiki Index Reorganisation
- **Symptom:** [`content/Wiki/index.mdx`](file:///C:/Users/Leon/Desktop/Psychograph/digital-garden/content/Wiki/index.mdx) is currently dominated at the top by Philchat Discord sagas and chronicles, completely hiding the extensive philosophical architecture (Map of Philosophy, branches, movements, concepts, thinkers).
- **Solution:**
  1. Elevate the **Map of Philosophy** (`[[Map of Philosophy|A Map of Philosophy]]`), **Major Traditions & Branches**, **Philosophers**, and **Thought Experiments** to the upper tiers of `content/Wiki/index.mdx`.
  2. Relocate Philchat Discord sagas, member cards, and server folklore into a dedicated lower section titled "Philchat Chronicles & Community Archives".

### Issue E: Roadmap Notes (Low Urgency Browser Diagnostics)
- **Action:** Record in [`ROADMAP.md`](file:///C:/Users/Leon/Desktop/Psychograph/digital-garden/ROADMAP.md):
  1. Form field inputs missing explicit `id` or `name` attributes (preventing browser autofill warnings).
  2. CSP restriction on `unsafe-eval` (audit all vendor dependencies to ensure none call `eval()` or `new Function()`).

---

## 3. New Content Architecture & Tasks

### 1. Thought Experiments Directory (`content/Wiki/Thought Experiments/`)
Create comprehensive, analytic, deeply considered articles (with decision trees, premise-by-premise formal logic, historical context, objections, and bibliographic citations):
- `The Ship of Theseus.md` (Persistence, mereology, Hobbes' second ship, four-dimensionalism vs endurantism)
- `The Trolley Problem.md` (Foot's switch, Thomson's footbridge and loop, Double Effect, neuro-ethics)
- `The Experience Machine.md` (Nozick's thought experiment, hedonism critique, status quo bias)
- `The Chinese Room.md` (Searle's syntax vs semantics, intentionality, systems reply, robot reply)
- `Marys Room.md` (Jackson's knowledge argument, qualia, epiphenomenalism, ability hypothesis)
- `Philosophical Zombies.md` (Chalmers' modal argument, conceivable vs metaphysically possible, type-A/B/C physicalism)
- `Newcombs Problem.md` (Evidential vs causal decision theory, dominance principle vs expected utility)
- `The Teletransporter.md` (Parfit's *Reasons and Persons*, bundle theory of self, fission paradox)
- `The Violinist.md` (Thomson's defense of abortion, right to life vs right to use another's body)
- `The Brain in a Vat.md` (Cartesian skepticism, Putnam's semantic externalism, causal constraint on reference)

### 2. Specific Philosophical Texts Directory (`content/Wiki/Texts/`)
Create masterwork structural analyses mirroring [`content/Wiki/Logic of Sense.md`](file:///C:/Users/Leon/Desktop/Psychograph/digital-garden/content/Wiki/Logic%20of%20Sense.md):
- `Ethics (Spinoza).md` (Geometric method, definitions, axioms, proofs, the 5 parts)
- `Critique of Pure Reason (Kant).md` (Transcendental Aesthetic, Analytic, Dialectic, synthetic a priori)
- `Tractatus Logico-Philosophicus (Wittgenstein).md` (The 7 propositions, picture theory, saying vs showing)
- `Being and Time (Heidegger).md` (Dasein, worldhood, equipmentality, falling, temporality)
- `A Theory of Justice (Rawls).md` (Original position, veil of ignorance, two principles, reflective equilibrium)

### 3. Deepen Existing Core Articles
- Enrich [`content/Wiki/Map of Philosophy.mdx`](file:///C:/Users/Leon/Desktop/Psychograph/digital-garden/content/Wiki/Map%20of%20Philosophy.mdx) with long, detailed SEP-like prose and interactive sub-constellation embeds.
- Update [`content/Wiki/About.md`](file:///C:/Users/Leon/Desktop/Psychograph/digital-garden/content/Wiki/About.md) and [`content/Wiki/Style-Guide.md`](file:///C:/Users/Leon/Desktop/Psychograph/digital-garden/content/Wiki/Style-Guide.md) with modern citation, footnote, and diagram standards.

---

## 4. Verification Checklist for the Next Session

1. `npm run prebuild` executes without errors.
2. `npm run check` passes completely (`npm test`, `npm run lint` with 0 warnings, `npm run typecheck:worker`, `npm run build`).
3. Verify [`content/Wiki/Map of Philosophy.mdx`](file:///C:/Users/Leon/Desktop/Psychograph/digital-garden/content/Wiki/Map%20of%20Philosophy.mdx) loads cleanly in the browser without Pixi.js / `unsafe-eval` errors.
4. Verify ASCII code blocks render with crisp backgrounds and no patchy line highlights.
5. Verify footnote tooltips and `[[Bibliography#Key]]` links resolve smoothly.
