import { BALANCE } from '@city-td/game-core';

/** Default map centre: Wellington CBD (Lambton Quay). */
export const WELLINGTON_CENTER = {
  lat: -41.2865,
  lng: 174.7762,
} as const;

/** Approx cell width in metres (H3 r12 / square z21), from the plan. */
export const APPROX_CELL_METRES = 19;

export const MAP_ATTRIBUTION =
  '© OpenStreetMap contributors © OpenFreeMap © OpenMapTiles';

export const CAMERA = BALANCE.camera;

export type CameraMode = 'street' | 'overview';
