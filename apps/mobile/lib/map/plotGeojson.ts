import {
  boardOutline,
  buildPlots,
  mergePlotsIntoBoards,
  type GridAdapter,
  type LngLat,
} from '@city-td/game-core';

import type { MapSite } from '@/lib/map/sites';

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

/**
 * Point features for site icons (and overview clustering).
 */
export function sitesToGeoJSON(sites: readonly MapSite[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: sites.map((site) => ({
      type: 'Feature',
      id: site.siteRef,
      properties: {
        siteRef: site.siteRef,
        name: site.name,
        siteKind: site.siteKind,
        source: site.source,
        icon: `site-${site.siteKind}`,
      },
      geometry: {
        type: 'Point',
        coordinates: [site.lng, site.lat],
      },
    })),
  };
}

/**
 * Build plot cell polygons + board outline lines from sites in view.
 */
export function plotsAndBoardsToGeoJSON(args: {
  sites: readonly MapSite[];
  grid: GridAdapter;
}): {
  cells: GeoJSON.FeatureCollection;
  boards: GeoJSON.FeatureCollection;
} {
  if (args.sites.length === 0) {
    return { cells: EMPTY_FC, boards: EMPTY_FC };
  }

  const plots = buildPlots({
    sites: args.sites.map((site) => ({
      id: site.siteRef,
      location: { lat: site.lat, lng: site.lng },
      // Server stores H3 only; square lab recomputes cells from lat/lng.
      cellId:
        args.grid.kind === 'h3' ? (site.cellR12 ?? undefined) : undefined,
    })),
    grid: args.grid,
  });

  const cellFeatures: GeoJSON.Feature[] = [];
  for (const plot of plots) {
    for (const cellId of plot.cells) {
      const ring = args.grid.boundary(cellId);
      cellFeatures.push({
        type: 'Feature',
        id: cellId,
        properties: {
          cellId,
          siteRef: plot.siteId,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [ring],
        },
      });
    }
  }

  const boards = mergePlotsIntoBoards({ plots, grid: args.grid });
  const boardFeatures: GeoJSON.Feature[] = boards.map((board) => {
    const multi = boardOutline({ board, grid: args.grid });
    return {
      type: 'Feature',
      id: board.id,
      properties: {
        boardId: board.id,
        siteCount: board.siteIds.length,
      },
      geometry: {
        type: 'MultiPolygon',
        coordinates: multi,
      },
    };
  });

  return {
    cells: { type: 'FeatureCollection', features: cellFeatures },
    boards: { type: 'FeatureCollection', features: boardFeatures },
  };
}

/** MultiPolygon rings → LineString / MultiLineString features for outlines. */
export function multiPolygonToOutlineLines(
  collection: GeoJSON.FeatureCollection,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const feature of collection.features) {
    if (feature.geometry.type === 'MultiPolygon') {
      const lines: LngLat[][] = [];
      for (const polygon of feature.geometry.coordinates) {
        for (const ring of polygon) {
          lines.push(ring as LngLat[]);
        }
      }
      features.push({
        type: 'Feature',
        properties: feature.properties,
        geometry:
          lines.length === 1
            ? { type: 'LineString', coordinates: lines[0]! }
            : { type: 'MultiLineString', coordinates: lines },
      });
      continue;
    }

    if (feature.geometry.type === 'Polygon') {
      const ring = feature.geometry.coordinates[0] as LngLat[];
      features.push({
        type: 'Feature',
        properties: feature.properties,
        geometry: { type: 'LineString', coordinates: ring },
      });
    }
  }

  return { type: 'FeatureCollection', features };
}
