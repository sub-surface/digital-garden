# Digital Garden — Docs

Custom React 19 + Vite 6 SPA serving three domains: `subsurfaces.net` (garden), `wiki.subsurfaces.net` (wiki), and `chat.subsurfaces.net` (chat). Deployed as a Cloudflare Worker. All three shells share a single codebase and Supabase instance; dependencies flow strictly downward (garden → wiki → chat — nothing flows upward).

---

## Contents

| File | Description |
|---|---|
| [architecture.md](architecture.md) | Three-shell system, layering rules, domain routing, build pipeline |
| [garden.md](garden.md) | Garden (`subsurfaces.net`) — platform, layout, features, content, UX |
| [wiki.md](wiki.md) | Wiki (`wiki.subsurfaces.net`) — infrastructure, submission, contributor experience |
| [chat.md](chat.md) | Chat (`chat.subsurfaces.net`) — phases 1–3: chat, stonks, identity |
| [infrastructure.md](infrastructure.md) | OG gen, performance, security headers, legal |
| [future.md](future.md) | Deferred and low-priority items, grouped by domain |
| [devlog/README.md](devlog/README.md) | Devlog format and YAML schema |
| [devlog/2026-03-13.yaml](devlog/2026-03-13.yaml) | Session log: chat UI overhaul, inline search, emote-only rendering |
