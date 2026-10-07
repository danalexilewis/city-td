import type {
  ResourceAmounts,
  SiteType,
  StructureType,
} from "../types.js";

/** Tunable POC defaults from the City TD plan. */
export type BalanceConfig = {
  grid: {
    h3Resolution: number;
    h3ParentResolution: number;
    squareZoom: number;
    /** Rings around the site cell (H3: 19 cells; square: 5×5). */
    plotRings: number;
    /** Max metres from site point to any plot cell centre on propose/approve. */
    plotCellMaxDistanceM: number;
  };
  reach: {
    /** Interaction radius around the player in metres. */
    actionRadiusM: number;
  };
  camera: {
    streetMinZoom: number;
    streetMaxZoom: number;
    streetDefaultZoom: number;
    overviewMinZoom: number;
    overviewMaxZoom: number;
    plotsVisibleFromZoom: number;
    buildFromZoom: number;
  };
  speedGate: {
    lockKmh: number;
    unlockKmh: number;
    windowMs: number;
  };
  collect: {
    cooldownMs: number;
    /** Max taken per resource on one visit (first come, first served). */
    takePerVisit: ResourceAmounts;
  };
  stock: {
    /** Soft cap per resource while refilling. */
    capacity: ResourceAmounts;
    /** Base refill per hour when idle (lazy-applied on collect). */
    baseRefillPerHour: ResourceAmounts;
    /** Extra refill per nearby player per minute (server cron). */
    presenceBonusPerMinute: ResourceAmounts;
    /** Starting fill when a site is created. */
    initialFill: ResourceAmounts;
  };
  /** Relative mix by site type; normalised when applied to rates/fills. */
  yieldsBySiteType: Record<SiteType, ResourceAmounts>;
  presence: {
    heartbeatIntervalMs: number;
    staleAfterMs: number;
  };
  structures: {
    costs: Record<StructureType, ResourceAmounts>;
    maxHealth: Record<StructureType, number>;
    ammoCapacity: Record<"turret" | "garrison", number>;
    boostDurationMs: number;
    neglectRubbleAfterMs: number;
    rubbleClearAfterMs: number;
    rebuildCostFactor: number;
    repairMaterialsPerHealth: number;
    loadAmmoPerAction: number;
  };
  raids: {
    intervalHintMs: number;
    fractionOfStructures: number;
    minDamageFraction: number;
    maxDamageFraction: number;
  };
};

export const BALANCE: BalanceConfig = {
  grid: {
    h3Resolution: 12,
    h3ParentResolution: 7,
    squareZoom: 21,
    plotRings: 2,
    plotCellMaxDistanceM: 50,
  },
  reach: {
    actionRadiusM: 40,
  },
  camera: {
    streetMinZoom: 16.5,
    streetMaxZoom: 18,
    streetDefaultZoom: 17.25,
    overviewMinZoom: 9,
    overviewMaxZoom: 16,
    plotsVisibleFromZoom: 16.5,
    buildFromZoom: 17,
  },
  speedGate: {
    lockKmh: 10,
    unlockKmh: 8,
    windowMs: 5_000,
  },
  collect: {
    cooldownMs: 60 * 60 * 1000,
    takePerVisit: {
      materials: 10,
      ammo: 10,
      power: 10,
    },
  },
  stock: {
    capacity: {
      materials: 100,
      ammo: 100,
      power: 100,
    },
    baseRefillPerHour: {
      materials: 20,
      ammo: 20,
      power: 20,
    },
    presenceBonusPerMinute: {
      materials: 1,
      ammo: 1,
      power: 1,
    },
    initialFill: {
      materials: 100,
      ammo: 100,
      power: 100,
    },
  },
  yieldsBySiteType: {
    // Stops/stations → mostly materials; intersections → ammo; landmarks/own → power.
    intersection: { materials: 1, ammo: 3, power: 1 },
    landmark: { materials: 1, ammo: 1, power: 3 },
    stop: { materials: 3, ammo: 1, power: 1 },
    station: { materials: 3, ammo: 1, power: 1 },
    own: { materials: 1, ammo: 1, power: 3 },
  },
  presence: {
    heartbeatIntervalMs: 15_000,
    staleAfterMs: 2 * 60 * 1000,
  },
  structures: {
    costs: {
      wall: { materials: 20, ammo: 0, power: 0 },
      turret: { materials: 40, ammo: 0, power: 0 },
      garrison: { materials: 60, ammo: 0, power: 0 },
    },
    maxHealth: {
      wall: 100,
      turret: 80,
      garrison: 120,
    },
    ammoCapacity: {
      turret: 50,
      garrison: 100,
    },
    boostDurationMs: 24 * 60 * 60 * 1000,
    neglectRubbleAfterMs: 28 * 24 * 60 * 60 * 1000,
    rubbleClearAfterMs: 7 * 24 * 60 * 60 * 1000,
    rebuildCostFactor: 0.5,
    repairMaterialsPerHealth: 0.5,
    loadAmmoPerAction: 10,
  },
  raids: {
    intervalHintMs: 3 * 60 * 60 * 1000,
    fractionOfStructures: 0.1,
    minDamageFraction: 0.05,
    maxDamageFraction: 0.15,
  },
};

/**
 * Redistribute a base resource vector by site-type yield weights.
 * Preserves the total across materials+ammo+power; equal weights leave
 * equal bases unchanged.
 */
export function scaleBySiteYield(args: {
  base: ResourceAmounts;
  siteType: SiteType;
  balance?: BalanceConfig;
}): ResourceAmounts {
  const balance = args.balance ?? BALANCE;
  const mix = balance.yieldsBySiteType[args.siteType];
  const total = mix.materials + mix.ammo + mix.power;
  if (total <= 0) {
    return { materials: 0, ammo: 0, power: 0 };
  }
  const pool =
    args.base.materials + args.base.ammo + args.base.power;
  return {
    materials: (pool * mix.materials) / total,
    ammo: (pool * mix.ammo) / total,
    power: (pool * mix.power) / total,
  };
}

/** Half-cost materials for rebuilding rubble (other resources stay zero). */
export function rebuildCost(args: {
  type: StructureType;
  balance?: BalanceConfig;
}): ResourceAmounts {
  const balance = args.balance ?? BALANCE;
  const full = balance.structures.costs[args.type];
  const factor = balance.structures.rebuildCostFactor;
  return {
    materials: full.materials * factor,
    ammo: full.ammo * factor,
    power: full.power * factor,
  };
}
