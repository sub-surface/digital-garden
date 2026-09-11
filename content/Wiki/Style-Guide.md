---
title: Wiki Style Guide
description: Guidelines for writing and formatting Philchat Wiki articles.
tags: [wiki, meta]
layout: article
---

# Wiki Style Guide

A reference for contributors writing or editing wiki articles. Follow these conventions for consistency across the wiki.

---

## Tone & Standards

- **Write clearly and charitably.** Steelman positions you disagree with.
- **Strict Academic Rigour.** Cite primary sources, state formal argument premises, and present counter-objections.
- **Zero Emojis.** Never use emojis in titles, frontmatter, headings, or prose across wiki articles. Maintain a clean, encyclopedic aesthetic.
- **Neutral point of view.** Present multiple perspectives fairly, especially on live debates.
- **Be concise.** Say what needs to be said without padding.
- **Obsidian Citation Anchors.** When linking to the bibliography, use `[[Bibliography#Key]]` (e.g. `[[Bibliography#Kant-CPR]]`). These anchors match `<span id="Key">` targets and automatically render rich popover previews.

---

## Frontmatter

Every article needs a YAML frontmatter block at the top. The required fields depend on the article type:

### Philosopher
```yaml
title: "Baruch de Spinoza"
description: "One-line summary for search and OG tags."
tags: [wiki, philosopher]
type: philosopher
born: "1632, Amsterdam"
died: "1677, The Hague"
school: "Rationalism, Spinozism"
main_interests: "Metaphysics, Ethics"
notable_ideas: "Substance Monism, Conatus"
```

### Canonical Text
```yaml
title: "Critique of Pure Reason (Kant)"
description: "Transcendental idealism, synthetic a priori knowledge, and the antinomies of pure reason."
tags: [wiki, text, kant, idealism, epistemology, metaphysics]
type: text
author: "Immanuel Kant"
original_title: "Kritik der reinen Vernunft"
published: "1781 (A) / 1787 (B)"
tradition: "German Idealism, Critical Philosophy"
key_themes: ["Synthetic a priori", "Transcendental Deduction", "Antinomies"]
```

### Concept & Thought Experiment
```yaml
title: "The Teletransporter"
description: "Derek Parfit's thought experiment probing fission, psychological continuity, and personal identity."
tags: [wiki, concept, metaphysics, personal-identity, parfit]
type: concept
introduced_by: "Derek Parfit"
key_works: "Reasons and Persons (1984)"
domain: "Personal Identity, Philosophy of Mind"
```

### Movement
```yaml
title: "Rationalism"
description: "One-line summary."
tags: [wiki, movement]
type: movement
```

### General / Misc
```yaml
title: "Page Title"
description: "One-line summary."
tags: [wiki]
```

---

## Headings

- Use `## Heading 2` for main sections.
- Use `### Heading 3` for subsections.
- Don't skip levels (e.g., don't go from `##` to `####`).
- Keep headings short and descriptive.

---

## Links

### Internal (wikilinks)
Link to other wiki pages with double brackets:
```
[[Baruch Spinoza]]
[[Substance Monism]]
```

### External
Standard markdown links render with a small arrow:
```
[Stanford Encyclopedia](https://plato.stanford.edu)
```

---

## Formatting

| Syntax | Result |
|---|---|
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `` `code` `` | `code` |
| `> blockquote` | blockquote |
| `- item` | bullet list |
| `1. item` | numbered list |
| `---` | horizontal rule |

---

## Callouts

Use callout blocks for important notes, tips, or warnings:

```
> [!note] Title
> Content here.
```

Available types: `note`, `tip`, `warning`, `callout`.

---

## Footnotes / Sidenotes

GFM footnotes render as Tufte-style sidenotes in the right margin:

```markdown
This claim needs a citation.[^1]

[^1]: Source: Author, *Title*, Year. See [[Bibliography#SourceKey]].
```

Every footnote reference `[^tag]` must have an exact matching footnote definition `[^tag]: ...` at the bottom of the file. Link previews automatically intercept footnote markers on hover to display rich preview tooltips.

Unverified or contested claims should be flagged with `[citation-needed]`. See the full **[[Citation-Guide|Citation & Style Standards]]** and the **[[Bibliography|Master Bibliography]]** for detailed citation keys and academic pagination rules.

---

## Images

```
![Alt text](https://url-to-image.jpg)
```

For images stored in the repo, use the `/content/Media/` path.

---

## Canonical Text Analyses

