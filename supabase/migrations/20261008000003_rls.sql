-- Row Level Security: public read of game state; writes via security definer RPCs.

alter table public.game_config enable row level security;
alter table public.osm_sites enable row level security;
alter table public.transit_sites enable row level security;
alter table public.own_sites enable row level security;
alter table public.plot_cells enable row level security;
alter table public.site_stocks enable row level security;
alter table public.structures enable row level security;
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.collections enable row level security;
alter table public.presence enable row level security;
alter table public.debug_tracks enable row level security;

-- game_config: readable so clients can mirror server knobs
create policy game_config_select on public.game_config
  for select to anon, authenticated
  using (true);

-- OSM / transit sites: world-readable
create policy osm_sites_select on public.osm_sites
  for select to anon, authenticated
  using (true);

create policy transit_sites_select on public.transit_sites
  for select to anon, authenticated
  using (true);

-- Own sites: live for everyone; pending/rejected for proposer or team
create policy own_sites_select on public.own_sites
  for select to authenticated
  using (
    status = 'live'
    or proposer_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_team
    )
  );

create policy own_sites_select_anon_live on public.own_sites
  for select to anon
  using (status = 'live');

-- Plots / stocks / structures / presence: public read
create policy plot_cells_select on public.plot_cells
  for select to anon, authenticated
  using (true);

create policy site_stocks_select on public.site_stocks
  for select to anon, authenticated
  using (true);

create policy structures_select on public.structures
  for select to anon, authenticated
  using (true);

create policy presence_select on public.presence
  for select to authenticated
  using (true);

-- Profiles: read all nicknames for nearby UI; update own non-team fields only
create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and is_team = (select p.is_team from public.profiles p where p.id = auth.uid())
  );

-- Wallets / collections: own rows only
create policy wallets_select_own on public.wallets
  for select to authenticated
  using (user_id = auth.uid());

create policy collections_select_own on public.collections
  for select to authenticated
  using (user_id = auth.uid());

-- Debug tracks: no direct client read/write (RPC only)
-- (RLS enabled with zero policies for authenticated/anon)

-- No INSERT/UPDATE/DELETE policies on game tables for anon/authenticated:
-- all mutations go through security definer RPCs.
