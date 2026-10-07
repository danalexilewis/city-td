import {
  BALANCE,
  buildPlot,
  h3Adapter,
  initialSiteStock,
  scaleBySiteYield,
  type SiteType,
} from "@city-td/game-core";

import { siteRef, wktPoint } from "./dedupe.js";
import type { PlotCellRow, PreparedSite, SiteSource, StockRow } from "./types.js";

export function buildPlotRows(args: {
  source: SiteSource;
  siteId: string;
  site: PreparedSite;
}): PlotCellRow[] {
  const plot = buildPlot({
    site: {
      id: args.siteId,
      location: args.site.location,
      cellId: args.site.cellR12,
    },
    grid: h3Adapter,
  });
  const ref = siteRef(args.source, args.siteId);
  const parentRes = BALANCE.grid.h3ParentResolution;

  return plot.cells.map((cellR12) => {
    const centre = h3Adapter.centreOf(cellR12);
    return {
      cell_r12: cellR12,
      site_ref: ref,
      cell_r7: h3Adapter.parentCell(cellR12, parentRes),
      centre_wkt: wktPoint(centre),
    };
  });
}

export function buildStockRow(args: {
  source: SiteSource;
  siteId: string;
  siteType: SiteType;
  now?: Date;
}): StockRow {
  const now = args.now ?? new Date();
  const stock = initialSiteStock({ siteType: args.siteType, now });
  const capacity = scaleBySiteYield({
    base: BALANCE.stock.capacity,
    siteType: args.siteType,
  });
  return {
    site_ref: siteRef(args.source, args.siteId),
    materials: stock.materials,
    ammo: stock.ammo,
    power: stock.power,
    capacity_materials: capacity.materials,
    capacity_ammo: capacity.ammo,
    capacity_power: capacity.power,
    refreshed_at: now.toISOString(),
  };
}
