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
- **Cite sources** where claims are contested or non-obvious.
- **Neutral point of view.** Present multiple perspectives fairly, especially on live debates.
- **Be concise.** Say what needs to be said without padding.

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

### Concept
```yaml
title: "Substance Monism"
description: "One-line summary."
tags: [wiki, concept]
type: concept
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
[[Spinoza]]
[[Wiki/Concepts/Substance Monism|Substance Monism]]
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

```
This claim needs a citation.[^1]

[^1]: Source: Author, *Title*, Year.
```

---

## Images

```
![Alt text](https://url-to-image.jpg)
```

For images stored in the repo, use the `/content/Media/` path.

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

## What Not To Do

- Don't use HTML unless absolutely necessary (MDX supports it, but markdown is preferred).
- Don't add `layout: article` to wiki pages (it's automatic for `wiki/` slugs).
- Don't create deeply nested folder structures within Wiki/.
- Don't use heading level 1 (`#`) more than once per article.
