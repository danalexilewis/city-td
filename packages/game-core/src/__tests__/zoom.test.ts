import { describe, expect, it } from "vitest";

import { metresPerPoint, metresToPoints } from "../zoom/metresPerPoint.js";

describe("metresPerPoint", () => {
  it("matches the plan formula at the equator", () => {
    expect(metresPerPoint(0, 0)).toBeCloseTo(78271.517, 3);
    expect(metresPerPoint(0, 1)).toBeCloseTo(78271.517 / 2, 3);
  });

  it("shrinks toward the poles via cos(lat)", () => {
    const equator = metresPerPoint(0, 17);
    const wellington = metresPerPoint(-41.2889, 17);
    expect(wellington).toBeLessThan(equator);
    expect(wellington).toBeCloseTo(equator * Math.cos((-41.2889 * Math.PI) / 180), 6);
  });

  it("converts metres to on-screen points", () => {
    const mpp = metresPerPoint(-41.2889, 17);
    expect(metresToPoints({ metres: mpp, latDegrees: -41.2889, zoom: 17 })).toBeCloseTo(
      1,
      6,
    );
  });
});
