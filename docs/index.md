# Digital Garden — Docs

Custom React 19 + Vite 6 SPA serving four domains: `subsurfaces.net` (garden), `wiki.subsurfaces.net` (wiki), `chat.subsurfaces.net` (chat), and `os.subsurfaces.net` (boot TUI). Deployed as a Cloudflare Worker. All shells share a single codebase and Supabase instance; dependencies flow strictly downward (garden → wiki → chat — nothing flows upward).

**Agent/dev quick-start lives in [`../CLAUDE.md`](../CLAUDE.md)** — commands, directory map, gotchas. This folder holds the deeper reference material.

---

## Living docs

| File | Description |
|---|---|
| [../ROADMAP.md](../ROADMAP.md) | **Consolidated outstanding work.** Start here for "what's next". |
| [../CHAT-API.md](../CHAT-API.md) | Public REST API reference for third-party chat clients/bots (split out of README 2026-07-12) |
| [architecture.md](architecture.md) | Shell system, layering rules, domain routing, build pipeline |
| [garden.md](garden.md) | Garden (`subsurfaces.net`) — platform, layout, features, content, UX |
| [wiki.md](wiki.md) | Wiki (`wiki.subsurfaces.net`) — infrastructure, submission, contributor experience |
| [chat.md](chat.md) | Chat (`chat.subsurfaces.net`) — chat + identity (stonks removed 2026-07) |
| [infrastructure.md](infrastructure.md) | OG gen, performance, security headers, legal |
| [music-workflow.md](music-workflow.md) | Music pipeline — SoundCloud → `npm run sync:music` → R2 → `music.json` |
| [future.md](future.md) | Full per-domain backlog (detail backer for ROADMAP) |
| [templeos-boot-ideas.md](templeos-boot-ideas.md) | Idea bank for `/boot` TUI easter eggs |

## Records

| Folder | Description |
|---|---|
| [migrations/](migrations/) | Database schema changes (SQL, run via Supabase SQL Editor or MCP). One file per change, dated. |
| [devlog/](devlog/README.md) | Session logs (YAML, schema in the README) |
| [archive/](archive/) | Historical specs, plans, and mockups for **shipped or superseded** work — including the boot-page specs, chamber/SIGIL spec, chess/arcade/chat design docs, and the old iteration-spec (superseded by ROADMAP.md). Reference, never edit. |

## Conventions

- New DB change → SQL file in `migrations/`, dated (`YYYY-MM-<topic>.sql`), applied via SQL Editor/MCP (REST can't do DDL).
- New build spec arriving from outside → drop it in `archive/specs/` once built; link it from the ROADMAP item it spawned.
- Docs describe the *current* system; superseded material moves to `archive/` rather than being rewritten in place.
