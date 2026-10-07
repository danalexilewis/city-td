import { describe, expect, it } from "vitest";

import { BALANCE } from "../balance/config.js";
import {
  applyBaseRefill,
  collectFromStock,
  initialSiteStock,
  isCollectOffCooldown,
  presenceBonusAmounts,
} from "../stock/stockMaths.js";

describe("stock maths", () => {
  it("initialises a full stock shaped by site yield", () => {
    const stop = initialSiteStock({ siteType: "stop" });
    const intersection = initialSiteStock({ siteType: "intersection" });
    expect(stop.materials).toBeGreaterThan(intersection.materials);
    expect(intersection.ammo).toBeGreaterThan(stop.ammo);
  });

  it("lazily refills toward capacity over time", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const later = new Date("2026-01-01T01:00:00Z");
    const empty = {
      materials: 0,
      ammo: 0,
      power: 0,
      refreshedAt: now,
    };
    const refilled = applyBaseRefill({
      stock: empty,
      siteType: "landmark",
      now: later,
    });
    expect(refilled.power).toBeGreaterThan(refilled.materials);
    expect(refilled.refreshedAt).toEqual(later);
  });

  it("collects up to takePerVisit without going negative", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const stock = {
      materials: 3,
      ammo: 50,
      power: 50,
      refreshedAt: now,
    };
    const { taken, stockAfter } = collectFromStock({
      stock,
      siteType: "landmark",
      now,
      balance: {
        ...BALANCE,
        // Equal weights: capacity stays at the base 100 per resource.
        yieldsBySiteType: {
          ...BALANCE.yieldsBySiteType,
          landmark: { materials: 1, ammo: 1, power: 1 },
        },
      },
    });
    expect(taken.materials).toBe(3);
    expect(taken.ammo).toBe(BALANCE.collect.takePerVisit.ammo);
    expect(stockAfter.materials).toBe(0);
    expect(stockAfter.ammo).toBe(50 - BALANCE.collect.takePerVisit.ammo);
  });

  it("enforces the 60-minute collect cooldown", () => {
    const now = new Date("2026-01-01T01:00:00Z");
    expect(
      isCollectOffCooldown({
        lastCollectedAt: new Date("2026-01-01T00:30:00Z"),
        now,
      }),
    ).toBe(false);
    expect(
      isCollectOffCooldown({
        lastCollectedAt: new Date("2026-01-01T00:00:00Z"),
        now,
      }),
    ).toBe(true);
    expect(isCollectOffCooldown({ lastCollectedAt: null, now })).toBe(true);
  });

  it("scales presence bonus by player count and site mix", () => {
    const bonus = presenceBonusAmounts({
      siteType: "station",
      playerCount: 2,
    });
    expect(bonus.materials).toBeGreaterThan(bonus.ammo);
    expect(bonus.materials).toBeGreaterThan(0);
  });
});
