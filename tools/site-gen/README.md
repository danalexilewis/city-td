# `@city-td/site-gen`

Node-only generator that turns **OpenStreetMap** (Overpass) and **Metlink GTFS** into Supabase rows: `osm_sites` / `transit_sites`, `plot_cells`, and full `site_stocks`.

**Never import this package from `apps/mobile`.** The service-role key, `fs`, Overpass client, and GTFS unzip stay here.

## What it does

1. **Overpass**
   - **Intersections:** nodes shared by 2+ roads of class residential and above (including pedestrian streets). Service roads, driveways, and footpaths are skipped.
   - **Landmarks:** configurable OSM tags in `src/config.ts` (`LANDMARK_TAGS`). Area features use Overpass `out center` (interior-ish point).
2. **Metlink GTFS** from `https://static.opendata.metlink.org.nz/v1/gtfs/full.zip`
   - Platforms collapse into their parent station.
   - Stops served by train or ferry routes count as stations.
3. **Per-source clean-up**
   - Clip to `region.geojson` (Wellington commuter belt).
   - Keep **one site per H3 r12 cell within each source**.
   - **No cross-source de-duplication** (ODbL Collective Database guideline).
4. **Output**
   - Upsert sites by `external_id`.
   - Replace plot cells for those `site_ref`s (`osm:<uuid>` / `transit:<uuid>`), built with `@city-td/game-core` `buildPlot` (2 rings → 19 cells).
   - Upsert full stocks via `initialSiteStock` / yield mix by site type.

Raw Overpass JSON and the GTFS zip are cached under `cache/` for repeatable runs.

## Setup

```bash
# from repo root
pnpm install

cp tools/site-gen/.env.example tools/site-gen/.env
# edit SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
```

### Env vars

| Variable | Required | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | yes (unless `--dry-run`) | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes (unless `--dry-run`) | **Service role only** — never ship to the app |
| `OVERPASS_URL` | no | Default `https://overpass-api.de/api/interpreter` |
| `METLINK_GTFS_URL` | no | Default Metlink full GTFS zip |

## Run

```bash
# Dry-run (cache downloads, print counts, no DB writes)
pnpm --filter @city-td/site-gen site-gen -- --dry-run

# Faster Overpass: small bbox around the region centre
pnpm --filter @city-td/site-gen site-gen -- --dry-run --sample

# Re-download Overpass + GTFS
pnpm --filter @city-td/site-gen site-gen -- --refresh

# Write to Supabase
pnpm --filter @city-td/site-gen site-gen

# OSM or transit only
pnpm --filter @city-td/site-gen site-gen -- --osm-only
pnpm --filter @city-td/site-gen site-gen -- --transit-only --dry-run
```

Root alias:

```bash
pnpm site-gen -- --dry-run --sample
```

## Licensing

- OSM-derived rows live only in `osm_sites`.
- Metlink-derived rows live only in `transit_sites`.
- Do not merge, gap-fill, or de-dupe across those tables — that would pull non-OSM data under ODbL share-alike.
- Credit OSM contributors and Metlink / Greater Wellington (CC BY 4.0) in the app About screen.

## Cache

`tools/site-gen/cache/` holds Overpass responses and the GTFS zip (gitignored). Delete the folder or pass `--refresh` to force new downloads.

If Node `fetch` cannot reach Overpass (common with IPv6 timeouts), the tool falls back to `curl`. Override the mirror with `OVERPASS_URL` (default `https://lz4.overpass-api.de/api/interpreter`).

## Sample dry-run counts (this environment)

`--dry-run --sample` (small Overpass bbox + full Metlink clip):

| Source | After clip + H3 r12 dedupe |
| --- | --- |
| OSM intersections | ~124 |
| OSM landmarks | ~55 |
| Metlink stops | ~2760 |
| Metlink stations | ~43 |
| **Total sites** | **~2982** |
| Plot cells (approx ×19) | ~56k |

Full-region Overpass (omit `--sample`) will produce far more OSM sites; Metlink counts stay the same.
