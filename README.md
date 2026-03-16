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

## Building a third-party chat client

The chat backend (`chat.subsurfaces.net`) exposes a REST API that works independently of the web UI. You can build your own frontend, bot, or CLI client against it.

### Authentication

All write endpoints require authentication. Two methods are accepted:

**Supabase JWT** — include the session access token:
```
Authorization: Bearer <supabase_access_token>
```

**API key** — generate a key at `chat.subsurfaces.net` (Settings → API Keys), then use the `sk_`-prefixed key:
```
Authorization: Bearer sk_<your_key>
```

API keys are SHA-256 hashed at rest and support soft revocation. They never expire unless revoked.

### Key endpoints

```
GET  /api/chat/rooms                       list all rooms
GET  /api/chat/messages?room_id=&limit=    fetch messages (newest first)
POST /api/chat/messages                    send a message
DELETE /api/chat/messages/:id              delete own message
POST /api/chat/reactions                   add/remove a reaction
GET  /api/chat/search?q=&room_id=          full-text search
GET  /api/chat/pins?room_id=               pinned messages
GET  /api/chat/users/:username/mini        profile + stonk balance
GET  /api/chat/users/:username/stonk-history  90-day balance history
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

### Manage API keys

```
POST   /api/admin/api-keys          generate a new key (returns plaintext key once)
GET    /api/admin/api-keys          list your keys (hashes only, no plaintext)
DELETE /api/admin/api-keys/:id      revoke a key
```

### Realtime

For realtime messages, connect to [Supabase Realtime](https://supabase.com/docs/guides/realtime) and subscribe to the `messages` table filtered by `room_id`. The same Supabase project powers the web UI — you can use the public anon key for read-only subscriptions.

### Notes

- Messages are returned **newest first** — reverse before displaying
- Emote names and extensions are listed at `/emotes/index.json`
- Room IDs are slugs (e.g. `general`, `philosophy`) — fetch from `/api/chat/rooms`

## License

Content is personal. Code has no formal license — if you find something useful, take it.
