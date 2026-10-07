import { describe, expect, it } from "vitest";

import { BALANCE, scaleBySiteYield } from "../balance/config.js";
import { isWithinReach } from "../geo.js";

describe("balance defaults", () => {
  it("locks the key POC numbers from the plan", () => {
    expect(BALANCE.grid.h3Resolution).toBe(12);
    expect(BALANCE.grid.squareZoom).toBe(21);
    expect(BALANCE.grid.plotRings).toBe(2);
    expect(BALANCE.reach.actionRadiusM).toBe(40);
    expect(BALANCE.speedGate.lockKmh).toBe(10);
    expect(BALANCE.speedGate.unlockKmh).toBe(8);
    expect(BALANCE.speedGate.windowMs).toBe(5_000);
    expect(BALANCE.collect.cooldownMs).toBe(60 * 60 * 1000);
    expect(BALANCE.structures.neglectRubbleAfterMs).toBe(28 * 24 * 60 * 60 * 1000);
    expect(BALANCE.structures.rubbleClearAfterMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(BALANCE.structures.boostDurationMs).toBe(24 * 60 * 60 * 1000);
    expect(BALANCE.camera.buildFromZoom).toBe(17);
    expect(BALANCE.camera.plotsVisibleFromZoom).toBe(16.5);
    // Keep in sync with supabase game_config cost_* / repair_materials_per_hp.
    expect(BALANCE.structures.costs.wall.materials).toBe(20);
    expect(BALANCE.structures.costs.turret.materials).toBe(40);
    expect(BALANCE.structures.costs.garrison.materials).toBe(60);
    expect(BALANCE.structures.repairMaterialsPerHealth).toBe(0.5);
  });

  it("checks reach with haversine metres", () => {
    const origin = { lat: -41.2889, lng: 174.7772 };
    const near = { lat: -41.2889, lng: 174.7775 }; // ~25 m
    const far = { lat: -41.2895, lng: 174.7772 }; // ~67 m
    expect(
      isWithinReach({
        origin,
        point: near,
        radiusM: BALANCE.reach.actionRadiusM,
      }),
    ).toBe(true);
    expect(
      isWithinReach({
        origin,
        point: far,
        radiusM: BALANCE.reach.actionRadiusM,
      }),
    ).toBe(false);
  });

  it("weights landmark yields toward power", () => {
    const scaled = scaleBySiteYield({
      base: { materials: 30, ammo: 30, power: 30 },
      siteType: "landmark",
    });
    expect(scaled.power).toBeGreaterThan(scaled.materials);
    expect(scaled.power).toBeGreaterThan(scaled.ammo);
  });
});
