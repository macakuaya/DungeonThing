create table if not exists public.shared_maps (
  id text primary key,
  payload jsonb not null,
  preview_path text not null,
  created_at timestamptz not null default now()
);

alter table public.shared_maps enable row level security;

drop policy if exists "public can read shares" on public.shared_maps;
create policy "public can read shares"
on public.shared_maps
for select
to anon, authenticated
using (true);

drop policy if exists "public can create shares" on public.shared_maps;
create policy "public can create shares"
on public.shared_maps
for insert
to anon, authenticated
with check (true);

insert into storage.buckets (id, name, public)
values ('share-previews', 'share-previews', true)
on conflict (id) do update set public = true;

drop policy if exists "public read preview images" on storage.objects;
create policy "public read preview images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'share-previews');

drop policy if exists "public upload preview images" on storage.objects;
create policy "public upload preview images"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'share-previews');
