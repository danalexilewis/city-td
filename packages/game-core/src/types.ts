/** WGS84 latitude/longitude in degrees. */
export type LatLng = {
  lat: number;
  lng: number;
};

/** GeoJSON-style [lng, lat] coordinate. */
export type LngLat = [number, number];

/** Resource kinds used by the economy. */
export type ResourceKind = "materials" | "ammo" | "power";

/** Amount of each resource. */
export type ResourceAmounts = Record<ResourceKind, number>;

/** Structure kinds placeable on a plot cell. */
export type StructureType = "wall" | "turret" | "garrison";

/** Site source categories used for yield mixes. */
export type SiteType =
  | "intersection"
  | "landmark"
  | "stop"
  | "station"
  | "own";

/** Opaque cell id string (H3 index or `z/x/y` square tile). */
export type CellId = string;

/** Which grid adapter is active. */
export type GridKind = "h3" | "square";

/** Shared grid adapter surface used by plots, boards, and the map. */
export type GridAdapter = {
  readonly kind: GridKind;
  /** Primary resolution / zoom used for playable cells. */
  readonly resolution: number;
  cellAt(point: LatLng): CellId;
  centreOf(cellId: CellId): LatLng;
  parentCell(cellId: CellId, parentResolution: number): CellId;
  disk(cellId: CellId, ringCount: number): CellId[];
  areNeighbors(a: CellId, b: CellId): boolean;
  /** GeoJSON MultiPolygon coordinates ([lng, lat] rings). */
  cellsToMultiPolygon(cellIds: readonly CellId[]): LngLat[][][];
  boundary(cellId: CellId): LngLat[];
};

/** One site's plot: the site cell plus rings around it. */
export type Plot = {
  siteId: string;
  siteCell: CellId;
  cells: CellId[];
};

/** Merged group of touching plots; boards have no rules of their own. */
export type Board = {
  id: string;
  siteIds: string[];
  cells: CellId[];
};

/** Structure row fields needed to derive active / rubble / cleared. */
export type StructureTimestamps = {
  health: number;
  lastCaredAt: Date;
  /** Set when health hits zero; null while still positive. */
  zeroedAt: Date | null;
};

export type StructureState = "active" | "rubble" | "cleared";

/** Stock row fields used by lazy refill maths. */
export type SiteStock = ResourceAmounts & {
  refreshedAt: Date;
};

export type SpeedGateState = "open" | "locked";

export type SpeedSample = {
  /** Instantaneous speed in km/h. */
  speedKmh: number;
  /** Sample time in epoch milliseconds. */
  atMs: number;
};
