import path from "node:path";
import { fileURLToPath } from "node:url";

import type { LandmarkTag } from "./types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.resolve(here, "..");
export const REGION_GEOJSON_PATH = path.join(PACKAGE_ROOT, "region.geojson");
export const CACHE_DIR = path.join(PACKAGE_ROOT, "cache");

export const OVERPASS_URL =
  process.env.OVERPASS_URL ??
  "https://lz4.overpass-api.de/api/interpreter";

export const METLINK_GTFS_URL =
  process.env.METLINK_GTFS_URL ??
  "https://static.opendata.metlink.org.nz/v1/gtfs/full.zip";

/**
 * Highway classes that count toward intersections.
 * Residential and above, plus pedestrian streets. Service / driveway / footpath skipped.
 */
export const INTERSECTION_HIGHWAYS = [
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
  "living_street",
  "pedestrian",
] as const;

/**
 * Configurable landmark OSM tags (nwr). Area features use an interior/
 * centre point from Overpass `out center` or a computed ring centroid.
 */
export const LANDMARK_TAGS: LandmarkTag[] = [
  { key: "leisure", value: "park", label: "Park" },
  { key: "leisure", value: "playground", label: "Playground" },
  { key: "leisure", value: "garden", label: "Garden" },
  { key: "leisure", value: "nature_reserve", label: "Nature reserve" },
  { key: "tourism", value: "artwork", label: "Artwork" },
  { key: "tourism", value: "museum", label: "Museum" },
  { key: "tourism", value: "viewpoint", label: "Viewpoint" },
  { key: "tourism", value: "attraction", label: "Attraction" },
  { key: "historic", value: "memorial", label: "Memorial" },
  { key: "historic", value: "monument", label: "Monument" },
  { key: "amenity", value: "library", label: "Library" },
  { key: "amenity", value: "theatre", label: "Theatre" },
  { key: "amenity", value: "place_of_worship", label: "Place of worship" },
  { key: "amenity", value: "community_centre", label: "Community centre" },
  { key: "amenity", value: "townhall", label: "Town hall" },
  { key: "landuse", value: "recreation_ground", label: "Recreation ground" },
];

/** GTFS route_type values that promote a stop to station kind. */
export const STATION_ROUTE_TYPES = new Set([
  2, // Rail
  4, // Ferry
  100, // Railway Service (extended)
  101, // High Speed Rail
  102, // Long Distance Rail
  103, // Inter Regional Rail
  106, // Regional Rail
  109, // Suburban Railway
  400, // Urban Railway
  401, // Metro
  402, // Underground
  403, // Urban Railway Service
  1000, // Water Transport
  1200, // Ferry Service
]);

export function loadEnvFromProcess(): {
  supabaseUrl: string | undefined;
  serviceRoleKey: string | undefined;
} {
  return {
    supabaseUrl: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}
