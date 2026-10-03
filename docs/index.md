# Docs

Custom React 19 + Vite 6 SPA on one Cloudflare Worker, serving four hostnames from one codebase:
`subsurfaces.net` (garden), `wiki.`, `chat.` and `os.` (SUBSURFACES 95). Dev quick-start, commands
and gotchas are in [`../CLAUDE.md`](../CLAUDE.md); the one list of outstanding work is
[`../ROADMAP.md`](../ROADMAP.md). Docs describe the current system; superseded material goes to `archive/`.

## Living docs

| File | Read it for |
|---|---|
| [../ROADMAP.md](../ROADMAP.md) | Everything not yet built, grouped by area. Start here for "what's next". |
| [architecture.md](architecture.md) | Shells, layering, Worker, build pipeline, pre-rendering, backgrounds, headers/OG/perf, Supabase data. |
| [garden.md](garden.md) | Main-site reading model, authoring syntax, MDX components, features, games. |
| [wiki.md](wiki.md) | Wiki content rules, submit/edit flow, accounts and roles, claims, admin panel. |
| [chat.md](chat.md) | Chat UI and backend, identity denormalisation, moderation, bots, terminal mode. |
| [../CHAT-API.md](../CHAT-API.md) | Public REST contract for third-party chat clients and bots. |
| [os.md](os.md) | SUBSURFACES 95 desktop, window manager, programs, terminal, persistence contracts. |
| [apparatus.md](apparatus.md) | The generative plate composer: layers, registries, determinism, how to extend. |
| [music-workflow.md](music-workflow.md) | SoundCloud to R2 to `public/music.json`, and how the site plays it. |

## Records

| Folder | Contents |
|---|---|
| [migrations/](migrations/) | Dated SQL for schema changes, applied by hand in the Supabase SQL Editor (REST cannot run DDL). Historical; never edit. |
| [devlog/](devlog/README.md) | One log per work session (YAML, schema in its README). History; not rewritten. |
| [archive/](archive/) | Shipped or superseded specs and plans, including the full OS-95, composer, SSG, boot-page, chamber/SIGIL, chess/arcade and chat design docs, the old iteration spec and the shipped-milestones record. Reference only. |

## Conventions

- New DB change: dated `migrations/YYYY-MM-<topic>.sql`.
- Finished build spec: move it to `archive/specs/`, summarise what is still true in a living doc, and put any unbuilt ideas in the ROADMAP.
- Do not duplicate: commands and gotchas live in `CLAUDE.md`, API contracts in `CHAT-API.md`, backlog only in the ROADMAP.
- Never edit `content/` (the owner's writing) without asking; never edit `src/content/` (generated).
