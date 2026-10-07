import { describe, expect, it } from "vitest";

import { createSpeedGate } from "../speed/speedGate.js";

describe("speedGate", () => {
  it("stays open below the lock threshold", () => {
    const gate = createSpeedGate();
    const base = 1_000_000;
    for (let i = 0; i < 5; i += 1) {
      expect(
        gate.pushSample({ speedKmh: 5, atMs: base + i * 1000 }),
      ).toBe("open");
    }
    expect(gate.getMedianSpeedKmh()).toBe(5);
  });

  it("locks when the median reaches ~10 km/h", () => {
    const gate = createSpeedGate();
    const base = 1_000_000;
    gate.pushSample({ speedKmh: 12, atMs: base });
    gate.pushSample({ speedKmh: 11, atMs: base + 1000 });
    gate.pushSample({ speedKmh: 10, atMs: base + 2000 });
    gate.pushSample({ speedKmh: 9, atMs: base + 3000 });
    expect(gate.pushSample({ speedKmh: 13, atMs: base + 4000 })).toBe("locked");
  });

  it("unlocks only after the median drops to ~8 km/h", () => {
    const gate = createSpeedGate({ initialState: "locked" });
    const base = 2_000_000;
    // Median 9 stays locked (between unlock and lock).
    for (let i = 0; i < 5; i += 1) {
      expect(
        gate.pushSample({ speedKmh: 9, atMs: base + i * 1000 }),
      ).toBe("locked");
    }
    // Drop to 8 → unlock.
    for (let i = 0; i < 5; i += 1) {
      gate.pushSample({ speedKmh: 8, atMs: base + 10_000 + i * 1000 });
    }
    expect(gate.getState()).toBe("open");
  });

  it("drops samples older than the ~5 s window", () => {
    const gate = createSpeedGate();
    const base = 3_000_000;
    gate.pushSample({ speedKmh: 50, atMs: base });
    // 6 s later only the walking samples remain.
    for (let i = 0; i < 5; i += 1) {
      gate.pushSample({ speedKmh: 4, atMs: base + 6000 + i * 200 });
    }
    expect(gate.getMedianSpeedKmh()).toBe(4);
    expect(gate.getState()).toBe("open");
  });
});
