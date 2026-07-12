# Chat API — building a third-party client

The chat backend (`chat.subsurfaces.net`) exposes a REST API that works independently of the web
UI. You can build your own frontend, bot, or CLI client against it.

## Authentication

All write endpoints (and most reads) require authentication. Two methods are accepted:

**Supabase JWT** — include the session access token:
```
Authorization: Bearer <supabase_access_token>
```

**API key** — generate a key at `chat.subsurfaces.net` (Settings → API Keys), then use the
`sk_`-prefixed key:
```
Authorization: Bearer sk_<your_key>
```

API keys are SHA-256 hashed at rest and support soft revocation. They never expire unless revoked.

## Key endpoints

```
GET    /api/chat/rooms                        list all rooms
GET    /api/chat/messages?room_id=&limit=      fetch messages (newest first)
POST   /api/chat/messages                      send a message
GET    /api/chat/messages/:id                   fetch a single message
DELETE /api/chat/messages/:id                   delete own message
POST   /api/chat/reactions                      add/remove a reaction
GET    /api/chat/search?q=&room_id=             full-text search
GET    /api/chat/pins?room_id=                  pinned messages
GET    /api/chat/users/:username/mini           public profile (username, avatar_url, role, bio,
                                                 created_at, name_color)
GET    /api/chat/gif-search?q=                  GIF search (proxies Klipy; needs server-side key)
```

**Send a message:**
```bash
curl -X POST https://chat.subsurfaces.net/api/chat/messages \
  -H "Authorization: Bearer sk_your_key" \
  -H "Content-Type: application/json" \
  -d '{"room_id": "general", "body": "hello from the API"}'
```

**Reply to a message:**
```json
{ "room_id": "general", "body": "reply text", "reply_to_id": "<message_uuid>" }
```

**React to a message:**
```bash
curl -X POST https://chat.subsurfaces.net/api/chat/reactions \
  -H "Authorization: Bearer sk_your_key" \
  -H "Content-Type: application/json" \
  -d '{"message_id": "<uuid>", "emote": "kek"}'
```
Sending the same reaction twice toggles it off.

## Manage API keys

```
POST   /api/keys          generate a new key (returns plaintext key once)
GET    /api/keys          list your keys (hashes only, no plaintext)
DELETE /api/keys/:id      revoke a key
```

(`/api/admin/api-keys` is accepted as an alias of `/api/keys` for historical reasons — despite the
name, it isn't admin-gated. Use `/api/keys`.)

## Chatter identity claiming

`POST /api/chat/claim` links your account to an existing wiki chatter page
(`GET /api/users/:username/claim`, `GET /api/claims/by-slug/:slug` read back a claim). This is a
wiki feature, not chat messaging — see [`docs/wiki.md`](docs/wiki.md) for detail.

## Moderation (admin accounts only)

```
POST   /api/chat/ban        { user_id, type: "temporary"|"permanent", duration_hours?, reason? }
POST   /api/chat/unban      { user_id }
```
A permanent ban hard-deletes the user's messages/reactions and anonymises their profile.

## Realtime

For realtime messages, connect to [Supabase Realtime](https://supabase.com/docs/guides/realtime)
and subscribe to the `messages` table filtered by `room_id`. The same Supabase project powers the
web UI — you can use the public anon key for read-only subscriptions.

## Notes

- Messages are returned **newest first** — reverse before displaying
- Emote names and extensions are listed at `/emotes/index.json`
- Room IDs are slugs (e.g. `general`, `philosophy`) — fetch from `/api/chat/rooms`
- There is no stonk/points balance on any endpoint — that system was removed in 2026-07
