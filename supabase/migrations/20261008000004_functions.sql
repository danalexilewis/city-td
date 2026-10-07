-- Helpers + security definer RPCs.
-- Structure state: rubble at least(zeroed_at, last_cared_at + care_days); cleared care_days+rubble_clear_days.

create or replace function public.make_site_ref(p_source text, p_id uuid)
returns text
language sql
immutable
as $$
  select p_source || ':' || p_id::text;
$$;

create or replace function public.site_ref_source(p_site_ref text)
returns text
language sql
immutable
as $$
  select split_part(p_site_ref, ':', 1);
$$;

create or replace function public.site_ref_id(p_site_ref text)
returns uuid
language sql
immutable
as $$
  select nullif(split_part(p_site_ref, ':', 2), '')::uuid;
$$;

-- Instant rubble starts (null if still active by care/zero rules).
create or replace function public.structure_rubble_at(
  p_last_cared_at timestamptz,
  p_zeroed_at timestamptz
)
returns timestamptz
language sql
stable
as $$
  select least(
    coalesce(p_zeroed_at, 'infinity'::timestamptz),
    p_last_cared_at + make_interval(days => public.game_config_num('care_days')::int)
  );
$$;

-- 'active' | 'rubble' | 'cleared'
create or replace function public.structure_computed_state(
  p_last_cared_at timestamptz,
  p_zeroed_at timestamptz,
  p_now timestamptz default now()
)
returns text
language sql
stable
as $$
  select case
    when p_now < public.structure_rubble_at(p_last_cared_at, p_zeroed_at) then 'active'
    when p_now < public.structure_rubble_at(p_last_cared_at, p_zeroed_at)
      + make_interval(days => public.game_config_num('rubble_clear_days')::int)
      then 'rubble'
    else 'cleared'
  end;
$$;

create or replace function public.require_auth_uid()
returns uuid
language plpgsql
stable
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  return uid;
end;
$$;

create or replace function public.require_team(p_uid uuid)
returns void
language plpgsql
stable
as $$
begin
  if not exists (
    select 1 from public.profiles p where p.id = p_uid and p.is_team
  ) then
    raise exception 'team only';
  end if;
end;
$$;

create or replace function public.structure_place_cost(p_type public.structure_type)
returns numeric
language sql
stable
as $$
  select case p_type
    when 'wall' then public.game_config_num('cost_wall')
    when 'turret' then public.game_config_num('cost_turret')
    when 'garrison' then public.game_config_num('cost_garrison')
  end;
$$;

create or replace function public.structure_max_health(p_type public.structure_type)
returns numeric
language sql
stable
as $$
  select case p_type
    when 'wall' then public.game_config_num('max_health_wall')
    when 'turret' then public.game_config_num('max_health_turret')
    when 'garrison' then public.game_config_num('max_health_garrison')
  end;
$$;

create or replace function public.player_within_m(
  p_lng double precision,
  p_lat double precision,
  p_target extensions.geography,
  p_metres numeric
)
returns boolean
language sql
stable
as $$
  select extensions.st_dwithin(
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
    p_target,
    p_metres
  );
$$;

create or replace function public.site_location(p_site_ref text)
returns extensions.geography
language plpgsql
stable
as $$
declare
  src text := public.site_ref_source(p_site_ref);
  sid uuid := public.site_ref_id(p_site_ref);
  loc extensions.geography;
begin
  if src = 'osm' then
    select location into loc from public.osm_sites where id = sid;
  elsif src = 'transit' then
    select location into loc from public.transit_sites where id = sid;
  elsif src = 'own' then
    select location into loc from public.own_sites where id = sid and status = 'live';
  else
    raise exception 'unknown site_ref %', p_site_ref;
  end if;
  if loc is null then
    raise exception 'site not found or not live: %', p_site_ref;
  end if;
  return loc;
end;
$$;

create or replace function public.site_kind_for_ref(p_site_ref text)
returns text
language plpgsql
stable
as $$
declare
  src text := public.site_ref_source(p_site_ref);
  sid uuid := public.site_ref_id(p_site_ref);
  kind text;
begin
  if src = 'osm' then
    select site_kind into kind from public.osm_sites where id = sid;
  elsif src = 'transit' then
    select site_kind into kind from public.transit_sites where id = sid;
  elsif src = 'own' then
    kind := 'own';
  end if;
  return kind;
