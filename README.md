# Sub-Surface Territories

A digital garden and wiki — notes, essays, philosophy, music, photography, and chess.

**Live:** [subsurfaces.net](https://subsurfaces.net) · **Wiki:** [wiki.subsurfaces.net](https://wiki.subsurfaces.net)

---

## What's here

A non-linear, explorable knowledge base with 120+ interconnected notes. Two reading modes: article (long-form with margin sidenotes) and note (panel stacking for exploration). Animated backgrounds, a music player, an interactive knowledge graph, and a built-in chess board.

The wiki at `wiki.subsurfaces.net` is a community space for the philchat Discord — profiles, philosophical positions, and collaborative articles. Anyone can submit a profile via the form at `/wiki/submit`.

## Contributing to the wiki

1. Visit [wiki.subsurfaces.net/wiki/submit](https://wiki.subsurfaces.net/wiki/submit)
2. Fill in your profile and answer as many (or few) survey questions as you like
3. Complete the captcha and submit — a pull request is opened automatically
4. Your profile goes live after review

## Local development

```bash
git clone https://github.com/sub-surface/digital-garden.git
cd digital-garden
npm install
npm run dev
```

Content lives in `content/`. Drop a `.md` file with a `title` in frontmatter and it's live.

See `CLAUDE.md` for the full developer reference.

## Stack

React 19, Vite 6, TanStack Router, MDX, Zustand, SCSS modules. D3 + PixiJS for the knowledge graph. FlexSearch for search. Deployed on Cloudflare Workers.

## License

Content is personal. Code has no formal license — if you find something useful, take it.
