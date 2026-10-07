-- Core tables, enums, game_config defaults.
-- Balance numbers mirror the plan; keep in sync with packages/game-core when it lands.

set search_path = public, extensions;

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.own_site_status as enum ('pending', 'live', 'rejected');
create type public.structure_type as enum ('wall', 'turret', 'garrison');
create type public.care_action as enum ('repair', 'load', 'boost');
create type public.review_decision as enum ('approve', 'reject');

-- ---------------------------------------------------------------------------
-- Tunable balance (key/value). Defaults from planning session.
-- ---------------------------------------------------------------------------
create table public.game_config (
  key text primary key,
  value numeric not null,
  description text
);

comment on table public.game_config is
  'Server-side balance knobs. Mirror packages/game-core balance constants.';

insert into public.game_config (key, value, description) values
  -- Reach / proposals
  ('reach_m', 40, 'Player must be within this many metres of cell/site centre'),
  ('proposal_cell_max_m', 50, 'Each proposed plot cell centre must be within this of the site'),
  -- Collect / presence
  ('collect_cooldown_minutes', 60, 'Per-player per-site collect cooldown'),
  ('collect_take_materials', 5, 'Max materials taken per collect'),
  ('collect_take_ammo', 5, 'Max ammo taken per collect'),
  ('collect_take_power', 5, 'Max power taken per collect'),
  ('presence_stale_seconds', 120, 'Heartbeats older than this are ignored / removed'),
  ('presence_bonus_materials', 0.5, 'Materials added per fresh presence per minute'),
  ('presence_bonus_ammo', 0.5, 'Ammo added per fresh presence per minute'),
  ('presence_bonus_power', 0.5, 'Power added per fresh presence per minute'),
  -- Stock capacities + base refill per hour (lazy applied on collect)
  ('stock_capacity_materials', 100, 'Default materials capacity'),
  ('stock_capacity_ammo', 100, 'Default ammo capacity'),
  ('stock_capacity_power', 100, 'Default power capacity'),
  ('refill_materials_per_hour', 10, 'Base materials refill / hour'),
  ('refill_ammo_per_hour', 10, 'Base ammo refill / hour'),
  ('refill_power_per_hour', 10, 'Base power refill / hour'),
  -- Site-type yield weights (relative; collect still takes up to collect_take_*)
  ('yield_weight_materials_stop', 3, 'Stop/station materials weight'),
  ('yield_weight_ammo_stop', 1, 'Stop/station ammo weight'),
  ('yield_weight_power_stop', 1, 'Stop/station power weight'),
  ('yield_weight_materials_intersection', 1, 'Intersection materials weight'),
  ('yield_weight_ammo_intersection', 3, 'Intersection ammo weight'),
  ('yield_weight_power_intersection', 1, 'Intersection power weight'),
  ('yield_weight_materials_landmark', 1, 'Landmark/own materials weight'),
  ('yield_weight_ammo_landmark', 1, 'Landmark/own ammo weight'),
  ('yield_weight_power_landmark', 3, 'Landmark/own power weight'),
  -- Structures
  ('care_days', 28, 'Days without care before rubble'),
  ('rubble_clear_days', 7, 'Days after rubble before cleared'),
  -- Structure costs mirror packages/game-core BALANCE (POC walk-friendly).
  ('cost_wall', 20, 'Materials to place a wall'),
  ('cost_turret', 40, 'Materials to place a turret'),
  ('cost_garrison', 60, 'Materials to place a garrison'),
  ('max_health_wall', 100, 'Wall max health'),
  ('max_health_turret', 80, 'Turret max health'),
  ('max_health_garrison', 120, 'Garrison max health'),
  ('repair_materials_per_hp', 0.5, 'Materials spent per HP repaired'),
  ('load_ammo_amount', 10, 'Ammo loaded per care load action'),
  ('load_ammo_wallet_cost', 10, 'Wallet ammo spent per load'),
  ('boost_power_cost', 20, 'Wallet power spent to boost'),
  ('boost_hours', 24, 'Boost duration hours'),
  -- Raids / retention
  ('raid_select_fraction', 0.10, 'Fraction of active structures raided each job'),
  ('raid_damage_min_pct', 0.05, 'Min damage as fraction of max_health'),
  ('raid_damage_max_pct', 0.15, 'Max damage as fraction of max_health'),
  ('debug_track_retention_days', 30, 'Debug GPS retention');

create or replace function public.game_config_num(p_key text)
returns numeric
language sql
stable
as $$
  select value from public.game_config where key = p_key;
$$;

