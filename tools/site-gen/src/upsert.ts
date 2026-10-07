import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { buildPlotRows, buildStockRow } from "./plots.js";
import { siteRef, wktPoint } from "./dedupe.js";
import type {
  PlotCellRow,
  PreparedSite,
  SiteSource,
  StockRow,
} from "./types.js";

export type UpsertResult = {
  source: SiteSource;
  sitesUpserted: number;
  plotCellsWritten: number;
  stocksUpserted: number;
};

type OsmRow = {
  external_id: string;
  name: string;
  site_kind: "intersection" | "landmark";
  location: string;
  cell_r12: string;
  cell_r7: string;
  updated_at: string;
};

type TransitRow = {
  external_id: string;
  name: string;
  site_kind: "stop" | "station";
  location: string;
  cell_r12: string;
  cell_r7: string;
  updated_at: string;
};

const CHUNK = 400;

export function createServiceClient(args: {
  supabaseUrl: string;
  serviceRoleKey: string;
}): SupabaseClient {
  return createClient(args.supabaseUrl, args.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function upsertChunked(args: {
  client: SupabaseClient;
  table: string;
  rows: OsmRow[] | TransitRow[];
  onConflict: string;
}): Promise<{ id: string; external_id: string }[]> {
  const out: { id: string; external_id: string }[] = [];
  for (let i = 0; i < args.rows.length; i += CHUNK) {
    const slice = args.rows.slice(i, i + CHUNK);
    const { data, error } = await args.client
      .from(args.table)
      .upsert(slice as OsmRow[], { onConflict: args.onConflict })
      .select("id, external_id");
    if (error) {
      throw new Error(`Upsert ${args.table} failed: ${error.message}`);
    }
    for (const row of data ?? []) {
      out.push({
        id: String(row.id),
        external_id: String(row.external_id),
      });
    }
  }
  return out;
}

async function replacePlotCells(args: {
  client: SupabaseClient;
  siteRefs: string[];
  rows: PlotCellRow[];
}): Promise<number> {
  for (let i = 0; i < args.siteRefs.length; i += CHUNK) {
    const slice = args.siteRefs.slice(i, i + CHUNK);
    const { error } = await args.client
      .from("plot_cells")
      .delete()
      .in("site_ref", slice);
    if (error) {
      throw new Error(`Delete plot_cells failed: ${error.message}`);
    }
  }

  let written = 0;
  for (let i = 0; i < args.rows.length; i += CHUNK) {
    const slice = args.rows.slice(i, i + CHUNK).map((row) => ({
      cell_r12: row.cell_r12,
      site_ref: row.site_ref,
      cell_r7: row.cell_r7,
      centre: row.centre_wkt,
    }));
    const { error } = await args.client.from("plot_cells").insert(slice);
    if (error) {
      throw new Error(`Insert plot_cells failed: ${error.message}`);
    }
    written += slice.length;
  }
  return written;
}

async function upsertStocks(args: {
  client: SupabaseClient;
  rows: StockRow[];
}): Promise<number> {
  let written = 0;
  for (let i = 0; i < args.rows.length; i += CHUNK) {
    const slice = args.rows.slice(i, i + CHUNK);
    const { error } = await args.client
      .from("site_stocks")
      .upsert(slice, { onConflict: "site_ref" });
    if (error) {
      throw new Error(`Upsert site_stocks failed: ${error.message}`);
    }
    written += slice.length;
  }
  return written;
}

function toOsmRows(sites: PreparedSite[], nowIso: string): OsmRow[] {
  return sites.map((site) => ({
    external_id: site.externalId,
    name: site.name,
    site_kind: site.siteType === "landmark" ? "landmark" : "intersection",
    location: wktPoint(site.location),
    cell_r12: site.cellR12,
    cell_r7: site.cellR7,
    updated_at: nowIso,
  }));
}

function toTransitRows(sites: PreparedSite[], nowIso: string): TransitRow[] {
  return sites.map((site) => ({
    external_id: site.externalId,
    name: site.name,
    site_kind: site.siteType === "station" ? "station" : "stop",
    location: wktPoint(site.location),
    cell_r12: site.cellR12,
    cell_r7: site.cellR7,
    updated_at: nowIso,
  }));
}

/**
 * Upsert sites for one source, then replace that source's plot cells and
 * write full initial stocks (yield-shaped).
 */
export async function upsertSource(args: {
  client: SupabaseClient;
  source: SiteSource;
  sites: PreparedSite[];
}): Promise<UpsertResult> {
  const now = new Date();
  const nowIso = now.toISOString();
  const table = args.source === "osm" ? "osm_sites" : "transit_sites";
  const upserted =
    args.source === "osm"
      ? await upsertChunked({
          client: args.client,
          table,
          rows: toOsmRows(args.sites, nowIso),
          onConflict: "external_id",
        })
      : await upsertChunked({
          client: args.client,
          table,
          rows: toTransitRows(args.sites, nowIso),
          onConflict: "external_id",
        });

  const byExternal = new Map(
    upserted.map((row) => [row.external_id, row.id] as const),
  );

  const plotRows: PlotCellRow[] = [];
  const stockRows: StockRow[] = [];
  const siteRefs: string[] = [];

  for (const site of args.sites) {
    const id = byExternal.get(site.externalId);
    if (!id) {
      throw new Error(
        `Upsert returned no id for ${args.source} ${site.externalId}`,
      );
    }
    siteRefs.push(siteRef(args.source, id));
    plotRows.push(
      ...buildPlotRows({ source: args.source, siteId: id, site }),
    );
    stockRows.push(
      buildStockRow({
        source: args.source,
        siteId: id,
        siteType: site.siteType,
        now,
      }),
    );
  }

  const plotCellsWritten = await replacePlotCells({
    client: args.client,
    siteRefs,
    rows: plotRows,
  });
  const stocksUpserted = await upsertStocks({
    client: args.client,
    rows: stockRows,
  });

  return {
    source: args.source,
    sitesUpserted: upserted.length,
    plotCellsWritten,
    stocksUpserted,
  };
}

/** Build plot/stock payloads without writing (dry-run). */
export function buildDryRunPayload(args: {
  source: SiteSource;
  sites: PreparedSite[];
}): {
  sites: number;
  plotCells: number;
  stocks: number;
  sample: Array<{
    externalId: string;
    name: string;
    siteType: string;
    cellR12: string;
    plotCellCount: number;
  }>;
} {
  const sample = args.sites.slice(0, 5).map((site) => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const plots = buildPlotRows({
      source: args.source,
      siteId: fakeId,
      site,
    });
    return {
      externalId: site.externalId,
      name: site.name,
      siteType: site.siteType,
      cellR12: site.cellR12,
      plotCellCount: plots.length,
    };
  });

  const plotCells = args.sites.length * 19;
  return {
    sites: args.sites.length,
    plotCells,
    stocks: args.sites.length,
    sample,
  };
}
