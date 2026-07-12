# Sub-Surface Territories

A digital garden — notes, essays, philosophy, music, photography, and a growing collection of
games and generative toys, wired together as one explorable, non-linear site.

**Garden:** [subsurfaces.net](https://subsurfaces.net) · **Arcade:** [subsurfaces.net/arcade](https://subsurfaces.net/arcade) · **Wiki:** [wiki.subsurfaces.net](https://wiki.subsurfaces.net) · **Chat:** [chat.subsurfaces.net](https://chat.subsurfaces.net) · **Boot TUI:** [os.subsurfaces.net](https://os.subsurfaces.net)

---

## What's here

A non-linear, explorable knowledge base with 100+ interconnected notes, essays, and reading
lists. Two reading modes: article (long-form, margin sidenotes, footnotes) and note (panel
stacking for exploration). An interactive knowledge graph, a vinyl-style music player, and
animated backgrounds you can cycle or theme.

**Games & toys:** a chess board with a homemade bot and an [arcade](https://subsurfaces.net/arcade)
of a dozen-plus small games (Snake, Tetris, 2048, Blackjack, Hex Mines, Boids/murmuration,
sandbox, ant farm, and more). Plus two original games with their own research threads:

- **[HeXO](https://subsurfaces.net/hexo)** — a hex-grid combinatorial game with an accompanying
  theory write-up (transversal-number pressure, forcing sequences); research repo tracks open
  questions.
- **[SIGIL](https://subsurfaces.net/sigil)** / **[Collider](https://subsurfaces.net/collider)** —
  a generative routing puzzle and a bubble-chamber aiming toy, both built on the same procedural
  "chamber" flow-field engine that also powers an ambient background mode.

**Generative art:** [Apparatus](https://subsurfaces.net/apparatus) is a plate composer — armatures
× motifs × eras combine into one-off generative compositions, rendered live as SVG.

**`/boot`** (also the whole of `os.subsurfaces.net`) is a self-contained, endlessly-generated
terminal boot sequence — a TUI easter egg with its own procedural text generators and ambient
audio.

The wiki at `wiki.subsurfaces.net` is a community space for the philchat Discord — profiles,
philosophical positions, and collaborative articles, with accounts, moderation, and edit history.
Anyone can submit a profile via the form at `/submit`. The chat at `chat.subsurfaces.net` is a
real-time chatroom with a documented REST API — see [`CHAT-API.md`](CHAT-API.md) if you want to
build a third-party client, bot, or CLI against it.

## Elsewhere in the constellation

Sub-Surface isn't only this repo — a handful of standalone experiments live on their own
subdomains (and one off it entirely), each its own codebase:

- **[ANABASIS](https://anabasis.subsurfaces.net)** — a real-time PS1/PS2-era topographic
  apparatus that hallucinates terrain from a photograph's pixel brightness, after Joan
  Fontcuberta's *Orogenesis*. Three.js.
- **[Avatar](https://avatar.subsurfaces.net)** — a real-time 3D audio visualiser with a Joy
  Division–esque aesthetic. WebGL.
- **[bazar](https://bazar.subsurfaces.net)** — an infinite procedural Persian-carpet walking
  simulator.
- **[lines of flight](https://lines.subsurfaces.net)** — a meditative ink-field toy: a dot that
  stays, a line that leaves.
- **[p(doom)](https://pdoom.subsurfaces.net)** — a text incremental about an AI lab's funding,
  compute, talent, and doom problems (`npx p-doom` for the terminal version).
- **[STARWEFT](https://star.subsurfaces.net)** — a cozy space-logistics strategy game: reweave a
  shattered galaxy's trade lanes one delivery at a time.
- **[The Predictor](https://omega.subsurfaces.net)** — a roguelike whose antagonist trains a live
  model of you (also linked from the garden's own arcade).
- **[Attention and Difference](https://mrcal17.github.io/attention-and-difference)** — a separate
  blog on AI ethics and philosophy (fairness, interpretability, governance). A sibling project to
  this garden's own *Attention & Difference* essay, sharing a name and a theme but not the text.

## Contributing to the wiki

1. Visit [wiki.subsurfaces.net/submit](https://wiki.subsurfaces.net/submit)
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

React 19, Vite 6, TanStack Router, MDX, Zustand, SCSS modules. D3 + PixiJS for the knowledge
graph. FlexSearch for search. Deployed on Cloudflare Workers.

## License

Content is personal. Code has no formal license — if you find something useful, take it.
