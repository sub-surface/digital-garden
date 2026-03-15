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
| `source_id` | TEXT | Composite key: `{message_id}:{reactor_user_id}:{emote}` — uniquely identifies the reaction event for reversals |
| `created_at` | TIMESTAMPTZ | `now()` |

Indexes: `(user_id, created_at DESC)`, `(created_at)`, `(source_id, source_type)`.

### `stonk_balance` view

```sql
SELECT user_id, GREATEST(COALESCE(SUM(amount), 0), 0) AS balance
FROM stonk_ledger GROUP BY user_id
```

Balance floor enforced at view level via `GREATEST(..., 0)`. Worker also clamps before insert as a belt-and-suspenders check.

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

Lookup logic: for emote `X`, worker checks `{X}_received` in config. If not found, uses `reaction_received_default`.

## API

### Modified: Reaction handler (`handleChatReactions`)

After inserting or deleting a reaction:

1. Check `stonks_enabled` in config — if 0, skip all ledger writes
2. Look up the message's `user_id` (the author)
3. Skip if reactor === author (no self-stonking)
4. Look up `{emote}_received` in `stonk_config` (fallback: `reaction_received_default`)
5. If value != 0, insert `stonk_ledger` row for the author (`source_type: reaction_received`)
6. For nahh: also look up `nahh_given`, insert a debit row for the reactor (`source_type: reaction_given`)
7. On reaction DELETE: look up the original ledger row(s) by `source_id` and negate the actual recorded amount (not the current config value — config may have changed since the reaction was given). Insert reversal row(s) with the negated amount and same `source_id`. Ledger is append-only.

**Race conditions:** Rapid toggle (add/remove/add) could produce duplicate ledger entries. Accepted risk at current scale — the composite `source_id` makes auditing straightforward, and the view-based balance self-corrects on the next reaction event.

### New: `GET /api/chat/users/:username/stonk-history`

Returns daily balance snapshots for sparkline charting.

```json
{ "days": [{ "date": "2026-03-15", "balance": 42 }] }
```

Returns cumulative balance at end-of-each-day. Query: group by `date_trunc('day', created_at)`, sum `amount` per day, then `SUM(...) OVER (ORDER BY date)` for running total. Limited to last 90 days.

### New: `GET /api/admin/stonk-config`

Returns all `stonk_config` rows. Admin only.

### New: `PUT /api/admin/stonk-config`

Body: `{ "key": "kek_received", "value": 10 }`. Updates a single config row. Admin only.

### Modified: `GET /api/chat/users/:username/mini`

Add `stonk_balance` field to response — query the `stonk_balance` view. When `stonks_enabled` is 0, return `stonk_balance: null` so the frontend can hide the display.

## Frontend

### Remove stonk button

Delete the triangle `stonkBtn` from MessageRow's `msgActions`. Remove `.stonkBtn` CSS and the `stonkBtn:hover` rule. The `onReact?.(msg.id, "stonk")` call is removed. All point flow comes through emote reactions.

### MiniProfilePopup

Replace the placeholder `◆ —` with the actual balance from the API response. Monospace number, same position.

### Profile pages (WikiProfilePage + public `/user/:username`)

Add a stonk section below the bio: balance number (monospace) + sparkline inline to the right. Same row, left-aligned.

### `StonkSparkline` component

`<StonkSparkline days={days} width={120} height={32} />`

Pure inline SVG. Takes `{ date, balance }[]`, draws a polyline. Accent-coloured stroke (`var(--color-accent)`). No axes, no labels — just the shape. If fewer than 2 data points, renders a flat line.

### `useStonkHistory` hook

Fetches `/api/chat/users/:username/stonk-history`. Returns `{ days, loading }`.

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

## Implementation notes

- **RLS:** Enable RLS on `stonk_ledger` and `stonk_config` with no policies (all writes via CF Worker service role key). `stonk_balance` view inherits from `stonk_ledger`.
- **Config seeding:** Seed `stonk_config` default values via the migration SQL.
- **TypeScript:** Update `MiniProfile` interface to include `stonk_balance: number | null`.

## Dependencies

- Phase 1 chat must be deployed (it is)
- Emote reactions must be functional (they are)
- `profiles` table exists with `role` column for admin checks (it does)
