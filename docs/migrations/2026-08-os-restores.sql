-- Per-reader bridge between os.subsurfaces.net and the main garden.
-- A restore never mutates content: it only changes visibility for its owner.
create table if not exists public.os_restores (
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null check (char_length(slug) between 1 and 240),
  restored_at timestamptz not null default now(),
  primary key (user_id, slug)
);

alter table public.os_restores enable row level security;

drop policy if exists "Readers manage their own restored files" on public.os_restores;
create policy "Readers manage their own restored files"
  on public.os_restores
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists os_restores_restored_at_idx
  on public.os_restores (user_id, restored_at desc);
