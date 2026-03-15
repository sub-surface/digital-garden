# Phase 2: Stonks — Design Spec

## Overview

A points economy driven by chat emote reactions. Every emote reaction triggers a configurable point event recorded in an append-only ledger. Balances are derived from the ledger via a Postgres view. Admins configure per-emote point values inline in ChatSettings.

## Schema

### `stonk_ledger` table

Append-only. One row per point event.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | `gen_random_uuid()` |
| `user_id` | UUID | References `profiles` |
| `amount` | INTEGER | Positive or negative |
| `reason` | TEXT | Human-readable (e.g. "received kek reaction") |
| `source_type` | TEXT | `reaction_received`, `reaction_given` |
| `source_id` | TEXT | message_id — for audit/dedup |
| `created_at` | TIMESTAMPTZ | `now()` |

Indexes: `(user_id, created_at DESC)`, `(created_at)`.

### `stonk_balance` view

```sql
SELECT user_id, COALESCE(SUM(amount), 0) AS balance
FROM stonk_ledger GROUP BY user_id
```

Never written to directly. Queried by API endpoints.

### `stonk_config` table

| Column | Type |
|---|---|
| `key` | TEXT (PK) |
| `value` | INTEGER |

Seed values:

| Key | Default | Purpose |
|---|---|---|
| `stonks_enabled` | 1 | Kill switch — 0 disables all ledger writes and hides UI |
| `kek_received` | 5 | Points to message author when they receive a kek reaction |
| `nahh_received` | -3 | Points to message author when they receive a nahh reaction |
| `nahh_given` | -1 | Points debited from the user who gives a nahh reaction |
| `reaction_received_default` | 0 | Fallback for emotes without explicit config |

Lookup logic: for emote `X`, worker checks `{X}_received` in config. If not found, uses `reaction_received_default`. Balance floor is 0 — worker clamps before insert.

## API

### Modified: Reaction handler (`handleChatReactions`)

After inserting or deleting a reaction:

1. Check `stonks_enabled` in config — if 0, skip all ledger writes
2. Look up the message's `user_id` (the author)
3. Skip if reactor === author (no self-stonking)
4. Look up `{emote}_received` in `stonk_config` (fallback: `reaction_received_default`)
5. If value != 0, insert `stonk_ledger` row for the author (`source_type: reaction_received`)
6. For nahh: also look up `nahh_given`, insert a debit row for the reactor (`source_type: reaction_given`)
7. On reaction DELETE: insert a reversal row (negated amount, same `source_id`) — ledger is append-only

### New: `GET /api/users/:username/stonk-history`

Returns daily balance snapshots for sparkline charting.

```json
{ "days": [{ "date": "2026-03-15", "balance": 42 }] }
```

Aggregates `stonk_ledger` by day using a running sum. Limited to last 90 days.

### New: `GET /api/admin/stonk-config`

Returns all `stonk_config` rows. Admin only.

### New: `PUT /api/admin/stonk-config`

Body: `{ "key": "kek_received", "value": 10 }`. Updates a single config row. Admin only.

### Modified: `GET /api/chat/users/:username/mini`

Add `stonk_balance` field to response — query the `stonk_balance` view.

## Frontend

### Remove stonk button

Delete the triangle `stonkBtn` from MessageRow's `msgActions`. Remove `.stonkBtn` CSS and the `stonkBtn:hover` rule. The `onReact?.(msg.id, "stonk")` call is removed. All point flow comes through emote reactions.

### MiniProfilePopup

Replace the placeholder `◆ —` with the actual balance from the API response. Monospace number, same position.

### Profile pages (WikiProfilePage + public `/user/:username`)

Add a stonk section: balance number + sparkline.

### `StonkSparkline` component

`<StonkSparkline days={days} width={120} height={32} />`

Pure inline SVG. Takes `{ date, balance }[]`, draws a polyline. Accent-coloured stroke (`var(--color-accent)`). No axes, no labels — just the shape. If fewer than 2 data points, renders a flat line.

### `useStonkHistory` hook

Fetches `/api/users/:username/stonk-history`. Returns `{ days, loading }`.

### ChatSettings — admin config section

Below the existing name colour section, admin-only:

- Section header: "stonk config"
- `stonks_enabled` toggle (on/off)
- Table: emote name | point value (inline-editable input)
- Saves on blur/enter per row via `PUT /api/admin/stonk-config`
- Only visible when `role === "admin"`

## Scope boundaries

**In scope:** Ledger, config, reaction-based point events, balance display, sparkline, admin config UI, kill switch.

**Out of scope (deferred):** Profile creation points, wiki edit points, variable/dynamic point values, secondary stonks market, Easter egg reaction effects (confetti), idle game.

## Dependencies

- Phase 1 chat must be deployed (it is)
- Emote reactions must be functional (they are)
- `profiles` table exists with `role` column for admin checks (it does)
