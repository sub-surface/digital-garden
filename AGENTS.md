# Agent Reference

The canonical agent reference for this codebase lives in **[`CLAUDE.md`](CLAUDE.md)**: commands,
directory map, gotchas. Read that first.

- Outstanding work: [`ROADMAP.md`](ROADMAP.md)
- Deeper reference (architecture, garden, wiki, chat, OS, composer, music): [`docs/index.md`](docs/index.md)
- Chat REST contract: [`CHAT-API.md`](CHAT-API.md)

This file exists so tools that look for `AGENTS.md` find the pointer. There is one source of truth for
agent instructions (`CLAUDE.md`); keep it out of here. Never edit `content/` (the owner's writing) or
`src/content/` (generated).
