import { describe, expect, it } from "vitest";

import { BALANCE } from "../balance/config.js";
import { createH3Adapter } from "../grid/h3Adapter.js";
import { createSquareAdapter } from "../grid/squareAdapter.js";
import { boardOutline, mergePlotsIntoBoards } from "../plots/boards.js";
import { buildPlot, validatePlotCellsNearSite } from "../plots/plots.js";

const A = { lat: -41.2889, lng: 174.7772 };
/** ~30 m east — same / neighbouring H3 r12 cells often share a board. */
const B_NEAR = { lat: -41.2889, lng: 174.7776 };
/** ~500 m away — separate board. */
const C_FAR = { lat: -41.2935, lng: 174.7772 };

describe("plots", () => {
  const h3 = createH3Adapter();

  it("builds an H3 plot with 19 cells", () => {
    const plot = buildPlot({
      site: { id: "site-a", location: A },
      grid: h3,
    });
    expect(plot.cells).toHaveLength(19);
    expect(plot.siteCell).toBe(h3.cellAt(A));
    expect(plot.cells).toContain(plot.siteCell);
  });

  it("builds a square plot as a 5×5 block", () => {
    const square = createSquareAdapter();
    const plot = buildPlot({
      site: { id: "site-a", location: A },
      grid: square,
    });
    expect(plot.cells).toHaveLength(25);
  });

  it("accepts plot cells whose centres are within 50 m", () => {
    const plot = buildPlot({
      site: { id: "site-a", location: A },
      grid: h3,
    });
    const result = validatePlotCellsNearSite({
      siteLocation: A,
      cellIds: plot.cells,
      grid: h3,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a distant cell", () => {
    const farCell = h3.cellAt(C_FAR);
    const result = validatePlotCellsNearSite({
      siteLocation: A,
      cellIds: [farCell],
      grid: h3,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.offendingCellIds).toContain(farCell);
    }
  });
});

describe("boards", () => {
  const h3 = createH3Adapter();

  it("merges touching plots into one board", () => {
    const plotA = buildPlot({
      site: { id: "a", location: A },
      grid: h3,
    });
    const plotB = buildPlot({
      site: { id: "b", location: B_NEAR },
      grid: h3,
    });
    const boards = mergePlotsIntoBoards({
      plots: [plotA, plotB],
      grid: h3,
    });
    expect(boards).toHaveLength(1);
    expect(boards[0]!.siteIds).toEqual(["a", "b"]);
    expect(boards[0]!.cells.length).toBeGreaterThanOrEqual(19);
  });

  it("keeps distant plots on separate boards", () => {
    const plotA = buildPlot({
      site: { id: "a", location: A },
      grid: h3,
    });
    const plotC = buildPlot({
      site: { id: "c", location: C_FAR },
      grid: h3,
    });
    const boards = mergePlotsIntoBoards({
      plots: [plotA, plotC],
      grid: h3,
    });
    expect(boards).toHaveLength(2);
  });

  it("builds a board outline multipolygon", () => {
    const plot = buildPlot({
      site: { id: "a", location: A },
      grid: h3,
    });
    const [board] = mergePlotsIntoBoards({ plots: [plot], grid: h3 });
    const outline = boardOutline({ board: board!, grid: h3 });
    expect(outline.length).toBeGreaterThan(0);
  });

  it("uses plotRings from balance", () => {
    expect(BALANCE.grid.plotRings).toBe(2);
  });
});
