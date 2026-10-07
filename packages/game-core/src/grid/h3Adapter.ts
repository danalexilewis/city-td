import {
  areNeighborCells,
  cellToBoundary,
  cellToLatLng,
  cellToParent,
  cellsToMultiPolygon,
  gridDisk,
  isValidCell,
  latLngToCell,
} from "h3-js";

import { BALANCE } from "../balance/config.js";
import type { CellId, GridAdapter, LatLng, LngLat } from "../types.js";

export type H3AdapterOptions = {
  resolution?: number;
};

/**
 * H3 grid adapter at resolution 12 (≈307 m² / ≈19 m across).
 * This is the authoritative playable grid stored on the server.
 */
export function createH3Adapter(options: H3AdapterOptions = {}): GridAdapter {
  const resolution = options.resolution ?? BALANCE.grid.h3Resolution;

  function cellAt(point: LatLng): CellId {
    return latLngToCell(point.lat, point.lng, resolution);
  }

  function centreOf(cellId: CellId): LatLng {
    const [lat, lng] = cellToLatLng(cellId);
    return { lat, lng };
  }

  function parentCell(cellId: CellId, parentResolution: number): CellId {
    return cellToParent(cellId, parentResolution);
  }

  function disk(cellId: CellId, ringCount: number): CellId[] {
    return gridDisk(cellId, ringCount);
  }

  function areNeighbors(a: CellId, b: CellId): boolean {
    if (a === b) {
      return false;
    }
    if (!isValidCell(a) || !isValidCell(b)) {
      return false;
    }
    return areNeighborCells(a, b);
  }

  function cellsToMultiPolygonCoords(cellIds: readonly CellId[]): LngLat[][][] {
    if (cellIds.length === 0) {
      return [];
    }
    return cellsToMultiPolygon([...cellIds], true) as LngLat[][][];
  }

  function boundary(cellId: CellId): LngLat[] {
    return cellToBoundary(cellId, true) as LngLat[];
  }

  return {
    kind: "h3",
    resolution,
    cellAt,
    centreOf,
    parentCell,
    disk,
    areNeighbors,
    cellsToMultiPolygon: cellsToMultiPolygonCoords,
    boundary,
  };
}

export const h3Adapter = createH3Adapter();