end;
$$;

-- Lazy base refill toward capacity (presence bonus applied by cron).
create or replace function public.apply_lazy_refill(p_site_ref text)
returns public.site_stocks
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  stock public.site_stocks;
  hours numeric;
  mat_rate numeric := public.game_config_num('refill_materials_per_hour');
  ammo_rate numeric := public.game_config_num('refill_ammo_per_hour');
  power_rate numeric := public.game_config_num('refill_power_per_hour');
begin
  select * into stock from public.site_stocks where site_ref = p_site_ref for update;
  if not found then
    raise exception 'no stock for %', p_site_ref;
  end if;

  hours := extract(epoch from (now() - stock.refreshed_at)) / 3600.0;
  if hours > 0 then
    stock.materials := least(stock.capacity_materials, stock.materials + mat_rate * hours);
    stock.ammo := least(stock.capacity_ammo, stock.ammo + ammo_rate * hours);
    stock.power := least(stock.capacity_power, stock.power + power_rate * hours);
    stock.refreshed_at := now();
    update public.site_stocks s
    set materials = stock.materials,
        ammo = stock.ammo,
        power = stock.power,
        refreshed_at = stock.refreshed_at
    where s.site_ref = p_site_ref;
  end if;

  return stock;
end;
$$;

-- ---------------------------------------------------------------------------
-- sites_in_bbox
-- ---------------------------------------------------------------------------
create or replace function public.sites_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision
)
returns table (
  site_ref text,
  source text,
  id uuid,
  name text,
  site_kind text,
  lng double precision,
  lat double precision,
  cell_r12 text,
  cell_r7 text,
  status text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with bbox as (
    select extensions.st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::extensions.geography as g
  )
  select
    public.make_site_ref('osm', o.id),
    'osm',
    o.id,
    o.name,
    o.site_kind,
    extensions.st_x(o.location::extensions.geometry),
    extensions.st_y(o.location::extensions.geometry),
    o.cell_r12,
    o.cell_r7,
    'live'::text
  from public.osm_sites o, bbox
  where extensions.st_intersects(o.location, bbox.g)

  union all

  select
    public.make_site_ref('transit', t.id),
    'transit',
    t.id,
    t.name,
    t.site_kind,
    extensions.st_x(t.location::extensions.geometry),
    extensions.st_y(t.location::extensions.geometry),
    t.cell_r12,
    t.cell_r7,
    'live'::text
  from public.transit_sites t, bbox
  where extensions.st_intersects(t.location, bbox.g)

  union all

  select
    public.make_site_ref('own', w.id),
    'own',
    w.id,
    w.name,
    'own'::text,
    extensions.st_x(w.location::extensions.geometry),
    extensions.st_y(w.location::extensions.geometry),
    w.cell_r12,
    w.cell_r7,
    w.status::text
  from public.own_sites w, bbox
  where extensions.st_intersects(w.location, bbox.g)
    and (
      w.status = 'live'
      or w.proposer_id = auth.uid()
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_team)
    );
$$;

grant execute on function public.sites_in_bbox(double precision, double precision, double precision, double precision)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- place_structure
-- ---------------------------------------------------------------------------
create or replace function public.place_structure(
  p_cell_r12 text,
  p_type public.structure_type,
  p_lng double precision,
  p_lat double precision
)
returns public.structures
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.require_auth_uid();
  plot public.plot_cells;
  cost numeric;
  max_hp numeric;
  wallet public.wallets;
  existing public.structures;
  result public.structures;
begin
  select * into plot from public.plot_cells where cell_r12 = p_cell_r12 limit 1;
  if not found then
    raise exception 'cell is not a build plot';
  end if;

  if not public.player_within_m(p_lng, p_lat, plot.centre, public.game_config_num('reach_m')) then
    raise exception 'out of reach';
  end if;

  select * into existing from public.structures where cell_r12 = p_cell_r12 for update;
  if found then
    if public.structure_computed_state(existing.last_cared_at, existing.zeroed_at) = 'cleared' then
      delete from public.structures where id = existing.id;
    else
      raise exception 'cell occupied';
    end if;
  end if;

  cost := public.structure_place_cost(p_type);
  max_hp := public.structure_max_health(p_type);

  select * into wallet from public.wallets where user_id = uid for update;
  if wallet.materials < cost then
    raise exception 'not enough materials';
  end if;

  update public.wallets
  set materials = materials - cost, updated_at = now()
  where user_id = uid;

  insert into public.structures (
    cell_r12, cell_r7, type, owner_id, health, max_health, ammo,
    last_cared_at, zeroed_at
  ) values (
    p_cell_r12, plot.cell_r7, p_type, uid, max_hp, max_hp, 0,
    now(), null
  )
  returning * into result;

  return result;
