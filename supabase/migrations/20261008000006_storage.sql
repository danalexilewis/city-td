-- site-photos bucket + policies.
-- Bucket is also declared in config.toml for local `supabase start`.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-photos',
  'site-photos',
  true,
  10485760, -- 10 MiB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Public read (live proposal photos on the map / review UI)
drop policy if exists "site_photos_public_read" on storage.objects;
create policy "site_photos_public_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'site-photos');

-- Authenticated users upload only under their own user-id prefix: {uid}/...
drop policy if exists "site_photos_insert_own" on storage.objects;
create policy "site_photos_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'site-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "site_photos_update_own" on storage.objects;
create policy "site_photos_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'site-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'site-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "site_photos_delete_own" on storage.objects;
create policy "site_photos_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'site-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
