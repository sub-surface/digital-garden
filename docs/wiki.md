# Wiki (wiki.subsurfaces.net)

The community wiki for the philchat Discord: philosophers, concepts, movements, thought experiments,
canonical texts, chatter profiles and chronicles, with accounts, moderation and edit history. It is
the same SPA in `WikiShell` (see [`architecture.md`](architecture.md)). Outstanding work is in
[`../ROADMAP.md`](../ROADMAP.md).

## Content

- Lives in `content/Wiki/` (`Philosophers/`, `Concepts/` including the thought experiments, `Movements/`, `Texts/`, `Events/`, `chatters/`, plus `index.mdx`, `About`, `Style-Guide`, `Citation Guide`, `Bibliography`, `Map of Philosophy.mdx`). Slugs under `wiki/` classify as articles. `wiki.subsurfaces.net/` resolves to `Wiki/index`.
- Standard tags: `philosopher`, `chatter`, `concept`, `movement`; index sections link to `/tags/{type}`. `type: chatter` / `philosopher` pages render `WikiInfobox`.
- Style rules (enforced by convention in `Style-Guide.md`): primary-source citations, formal premises and objections, no emojis, Obsidian-style `[[Note#Section]]` references, every `[^key]` footnote defined, ASCII diagrams in fenced code blocks (the `:not(pre) > code` selector keeps them unhighlighted).
- Cross-domain backlinks from wiki pages to non-wiki notes use the full `https://subsurfaces.net/` prefix; wiki links never go through the panel stack (`usePanelClick` bails on non-main shells); wiki RSS is `wiki-rss.xml`.
- `<WikiGraph>`/`<EmbedGraph>` embeds support `cluster`, `tag`, `slug`, `depth`, `height`, `interactive`.

## Contribution flow

- **Submit** (`/submit`, `WikiSubmitPage`): 4 steps (basics, 35-question survey with "Other" free text, markdown body editor, review), profile image upload or URL, localStorage draft plus `.json` draft download/upload. `POST /api/submit` verifies Turnstile and opens a PR against `master` with `tags: [wiki, chatter]`. User text must go through `yamlStr()` in `src/worker/wiki.ts`.
- **Edit** (`/edit/<slug>`) and **New** (`/new`): editor/admin roles only. Markdown editor with toolbar, word count, lazy-loaded preview, mandatory edit summary (200 chars), "+N / -M lines" summary; both open a GitHub PR (`POST /api/edit`, `POST /api/new`) and write `edit_log`. `GET /api/lock-status` reports page locks so concurrent editing is blocked.
- The GitHub token is a personal token; a GitHub App token is on the roadmap. The wiki rebuilds only after a PR merges.

## Accounts and roles

- Roles: `pending`, `editor`, `admin`. Supabase auth with email+password (`signInWithPassword`), signup with username (3-30 chars, unique), magic link or password reset landing on `/profile` (the page detects an OTP-only or recovery session via `session.user.amr` and prompts for a password). Custom SMTP via Resend. Dev auto-login: `VITE_DEV_AUTH_EMAIL` + `VITE_DEV_AUTH_PASSWORD` in `.env.local` (never commit).
- `useAuth()` consumes the single `AuthProvider` (mounted in `main.tsx`); never create another listener.
- Endpoints: `GET /api/auth/me`, `PUT /api/auth/profile`, `POST /api/auth/register`, `POST /api/profile/avatar` (2MB JPEG/PNG/WebP/GIF to the public `avatars` bucket; falls back to a claimed or `username`-matched chatter page image), `GET /api/user/:username`.
- Profiles: `/profile` (own, editable bio/username, avatar upload, edit history, bookmarks, claim status) and `/user/:username`.
- Bookmarks: `useBookmarks` is Supabase-backed when logged in, localStorage when not, and migrates on first login (`GET/POST/DELETE /api/bookmarks`, `POST /api/bookmarks/migrate`).

## Chatter claiming

A logged-in user links their account to a chatter page whose `username` frontmatter matches theirs.
`chatter_claims(user_id PK, wiki_slug UNIQUE, claimed_at)`. `POST /api/chat/claim` (409 if taken by
someone else), `GET /api/users/:username/claim`, `GET /api/claims/by-slug/:slug`. `WikiInfobox`
overrides the frontmatter image with the claimer's avatar; `WikiProfilePage` shows the claimed page
and a "Claim this page" button.

## Admin panel (`/admin`, `role === "admin"`)

Three tabs: Users (role ladder pending, editor, admin; approve/promote/demote/revoke via
`POST /api/admin/approve|revoke`), Edit Log (`GET /api/admin/log`) and Page Locks
(`GET/POST/DELETE /api/admin/lock(s)`). All `/api/admin/*` routes are declared `auth: "admin"` in the
Worker route table. Chat moderation (bans, rooms, pins) shares the same admin gate; see [`chat.md`](chat.md).
