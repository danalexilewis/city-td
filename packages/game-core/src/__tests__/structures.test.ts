import { describe, expect, it } from "vitest";

import { BALANCE, rebuildCost } from "../balance/config.js";
import {
  applyDamage,
  canRebuildRubble,
  markCared,
  structureStateAt,
} from "../structures/structureState.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("structure state", () => {
  it("stays active while healthy and recently cared for", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const state = structureStateAt({
      structure: {
        health: 80,
        lastCaredAt: new Date(now.getTime() - DAY),
        zeroedAt: null,
      },
      now,
    });
    expect(state).toBe("active");
  });

  it("becomes rubble when health hits zero", () => {
    const zeroedAt = new Date("2026-06-01T00:00:00Z");
    const state = structureStateAt({
      structure: {
        health: 0,
        lastCaredAt: new Date(zeroedAt.getTime() - DAY),
        zeroedAt,
      },
      now: new Date(zeroedAt.getTime() + DAY),
    });
    expect(state).toBe("rubble");
  });

  it("becomes rubble after 28 days without care", () => {
    const lastCaredAt = new Date("2026-01-01T00:00:00Z");
    const now = new Date(
      lastCaredAt.getTime() + BALANCE.structures.neglectRubbleAfterMs + HOUR,
    );
    const state = structureStateAt({
      structure: {
        health: 100,
        lastCaredAt,
        zeroedAt: null,
      },
      now,
    });
    expect(state).toBe("rubble");
  });

  it("clears rubble 7 days after rubble start", () => {
    const zeroedAt = new Date("2026-01-01T00:00:00Z");
    const now = new Date(
      zeroedAt.getTime() + BALANCE.structures.rubbleClearAfterMs + HOUR,
    );
    const state = structureStateAt({
      structure: {
        health: 0,
        lastCaredAt: zeroedAt,
        zeroedAt,
      },
      now,
    });
    expect(state).toBe("cleared");
    expect(
      canRebuildRubble({
        structure: { health: 0, lastCaredAt: zeroedAt, zeroedAt },
        now,
      }),
    ).toBe(false);
  });

  it("allows rebuild while rubble", () => {
    const zeroedAt = new Date("2026-01-01T00:00:00Z");
    expect(
      canRebuildRubble({
        structure: { health: 0, lastCaredAt: zeroedAt, zeroedAt },
        now: new Date(zeroedAt.getTime() + 3 * DAY),
      }),
    ).toBe(true);
  });

  it("stamps zeroedAt on lethal damage", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const next = applyDamage({
      structure: { health: 5, lastCaredAt: now, zeroedAt: null },
      damage: 10,
      now,
    });
    expect(next.health).toBe(0);
    expect(next.zeroedAt).toEqual(now);
  });

  it("resets the care clock on repair", () => {
    const earlier = new Date("2026-01-01T00:00:00Z");
    const now = new Date("2026-01-10T00:00:00Z");
    const next = markCared({
      structure: { health: 10, lastCaredAt: earlier, zeroedAt: null },
      now,
      health: 50,
    });
    expect(next.lastCaredAt).toEqual(now);
    expect(next.health).toBe(50);
    expect(next.zeroedAt).toBeNull();
  });

  it("charges half materials to rebuild", () => {
    const cost = rebuildCost({ type: "turret" });
    expect(cost.materials).toBe(
      BALANCE.structures.costs.turret.materials * 0.5,
    );
  });
});
