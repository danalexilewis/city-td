import type { LatLng, SiteType } from "@city-td/game-core";

/** Candidate site before H3 dedupe / upsert. */
export type CandidateSite = {
  /** Stable id within the source (OSM node/way id, GTFS stop_id, …). */
  externalId: string;
  name: string;
  siteType: SiteType;
  location: LatLng;
};

/** Site ready to upsert, with H3 cells. */
export type PreparedSite = CandidateSite & {
  cellR12: string;
  cellR7: string;
};

export type SiteSource = "osm" | "transit";

export type OsmSiteKind = "intersection" | "landmark";
export type TransitSiteKind = "stop" | "station";

export type BBox = {
  south: number;
  west: number;
  north: number;
  east: number;
};

/** One OSM landmark tag filter (key=value). */
export type LandmarkTag = {
  key: string;
  value: string;
  /** Optional name prefix when the feature has no name= tag. */
  label?: string;
};

export type PlotCellRow = {
  cell_r12: string;
  site_ref: string;
  cell_r7: string;
  /** PostGIS-friendly WKT point. */
  centre_wkt: string;
};

export type StockRow = {
  site_ref: string;
  materials: number;
  ammo: number;
  power: number;
  capacity_materials: number;
  capacity_ammo: number;
  capacity_power: number;
  refreshed_at: string;
};

export type RunStats = {
  osmCandidates: number;
  transitCandidates: number;
  osmAfterDedupe: number;
  transitAfterDedupe: number;
  osmClippedOut: number;
  transitClippedOut: number;
  plotCells: number;
  stocks: number;
};
