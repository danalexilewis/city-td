import {
  BALANCE,
  distanceMetres,
  h3Adapter,
  isWithinReach,
} from '@city-td/game-core';

import type { PlayerPose } from '@/lib/structures/types';

/**
 * Client-side reach check against an H3 cell centre (~40 m).
 * Server still enforces reach on every mutating RPC.
 */
export function isWithinCellReach(args: {
  player: PlayerPose | null;
  cellR12: string;
  radiusM?: number;
}): boolean {
  if (!args.player) {
    return false;
  }

  const centre = h3Adapter.centreOf(args.cellR12);
  return isWithinReach({
    origin: { lat: args.player.lat, lng: args.player.lng },
    point: centre,
    radiusM: args.radiusM ?? BALANCE.reach.actionRadiusM,
  });
}

/** Distance in metres from player to cell centre, or null without a pose. */
export function metresToCell(args: {
  player: PlayerPose | null;
  cellR12: string;
}): number | null {
  if (!args.player) {
    return null;
  }
  const centre = h3Adapter.centreOf(args.cellR12);
  return distanceMetres(
    { lat: args.player.lat, lng: args.player.lng },
    centre,
  );
}
