-- Chat identity denormalization + stonks removal
-- Run in the Supabase SQL Editor BEFORE (or shortly after) deploying the
-- worker refactor of 2026-07. The worker degrades gracefully either way:
--   - message POST retries without the denormalized columns if they're missing
--   - message GET falls back to the profiles embed for rows with null username
--
-- Why: messages store only user_id, so every read joined profiles and every
-- realtime broadcast forced each connected client to re-fetch the message list
-- to learn the author's name/colour (a thundering herd). Chat is append-heavy
-- and identities change rarely — denormalize at write time, propagate renames.

-- 1. Denormalized author identity on messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS username   text,
  ADD COLUMN IF NOT EXISTS name_color text,
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- 2. Backfill existing rows from profiles
UPDATE public.messages m
SET username   = p.username,
    name_color = p.name_color,
    avatar_url = p.avatar_url
FROM public.profiles p
WHERE m.user_id = p.id
  AND m.username IS NULL;

-- 3. Stonks feature removed (2026-07) — drop its tables/views.
--    stonk_balance may be a view over stonk_ledger; drop it first either way.
DROP VIEW IF EXISTS public.stonk_balance;
DROP TABLE IF EXISTS public.stonk_balance;
DROP TABLE IF EXISTS public.stonk_ledger;
DROP TABLE IF EXISTS public.stonk_config;

-- 4. (Recommended) index for the hot room-history query if not already present
CREATE INDEX IF NOT EXISTS messages_room_created_idx
  ON public.messages (room_id, created_at DESC)
  WHERE deleted_at IS NULL;
