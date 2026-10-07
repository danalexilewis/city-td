import { BALANCE } from "../balance/config.js";
import type { CellId, GridAdapter, LatLng, LngLat } from "../types.js";

export type SquareAdapterOptions = {
  zoom?: number;
};

type TileXY = {
  x: number;
  y: number;
  z: number;
};

const TILE_RE = /^(\d+)\/(\d+)\/(\d+)$/;

function encodeTile(tile: TileXY): CellId {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

function decodeTile(cellId: CellId): TileXY {
  const match = TILE_RE.exec(cellId);
  if (!match) {
    throw new Error(`Invalid square cell id: ${cellId}`);
  }
  return {
    z: Number(match[1]),
    x: Number(match[2]),
    y: Number(match[3]),
  };
}

function clampLat(lat: number): number {
  return Math.max(-85.05112878, Math.min(85.05112878, lat));
}

/** Web Mercator tile containing `point` at integer zoom `z`. */
export function latLngToTile(point: LatLng, z: number): TileXY {
  const n = 2 ** z;
  const lat = clampLat(point.lat);
  const x = Math.floor(((point.lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return {
    z,
    x: ((x % n) + n) % n,
    y: Math.min(n - 1, Math.max(0, y)),
  };
}

/** Northwest corner of a tile as WGS84. */
export function tileToLatLng(tile: TileXY): LatLng {
  const n = 2 ** tile.z;
  const lng = (tile.x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * tile.y) / n)));
  return { lat: (latRad * 180) / Math.PI, lng };
}

function tileCentre(tile: TileXY): LatLng {
  const nw = tileToLatLng(tile);
  const se = tileToLatLng({ ...tile, x: tile.x + 1, y: tile.y + 1 });
  return {
    lat: (nw.lat + se.lat) / 2,
    lng: (nw.lng + se.lng) / 2,
  };
}

function tileBoundary(tile: TileXY): LngLat[] {
  const nw = tileToLatLng(tile);
  const ne = tileToLatLng({ ...tile, x: tile.x + 1, y: tile.y });
  const se = tileToLatLng({ ...tile, x: tile.x + 1, y: tile.y + 1 });
  const sw = tileToLatLng({ ...tile, x: tile.x, y: tile.y + 1 });
  return [
    [nw.lng, nw.lat],
    [ne.lng, ne.lat],
    [se.lng, se.lat],
    [sw.lng, sw.lat],
    [nw.lng, nw.lat],
  ];
}

/**
 * Parent tile at a coarser zoom. Square mode is view-only; parent ids are for
 * lab comparison with H3 r7 grouping, not server storage.
 */
function parentTile(tile: TileXY, parentZoom: number): TileXY {
  if (parentZoom > tile.z) {
    throw new Error("parent zoom must be <= cell zoom");
  }
  const shift = tile.z - parentZoom;
  return {
    z: parentZoom,
    x: Math.floor(tile.x / 2 ** shift),
    y: Math.floor(tile.y / 2 ** shift),
  };
}

/**
 * Square Web Mercator tiles at zoom 21 for view-only comparison with H3.
 * The server stores H3 cells only.
 */
export function createSquareAdapter(
  options: SquareAdapterOptions = {},
): GridAdapter {
  const zoom = options.zoom ?? BALANCE.grid.squareZoom;
  const worldSize = 2 ** zoom;

  function cellAt(point: LatLng): CellId {
    return encodeTile(latLngToTile(point, zoom));
  }

  function centreOf(cellId: CellId): LatLng {
    return tileCentre(decodeTile(cellId));
  }

  function parentCell(cellId: CellId, parentResolution: number): CellId {
    return encodeTile(parentTile(decodeTile(cellId), parentResolution));
  }

  function disk(cellId: CellId, ringCount: number): CellId[] {
    const centre = decodeTile(cellId);
    const cells: CellId[] = [];
    for (let dy = -ringCount; dy <= ringCount; dy += 1) {
      for (let dx = -ringCount; dx <= ringCount; dx += 1) {
        const x = (((centre.x + dx) % worldSize) + worldSize) % worldSize;
        const y = centre.y + dy;
        if (y < 0 || y >= worldSize) {
          continue;
        }
        cells.push(encodeTile({ z: zoom, x, y }));
      }
    }
    return cells;
  }

  function areNeighbors(a: CellId, b: CellId): boolean {
    if (a === b) {
      return false;
    }
    const ta = decodeTile(a);
    const tb = decodeTile(b);
    if (ta.z !== tb.z) {
      return false;
    }
    const dx = Math.min(
      Math.abs(ta.x - tb.x),
      worldSize - Math.abs(ta.x - tb.x),
    );
    const dy = Math.abs(ta.y - tb.y);
    // Edge-adjacent only (4-connected), mirroring H3 neighbour semantics.
    return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
  }

  function cellsToMultiPolygonCoords(cellIds: readonly CellId[]): LngLat[][][] {
    // View-only: emit one polygon per tile. Board outlines for square mode
    // do not need dissolved rings for the POC.
    return cellIds.map((cellId) => [tileBoundary(decodeTile(cellId))]);
  }

  function boundary(cellId: CellId): LngLat[] {
    return tileBoundary(decodeTile(cellId));
  }

  return {
    kind: "square",
    resolution: zoom,
    cellAt,
    centreOf,
    parentCell,
    disk,
    areNeighbors,
    cellsToMultiPolygon: cellsToMultiPolygonCoords,
    boundary,
  };
}

export const squareAdapter = createSquareAdapter();
