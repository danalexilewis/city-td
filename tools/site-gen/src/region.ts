import { readFile } from "node:fs/promises";

import type { LatLng } from "@city-td/game-core";

import { REGION_GEOJSON_PATH } from "./config.js";
import type { BBox } from "./types.js";

type Position = [number, number];

type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: Position[][];
};

type GeoJsonMultiPolygon = {
  type: "MultiPolygon";
  coordinates: Position[][][];
};

type GeoJsonGeometry = GeoJsonPolygon | GeoJsonMultiPolygon;

type GeoJsonFeature = {
  type: "Feature";
  geometry: GeoJsonGeometry | null;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

export type Region = {
  polygons: Position[][][];
  bbox: BBox;
  path: string;
};

function isRing(coords: unknown): coords is Position[] {
  return (
    Array.isArray(coords) &&
    coords.length >= 4 &&
    Array.isArray(coords[0]) &&
    typeof coords[0][0] === "number"
  );
}

function collectPolygons(geometry: GeoJsonGeometry): Position[][][] {
  if (geometry.type === "Polygon") {
    return [geometry.coordinates];
  }
  return geometry.coordinates;
}

function bboxOfPolygons(polygons: Position[][][]): BBox {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lng, lat] of ring) {
        if (lat < south) south = lat;
        if (lat > north) north = lat;
        if (lng < west) west = lng;
        if (lng > east) east = lng;
      }
    }
  }
  return { south, west, north, east };
}

/** Ray-casting point-in-ring (lng/lat as x/y). */
function pointInRing(point: LatLng, ring: Position[]): boolean {
  const x = point.lng;
  const y = point.lat;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i];
    const pj = ring[j];
    if (!pi || !pj) continue;
    const [xi, yi] = pi;
    const [xj, yj] = pj;
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: LatLng, polygon: Position[][]): boolean {
  const outer = polygon[0];
  if (!outer || !isRing(outer)) return false;
  if (!pointInRing(point, outer)) return false;
  for (let i = 1; i < polygon.length; i++) {
    const hole = polygon[i];
    if (hole && isRing(hole) && pointInRing(point, hole)) {
      return false;
    }
  }
  return true;
}

export function pointInRegion(point: LatLng, region: Region): boolean {
  for (const polygon of region.polygons) {
    if (pointInPolygon(point, polygon)) return true;
  }
  return false;
}

export async function loadRegion(
  geojsonPath: string = REGION_GEOJSON_PATH,
): Promise<Region> {
  const raw = await readFile(geojsonPath, "utf8");
  const parsed = JSON.parse(raw) as GeoJsonFeatureCollection;
  if (parsed.type !== "FeatureCollection") {
    throw new Error(`Expected FeatureCollection in ${geojsonPath}`);
  }

  const polygons: Position[][][] = [];
  for (const feature of parsed.features) {
    if (!feature.geometry) continue;
    if (
      feature.geometry.type !== "Polygon" &&
      feature.geometry.type !== "MultiPolygon"
    ) {
      continue;
    }
    polygons.push(...collectPolygons(feature.geometry));
  }

  if (polygons.length === 0) {
    throw new Error(`No polygons found in ${geojsonPath}`);
  }

  return {
    polygons,
    bbox: bboxOfPolygons(polygons),
    path: geojsonPath,
  };
}

/** Shrink bbox around its centre for dry-run / sample queries. */
export function sampleBBox(bbox: BBox, fraction = 0.15): BBox {
  const latSpan = bbox.north - bbox.south;
  const lngSpan = bbox.east - bbox.west;
  const midLat = (bbox.north + bbox.south) / 2;
  const midLng = (bbox.east + bbox.west) / 2;
  const halfLat = (latSpan * fraction) / 2;
  const halfLng = (lngSpan * fraction) / 2;
  return {
    south: midLat - halfLat,
    north: midLat + halfLat,
    west: midLng - halfLng,
    east: midLng + halfLng,
  };
}

export function overpassBBoxString(bbox: BBox): string {
  // Overpass: south,west,north,east (fixed precision for stable cache keys)
  const f = (n: number) => n.toFixed(6);
  return `${f(bbox.south)},${f(bbox.west)},${f(bbox.north)},${f(bbox.east)}`;
}
