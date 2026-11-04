import { CELL, GRID_W as W, GRID_D as D, GRID_H as H, WALL_H } from './config.js';
import { Grid, STATIC, EMPTY } from './grid.js';

// Original three-lane layout. Attackers start south, defenders north, sites flank the defenders.
// Rects are inclusive [x0, x1, z0, z1] cell ranges.
const OPEN = {
  attSpawn: [12, 19, 26, 30],
  defSpawn: [12, 19, 1, 5],
  siteA: [2, 10, 3, 11],
  siteB: [21, 29, 3, 11],
  mid: [14, 18, 6, 25],
  longA: [3, 7, 12, 26],
  longASouth: [3, 11, 27, 29],
  longB: [24, 28, 12, 26],
  longBSouth: [20, 28, 27, 29],
  connA: [8, 13, 15, 17],
  connB: [19, 23, 20, 22],
  doorA: [11, 11, 3, 5],
  doorB: [20, 20, 3, 5],
  shortA: [11, 13, 8, 10],
  shortB: [19, 20, 8, 10],
};

// Solid single-cell pillars break up the sites.
const PILLARS = [[3, 7], [9, 8], [28, 7], [22, 8]];

const CRATES = [
  [3, 4], [9, 10], [4, 10], [9, 5], [22, 4], [28, 10], [22, 10], [28, 5],
  [15, 12], [17, 18], [15, 23], [4, 18], [6, 22], [26, 16], [25, 22], [9, 28], [22, 28], [15, 8],
];

export const SITES = {
  A: { name: 'A', core: [5, 7, 6, 8], zone: [4, 8, 5, 9], centre: [6, 7] },
  B: { name: 'B', core: [24, 26, 6, 8], zone: [23, 27, 5, 9], centre: [25, 7] },
};
export const SPAWNS = {
  attackers: { rect: [13, 18, 27, 29], cells: [[13, 28], [15, 28], [17, 28], [14, 29], [16, 29], [18, 28]] },
  defenders: { rect: [13, 18, 2, 4], cells: [[13, 3], [15, 3], [17, 3], [14, 2], [16, 2], [18, 3]] },
};
// Pieces may never land on these columns, so spawns and plant spots stay usable.
export const KEEPOUT = [SITES.A.core, SITES.B.core, SPAWNS.attackers.rect, SPAWNS.defenders.rect];
export const inRect = (r, x, z) => x >= r[0] && x <= r[1] && z >= r[2] && z <= r[3];

// Hold points give defenders and escorts somewhere sensible to stand.
export const POSTS = {
  A: [[2, 8], [9, 6], [6, 11], [4, 5], [8, 4]],
  B: [[29, 8], [22, 6], [25, 11], [27, 5], [23, 4]],
  mid: [[15, 9], [16, 14]],
};

export function buildMap() {
  const g = new Grid();
  for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const edge = x === 0 || z === 0 || x === W - 1 || z === D - 1;
    g.set(x, y, z, (edge && y < 8) || y < WALL_H ? STATIC : EMPTY);
  }
  for (const [x0, x1, z0, z1] of Object.values(OPEN)) {
    for (let y = 0; y < WALL_H; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) g.set(x, y, z, EMPTY);
  }
  for (const [x, z] of PILLARS) for (let y = 0; y < WALL_H; y++) g.set(x, y, z, STATIC);
  const size = 1.6, tall = 1.2;
  for (const [cx, cz] of CRATES) {
    const mx = (cx + 0.5) * CELL, mz = (cz + 0.5) * CELL;
    g.crates.push({ cx, cy: 0, cz, x0: mx - size / 2, x1: mx + size / 2, y0: 0, y1: tall, z0: mz - size / 2, z1: mz + size / 2 });
  }
  g.freeze();
  return g;
}
