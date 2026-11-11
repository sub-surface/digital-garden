# Where the backend should live

An assessment written 2026-11-11, after the `/write` desk moved to D1 + R2.
Decision record and plan, not a spec. Check limits against the Cloudflare
dashboard before relying on them; the numbers below are from memory.

## What the backend actually is

Almost all of it is already *the Worker*. Every Supabase table except one is
reached only through `supabaseRest()` in `src/worker/lib.ts` with the
service key; the browser never reads a table directly. Inventory (calls in
`src/worker/`):

| Data | Calls | Who uses it | Moves to |
|---|---|---|---|
| `profiles` | 17 | everyone signed in (role, username, colour, avatar) | D1, with auth (phase 3) |
| `messages`, `reactions`, `rooms` | 22 | philchat in the dock, the cold-storage chat room | a Durable Object per room (phase 2) |
| `page_locks`, `edit_log`, `chatter_claims` | 12 | wiki editing and claims | D1 (phase 1) |
| `bookmarks` | 4 | signed-in readers | D1 (phase 1) |
| `api_keys` | 4 | the CLI / bots | D1 (phase 1) |
| `os_restores` | 3 | OS shell restored files | D1 (phase 1) |
| Storage `avatars` (public bucket) | 3 | profile pictures | R2 behind the Worker (phase 1) |
| Supabase Realtime (`room:*`, `typing:*`) | 2 channels | chat, live | the same Durable Object (phase 2) |
| Supabase Auth (password, OTP signup, SMTP via Resend, cross-subdomain cookie) | everywhere | sign-in | stays for now (phase 3 is optional) |

Content is not in any database and shouldn't be: git is the CMS (notes,
wiki PRs, desk commits), the build renders it, Workers static assets serve
it. Settings live in `localStorage`. Music lives in R2.

## Why Supabase feels insecure, and how far that's true

The service key is a Worker secret and never reaches the client, and the
Worker checks `isUuid()` before interpolating ids into PostgREST filters. The
remaining exposure is the **anon key in the bundle**. It's public by design.
Anything it can reach is guarded only by Row Level Security, and the
migrations here define a policy for one table (`os_restores`). Realtime
`postgres_changes` on `messages` needs anon or authenticated `select` on that
table. A table whose RLS was never enabled is readable and writable by anyone
who has the anon key.

**Do this now, whatever else happens:** in the Supabase SQL editor run
`select tablename, rowsecurity from pg_tables where schemaname = 'public';`,
enable RLS on every table, and give each table *no* anon policies except what
Realtime needs (read on `messages` only). The Worker's service key bypasses
RLS, so nothing in the Worker breaks.

## The recommendation

**Cloudflare for data, Supabase for identity only. Retire it fully only if
phase 3 earns its keep.**

- **Phase 1: plain tables → D1, avatars → R2.** All of these are already
  Worker-mediated, so the client doesn't change (avatar URLs become
  `/api/avatar/<id>`, served from R2 with a long cache). There's one binding
  to add (reuse `DESK_DB` or add `SITE_DB`), the queries become D1
  statements, and a one-off export script copies the rows. Low risk, about a
  day. It also removes most of the RLS surface.
- **Phase 2: chat → Durable Objects.** One DO per room, using SQLite storage
  for messages and reactions and hibernating WebSockets for live delivery and
  typing. That replaces Realtime, which is the main reason the client still
  loads `supabase-js` beyond auth. The denormalised identity on messages
  (gotcha in CLAUDE.md) carries over unchanged. Medium risk, mostly UI glue in
  `useChatMessages` and `TypingIndicator`. Chat is in cold storage, so it's
  also fair to ask whether the tables can just be archived.
- **Phase 3 (optional): own auth on the Worker.** Passkeys (WebAuthn, e.g.
  `@simplewebauthn/server`, which runs on Workers) plus an email magic link
  (Cloudflare Email Service or the existing Resend). The session would be an
  HttpOnly, Secure cookie on `.subsurfaces.net` holding a random id, with
  sessions and profiles in D1. Existing users re-enrol once: password hashes
  could be exported, but it isn't worth it for a handful of accounts. This is
  the only phase that is genuinely security-sensitive code. For a site whose
  users are the owner and a few friends, passkeys make it smaller and safer
  than what's there now. Do it after phases 1 and 2 have settled, not
  alongside them.

Things that should **not** move: content (git), settings (`localStorage`),
OG cards (committed), and any of the static games. The arcade's bots run in
the browser, in Web Workers where the search is heavy (Enclosure).

## The free-tier caveat that matters

`wrangler.toml` sets `run_worker_first = true`, so **every** request, static
assets included, is a Worker invocation. On the Workers Free plan that's
100k requests a day across the account. Normal traffic fits, but a link
landing somewhere busy wouldn't. D1 (millions of reads a day), R2 (10 GB, no
egress fees) and Durable Objects (on Free, SQLite-backed) are not the
constraint. If the site grows, either go to Workers Paid ($5/month, which
lifts all of these) or narrow `run_worker_first` to the paths that need
the Worker (`/api/*` plus HTML routes for OG injection), so that assets bypass it.