end;
$$;

grant execute on function public.place_structure(text, public.structure_type, double precision, double precision)
  to authenticated;

-- ---------------------------------------------------------------------------
-- care_structure: repair | load | boost
-- ---------------------------------------------------------------------------
create or replace function public.care_structure(
  p_structure_id uuid,
  p_action public.care_action,
  p_lng double precision,
  p_lat double precision,
  p_repair_hp numeric default null
)
returns public.structures
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.require_auth_uid();
  s public.structures;
  centre extensions.geography;
  wallet public.wallets;
  repair_hp numeric;
  repair_cost numeric;
  state text;
begin
  select * into s from public.structures where id = p_structure_id for update;
  if not found then
    raise exception 'structure not found';
  end if;

  state := public.structure_computed_state(s.last_cared_at, s.zeroed_at);
  if state <> 'active' then
    raise exception 'structure is %', state;
  end if;

  select pc.centre into centre
  from public.plot_cells pc
  where pc.cell_r12 = s.cell_r12
  limit 1;

  if centre is null then
    raise exception 'plot centre missing';
  end if;

  if not public.player_within_m(p_lng, p_lat, centre, public.game_config_num('reach_m')) then
    raise exception 'out of reach';
  end if;

  select * into wallet from public.wallets where user_id = uid for update;

  if p_action = 'repair' then
    repair_hp := coalesce(p_repair_hp, s.max_health - s.health);
    if repair_hp <= 0 then
      raise exception 'nothing to repair';
    end if;
    repair_hp := least(repair_hp, s.max_health - s.health);
    repair_cost := repair_hp * public.game_config_num('repair_materials_per_hp');
    if wallet.materials < repair_cost then
      raise exception 'not enough materials';
    end if;
    update public.wallets
    set materials = materials - repair_cost, updated_at = now()
    where user_id = uid;
    s.health := s.health + repair_hp;
    if s.health > 0 then
      s.zeroed_at := null;
    end if;

  elsif p_action = 'load' then
    if wallet.ammo < public.game_config_num('load_ammo_wallet_cost') then
      raise exception 'not enough ammo';
    end if;
    update public.wallets
    set ammo = ammo - public.game_config_num('load_ammo_wallet_cost'), updated_at = now()
    where user_id = uid;
    s.ammo := s.ammo + public.game_config_num('load_ammo_amount');

  elsif p_action = 'boost' then
    if wallet.power < public.game_config_num('boost_power_cost') then
      raise exception 'not enough power';
    end if;
    update public.wallets
    set power = power - public.game_config_num('boost_power_cost'), updated_at = now()
    where user_id = uid;
    s.boosted_until := now() + make_interval(hours => public.game_config_num('boost_hours')::int);
  end if;

  update public.structures
  set health = s.health,
      ammo = s.ammo,
      boosted_until = s.boosted_until,
      zeroed_at = s.zeroed_at,
      last_cared_at = now(),
      updated_at = now()
  where id = s.id
  returning * into s;

  return s;
end;
$$;

grant execute on function public.care_structure(uuid, public.care_action, double precision, double precision, numeric)
  to authenticated;

-- ---------------------------------------------------------------------------
-- rebuild_rubble: half cost, caller becomes owner
-- ---------------------------------------------------------------------------
create or replace function public.rebuild_rubble(
  p_structure_id uuid,
  p_lng double precision,
  p_lat double precision
)
returns public.structures
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.require_auth_uid();
  s public.structures;
  centre extensions.geography;
  cost numeric;
  wallet public.wallets;
  state text;
