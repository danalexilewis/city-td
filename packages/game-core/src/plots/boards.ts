import type { Board, CellId, GridAdapter, Plot } from "../types.js";

type UnionFind = {
  parent: Map<string, string>;
  find: (id: string) => string;
  union: (a: string, b: string) => void;
};

function createUnionFind(ids: readonly string[]): UnionFind {
  const parent = new Map<string, string>();
  for (const id of ids) {
    parent.set(id, id);
  }

  function find(id: string): string {
    let current = id;
    while (parent.get(current) !== current) {
      const next = parent.get(current)!;
      parent.set(current, parent.get(next)!);
      current = next;
    }
    return current;
  }

  function union(a: string, b: string): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent.set(rootA, rootB);
    }
  }

  return { parent, find, union };
}

function cellsTouch(
  cellsA: readonly CellId[],
  cellsB: readonly CellId[],
  grid: GridAdapter,
): boolean {
  const setB = new Set(cellsB);
  for (const cell of cellsA) {
    if (setB.has(cell)) {
      return true;
    }
    for (const other of cellsB) {
      if (grid.areNeighbors(cell, other)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Merge plots whose cells overlap or share an edge into boards.
 * Boards have no gameplay rules of their own — they are visual/grouping only.
 */
export function mergePlotsIntoBoards(args: {
  plots: readonly Plot[];
  grid: GridAdapter;
}): Board[] {
  const { plots, grid } = args;
  if (plots.length === 0) {
    return [];
  }

  const siteIds = plots.map((plot) => plot.siteId);
  const uf = createUnionFind(siteIds);

  for (let i = 0; i < plots.length; i += 1) {
    for (let j = i + 1; j < plots.length; j += 1) {
      const a = plots[i]!;
      const b = plots[j]!;
      if (cellsTouch(a.cells, b.cells, grid)) {
        uf.union(a.siteId, b.siteId);
      }
    }
  }

  const groups = new Map<string, Plot[]>();
  for (const plot of plots) {
    const root = uf.find(plot.siteId);
    const group = groups.get(root) ?? [];
    group.push(plot);
    groups.set(root, group);
  }

  const boards: Board[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.siteId.localeCompare(b.siteId));
    const cellSet = new Set<CellId>();
    for (const plot of sorted) {
      for (const cell of plot.cells) {
        cellSet.add(cell);
      }
    }
    const boardSiteIds = sorted.map((plot) => plot.siteId);
    boards.push({
      id: `board:${boardSiteIds.join("+")}`,
      siteIds: boardSiteIds,
      cells: [...cellSet],
    });
  }

  return boards.sort((a, b) => a.id.localeCompare(b.id));
}

/** Outline MultiPolygon for a board using the active grid adapter. */
export function boardOutline(args: {
  board: Board;
  grid: GridAdapter;
}): ReturnType<GridAdapter["cellsToMultiPolygon"]> {
  return args.grid.cellsToMultiPolygon(args.board.cells);
}
