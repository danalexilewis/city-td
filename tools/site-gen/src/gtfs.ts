import AdmZip from "adm-zip";

import { cachedFetch } from "./cache.js";
import { METLINK_GTFS_URL, STATION_ROUTE_TYPES } from "./config.js";
import type { CandidateSite } from "./types.js";

type GtfsStop = {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  location_type: number;
  parent_station: string;
};

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const headerLine = lines[0];
  if (!headerLine) return [];
  const headers = splitCsvLine(headerLine);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      row[key] = cells[c] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

/** Minimal CSV splitter that respects double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function zipEntryText(zip: AdmZip, name: string): string {
  const entry =
    zip.getEntry(name) ??
    zip.getEntries().find((e) => e.entryName.endsWith(`/${name}`));
  if (!entry) {
    throw new Error(`GTFS zip missing ${name}`);
  }
  return entry.getData().toString("utf8");
}

function parseStops(text: string): Map<string, GtfsStop> {
  const rows = parseCsv(text);
  const map = new Map<string, GtfsStop>();
  for (const row of rows) {
    const stopId = row.stop_id?.trim();
    if (!stopId) continue;
    const lat = Number(row.stop_lat);
    const lon = Number(row.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    map.set(stopId, {
      stop_id: stopId,
      stop_name: (row.stop_name ?? stopId).trim() || stopId,
      stop_lat: lat,
      stop_lon: lon,
      location_type: Number(row.location_type ?? "0") || 0,
      parent_station: (row.parent_station ?? "").trim(),
    });
  }
  return map;
}

/**
 * stop_id → true when any trip through that stop is on a rail/ferry route.
 */
function railFerryStopIds(args: {
  routesText: string;
  tripsText: string;
  stopTimesText: string;
}): Set<string> {
  const stationRouteIds = new Set<string>();
  for (const row of parseCsv(args.routesText)) {
    const routeId = row.route_id?.trim();
    if (!routeId) continue;
    const routeType = Number(row.route_type);
    if (STATION_ROUTE_TYPES.has(routeType)) {
      stationRouteIds.add(routeId);
    }
  }

  const stationTripIds = new Set<string>();
  for (const row of parseCsv(args.tripsText)) {
    const tripId = row.trip_id?.trim();
    const routeId = row.route_id?.trim();
    if (!tripId || !routeId) continue;
    if (stationRouteIds.has(routeId)) {
      stationTripIds.add(tripId);
    }
  }

  const stopIds = new Set<string>();
  for (const row of parseCsv(args.stopTimesText)) {
    const tripId = row.trip_id?.trim();
    const stopId = row.stop_id?.trim();
    if (!tripId || !stopId) continue;
    if (stationTripIds.has(tripId)) {
      stopIds.add(stopId);
    }
  }
  return stopIds;
}

/**
 * Collapse platforms into their parent station; promote rail/ferry stops
 * to station kind. No cross-source de-duplication.
 */
export function transitSitesFromGtfs(args: {
  stopsText: string;
  routesText: string;
  tripsText: string;
  stopTimesText: string;
}): CandidateSite[] {
  const stops = parseStops(args.stopsText);
  const railFerry = railFerryStopIds({
    routesText: args.routesText,
    tripsText: args.tripsText,
    stopTimesText: args.stopTimesText,
  });

  // If a child platform is rail/ferry, mark the parent too.
  for (const stop of stops.values()) {
    if (railFerry.has(stop.stop_id) && stop.parent_station) {
      railFerry.add(stop.parent_station);
    }
  }

  const candidates: CandidateSite[] = [];
  for (const stop of stops.values()) {
    // Platforms / boarding areas collapse into the parent station.
    if (stop.parent_station) {
      continue;
    }
    // Skip non-stop nodes (entrances, generic nodes, boarding areas).
    if (stop.location_type === 2 || stop.location_type === 3 || stop.location_type === 4) {
      continue;
    }

    const isStation =
      stop.location_type === 1 || railFerry.has(stop.stop_id);

    candidates.push({
      externalId: `gtfs-${stop.stop_id}`,
      name: stop.stop_name,
      siteType: isStation ? "station" : "stop",
      location: { lat: stop.stop_lat, lng: stop.stop_lon },
    });
  }

  return candidates;
}

export async function fetchTransitCandidates(args: {
  forceRefresh?: boolean;
}): Promise<{
  candidates: CandidateSite[];
  fromCache: boolean;
  zipPath: string;
}> {
  const fetchArgs: {
    label: string;
    url: string;
    ext: string;
    forceRefresh?: boolean;
  } = {
    label: "metlink_gtfs",
    url: METLINK_GTFS_URL,
    ext: "zip",
  };
  if (args.forceRefresh) {
    fetchArgs.forceRefresh = true;
  }
  const { path: zipPath, fromCache, body } = await cachedFetch(fetchArgs);

  const zip = new AdmZip(body);
  const candidates = transitSitesFromGtfs({
    stopsText: zipEntryText(zip, "stops.txt"),
    routesText: zipEntryText(zip, "routes.txt"),
    tripsText: zipEntryText(zip, "trips.txt"),
    stopTimesText: zipEntryText(zip, "stop_times.txt"),
  });

  return { candidates, fromCache, zipPath };
}
