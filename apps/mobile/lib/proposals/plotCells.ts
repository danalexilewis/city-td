import {
  BALANCE,
  buildPlot,
  h3Adapter,
  validatePlotCellsNearSite,
} from '@city-td/game-core';

import type { PlotCellPayload } from '@/lib/proposals/types';

export type PlotCellsForSite =
  | {
      ok: true;
      cellR12: string;
      cellR7: string;
      plotCells: PlotCellPayload[];
    }
  | { ok: false; error: string };

/**
 * Build the 19 H3 r12 plot cells for a proposed site and validate centres ≤ 50 m.
 */
export function computePlotCellsForSite(args: {
  lat: number;
  lng: number;
}): PlotCellsForSite {
  const location = { lat: args.lat, lng: args.lng };
  const plot = buildPlot({
    site: { id: 'proposal', location },
    grid: h3Adapter,
  });

  const validation = validatePlotCellsNearSite({
    siteLocation: location,
    cellIds: plot.cells,
    grid: h3Adapter,
  });

  if (!validation.ok) {
    return {
      ok: false,
      error:
        'Plot cells are too far from this GPS fix. Wait for a better location and try again.',
    };
  }

  const cellR12 = plot.siteCell;
  const parentResolution = BALANCE.grid.h3ParentResolution;
  const cellR7 = h3Adapter.parentCell(cellR12, parentResolution);

  const plotCells: PlotCellPayload[] = plot.cells.map(function toPayload(cellId) {
    const centre = h3Adapter.centreOf(cellId);
    return {
      cell_r12: cellId,
      cell_r7: h3Adapter.parentCell(cellId, parentResolution),
      lng: centre.lng,
      lat: centre.lat,
    };
  });

  return { ok: true, cellR12, cellR7, plotCells };
}
