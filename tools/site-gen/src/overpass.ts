import type { LatLng } from "@city-td/game-core";

import { cachedOverpass } from "./cache.js";
import {
  INTERSECTION_HIGHWAYS,
  LANDMARK_TAGS,
  OVERPASS_URL,
} from "./config.js";
import { overpassBBoxString, type Region } from "./region.js";
import type { BBox, CandidateSite, LandmarkTag } from "./types.js";

type OverpassNode = {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
};

type OverpassWay = {
  type: "way";
  id: number;
  nodes?: number[];
  center?: { lat: number; lon: number };
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
};

type OverpassRelation = {
  type: "relation";
  id: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OverpassElement = OverpassNode | OverpassWay | OverpassRelation;

type OverpassResponse = {
  elements: OverpassElement[];
};

function highwayRegex(): string {
  return INTERSECTION_HIGHWAYS.join("|");
}

/**
 * Average of ring vertices — good enough interior-ish point for POC parks.
 * Prefer Overpass `center` when present.
 */
function ringCentroid(
  points: Array<{ lat: number; lon: number }>,
): LatLng | null {
  if (points.length === 0) return null;
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    lat += p.lat;
    lng += p.lon;
  }
  return { lat: lat / points.length, lng: lng / points.length };
}

function elementPoint(el: OverpassElement): LatLng | null {
  if (el.type === "node") {
    return { lat: el.lat, lng: el.lon };
  }
  if (el.center) {
    return { lat: el.center.lat, lng: el.center.lon };
  }
  if (el.type === "way" && el.geometry && el.geometry.length > 0) {
    return ringCentroid(el.geometry);
  }
  return null;
}

function displayName(
  tags: Record<string, string> | undefined,
  fallback: string,
): string {
  const name = tags?.name?.trim();
  if (name) return name;
  return fallback;
}

function buildIntersectionQuery(bbox: BBox): string {
  const bb = overpassBBoxString(bbox);
  const hw = highwayRegex();
  return `
[out:json][timeout:300];
(
  way["highway"~"^(${hw})$"](${bb});
);
out body;
>;
out skel qt;
`.trim();
}

function buildLandmarkQuery(bbox: BBox, tags: LandmarkTag[]): string {
  const bb = overpassBBoxString(bbox);
  const parts = tags
    .map((t) => `  nwr["${t.key}"="${t.value}"](${bb});`)
    .join("\n");
  return `
[out:json][timeout:300];
(
${parts}
);
out center tags;
`.trim();
}

/**
 * Nodes shared by 2+ residential+ roads (service/driveway/footpath skipped
 * because those highways are not in INTERSECTION_HIGHWAYS).
 */
export function intersectionsFromOverpassJson(
  json: OverpassResponse,
): CandidateSite[] {
  const ways = json.elements.filter(
    (el): el is OverpassWay => el.type === "way" && Array.isArray(el.nodes),
  );
  const nodes = new Map<number, OverpassNode>();
  for (const el of json.elements) {
    if (el.type === "node") {
      nodes.set(el.id, el);
    }
  }

  const wayCount = new Map<number, number>();
  for (const way of ways) {
    const seenInWay = new Set<number>();
    for (const nodeId of way.nodes ?? []) {
      if (seenInWay.has(nodeId)) continue;
      seenInWay.add(nodeId);
      wayCount.set(nodeId, (wayCount.get(nodeId) ?? 0) + 1);
    }
  }

  const candidates: CandidateSite[] = [];
  for (const [nodeId, count] of wayCount) {
    if (count < 2) continue;
    const node = nodes.get(nodeId);
    if (!node) continue;
    candidates.push({
      externalId: `osm-node-${nodeId}`,
      name: displayName(node.tags, "Intersection"),
      siteType: "intersection",
      location: { lat: node.lat, lng: node.lon },
    });
  }
  return candidates;
}

function landmarkFallbackLabel(
  tags: Record<string, string> | undefined,
  configured: LandmarkTag[],
): string {
  if (!tags) return "Landmark";
  for (const rule of configured) {
    if (tags[rule.key] === rule.value) {
      return rule.label ?? rule.value;
    }
  }
  return "Landmark";
}

export function landmarksFromOverpassJson(
  json: OverpassResponse,
  configured: LandmarkTag[] = LANDMARK_TAGS,
): CandidateSite[] {
  const candidates: CandidateSite[] = [];
  for (const el of json.elements) {
    const location = elementPoint(el);
    if (!location) continue;
    const fallback = landmarkFallbackLabel(el.tags, configured);
    candidates.push({
      externalId: `osm-${el.type}-${el.id}`,
      name: displayName(el.tags, fallback),
      siteType: "landmark",
      location,
    });
  }
  return candidates;
}

export async function fetchOsmCandidates(args: {
  region: Region;
  bbox?: BBox;
  forceRefresh?: boolean;
  landmarkTags?: LandmarkTag[];
}): Promise<{
  intersections: CandidateSite[];
  landmarks: CandidateSite[];
  fromCache: { intersections: boolean; landmarks: boolean };
}> {
  const bbox = args.bbox ?? args.region.bbox;
  const landmarkTags = args.landmarkTags ?? LANDMARK_TAGS;

  const intersectionQuery = buildIntersectionQuery(bbox);
  const landmarkQuery = buildLandmarkQuery(bbox, landmarkTags);

  // Sequential: public Overpass mirrors rate-limit / 504 under parallel load.
  const overpassOpts = args.forceRefresh ? { forceRefresh: true as const } : {};
  const intersectionCache = await cachedOverpass({
    label: "overpass_intersections",
    url: OVERPASS_URL,
    query: intersectionQuery,
    ...overpassOpts,
  });
  const landmarkCache = await cachedOverpass({
    label: "overpass_landmarks",
    url: OVERPASS_URL,
    query: landmarkQuery,
    ...overpassOpts,
  });

  const intersectionJson = JSON.parse(
    intersectionCache.body.toString("utf8"),
  ) as OverpassResponse;
  const landmarkJson = JSON.parse(
    landmarkCache.body.toString("utf8"),
  ) as OverpassResponse;

  return {
    intersections: intersectionsFromOverpassJson(intersectionJson),
    landmarks: landmarksFromOverpassJson(landmarkJson, landmarkTags),
    fromCache: {
      intersections: intersectionCache.fromCache,
      landmarks: landmarkCache.fromCache,
    },
  };
}
