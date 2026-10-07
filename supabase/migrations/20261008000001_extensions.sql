-- PostGIS in the extensions schema (Supabase convention).
-- Remote: enable PostGIS + pg_cron in Dashboard → Database → Extensions before db push.
create schema if not exists extensions;

create extension if not exists postgis with schema extensions;
-- pg_cron must live in pg_catalog on hosted Supabase.
create extension if not exists pg_cron with schema pg_catalog;

-- Keep PostGIS operators/functions visible on the API search_path (config.toml extra_search_path).
grant usage on schema extensions to postgres, anon, authenticated, service_role;
