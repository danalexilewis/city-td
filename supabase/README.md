# Supabase (City TD)

Local Postgres + Auth + Storage + Realtime for the Wellington map POC. Remote cloud project setup is manual (Sydney).

## Prerequisites (remote Sydney project)

Do **not** assume the CLI can create a live cloud project for you. In the Supabase Dashboard:

1. Create a project in **Sydney (`ap-southeast-2`)**.
2. **Database → Extensions:** enable **PostGIS** and **pg_cron**.
3. **Authentication → SMTP:** custom SMTP (e.g. **Resend**). The built-in sender only emails org members at 2 emails/hour.
4. **Authentication → Email Templates** (Magic Link / OTP): include `{{ .Token }}` so the 6-digit code is delivered. Local template: `templates/magic_link.html`.
5. Link and push:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

## Local apply

```bash
# From repo root (Docker Desktop or Podman required)
npx supabase start
npx supabase db reset   # applies migrations + seed.sql
```

Useful URLs after `start`: API `http://127.0.0.1:54321`, Studio `http://127.0.0.1:54323`, Inbucket `http://127.0.0.1:54324`.

Config parses with the CLI; full `db reset` needs Docker (not available in the environment that authored these migrations).

## Layout

| Path | Purpose |
|------|---------|
| `config.toml` | Local ports, Auth OTP, `site-photos` bucket, remote notes |
| `migrations/` | Extensions, tables, RLS, RPCs, cron, storage policies |
| `templates/magic_link.html` | Email OTP with `{{ .Token }}` |
| `seed.sql` | Optional fixtures (empty by default) |

## Security model

- Clients use the **anon** key only.
- RLS allows **read** of public game state (live sites, plots, stocks, structures, presence).
- All **writes** go through `security definer` RPCs listed below.

## RPCs

| Function | Role |
|----------|------|
| `sites_in_bbox` | Map query |
| `place_structure` | Build on a free plot cell |
| `care_structure` | Repair / load / boost (+ reset care clock) |
| `rebuild_rubble` | Half cost, caller becomes owner |
| `remove_structure` | Owner only |
| `collect` | Reach + cooldown + lazy refill |
| `heartbeat` | Live presence upsert |
| `propose_site` | Pending own site + plot cells |
| `review_site` | Team approve/reject |
| `debug_damage` | Team only |
| `log_debug_tracks` | Opt-in debug GPS |

## Structure state (mirrors plan / game-core)

- **Rubble** at `least(zeroed_at, last_cared_at + 28 days)`.
- **Cleared** 7 days after rubble start; daily cron deletes cleared rows.
- Care actions (repair, load, boost) reset `last_cared_at`.

## Cron jobs (pg_cron)

| Job | Schedule | Work |
|-----|----------|------|
| `presence-bonus` | every minute | Presence stock bonus + drop stale presence (>2 min) |
| `structure-raids` | every 3 hours | ~10% of active structures take 5–15% max HP |
| `daily-cleanup` | daily | Delete cleared structures + debug tracks >30 days |

## Balance defaults

Tunable keys live in `game_config` (seeded in the schema migration). Structure place costs and repair rate match `packages/game-core` `BALANCE` (wall 20 / turret 40 / garrison 60; repair 0.5 mat/hp). Keep SQL and TS in sync when tuning after walks — see [`docs/walk-tests.md`](../docs/walk-tests.md).

## Handoff

- `apps/mobile`: call RPCs with the anon client; subscribe to `structures` Realtime filtered by `cell_r7`.
- `packages/game-core`: mirror stock / structure-state maths and the same numeric defaults as `game_config`.
- `tools/site-gen`: service-role upserts into `osm_sites` / `transit_sites`, `plot_cells`, `site_stocks` (never import that into the app).
- `site_ref` format: `osm:<uuid>` | `transit:<uuid>` | `own:<uuid>`.
- `propose_site` `p_plot_cells` JSON array (up to 19):
  `[{"cell_r12":"…","cell_r7":"…","lng":174.77,"lat":-41.29}, …]`
- Photo uploads: `site-photos/{auth.uid()}/…` then pass `photo_path` into `propose_site`.
- Team flag (`profiles.is_team`) is not client-writable; set via SQL/service role for moderators.
