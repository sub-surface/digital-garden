# Chat Overhaul Spec

## Summary

Restructure chat UI: right-align chat area, collapse sidebar into a compact header bar, add message pinning (admin), autocomplete for emotes/mentions/commands, emote preview strip, fix settings z-index, and apply name_color properly.

## Layout

- `.chatMain` right-aligned via `margin-left: auto` (sidebar stays left)
- Sidebar replaced by header bar: `[# channel ▾] ... [search] [pin] [gear]`
- Channel selector: dropdown button, same pattern as SideChat room selector
- Search: button that expands inline input field, collapses on blur/escape
- Pin icon: toggles pinned message ticker visibility

## Pinned Messages

- **DB:** Add `pinned_at` (timestamptz, nullable) and `pinned_by` (uuid, nullable) columns to `messages` table
- **API:** `POST /api/chat/messages/:id/pin` (admin), `DELETE /api/chat/messages/:id/pin` (admin)
- **Ticker:** Thin bar below header, shows latest pin, cycles if multiple. Dismissible with `x`. Only renders when pins exist for current room.
- **Inline:** Pinned messages show subtle pin indicator in message list
- **Hover action:** Admins see "pin"/"unpin" in message action buttons

## Autocomplete

Unified popup triggered by prefix characters in textarea:

| Trigger | Source | Inserts |
|---------|--------|---------|
| `:` | Emote index (`/emotes/index.json`) | `:name:` |
| `@` | Room participants (cache from message authors) | `@username` |
| `/` | Static command list | Full command |

- Popup above cursor, arrow keys navigate, Tab/Enter selects, Escape dismisses
- Fuzzy match filtering as user types after trigger character
- **Initial commands:** `/gif` (opens picker), `/shrug` (inserts text), `/me` (action format)
- **Future (noted only):** `/whisper`, `/pepo`, `/remind`

## Emote Preview Strip

- Thin strip between message list and input, only visible when input contains `:emote:` tokens
- Renders matched emotes as images inline

## Fixes

- **Settings z-index:** Audit and ensure ChatSettings panel renders above all chat layers
- **Name color:** Apply `name_color` as default username color (not just hover). Hover brightens slightly.

## Not in scope

- Whisper system, /pepo, /remind (future)
- Message editing
- File uploads
- Threads
