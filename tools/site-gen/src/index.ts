#!/usr/bin/env node
/**
 * Site generator CLI — Overpass (OSM) + Metlink GTFS → Supabase.
 * Node-only. Service-role key stays here; never import from apps/mobile.
 *
 * Usage:
 *   pnpm --filter @city-td/site-gen site-gen -- --dry-run
 *   pnpm --filter @city-td/site-gen site-gen -- --dry-run --sample
 *   pnpm --filter @city-td/site-gen site-gen -- --refresh
 */

import { writeJsonCache } from "./cache.js";
import { loadEnvFromProcess } from "./config.js";
import { prepareSites } from "./dedupe.js";
import { loadDotEnv } from "./env.js";
import { fetchTransitCandidates } from "./gtfs.js";
import { fetchOsmCandidates } from "./overpass.js";
import { loadRegion, sampleBBox } from "./region.js";
import type { PreparedSite, RunStats } from "./types.js";
import {
  buildDryRunPayload,
  createServiceClient,
  upsertSource,
} from "./upsert.js";

type CliArgs = {
  dryRun: boolean;
  refresh: boolean;
  sample: boolean;
  osmOnly: boolean;
  transitOnly: boolean;
  help: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const flags = new Set(argv.filter((arg) => arg !== "--"));
  return {
    dryRun: flags.has("--dry-run"),
    refresh: flags.has("--refresh"),
    sample: flags.has("--sample"),
    osmOnly: flags.has("--osm-only"),
    transitOnly: flags.has("--transit-only"),
    help: flags.has("--help") || flags.has("-h"),
  };
}

function printHelp(): void {
  console.log(`
@city-td/site-gen — generate osm_sites / transit_sites, plot cells, stocks

Options:
  --dry-run       Fetch/cache + process; print counts; do not write to Supabase
  --sample        Use a small bbox around the region centre (faster Overpass)
  --refresh       Re-download Overpass / GTFS instead of using cache/
  --osm-only      Only process OpenStreetMap sources
  --transit-only  Only process Metlink GTFS
  --help          Show this help

Env (tools/site-gen/.env or process env):
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY   (required unless --dry-run)

Examples:
  pnpm --filter @city-td/site-gen site-gen -- --dry-run --sample
  pnpm --filter @city-td/site-gen site-gen -- --refresh
`.trim());
}

function summarizeTypes(sites: PreparedSite[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const site of sites) {
    counts[site.siteType] = (counts[site.siteType] ?? 0) + 1;
  }
  return counts;
}

async function main(): Promise<void> {
  await loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const region = await loadRegion();
  const overpassBbox = args.sample
    ? sampleBBox(region.bbox, 0.12)
    : region.bbox;

  console.log(`Region: ${region.path}`);
  console.log(
    `BBox: ${region.bbox.south.toFixed(4)},${region.bbox.west.toFixed(4)} → ${region.bbox.north.toFixed(4)},${region.bbox.east.toFixed(4)}`,
  );
  if (args.sample) {
    console.log(
      `Sample Overpass bbox: ${overpassBbox.south.toFixed(4)},${overpassBbox.west.toFixed(4)} → ${overpassBbox.north.toFixed(4)},${overpassBbox.east.toFixed(4)}`,
    );
  }

  const stats: RunStats = {
    osmCandidates: 0,
    transitCandidates: 0,
    osmAfterDedupe: 0,
    transitAfterDedupe: 0,
    osmClippedOut: 0,
    transitClippedOut: 0,
    plotCells: 0,
    stocks: 0,
  };

  let osmSites: PreparedSite[] = [];
  let transitSites: PreparedSite[] = [];

  if (!args.transitOnly) {
    console.log("Fetching OSM intersections + landmarks…");
    const osm = await fetchOsmCandidates({
      region,
      bbox: overpassBbox,
      forceRefresh: args.refresh,
    });
    console.log(
      `  Overpass cache: intersections=${osm.fromCache.intersections ? "hit" : "miss"}, landmarks=${osm.fromCache.landmarks ? "hit" : "miss"}`,
    );
    console.log(
      `  Raw: ${osm.intersections.length} intersections, ${osm.landmarks.length} landmarks`,
    );
    const combined = [...osm.intersections, ...osm.landmarks];
    stats.osmCandidates = combined.length;
    const prepared = prepareSites(combined, region);
    osmSites = prepared.sites;
    stats.osmClippedOut = prepared.clippedOut;
    stats.osmAfterDedupe = osmSites.length;
    console.log(
      `  After clip+dedupe (H3 r12, OSM only): ${osmSites.length} (clipped ${prepared.clippedOut})`,
    );
    console.log(`  By type: ${JSON.stringify(summarizeTypes(osmSites))}`);
  }

  if (!args.osmOnly) {
    console.log("Fetching Metlink GTFS…");
    const transit = await fetchTransitCandidates({
      forceRefresh: args.refresh,
    });
    console.log(
      `  GTFS cache: ${transit.fromCache ? "hit" : "miss"} (${transit.zipPath})`,
    );
    console.log(`  Raw candidates (platforms collapsed): ${transit.candidates.length}`);
    stats.transitCandidates = transit.candidates.length;
    const prepared = prepareSites(transit.candidates, region);
    transitSites = prepared.sites;
    stats.transitClippedOut = prepared.clippedOut;
    stats.transitAfterDedupe = transitSites.length;
    console.log(
      `  After clip+dedupe (H3 r12, transit only): ${transitSites.length} (clipped ${prepared.clippedOut})`,
    );
    console.log(`  By type: ${JSON.stringify(summarizeTypes(transitSites))}`);
  }

  // No cross-source de-duplication (ODbL Collective Database guideline).
  stats.plotCells = (osmSites.length + transitSites.length) * 19;
  stats.stocks = osmSites.length + transitSites.length;

  const dryOsm = buildDryRunPayload({ source: "osm", sites: osmSites });
  const dryTransit = buildDryRunPayload({
    source: "transit",
    sites: transitSites,
  });

  const summary = {
    dryRun: args.dryRun,
    sample: args.sample,
    stats,
    osmSample: dryOsm.sample,
    transitSample: dryTransit.sample,
    note: "Sources are never de-duplicated against each other (ODbL).",
  };
  const summaryPath = await writeJsonCache(
    `last-run-summary_${Date.now()}.json`,
    summary,
  );
  console.log(`Wrote summary ${summaryPath}`);

  if (args.dryRun) {
    console.log("\nDry-run complete — no database writes.");
    console.log(
      JSON.stringify(
        {
          osmSites: dryOsm.sites,
          transitSites: dryTransit.sites,
          plotCellsApprox: stats.plotCells,
          stocks: stats.stocks,
        },
        null,
        2,
      ),
    );
    return;
  }

  const { supabaseUrl, serviceRoleKey } = loadEnvFromProcess();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required unless --dry-run",
    );
  }

  const client = createServiceClient({ supabaseUrl, serviceRoleKey });

  if (osmSites.length > 0) {
    console.log(`Upserting ${osmSites.length} osm_sites…`);
    const result = await upsertSource({
      client,
      source: "osm",
      sites: osmSites,
    });
    console.log(`  ${JSON.stringify(result)}`);
  }

  if (transitSites.length > 0) {
    console.log(`Upserting ${transitSites.length} transit_sites…`);
    const result = await upsertSource({
      client,
      source: "transit",
      sites: transitSites,
    });
    console.log(`  ${JSON.stringify(result)}`);
  }

  console.log("\nDone.");
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