-- ---------------------------------------------------------------------------
-- Site tables (one per source — keep ODbL / Metlink / own separated)
-- site_ref format used elsewhere: '{source}:{uuid}' e.g. osm:…
-- ---------------------------------------------------------------------------
create table public.osm_sites (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  name text not null,
  site_kind text not null check (site_kind in ('intersection', 'landmark')),
  location geography(point, 4326) not null,
  cell_r12 text not null,
  cell_r7 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index osm_sites_external_id_uidx on public.osm_sites (external_id)
  where external_id is not null;
create index osm_sites_location_gix on public.osm_sites using gist (location);
create index osm_sites_cell_r7_idx on public.osm_sites (cell_r7);
create index osm_sites_cell_r12_idx on public.osm_sites (cell_r12);

create table public.transit_sites (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  name text not null,
  site_kind text not null check (site_kind in ('stop', 'station')),
  location geography(point, 4326) not null,
  cell_r12 text not null,
  cell_r7 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index transit_sites_external_id_uidx on public.transit_sites (external_id)
  where external_id is not null;
create index transit_sites_location_gix on public.transit_sites using gist (location);
create index transit_sites_cell_r7_idx on public.transit_sites (cell_r7);
create index transit_sites_cell_r12_idx on public.transit_sites (cell_r12);

create table public.own_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  photo_path text,
  status public.own_site_status not null default 'pending',
  location geography(point, 4326) not null,
  cell_r12 text not null,
  cell_r7 text not null,
  proposer_id uuid not null references auth.users (id) on delete cascade,
  reviewer_id uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index own_sites_location_gix on public.own_sites using gist (location);
create index own_sites_status_idx on public.own_sites (status);
create index own_sites_cell_r7_idx on public.own_sites (cell_r7);
create index own_sites_proposer_idx on public.own_sites (proposer_id);

-- ---------------------------------------------------------------------------
-- Plots, stocks, structures
-- ---------------------------------------------------------------------------
create table public.plot_cells (
  cell_r12 text not null,
  site_ref text not null,
  cell_r7 text not null,
  centre geography(point, 4326) not null,
  primary key (cell_r12, site_ref)
);

create index plot_cells_site_ref_idx on public.plot_cells (site_ref);
create index plot_cells_cell_r7_idx on public.plot_cells (cell_r7);
create index plot_cells_centre_gix on public.plot_cells using gist (centre);

comment on column public.plot_cells.site_ref is
  'Composite ref: osm:<uuid> | transit:<uuid> | own:<uuid>. Cells computed in TS (no H3 extension).';

create table public.site_stocks (
  site_ref text primary key,
  materials numeric not null default 0 check (materials >= 0),
  ammo numeric not null default 0 check (ammo >= 0),
  power numeric not null default 0 check (power >= 0),
  capacity_materials numeric not null default 100,
  capacity_ammo numeric not null default 100,
  capacity_power numeric not null default 100,
  refreshed_at timestamptz not null default now()
);

create table public.structures (
  id uuid primary key default gen_random_uuid(),
  cell_r12 text not null unique,
  cell_r7 text not null,
  type public.structure_type not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  health numeric not null check (health >= 0),
  max_health numeric not null check (max_health > 0),
  ammo numeric not null default 0 check (ammo >= 0),
  boosted_until timestamptz,
  last_cared_at timestamptz not null default now(),
  zeroed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index structures_cell_r7_idx on public.structures (cell_r7);
create index structures_owner_idx on public.structures (owner_id);

comment on table public.structures is
  'State (active/rubble/cleared) is computed: rubble at least(zeroed_at, last_cared_at+28d); cleared 7d later.';

-- ---------------------------------------------------------------------------
-- Players
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null default '',
  is_team boolean not null default false,
  debug_logging boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  materials numeric not null default 0 check (materials >= 0),
  ammo numeric not null default 0 check (ammo >= 0),
  power numeric not null default 0 check (power >= 0),
  updated_at timestamptz not null default now()
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  site_ref text not null,
  materials numeric not null default 0,
  ammo numeric not null default 0,
  power numeric not null default 0,
  collected_at timestamptz not null default now()
);

create index collections_user_site_time_idx
  on public.collections (user_id, site_ref, collected_at desc);

create table public.presence (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cell_r12 text not null,
  cell_r7 text not null,
  location geography(point, 4326),
  updated_at timestamptz not null default now()
);

create index presence_cell_r7_idx on public.presence (cell_r7);
create index presence_updated_at_idx on public.presence (updated_at);

create table public.debug_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  location geography(point, 4326) not null,
  accuracy_m numeric,
  speed_mps numeric,
  recorded_at timestamptz not null default now()
);

create index debug_tracks_user_time_idx on public.debug_tracks (user_id, recorded_at desc);
create index debug_tracks_recorded_at_idx on public.debug_tracks (recorded_at);

-- ---------------------------------------------------------------------------
-- Auth bootstrap: profile + wallet on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nickname', split_part(new.email, '@', 1), 'player')
  );
  insert into public.wallets (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Realtime: structures filtered client-side by cell_r7
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.structures;
exception
  when duplicate_object then null;
end;
$$;
