import { h3Adapter } from '@city-td/game-core';

import type { StructureRow } from '@/lib/structures/types';
import {
  ammoCapacityFor,
  isBoosted,
  structureViewState,
} from '@/lib/structures/viewState';
import { colours } from '@/theme';

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

/**
 * Point features for structure icons, health rings, ammo dots, boost glow.
 */
export function structuresToGeoJSON(
  structures: readonly StructureRow[],
  now: Date = new Date(),
): GeoJSON.FeatureCollection {
  if (structures.length === 0) {
    return EMPTY_FC;
  }

  return {
    type: 'FeatureCollection',
    features: structures.flatMap((row) => {
      const state = structureViewState(row, now);
      if (state === 'cleared') {
        return [];
      }

      const centre = h3Adapter.centreOf(row.cell_r12);
      const health = Number(row.health);
      const maxHealth = Number(row.max_health);
      const healthRatio = maxHealth > 0 ? health / maxHealth : 0;
      const ammo = Number(row.ammo);
      const capacity = ammoCapacityFor(row.type);
      const ammoRatio = capacity > 0 ? Math.min(1, ammo / capacity) : 0;
      const ammoDots = ammoDotCount(ammo, capacity);
      const boosted = state === 'active' && isBoosted(row, now);
      const icon =
        state === 'rubble' ? 'structure-rubble' : `structure-${row.type}`;

      return [
        {
          type: 'Feature' as const,
          id: row.id,
          properties: {
            structureId: row.id,
            cellId: row.cell_r12,
            type: row.type,
            state,
            icon,
            healthRatio,
            ammo,
            ammoRatio,
            ammoDots,
            boosted: boosted ? 1 : 0,
            ownerId: row.owner_id,
          },
          geometry: {
            type: 'Point' as const,
            coordinates: [centre.lng, centre.lat],
          },
        },
      ];
    }),
  };
}

/** Up to 5 dots for the ammo text layer. */
function ammoDotCount(ammo: number, capacity: number): string {
  if (capacity <= 0) {
    return '';
  }
  const filled = Math.round((ammo / capacity) * 5);
  const clamped = Math.max(0, Math.min(5, filled));
  if (clamped === 0 && ammo > 0) {
    return '·';
  }
  return '●'.repeat(clamped);
}

export const STRUCTURE_HEALTH_COLORS = {
  low: colours.danger,
  mid: colours.path,
  high: colours.success,
} as const;
