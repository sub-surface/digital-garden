---
title: Writing Template
description: A template and style reference for long-form notes in the Writing folder.
tags: [meta, writing]
type: essay
layout: article
date: 2026-03-07
growth: larval
---

# Title Here

<div className="dropcap">

Opening paragraph goes here. The first letter will render as a large drop cap. Keep this paragraph substantive — it sets the tone. The dropcap only applies to the first paragraph inside the `<div className="dropcap">` block.

</div>

Subsequent paragraphs flow normally. Notes in `content/Writing/` automatically get `layout: article` — no need to set it in frontmatter unless overriding. Add `published: true` and a `date` to include the note in the RSS feed.

---

## Section Heading

Regular prose. Internal links use wikilink syntax: [[Philosophy of Mind]]. External links render with a small ↗ arrow automatically — no special markup needed: [Stanford Encyclopedia of Philosophy](https://plato.stanford.edu).

Footnotes use standard GFM syntax and render as Tufte-style sidenotes in the right margin on wide viewports, toggling inline on narrow ones.[^1]

[^1]: Sidenote content goes here. Can include *emphasis*, **bold**, [links](https://example.com), wikilinks like [[Wiki/About]], and images. Images are automatically constrained to the sidenote width.

---

## Callouts

Obsidian-style callout syntax. The type sets the colour (`note` → secondary, `tip` → tertiary, `warning` → tertiary, `danger` → accent, default → primary):

> [!note] Note title
> Note content goes here. Single paragraph — for multi-paragraph callouts use separate `>` lines.

> [!callout] Callout title
> A general callout. Good for asides that aren't warnings or tips.

> [!warning] Warning title
> Use sparingly.

---

## Pull Quotes

Pull quotes float into the right margin. Use `<blockquote className="pullquote">` — the JSX `className` is required in MDX files (not `class`):

<blockquote className="pullquote">A short, striking sentence worth pulling out of the prose.</blockquote>

Pull quotes use `clear: right` so they never overlap with sidenotes.

---

## Embeds

Embed another note inline with `![[Note Title]]`. Renders as a styled aside block with a link to the full note:

![[Wiki/About]]

Section-scoped embed — only pulls content under a specific heading:

![[Wiki/About#How articles are structured]]

---

## Queries

Pull a live list of related notes from the content index. Syntax:

```jsx
<Query filter="tag=wiki" sort="-date" limit="5" display="list" />
```

Rendered output:

<Query filter="tag=wiki" sort="-date" limit="5" display="list" />

Supported display modes: `list`, `grid`, `table`. Filter by `tag`, `type`, `folder`, `growth`, `featured`. Sort by any frontmatter field, prefix `-` for descending.

---

## Frontmatter Reference

```yaml
title: Note Title
description: One sentence for OG tags and RSS.
tags: [essay, philosophy]   # freeform
type: essay                 # affects layout resolution
layout: article             # explicit override (Writing/ sets this automatically)
date: YYYY-MM-DD            # required for RSS
published: true             # opt-in to rss.xml feed
growth: larval | becoming | actual
```
