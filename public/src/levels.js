import { PIT } from './config.js';
import { STATIC, EMPTY } from './grid.js';
import { LIFT_SPOTS } from './lifts.js';

// Extra levels. The arena gets a lower level in the pit under the floor and raised mezzanine decks above it, joined by
// stairways of solid blocks. Cell rects are [x0, x1, z0, z1] inclusive. One step is one block (3 m), which a player
// climbs by mantling and bots climb as a one-cell move.
const LOW = -(PIT - 1);   // the first open layer above the bedrock

// Stairwells cut through the floor. `dir` is the way you walk going down; the first column is the highest step.
export const STAIRWELLS = [
  { rect: [17, 18, 9, 12], axis: 'z', dir: 1 },    // mid, going south
  { rect: [14, 15, 19, 22], axis: 'z', dir: -1 },  // mid, going north
];

// Mezzanine decks one block thick at layer 2 (top surface 9 m), each with two solid steps up from the floor.
export const MEZZANINES = [
  { deck: [6, 7, 15, 19], steps: [[6, 7, 13, 13], [6, 7, 14, 14]] },     // long A
  { deck: [24, 25, 15, 19], steps: [[24, 25, 13, 13], [24, 25, 14, 14]] }, // long B
];

// Rim ledges: the long A and long B mezzanines carry on across the lane and out through a gap in the outer wall. `deck`
// is a bridge at the same height as the mezzanine, `carve` is the wall cut away above the wall top so the ledge ends in
// open air. Past it is a sheer drop to the void (see RIM in config.js). Rows must match RIM.z0..z1.
export const RIM_LEDGES = [
  { deck: [3, 5, 16, 19], carve: [0, 2, 16, 19] },       // west, off long A
  { deck: [26, 28, 16, 19], carve: [29, 31, 16, 19] },   // east, off long B
];

// Cover walls on the lower level: [x0, x1, z0, z1, height in blocks].
const LOWER_COVER = [
  [6, 12, 8, 8, 2], [19, 25, 8, 8, 2], [6, 12, 24, 24, 2], [19, 25, 24, 24, 2],
  [9, 9, 12, 20, 2], [22, 22, 12, 20, 2], [13, 19, 16, 16, 1], [13, 13, 4, 10, 2], [19, 19, 22, 28, 2],
  [3, 5, 14, 14, 1], [26, 28, 14, 14, 1], [3, 5, 20, 20, 1], [26, 28, 20, 20, 1],
];

const cells = ([x0, x1, z0, z1]) => { const out = []; for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) out.push([x, z]); return out; };

// Columns the stairwells, pistons and mezzanines own, which other blocks must keep clear of.
export function levelKeepout() {
  const keep = new Set();
  for (const w of STAIRWELLS) for (const [x, z] of cells(w.rect)) keep.add(`${x},${z}`);
  return keep;
}

export function addLevels(g) {
  const shafts = new Set();
  for (const l of LIFT_SPOTS) if (l.deep) for (const [x, z] of cells(l.rect)) shafts.add(`${x},${z}`);
  const wells = levelKeepout();

  // Lower level cover.
  for (const [x0, x1, z0, z1, h] of LOWER_COVER) for (const [x, z] of cells([x0, x1, z0, z1])) {
    if (shafts.has(`${x},${z}`) || wells.has(`${x},${z}`)) continue;
    for (let y = LOW; y < LOW + h; y++) g.set(x, y, z, STATIC);
  }

  // Stairwells: a hole in the floor over four steps climbing from the lower floor.
  for (const w of STAIRWELLS) {
    const [x0, x1, z0, z1] = w.rect;
    const n = (w.axis === 'z' ? z1 - z0 : x1 - x0) + 1;
    for (const [x, z] of cells(w.rect)) {
      g.set(x, -1, z, EMPTY);
      const i = w.axis === 'z' ? z - z0 : x - x0;
      const k = w.dir > 0 ? i : n - 1 - i;           // 0 = top step
      const top = n - k;                              // blocks tall
      for (let y = LOW; y < LOW + top; y++) g.set(x, y, z, STATIC);
    }
  }

  // Mezzanines: a deck on the second layer and solid steps up to it.
  for (const m of MEZZANINES) {
    for (const [x, z] of cells(m.deck)) g.set(x, 2, z, STATIC);
    m.steps.forEach((r, i) => { for (const [x, z] of cells(r)) for (let y = 0; y <= i; y++) g.set(x, y, z, STATIC); });
  }

  // Rim ledges: a bridge from the mezzanine and a notch cut through the wall above its top.
  for (const r of RIM_LEDGES) {
    for (const [x, z] of cells(r.deck)) g.set(x, 2, z, STATIC);
    for (const [x, z] of cells(r.carve)) for (let y = 3; y < 8; y++) g.set(x, y, z, EMPTY);
  }
}