Text analyses dissect historical treatises proposition by proposition. Follow this seven-part structure:
1. **Overview & Historical Context**: Composition timeline, immediate polemical rivals, and foundational objectives.
2. **Structural Architecture**: Formal textual divisions (parts, books, propositions, or meditations).
3. **Core Axioms & Deductions**: Exact logical progressions with numbered propositions or demonstrations.
4. **Key Arguments & Landmark Formulations**: The system's central conceptual innovations (e.g. conatus, synthetic *a priori*, picture theory).
5. **Aporias, Paradoxes & Internal Tensions**: Textual friction, circularities, or unreconciled doctrines.
6. **Critical Objections & Historical Reception**: Major historical rebuttals from competing traditions.
7. **Bibliographic Apparatus**: Authoritative critical editions, standard pagination formats (e.g., Stephanus, Bekker, Gebhardt, Academy), and standard citation anchors linking to `[[Bibliography#Key]]`.

See [[Ethics (Spinoza)]], [[Critique of Pure Reason (Kant)]], or [[Tractatus Logico-Philosophicus (Wittgenstein)]] for reference implementations.

---

## Thought Experiments & Analytical Concepts

Follow the standard analytical philosophy format:
1. **Overview & The Paradox / Dilemma**: Vivid presentation of the scenario and the intuition pump.
2. **Historical Genesis & Context**: Originating thinker, seminal publication, and background philosophical problem.
3. **Formal Argument & Logical Architecture**: Precise numbered premises, conclusion, and deduction rules (modus ponens, reductio, etc.).
4. **Theoretical Responses & Intuition Divergence**: Tabular or structured breakdown of competing traditions (e.g. physicalist vs. dualist, compatibilist vs. libertarian).
5. **Crucial Objections & Variations**: Branching variations (e.g. Parfit's Branch-Line case, Putnam's Twin Earth) and objections.
6. **Related Concepts & Navigation**: Wikilinks to related paradoxes, thinkers, and movements.

See [[The Teletransporter]], [[The Brain in a Vat]], [[The Violinist]], or [[Molyneuxs Problem]] for reference implementations.

---

## Philosopher Articles

Follow the established structure:
1. Quote or motto
2. Quick Info box (dates, nationality, tradition, AOS, notable for)
3. Biography Summary
4. Key Philosophical Contributions (with subsections)
5. PhilPapers Survey Profile
6. Major Works
7. Influence & Legacy

---

## Chatter Profiles

Use the Philsurvey format. The submit form generates this structure automatically, but if editing manually:
1. Introduction / bio paragraph
2. Survey sections (Metaphysics & Epistemology, Value Theory, Logic & Language, Metaphilosophy)
3. Additional Notes

---

## Events

Running stories — the room's bouts, sagas and capers, as reported by *The Phil Chat Times* — live in `Wiki/Events/`, tagged `[wiki, event]`. They render as articles automatically (any `wiki/` slug does). Cite the paper by volume and page, document from the public archive rather than the private logs, and quote any claim that rests on a single line. See [[The Moggening]] for the house style.

## Phil Chat Widgets

Three MDX components echo the paper's own furniture. They are registered globally, so any `.md` or `.mdx` article can use them with no import.

### `<Tape>`
The masthead measuring-strip, reused as a divider.
```mdx
<Tape />
<Tape label="Sunday afternoon" />
<Tape tone="ink" />
```

### `<Clipping>`
A line from the room, set apart in the paper's broadsheet voice.
```mdx
<Clipping cite="Stackhouse" issue="Vol I No 8">
The fun police have shown up.
</Clipping>
```

### `<WeighIn>`
The "tale of the tape" for bouts and mog-offs. `rows` is a list of `[attribute, left, right]`.
```mdx
<WeighIn
  left="Quigley" right="Hugh"
  rows={[
    ["Truth", "Warranted assertibility", "Correspondence"],
    ["Messages", "804", "1,468"],
  ]}
  verdict="Hugh by decision, Quigley by his own account."
/>
```

### `<Classifieds>` & `<Classified>`
Vintage newsprint classified advertisements column for notices, bounties, lost & found, and room disputes.
```mdx
<Classifieds rate="2 Cents Per Word">
  <Classified category="LOST & FOUND" title="10 Gallons of Lye" contact="Box 4">
    Found in plastic storage tub. Slightly hygroscopic.
  </Classified>
</Classifieds>
```

### `<ChuckleRating>`
The aura reaction scale badge (sizes 1 to 5) for somatic laugh measurement.
```mdx
<ChuckleRating size={2} react=":KEKW: × 4" />
<ChuckleRating size={4} label="Channel Meltdown" react=":OMEGALUL: × 14" />
```

> [!tip] JSX, not HTML
> Content files are compiled as JSX. Inside raw HTML use `className`, not `class`. `<WeighIn>`'s `rows` prop is a JS expression, so the file should be `.mdx` when you pass it (plain `<Tape />`, `<Clipping>`, `<Classifieds>`, or `<ChuckleRating>` works in `.md` too).

## What Not To Do

- Don't use HTML unless absolutely necessary (MDX supports it, but markdown is preferred).
- Don't add `layout: article` to wiki pages (it's automatic for `wiki/` slugs).
- Don't create deeply nested folder structures within Wiki/.
- Don't use heading level 1 (`#`) more than once per article.
