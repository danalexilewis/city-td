import { BALANCE, type BalanceConfig } from "../balance/config.js";
import type {
  StructureState,
  StructureTimestamps,
} from "../types.js";

/**
 * Rubble starts at the earlier of `zeroedAt` or `lastCaredAt + 28 days`.
 * Cleared 7 days after becoming rubble.
 */
export function rubbleStartedAt(args: {
  structure: StructureTimestamps;
  balance?: BalanceConfig;
}): Date | null {
  const balance = args.balance ?? BALANCE;
  const neglectAt = new Date(
    args.structure.lastCaredAt.getTime() +
      balance.structures.neglectRubbleAfterMs,
  );

  const candidates: Date[] = [neglectAt];
  if (args.structure.health <= 0 && args.structure.zeroedAt !== null) {
    candidates.push(args.structure.zeroedAt);
  } else if (args.structure.health <= 0 && args.structure.zeroedAt === null) {
    // Health is already zero but zeroedAt was not set — treat "now" callers
    // should pass an explicit zeroedAt; fall back to lastCaredAt.
    candidates.push(args.structure.lastCaredAt);
  }

  let earliest = candidates[0]!;
  for (const candidate of candidates) {
    if (candidate.getTime() < earliest.getTime()) {
      earliest = candidate;
    }
  }
  return earliest;
}

export function structureStateAt(args: {
  structure: StructureTimestamps;
  now: Date;
  balance?: BalanceConfig;
}): StructureState {
  const balance = args.balance ?? BALANCE;
  const rubbleAt = rubbleStartedAt({
    structure: args.structure,
    balance,
  });
  if (rubbleAt === null) {
    return "active";
  }
  const nowMs = args.now.getTime();
  if (nowMs < rubbleAt.getTime()) {
    return "active";
  }
  const clearedAt = rubbleAt.getTime() + balance.structures.rubbleClearAfterMs;
  if (nowMs >= clearedAt) {
    return "cleared";
  }
  return "rubble";
}

/** True while rubble can still be rebuilt (before cleared). */
export function canRebuildRubble(args: {
  structure: StructureTimestamps;
  now: Date;
  balance?: BalanceConfig;
}): boolean {
  const state = args.balance
    ? structureStateAt({
        structure: args.structure,
        now: args.now,
        balance: args.balance,
      })
    : structureStateAt({
        structure: args.structure,
        now: args.now,
      });
  return state === "rubble";
}

/**
 * Apply damage; when health crosses to zero, stamp `zeroedAt` if missing.
 * Does not change `lastCaredAt` (raids are not care).
 */
export function applyDamage(args: {
  structure: StructureTimestamps;
  damage: number;
  now: Date;
}): StructureTimestamps {
  const nextHealth = Math.max(0, args.structure.health - args.damage);
  if (nextHealth > 0) {
    return { ...args.structure, health: nextHealth };
  }
  return {
    ...args.structure,
    health: 0,
    zeroedAt: args.structure.zeroedAt ?? args.now,
  };
}

/** Repair / load / boost: restore care clock and clear zeroedAt when healed. */
export function markCared(args: {
  structure: StructureTimestamps;
  now: Date;
  health?: number;
}): StructureTimestamps {
  const health = args.health ?? args.structure.health;
  return {
    health,
    lastCaredAt: args.now,
    zeroedAt: health > 0 ? null : args.structure.zeroedAt,
  };
}
