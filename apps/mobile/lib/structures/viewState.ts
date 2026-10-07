import {
  BALANCE,
  canRebuildRubble,
  h3Adapter,
  structureStateAt,
  type StructureState,
  type StructureType,
} from '@city-td/game-core';

import type { StructureRow } from '@/lib/structures/types';

/** Derive active / rubble / cleared from structure timestamps. */
export function structureViewState(
  row: StructureRow,
  now: Date = new Date(),
): StructureState {
  return structureStateAt({
    structure: {
      health: Number(row.health),
      lastCaredAt: new Date(row.last_cared_at),
      zeroedAt: row.zeroed_at ? new Date(row.zeroed_at) : null,
    },
    now,
  });
}

/** Drop cleared rows; keep active + rebuildable rubble. */
export function filterVisibleStructures(
  rows: readonly StructureRow[],
  now: Date = new Date(),
): StructureRow[] {
  return rows.filter((row) => {
    const state = structureViewState(row, now);
    return state === 'active' || state === 'rubble';
  });
}

export function isBoosted(row: StructureRow, now: Date = new Date()): boolean {
  if (!row.boosted_until) {
    return false;
  }
  return new Date(row.boosted_until).getTime() > now.getTime();
}

export function canRebuild(row: StructureRow, now: Date = new Date()): boolean {
  return canRebuildRubble({
    structure: {
      health: Number(row.health),
      lastCaredAt: new Date(row.last_cared_at),
      zeroedAt: row.zeroed_at ? new Date(row.zeroed_at) : null,
    },
    now,
  });
}

/** Ammo capacity for turret/garrison; walls have none. */
export function ammoCapacityFor(type: StructureType): number {
  if (type === 'wall') {
    return 0;
  }
  return BALANCE.structures.ammoCapacity[type];
}

/** Parent r7 ids covering sites currently in view (H3 only). */
export function r7ParentsInView(args: {
  sites: readonly {
    cellR7: string | null;
    cellR12: string | null;
    lat: number;
    lng: number;
  }[];
}): string[] {
  const parents = new Set<string>();
  const parentRes = BALANCE.grid.h3ParentResolution;

  for (const site of args.sites) {
    if (site.cellR7) {
      parents.add(site.cellR7);
      continue;
    }
    if (site.cellR12) {
      parents.add(h3Adapter.parentCell(site.cellR12, parentRes));
      continue;
    }
    const cell = h3Adapter.cellAt({ lat: site.lat, lng: site.lng });
    parents.add(h3Adapter.parentCell(cell, parentRes));
  }

  return [...parents].sort();
}

export function placeCostMaterials(type: StructureType): number {
  return BALANCE.structures.costs[type].materials;
}

export function rebuildCostMaterials(type: StructureType): number {
  return (
    BALANCE.structures.costs[type].materials *
    BALANCE.structures.rebuildCostFactor
  );
}