begin
  select * into s from public.structures where id = p_structure_id for update;
  if not found then
    raise exception 'structure not found';
  end if;

  state := public.structure_computed_state(s.last_cared_at, s.zeroed_at);
  if state <> 'rubble' then
    raise exception 'structure is %, not rubble', state;
  end if;

  select pc.centre into centre
  from public.plot_cells pc
  where pc.cell_r12 = s.cell_r12
  limit 1;

  if not public.player_within_m(p_lng, p_lat, centre, public.game_config_num('reach_m')) then
    raise exception 'out of reach';
  end if;

  cost := public.structure_place_cost(s.type) / 2.0;
  select * into wallet from public.wallets where user_id = uid for update;
  if wallet.materials < cost then
    raise exception 'not enough materials';
  end if;

  update public.wallets
  set materials = materials - cost, updated_at = now()
  where user_id = uid;

  update public.structures
  set owner_id = uid,
      health = s.max_health,
      ammo = 0,
      boosted_until = null,
      zeroed_at = null,
      last_cared_at = now(),
      updated_at = now()
  where id = s.id
  returning * into s;

  return s;
end;
$$;

grant execute on function public.rebuild_rubble(uuid, double precision, double precision)
  to authenticated;

-- ---------------------------------------------------------------------------
-- remove_structure: owner only
-- ---------------------------------------------------------------------------
create or replace function public.remove_structure(
  p_structure_id uuid,
  p_lng double precision,
  p_lat double precision
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.require_auth_uid();
  s public.structures;
  centre extensions.geography;
begin
  select * into s from public.structures where id = p_structure_id for update;
  if not found then
    raise exception 'structure not found';
  end if;

  if s.owner_id <> uid then
    raise exception 'owner only';
  end if;

  select pc.centre into centre
  from public.plot_cells pc
  where pc.cell_r12 = s.cell_r12
  limit 1;

  if centre is not null
     and not public.player_within_m(p_lng, p_lat, centre, public.game_config_num('reach_m')) then
    raise exception 'out of reach';
  end if;

  delete from public.structures where id = s.id;
end;
$$;

grant execute on function public.remove_structure(uuid, double precision, double precision)
  to authenticated;

-- ---------------------------------------------------------------------------
-- collect
-- ---------------------------------------------------------------------------
create or replace function public.collect(
  p_site_ref text,
  p_lng double precision,
  p_lat double precision
)
returns table (
  materials numeric,
  ammo numeric,
  power numeric,
  wallet_materials numeric,
  wallet_ammo numeric,
  wallet_power numeric
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.require_auth_uid();
  loc extensions.geography;
  stock public.site_stocks;
  cooldown interval;
  last_at timestamptz;
  take_m numeric;
  take_a numeric;
  take_p numeric;
  kind text;
  wm numeric;
  wa numeric;
  wp numeric;
begin
  loc := public.site_location(p_site_ref);

  if not public.player_within_m(p_lng, p_lat, loc, public.game_config_num('reach_m')) then
    raise exception 'out of reach';
  end if;

  cooldown := make_interval(mins => public.game_config_num('collect_cooldown_minutes')::int);
  select c.collected_at into last_at
  from public.collections c
  where c.user_id = uid and c.site_ref = p_site_ref
  order by c.collected_at desc
  limit 1;

  if last_at is not null and last_at > now() - cooldown then
    raise exception 'collect cooldown';
  end if;

  stock := public.apply_lazy_refill(p_site_ref);

  take_m := least(stock.materials, public.game_config_num('collect_take_materials'));
  take_a := least(stock.ammo, public.game_config_num('collect_take_ammo'));
  take_p := least(stock.power, public.game_config_num('collect_take_power'));

  -- Soft yield bias by site kind (still capped by stock + collect_take_*)
  kind := public.site_kind_for_ref(p_site_ref);
  if kind in ('stop', 'station') then
    take_a := least(take_a, ceil(take_m / 2.0));
    take_p := least(take_p, ceil(take_m / 2.0));
  elsif kind = 'intersection' then
    take_m := least(take_m, ceil(take_a / 2.0));
    take_p := least(take_p, ceil(take_a / 2.0));
  else
    -- landmark / own: favour power
    take_m := least(take_m, ceil(take_p / 2.0));
    take_a := least(take_a, ceil(take_p / 2.0));
  end if;

  if take_m <= 0 and take_a <= 0 and take_p <= 0 then
    raise exception 'site stock empty';
  end if;

  update public.site_stocks
  set materials = materials - take_m,
      ammo = ammo - take_a,
      power = power - take_p,
      refreshed_at = now()
  where site_ref = p_site_ref;

  update public.wallets
  set materials = materials + take_m,
      ammo = ammo + take_a,
      power = power + take_p,
      updated_at = now()
  where user_id = uid
  returning wallets.materials, wallets.ammo, wallets.power
  into wm, wa, wp;

  insert into public.collections (user_id, site_ref, materials, ammo, power)
  values (uid, p_site_ref, take_m, take_a, take_p);

  materials := take_m;
  ammo := take_a;
  power := take_p;
  wallet_materials := wm;
  wallet_ammo := wa;
  wallet_power := wp;
  return next;
end;
$$;

grant execute on function public.collect(text, double precision, double precision)
  to authenticated;

-- ---------------------------------------------------------------------------
-- heartbeat
-- ---------------------------------------------------------------------------
create or replace function public.heartbeat(
  p_cell_r12 text,
  p_cell_r7 text,
  p_lng double precision default null,
  p_lat double precision default null
)
returns public.presence
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.require_auth_uid();
  loc extensions.geography;
  result public.presence;
begin
  if p_lng is not null and p_lat is not null then
    loc := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  end if;

  insert into public.presence (user_id, cell_r12, cell_r7, location, updated_at)
  values (uid, p_cell_r12, p_cell_r7, loc, now())
  on conflict (user_id) do update
  set cell_r12 = excluded.cell_r12,
      cell_r7 = excluded.cell_r7,
      location = excluded.location,
      updated_at = now()
  returning * into result;

  return result;
end;
$$;

grant execute on function public.heartbeat(text, text, double precision, double precision)
  to authenticated;

-- ---------------------------------------------------------------------------
-- propose_site: client supplies plot cells; team auto-live
-- ---------------------------------------------------------------------------
create or replace function public.propose_site(
  p_name text,
  p_description text,
  p_photo_path text,
  p_lng double precision,
  p_lat double precision,
  p_cell_r12 text,
  p_cell_r7 text,
  p_plot_cells jsonb
)
returns public.own_sites
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.require_auth_uid();
  is_team boolean;
  site public.own_sites;
  site_loc extensions.geography;
  cell jsonb;
  cell_centre extensions.geography;
  max_m numeric := public.game_config_num('proposal_cell_max_m');
  ref text;
  status public.own_site_status;
begin
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'name required';
  end if;

  if p_plot_cells is null or jsonb_typeof(p_plot_cells) <> 'array' then
    raise exception 'plot_cells must be a JSON array';
  end if;

  if jsonb_array_length(p_plot_cells) < 1 or jsonb_array_length(p_plot_cells) > 19 then
    raise exception 'expected 1–19 plot cells (2 rings = 19)';
  end if;

  select p.is_team into is_team from public.profiles p where p.id = uid;
  status := case when coalesce(is_team, false) then 'live'::public.own_site_status
                 else 'pending'::public.own_site_status end;

  site_loc := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;

  insert into public.own_sites (
    name, description, photo_path, status, location, cell_r12, cell_r7, proposer_id,
    reviewer_id, reviewed_at
  ) values (
    trim(p_name), p_description, p_photo_path, status, site_loc, p_cell_r12, p_cell_r7, uid,
    case when status = 'live' then uid else null end,
    case when status = 'live' then now() else null end
  )
  returning * into site;

  ref := public.make_site_ref('own', site.id);

  for cell in select * from jsonb_array_elements(p_plot_cells)
  loop
    cell_centre := extensions.st_setsrid(
      extensions.st_makepoint(
        (cell ->> 'lng')::double precision,
        (cell ->> 'lat')::double precision
      ),
      4326
    )::extensions.geography;

    if not extensions.st_dwithin(cell_centre, site_loc, max_m) then
      raise exception 'plot cell centre more than % m from site', max_m;
    end if;

    insert into public.plot_cells (cell_r12, site_ref, cell_r7, centre)
    values (
      cell ->> 'cell_r12',
      ref,
      coalesce(cell ->> 'cell_r7', p_cell_r7),
      cell_centre
    );
  end loop;

  if status = 'live' then
    insert into public.site_stocks (
      site_ref, materials, ammo, power,
      capacity_materials, capacity_ammo, capacity_power, refreshed_at
    ) values (
      ref,
      public.game_config_num('stock_capacity_materials'),
      public.game_config_num('stock_capacity_ammo'),
      public.game_config_num('stock_capacity_power'),
      public.game_config_num('stock_capacity_materials'),
      public.game_config_num('stock_capacity_ammo'),
      public.game_config_num('stock_capacity_power'),
      now()
    );
  end if;

  return site;
end;
$$;

grant execute on function public.propose_site(text, text, text, double precision, double precision, text, text, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- review_site: team only
-- ---------------------------------------------------------------------------
create or replace function public.review_site(
  p_site_id uuid,
  p_decision public.review_decision
)
returns public.own_sites
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.require_auth_uid();
  site public.own_sites;
  ref text;
begin
  perform public.require_team(uid);

  select * into site from public.own_sites where id = p_site_id for update;
  if not found then
    raise exception 'site not found';
  end if;

  if site.status <> 'pending' then
    raise exception 'site is not pending';
  end if;

  if p_decision = 'reject' then
    update public.own_sites
    set status = 'rejected',
        reviewer_id = uid,
        reviewed_at = now(),
        updated_at = now()
    where id = p_site_id
    returning * into site;
    return site;
  end if;

  -- approve
  update public.own_sites
  set status = 'live',
      reviewer_id = uid,
      reviewed_at = now(),
      updated_at = now()
  where id = p_site_id
  returning * into site;

  ref := public.make_site_ref('own', site.id);

  insert into public.site_stocks (
    site_ref, materials, ammo, power,
    capacity_materials, capacity_ammo, capacity_power, refreshed_at
  ) values (
    ref,
    public.game_config_num('stock_capacity_materials'),
    public.game_config_num('stock_capacity_ammo'),
    public.game_config_num('stock_capacity_power'),
    public.game_config_num('stock_capacity_materials'),
    public.game_config_num('stock_capacity_ammo'),
    public.game_config_num('stock_capacity_power'),
    now()
  )
  on conflict (site_ref) do nothing;

  return site;
end;
$$;

grant execute on function public.review_site(uuid, public.review_decision)
  to authenticated;

-- ---------------------------------------------------------------------------
-- debug_damage: team only
-- ---------------------------------------------------------------------------
create or replace function public.debug_damage(
  p_structure_id uuid,
  p_damage numeric
)
returns public.structures
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.require_auth_uid();
  s public.structures;
  new_health numeric;
begin
  perform public.require_team(uid);

  if p_damage is null or p_damage <= 0 then
    raise exception 'damage must be positive';
  end if;

  select * into s from public.structures where id = p_structure_id for update;
  if not found then
    raise exception 'structure not found';
  end if;

  if public.structure_computed_state(s.last_cared_at, s.zeroed_at) <> 'active' then
    raise exception 'structure not active';
  end if;

  new_health := greatest(0, s.health - p_damage);

  update public.structures
  set health = new_health,
      zeroed_at = case when new_health = 0 then coalesce(zeroed_at, now()) else zeroed_at end,
      updated_at = now()
  where id = s.id
  returning * into s;

  return s;
end;
$$;

grant execute on function public.debug_damage(uuid, numeric)
  to authenticated;

-- ---------------------------------------------------------------------------
-- log_debug_tracks: only when profile.debug_logging
-- ---------------------------------------------------------------------------
create or replace function public.log_debug_tracks(
  p_points jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid uuid := public.require_auth_uid();
  allowed boolean;
  point jsonb;
  n integer := 0;
begin
  select p.debug_logging into allowed from public.profiles p where p.id = uid;
  if not coalesce(allowed, false) then
    raise exception 'debug logging disabled';
  end if;

  if p_points is null or jsonb_typeof(p_points) <> 'array' then
    raise exception 'points must be a JSON array';
  end if;

  for point in select * from jsonb_array_elements(p_points)
  loop
    insert into public.debug_tracks (user_id, location, accuracy_m, speed_mps, recorded_at)
    values (
      uid,
      extensions.st_setsrid(
        extensions.st_makepoint(
          (point ->> 'lng')::double precision,
          (point ->> 'lat')::double precision
        ),
        4326
      )::extensions.geography,
      nullif(point ->> 'accuracy_m', '')::numeric,
      nullif(point ->> 'speed_mps', '')::numeric,
      coalesce(nullif(point ->> 'recorded_at', '')::timestamptz, now())
    );
    n := n + 1;
  end loop;

  return n;
end;
$$;

grant execute on function public.log_debug_tracks(jsonb)
  to authenticated;
