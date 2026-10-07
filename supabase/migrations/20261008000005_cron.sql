-- pg_cron jobs: presence bonus / minute, raids / 3h, daily cleanup.
-- Requires pg_cron (enabled in 20261008000001_extensions.sql / Dashboard).

-- ---------------------------------------------------------------------------
-- Job bodies as named functions (easier to re-schedule / test)
-- ---------------------------------------------------------------------------
create or replace function public.cron_presence_bonus()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  stale interval := make_interval(secs => public.game_config_num('presence_stale_seconds')::int);
  bonus_m numeric := public.game_config_num('presence_bonus_materials');
  bonus_a numeric := public.game_config_num('presence_bonus_ammo');
  bonus_p numeric := public.game_config_num('presence_bonus_power');
begin
  -- Drop stale presence (no history kept)
  delete from public.presence
  where updated_at < now() - stale;

  -- Add presence bonus for each fresh player standing in a site's plot
  with counts as (
    select pc.site_ref, count(distinct pr.user_id)::numeric as players
    from public.presence pr
    join public.plot_cells pc on pc.cell_r12 = pr.cell_r12
    where pr.updated_at >= now() - stale
    group by pc.site_ref
  )
  update public.site_stocks s
  set materials = least(s.capacity_materials, s.materials + c.players * bonus_m),
      ammo = least(s.capacity_ammo, s.ammo + c.players * bonus_a),
      power = least(s.capacity_power, s.power + c.players * bonus_p),
      refreshed_at = now()
  from counts c
  where s.site_ref = c.site_ref;
end;
$$;

-- One damage roll per selected row (avoid calling random() twice in SET).
create or replace function public.cron_structure_raids()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  select_frac numeric := public.game_config_num('raid_select_fraction');
  dmg_min numeric := public.game_config_num('raid_damage_min_pct');
  dmg_max numeric := public.game_config_num('raid_damage_max_pct');
begin
  with targets as (
    select
      s.id,
      s.max_health * (dmg_min + random() * (dmg_max - dmg_min)) as damage
    from public.structures s
    where public.structure_computed_state(s.last_cared_at, s.zeroed_at) = 'active'
      and random() < select_frac
  )
  update public.structures s
  set
    health = greatest(0, s.health - t.damage),
    zeroed_at = case
      when greatest(0, s.health - t.damage) = 0 then coalesce(s.zeroed_at, now())
      else s.zeroed_at
    end,
    updated_at = now()
  from targets t
  where s.id = t.id;
end;
$$;

create or replace function public.cron_daily_cleanup()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  track_days int := public.game_config_num('debug_track_retention_days')::int;
begin
  delete from public.structures s
  where public.structure_computed_state(s.last_cared_at, s.zeroed_at) = 'cleared';

  delete from public.debug_tracks
  where recorded_at < now() - make_interval(days => track_days);
end;
$$;

-- Schedule (unschedule first so db reset is idempotent)
do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname in ('presence-bonus', 'structure-raids', 'daily-cleanup');
exception
  when undefined_table then
    null;
  when undefined_function then
    null;
end;
$$;

select cron.schedule(
  'presence-bonus',
  '* * * * *',
  $$select public.cron_presence_bonus()$$
);

select cron.schedule(
  'structure-raids',
  '0 */3 * * *',
  $$select public.cron_structure_raids()$$
);

select cron.schedule(
  'daily-cleanup',
  '15 3 * * *',
  $$select public.cron_daily_cleanup()$$
);
