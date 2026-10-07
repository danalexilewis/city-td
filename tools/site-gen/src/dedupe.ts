import {
  BALANCE,
  h3Adapter,
  type LatLng,
} from "@city-td/game-core";

import { pointInRegion, type Region } from "./region.js";
import type { CandidateSite, PreparedSite } from "./types.js";

/**
 * Keep one site per H3 r12 cell within a single source.
 * Prefer named sites over generic fallbacks; otherwise first wins.
 */
export function dedupeByH3Cell(
  candidates: readonly CandidateSite[],
): PreparedSite[] {
  const parentRes = BALANCE.grid.h3ParentResolution;
  const best = new Map<string, PreparedSite>();

  for (const candidate of candidates) {
    const cellR12 = h3Adapter.cellAt(candidate.location);
    const cellR7 = h3Adapter.parentCell(cellR12, parentRes);
    const prepared: PreparedSite = {
      ...candidate,
      cellR12,
      cellR7,
    };
    const existing = best.get(cellR12);
    if (!existing) {
      best.set(cellR12, prepared);
      continue;
    }
    if (isBetterName(prepared.name, existing.name)) {
      best.set(cellR12, prepared);
    }
  }

  return [...best.values()];
}

function isBetterName(next: string, current: string): boolean {
  const nextGeneric = isGenericName(next);
  const currentGeneric = isGenericName(current);
  if (nextGeneric !== currentGeneric) {
    return !nextGeneric;
  }
  return next.length > current.length;
}

function isGenericName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return (
    n === "intersection" ||
    n === "landmark" ||
    n === "park" ||
    n === "stop" ||
    n === "station"
  );
}

export function clipToRegion(
  candidates: readonly CandidateSite[],
  region: Region,
): { kept: CandidateSite[]; clippedOut: number } {
  const kept: CandidateSite[] = [];
  let clippedOut = 0;
  for (const c of candidates) {
    if (pointInRegion(c.location, region)) {
      kept.push(c);
    } else {
      clippedOut += 1;
    }
  }
  return { kept, clippedOut };
}

export function prepareSites(
  candidates: readonly CandidateSite[],
  region: Region,
): { sites: PreparedSite[]; clippedOut: number } {
  const { kept, clippedOut } = clipToRegion(candidates, region);
  return { sites: dedupeByH3Cell(kept), clippedOut };
}

export function siteRef(source: "osm" | "transit", id: string): string {
  return `${source}:${id}`;
}

export function wktPoint(location: LatLng): string {
  return `SRID=4326;POINT(${location.lng} ${location.lat})`;
}
