/**
 * @city-td/game-core — pure TypeScript game maths for the Expo app and site-gen.
 * No React, no Node APIs.
 */

export {
  BALANCE,
  rebuildCost,
  scaleBySiteYield,
  type BalanceConfig,
} from "./balance/config.js";

export { distanceMetres, isWithinReach } from "./geo.js";

export { createH3Adapter, h3Adapter } from "./grid/h3Adapter.js";
export {
  createSquareAdapter,
  latLngToTile,
  squareAdapter,
  tileToLatLng,
} from "./grid/squareAdapter.js";

export { boardOutline, mergePlotsIntoBoards } from "./plots/boards.js";
export {
  buildPlot,
  buildPlots,
  validatePlotCellsNearSite,
  type SiteForPlot,
} from "./plots/plots.js";

export {
  createSpeedGate,
  type SpeedGate,
  type SpeedGateOptions,
} from "./speed/speedGate.js";

export {
  applyBaseRefill,
  applyPresenceBonus,
  collectFromStock,
  initialSiteStock,
  isCollectOffCooldown,
  presenceBonusAmounts,
  type CollectResult,
} from "./stock/stockMaths.js";

export {
  applyDamage,
  canRebuildRubble,
  markCared,
  rubbleStartedAt,
  structureStateAt,
} from "./structures/structureState.js";

export type {
  Board,
  CellId,
  GridAdapter,
  GridKind,
  LatLng,
  LngLat,
  Plot,
  ResourceAmounts,
  ResourceKind,
  SiteStock,
  SiteType,
  SpeedGateState,
  SpeedSample,
  StructureState,
  StructureTimestamps,
  StructureType,
} from "./types.js";

export { metresPerPoint, metresToPoints } from "./zoom/metresPerPoint.js";
