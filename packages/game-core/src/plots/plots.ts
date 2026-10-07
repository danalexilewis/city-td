import { BALANCE, type BalanceConfig } from "../balance/config.js";
import { distanceMetres } from "../geo.js";
import type { CellId, GridAdapter, LatLng, Plot } from "../types.js";

export type SiteForPlot = {
  id: string;
  location: LatLng;
  /** Optional precomputed site cell; otherwise derived via the adapter. */
  cellId?: CellId;
};

/**
 * Build a plot: the site's cell plus `plotRings` rings around it
 * (H3: 19 cells; square zoom-21: 5×5 block).
 */
export function buildPlot(args: {
  site: SiteForPlot;
  grid: GridAdapter;
  balance?: BalanceConfig;
}): Plot {
  const balance = args.balance ?? BALANCE;
  const siteCell = args.site.cellId ?? args.grid.cellAt(args.site.location);
  const cells = args.grid.disk(siteCell, balance.grid.plotRings);
  return {
    siteId: args.site.id,
    siteCell,
    cells,
  };
}

export function buildPlots(args: {
  sites: readonly SiteForPlot[];
  grid: GridAdapter;
  balance?: BalanceConfig;
}): Plot[] {
  return args.sites.map((site) => {
    if (args.balance) {
      return buildPlot({ site, grid: args.grid, balance: args.balance });
    }
    return buildPlot({ site, grid: args.grid });
  });
}

/**
 * Server-side check for propose/review: every plot cell centre must lie within
 * `plotCellMaxDistanceM` of the site point (default 50 m).
 */
export function validatePlotCellsNearSite(args: {
  siteLocation: LatLng;
  cellIds: readonly CellId[];
  grid: GridAdapter;
  balance?: BalanceConfig;
}): { ok: true } | { ok: false; offendingCellIds: CellId[] } {
  const balance = args.balance ?? BALANCE;
  const maxM = balance.grid.plotCellMaxDistanceM;
  const offendingCellIds: CellId[] = [];
  for (const cellId of args.cellIds) {
    const centre = args.grid.centreOf(cellId);
    if (distanceMetres(args.siteLocation, centre) > maxM) {
      offendingCellIds.push(cellId);
    }
  }
  if (offendingCellIds.length > 0) {
    return { ok: false, offendingCellIds };
  }
  return { ok: true };
}
