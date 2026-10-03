# Chat API: building a third-party client

The chat backend (`chat.subsurfaces.net`) is a REST API served by the Cloudflare Worker
(`src/worker/chat.ts`, `chatBot.ts`, `keys.ts`; route table in `src/worker/index.ts`). It works
independently of the web UI, so you can build your own frontend, bot or CLI against it. The same
host also answers on `subsurfaces.net` and `wiki.subsurfaces.net` (CORS is allow-listed to those origins).

## Authentication

Every chat endpoint below except `users/:username/mini` needs a bearer token. Two kinds are accepted:

```
Authorization: Bearer <supabase_access_token>     # a logged-in session JWT
Authorization: Bearer sk_<your_key>               # an API key
```

Create an API key in the chat UI (Settings, API Keys) or with `POST /api/keys` (below). Keys are
SHA-256 hashed at rest, shown in plaintext once, never expire, and are revoked softly
(`revoked_at`). Banned users get `403` when sending messages or running bot commands.

Write requests (POST/PUT/PATCH/DELETE under `/api`) are rate limited per user/IP (30 per minute at
the time of writing); expect `429` and back off.

## Rooms and messages

`room`/`room_id` is the room's `id` as returned by `GET /api/chat/rooms` (each room also has a `slug` and `name`).

```
GET    /api/chat/rooms                           { rooms: [{ id, name, slug, created_at, created_by }] }
GET    /api/chat/messages?room=<id>&before=<iso>&limit=<=100>
                                                 { messages: [...], has_more }   newest first
GET    /api/chat/messages/:id                    { message }
POST   /api/chat/messages                        { room_id, body, reply_to? }  -> 201 { ok: true }
PATCH  /api/chat/messages/:id                    { body }   edit your own message (sets edited_at)
DELETE /api/chat/messages/:id                    soft delete (own message, or any as admin)
GET    /api/chat/search?q=&room=&user=&before=&after=&limit=
GET    /api/chat/pins?room=<id>                  pinned messages (max 20)
POST   /api/chat/messages/:id/pin                admin
DELETE /api/chat/messages/:id/pin                admin
```

Message bodies are limited to 2000 characters. Message objects carry denormalised author identity
(`username`, `name_color`, `avatar_url`), a `profiles` summary, a `reply_to_message` snapshot and
grouped `reactions`.

```bash
curl -X POST https://chat.subsurfaces.net/api/chat/messages \
  -H "Authorization: Bearer sk_your_key" -H "Content-Type: application/json" \
  -d '{"room_id": "<room id>", "body": "hello from the API"}'
```

Reply by adding `"reply_to": "<message_uuid>"`.

## Reactions

```
POST   /api/chat/reactions    { message_id, emote }   add (idempotent upsert, not a toggle)
DELETE /api/chat/reactions    { message_id, emote }   remove your own
```

Emote names and extensions are listed at `/emotes/index.json` (`[{ name, ext }]`).

## Users, GIFs, bots

```
GET    /api/chat/users/:username/mini    public, no auth: { username, avatar_url, role, bio, created_at, name_color }
GET    /api/chat/gif-search?q=           proxies Klipy (needs the server-side key)
POST   /api/chat/command                 { room_id, command, args[] }  persona bots
```

`/api/chat/command` runs the in-room persona bots (`debate`, `ask`/`chat`, `quote`, `yellowcard`,
`tape`, `bothelp`); it posts as the bot persona and enforces a per-room debate cooldown.

## API keys

```
POST   /api/keys          { name? }  -> { key: "sk_...", name }   (plaintext key returned once)
GET    /api/keys          your keys: id, name, created_at, last_used_at, revoked_at
DELETE /api/keys/:id      revoke
```

`/api/admin/api-keys` is an alias kept for history; despite the name it is not admin-gated.

## Chatter identity claiming (wiki feature)

`POST /api/chat/claim { wiki_slug }` links your account to a wiki chatter page whose `username`
frontmatter matches yours (`409` if already claimed by someone else).
`GET /api/users/:username/claim` and `GET /api/claims/by-slug/:slug` read a claim back. See
[`docs/wiki.md`](docs/wiki.md).

## Moderation (admin accounts only)

```
POST /api/chat/ban      { user_id, type: "temporary" | "permanent", duration_hours?, reason? }
POST /api/chat/unban    { user_id }
POST/PATCH /api/chat/rooms[/:id]   create a room / archive-unarchive one
```

A permanent ban hard-deletes the user's messages and reactions and anonymises their profile.

## Realtime

Live messages come from [Supabase Realtime](https://supabase.com/docs/guides/realtime): subscribe to
inserts on the `messages` table filtered by `room_id`. Inserted rows already include the denormalised
author fields, so do not re-fetch to enrich them. Row-level security limits reads to authenticated
sessions, so use a Supabase session token; `sk_` keys authenticate the Worker REST API only.

## Notes

- `GET /api/chat/messages` is newest first: reverse before displaying.
- Errors are JSON `{ error }`; a Worker crash returns a 500 with a short `requestId` you can quote to the owner.
- There is no points/stonks balance on any endpoint (removed 2026-07).
