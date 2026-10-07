import { describe, expect, it } from "vitest";

import { BALANCE } from "../balance/config.js";
import { createH3Adapter } from "../grid/h3Adapter.js";
import { createSquareAdapter } from "../grid/squareAdapter.js";

/** Civic Square / Te Ngākau, Wellington. */
const WELLINGTON = { lat: -41.2889, lng: 174.7772 };

describe("h3Adapter", () => {
  const grid = createH3Adapter();

  it("uses resolution 12", () => {
    expect(grid.kind).toBe("h3");
    expect(grid.resolution).toBe(12);
  });

  it("round-trips cell centre near the input point", () => {
    const cell = grid.cellAt(WELLINGTON);
    const centre = grid.centreOf(cell);
    expect(Math.abs(centre.lat - WELLINGTON.lat)).toBeLessThan(0.01);
    expect(Math.abs(centre.lng - WELLINGTON.lng)).toBeLessThan(0.01);
  });

  it("disk with 2 rings has 19 cells", () => {
    const cell = grid.cellAt(WELLINGTON);
    const cells = grid.disk(cell, BALANCE.grid.plotRings);
    expect(cells).toHaveLength(19);
    expect(cells).toContain(cell);
  });

  it("exposes r7 parents for realtime grouping", () => {
    const cell = grid.cellAt(WELLINGTON);
    const parent = grid.parentCell(cell, BALANCE.grid.h3ParentResolution);
    expect(parent).not.toBe(cell);
    expect(parent.length).toBeGreaterThan(0);
  });

  it("reports edge neighbours inside a disk", () => {
    const cell = grid.cellAt(WELLINGTON);
    const ring1 = grid.disk(cell, 1).filter((id) => id !== cell);
    expect(ring1.length).toBeGreaterThan(0);
    expect(grid.areNeighbors(cell, ring1[0]!)).toBe(true);
    expect(grid.areNeighbors(cell, cell)).toBe(false);
  });

  it("builds a multipolygon outline", () => {
    const cell = grid.cellAt(WELLINGTON);
    const outline = grid.cellsToMultiPolygon(grid.disk(cell, 1));
    expect(outline.length).toBeGreaterThan(0);
    expect(outline[0]![0]!.length).toBeGreaterThan(3);
    // GeoJSON order: [lng, lat]
    const [lng, lat] = outline[0]![0]![0]!;
    expect(Math.abs(lat - WELLINGTON.lat)).toBeLessThan(0.05);
    expect(Math.abs(lng - WELLINGTON.lng)).toBeLessThan(0.05);
  });
});

describe("squareAdapter", () => {
  const grid = createSquareAdapter();

  it("uses zoom 21", () => {
    expect(grid.kind).toBe("square");
    expect(grid.resolution).toBe(21);
  });

  it("encodes cells as z/x/y", () => {
    const cell = grid.cellAt(WELLINGTON);
    expect(cell).toMatch(/^21\/\d+\/\d+$/);
  });

  it("disk with 2 rings is a 5×5 block", () => {
    const cell = grid.cellAt(WELLINGTON);
    const cells = grid.disk(cell, BALANCE.grid.plotRings);
    expect(cells).toHaveLength(25);
    expect(cells).toContain(cell);
  });

  it("round-trips centre inside the same tile", () => {
    const cell = grid.cellAt(WELLINGTON);
    const centre = grid.centreOf(cell);
    expect(grid.cellAt(centre)).toBe(cell);
  });

  it("detects 4-connected neighbours only", () => {
    const cell = grid.cellAt(WELLINGTON);
    const disk = grid.disk(cell, 1);
    const edge = disk.filter((id) => grid.areNeighbors(cell, id));
    expect(edge).toHaveLength(4);
  });

  it("parents to a coarser zoom", () => {
    const cell = grid.cellAt(WELLINGTON);
    const parent = grid.parentCell(cell, 7);
    expect(parent.startsWith("7/")).toBe(true);
  });
});
