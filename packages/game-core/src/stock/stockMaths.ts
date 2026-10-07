import {
  BALANCE,
  scaleBySiteYield,
  type BalanceConfig,
} from "../balance/config.js";
import type {
  ResourceAmounts,
  ResourceKind,
  SiteStock,
  SiteType,
} from "../types.js";

const RESOURCE_KINDS: ResourceKind[] = ["materials", "ammo", "power"];

function clampResource(value: number, max: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function emptyAmounts(): ResourceAmounts {
  return { materials: 0, ammo: 0, power: 0 };
}

function mapAmounts(
  amounts: ResourceAmounts,
  mapFn: (value: number, kind: ResourceKind) => number,
): ResourceAmounts {
  return {
    materials: mapFn(amounts.materials, "materials"),
    ammo: mapFn(amounts.ammo, "ammo"),
    power: mapFn(amounts.power, "power"),
  };
}

/** Initial full stock for a newly created site, shaped by site-type yield. */
export function initialSiteStock(args: {
  siteType: SiteType;
  now?: Date;
  balance?: BalanceConfig;
}): SiteStock {
  const balance = args.balance ?? BALANCE;
  const fill = scaleBySiteYield({
    base: balance.stock.initialFill,
    siteType: args.siteType,
    balance,
  });
  const capacity = scaleBySiteYield({
    base: balance.stock.capacity,
    siteType: args.siteType,
    balance,
  });
  return {
    ...mapAmounts(fill, (value, kind) =>
      clampResource(value, capacity[kind]),
    ),
    refreshedAt: args.now ?? new Date(),
  };
}

/**
 * Lazy base refill between `refreshedAt` and `now`, capped at capacity.
 * Presence bonuses are applied separately by the server cron.
 */
export function applyBaseRefill(args: {
  stock: SiteStock;
  siteType: SiteType;
  now: Date;
  balance?: BalanceConfig;
}): SiteStock {
  const balance = args.balance ?? BALANCE;
  const elapsedMs = Math.max(
    0,
    args.now.getTime() - args.stock.refreshedAt.getTime(),
  );
  const hours = elapsedMs / (60 * 60 * 1000);
  const rate = scaleBySiteYield({
    base: balance.stock.baseRefillPerHour,
    siteType: args.siteType,
    balance,
  });
  const capacity = scaleBySiteYield({
    base: balance.stock.capacity,
    siteType: args.siteType,
    balance,
  });

  return {
    materials: clampResource(
      args.stock.materials + rate.materials * hours,
      capacity.materials,
    ),
    ammo: clampResource(args.stock.ammo + rate.ammo * hours, capacity.ammo),
    power: clampResource(
      args.stock.power + rate.power * hours,
      capacity.power,
    ),
    refreshedAt: args.now,
  };
}

/** Presence bonus for one minute with `playerCount` players in the plot. */
export function presenceBonusAmounts(args: {
  siteType: SiteType;
  playerCount: number;
  balance?: BalanceConfig;
}): ResourceAmounts {
  const balance = args.balance ?? BALANCE;
  if (args.playerCount <= 0) {
    return emptyAmounts();
  }
  const perPlayer = scaleBySiteYield({
    base: balance.stock.presenceBonusPerMinute,
    siteType: args.siteType,
    balance,
  });
  return mapAmounts(perPlayer, (value) => value * args.playerCount);
}

export function applyPresenceBonus(args: {
  stock: SiteStock;
  siteType: SiteType;
  playerCount: number;
  balance?: BalanceConfig;
}): SiteStock {
  const balance = args.balance ?? BALANCE;
  const bonus = presenceBonusAmounts({
    siteType: args.siteType,
    playerCount: args.playerCount,
    balance,
  });
  const capacity = scaleBySiteYield({
    base: balance.stock.capacity,
    siteType: args.siteType,
    balance,
  });
  return {
    materials: clampResource(
      args.stock.materials + bonus.materials,
      capacity.materials,
    ),
    ammo: clampResource(args.stock.ammo + bonus.ammo, capacity.ammo),
    power: clampResource(args.stock.power + bonus.power, capacity.power),
    refreshedAt: args.stock.refreshedAt,
  };
}

export type CollectResult = {
  taken: ResourceAmounts;
  stockAfter: SiteStock;
};

/**
 * First-come collect: refill lazily, then take up to `takePerVisit` per
 * resource without going negative.
 */
export function collectFromStock(args: {
  stock: SiteStock;
  siteType: SiteType;
  now: Date;
  balance?: BalanceConfig;
}): CollectResult {
  const balance = args.balance ?? BALANCE;
  const refilled = applyBaseRefill({
    stock: args.stock,
    siteType: args.siteType,
    now: args.now,
    balance,
  });
  const takeCap = balance.collect.takePerVisit;
  const taken = emptyAmounts();
  const stockAfter = { ...refilled };

  for (const kind of RESOURCE_KINDS) {
    const amount = Math.min(refilled[kind], takeCap[kind]);
    taken[kind] = amount;
    stockAfter[kind] = refilled[kind] - amount;
  }

  return { taken, stockAfter };
}

/** True when the player may collect again (outside cooldown). */
export function isCollectOffCooldown(args: {
  lastCollectedAt: Date | null;
  now: Date;
  balance?: BalanceConfig;
}): boolean {
  const balance = args.balance ?? BALANCE;
  if (args.lastCollectedAt === null) {
    return true;
  }
  return (
    args.now.getTime() - args.lastCollectedAt.getTime() >=
    balance.collect.cooldownMs
  );
}
