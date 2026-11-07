import { CELL, GRID_W as W, GRID_D as D, GRID_H as H, MAX_STACK, MIN_LINE, CLOSE } from './config.js';
import { EMPTY, STATIC } from './grid.js';
import { KEEPOUT, inRect, SITES, SPAWNS } from './map.js';

// The seven one-sided tetrominoes in 2D (a, b).
export const SHAPES = [
  { name: 'I', cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { name: 'O', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { name: 'T', cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  { name: 'S', cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  { name: 'Z', cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  { name: 'J', cells: [[0, 0], [1, 0], [2, 0], [0, 1]] },
  { name: 'L', cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
];

const rot2 = ([a, b], r) => (r === 0 ? [a, b] : r === 1 ? [-b, a] : r === 2 ? [-a, -b] : [b, -a]);

// Pose: 0 lies flat, 1 stands along X, 2 stands along Z. Mirror flips the shape over (S becomes Z).
// Offsets are normalised to >= 0.
export function orient(shapeId, rot, pose, mirror = false) {
  const raw = SHAPES[shapeId].cells.map(c => rot2(c, rot)).map(([a, b]) => (mirror ? [-a, b] : [a, b]));
  const minA = Math.min(...raw.map(c => c[0])), minB = Math.min(...raw.map(c => c[1]));
  return raw.map(([a0, b0]) => {
    const a = a0 - minA, b = b0 - minB;
    return pose === 0 ? { x: a, y: 0, z: b } : pose === 1 ? { x: a, y: b, z: 0 } : { x: 0, y: b, z: a };
  });
}

// Lowest height a piece can fall to from the sky.
export function restHeight(grid, cells, x, z) {
  let y = H - 1;
  while (y > -1) {
    if (cells.some(c => grid.solid(x + c.x, y + c.y - 1, z + c.z) || (y + c.y - 1) < 0)) break;
    y--;
  }
  return y;
}

export function validPlacement(grid, cells, x, z, bombColumn) {
  for (const c of cells) {
    const cx = x + c.x, cz = z + c.z;
    if (cx < 1 || cz < 1 || cx >= W - 1 || cz >= D - 1) return null;
    if (!grid.columnOpen(cx, cz)) return null;
    if (grid.cellClosed(cx, cz, CLOSE.lead)) return null;
    for (const r of KEEPOUT) if (inRect(r, cx, cz)) return null;
    if (bombColumn && bombColumn.x === cx && bombColumn.z === cz) return null;
  }
  const y = restHeight(grid, cells, x, z);
  if (cells.some(c => y + c.y >= MAX_STACK)) return null;
  return y;
}

function touches(a, b) { return Math.abs(a.x - b.x) <= 1 && Math.abs(a.z - b.z) <= 1; }

// Would this placement keep every objective reachable for both teams and every living actor?
export function keepsMapOpen(game, cells, x, y, z) {
  const { grid, nav } = game;
  const placed = cells.map(c => ({ x: x + c.x, y: y + c.y, z: z + c.z }));
  for (const c of placed) grid.set(c.x, c.y, c.z, 1);
  const pads = [SITES.A.centre, SITES.B.centre].map(([cx, cz]) => nav.id(cx, 0, cz));
  const spawn = t => { const [cx, cz] = SPAWNS[t].cells[0]; return { x: cx, y: 0, z: cz }; };
  const reachesPads = from => { const seen = nav.flood(from); return pads.every(p => seen[p]); };
  let ok = reachesPads(spawn('attackers')) && reachesPads(spawn('defenders'));
  if (ok) {
    for (const a of game.actors) {
      if (!a.alive) continue;
      const here = { x: Math.floor(a.pos.x / 3), z: Math.floor(a.pos.z / 3) };
      if (placed.some(c => touches(c, here))) continue; // about to dodge or be crushed
      const n = nav.nearest(a.pos);
      if (n && !reachesPads(n)) { ok = false; break; }
    }
  }
  for (const c of placed) grid.set(c.x, c.y, c.z, EMPTY);
  return ok;
}

// Pick where the next piece lands: mostly pressure on players or nearly finished lines.
export function choosePlacement(game, shapeId) {
  const { grid, rng } = game;
  const living = game.actors.filter(a => a.alive);
  const candidates = [];
  for (let i = 0; i < 40; i++) {
    const pose = rng() < 0.2 ? 1 + Math.floor(rng() * 2) : 0;
    const rot = Math.floor(rng() * 4);
    const mirror = rng() < 0.5;
    const cells = orient(shapeId, rot, pose, mirror);
    let x, z;
    const recent = game.recentCells || [];
    if (recent.length && rng() < 0.45) {
      // Build on the last landings so corridors actually fill up and clear.
      const c = recent[Math.floor(rng() * recent.length)];
      x = c.x - 3 + Math.floor(rng() * 7);
      z = c.z - 3 + Math.floor(rng() * 7);
    } else if (living.length && rng() < 0.4) {
      const a = living[Math.floor(rng() * living.length)];
      x = Math.floor(a.pos.x / 3) - 2 + Math.floor(rng() * 4);
      z = Math.floor(a.pos.z / 3) - 2 + Math.floor(rng() * 4);
    } else { x = 1 + Math.floor(rng() * (W - 3)); z = 1 + Math.floor(rng() * (D - 3)); }
    const y = validPlacement(grid, cells, x, z, game.bombColumn());
    if (y === null) continue;
    candidates.push({ shapeId, rot, pose, mirror, cells, x, y, z, score: rng() + lineBonus(grid, cells, x, y, z) - y * 0.15 });
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const c of candidates) if (keepsMapOpen(game, c.cells, c.x, c.y, c.z)) return c;
  return null;
}

export function lineBonus(grid, cells, x, y, z) {
  const placed = cells.map(c => ({ x: x + c.x, y: y + c.y, z: z + c.z }));
  const isNew = (cx, cy, cz) => placed.some(p => p.x === cx && p.y === cy && p.z === cz);
  let best = 0;
  for (const p of placed) {
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      let len = 1, gaps = 0;
      for (const s of [1, -1]) {
        let cx = p.x + dx * s, cz = p.z + dz * s;
        while (!grid.isStatic(cx, p.y, cz)) {
          len++;
          if (!grid.solid(cx, p.y, cz) && !isNew(cx, p.y, cz)) gaps++;
          cx += dx * s; cz += dz * s;
        }
      }
      if (len >= MIN_LINE && len <= 14) best = Math.max(best, 3 * (1 - gaps / len) ** 2);
    }
  }
  return best;
}

// A line is a wall-to-wall run along X or Z, at any layer, packed with piece cubes.
export function findLines(grid) {
  const hit = [];
  const scan = (y, outerMax, innerMax, at) => {
    for (let o = 1; o < outerMax - 1; o++) {
      let run = [], full = true;
      const flush = () => { if (full && run.length >= MIN_LINE) hit.push(...run); run = []; full = true; };
      for (let i = 1; i < innerMax; i++) {
        const [x, z] = at(o, i);
        const v = grid.get(x, y, z);
        if (v === STATIC) { flush(); continue; }
        if (v === EMPTY) full = false;
        run.push({ x, y, z });
      }
      flush();
    }
  };
  for (let y = 0; y < MAX_STACK; y++) {
    scan(y, D, W, (o, i) => [i, o]);
    scan(y, W, D, (o, i) => [o, i]);
  }
  const seen = new Set();
  return hit.filter(c => { const k = grid.idx(c.x, c.y, c.z); if (seen.has(k)) return false; seen.add(k); return true; });
}

// Removes cubes and drops whatever sat directly above them by one cell.
export function clearCells(grid, cells) {
  const columns = new Map();
  for (const c of cells) {
    const k = c.x + c.z * W;
    if (!columns.has(k)) columns.set(k, { x: c.x, z: c.z, ys: [] });
    columns.get(k).ys.push(c.y);
  }
  for (const { x, z, ys } of columns.values()) {
    ys.sort((a, b) => b - a); // top first so lower indices stay valid
    for (const y of ys) {
      let cy = y;
      while (cy + 1 < H && grid.get(x, cy + 1, z) !== EMPTY && grid.get(x, cy + 1, z) !== STATIC) {
        grid.set(x, cy, z, grid.get(x, cy + 1, z));
        cy++;
      }
      grid.set(x, cy, z, EMPTY);
    }
  }
}

const extent = cells => ({ x: Math.max(...cells.map(c => c.x)) + 1, z: Math.max(...cells.map(c => c.z)) + 1 });
const KICKS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]];

// Try a move, rotation, flip or tumble on a block that is still falling. Altitude is kept, so the
// block never jumps down: a change that would put it below the new landing spot is refused.
// Rotations pivot around the block's centre and try small wall kicks, like classic Tetris.
export function adjustPlacement(game, p, cmd) {
  const rot = (p.rot + (cmd.rot || 0) + 4) % 4;
  const mirror = cmd.mirror ? !p.mirror : p.mirror;
  const pose = (p.pose + (cmd.tumble || 0) + 3) % 3;
  const changed = rot !== p.rot || mirror !== p.mirror || pose !== p.pose;
  // A block that has lost cubes to gunfire keeps only the survivors (p.ids are their positions in the full shape).
  const cells = changed ? orient(p.shapeId, rot, pose, mirror).filter((_, i) => !p.ids || p.ids.includes(i)) : p.cells;
  let bx = p.x + (cmd.dx || 0), bz = p.z + (cmd.dz || 0);
  if (changed) {
    const o = extent(p.cells), n = extent(cells);
    bx += Math.round((o.x - n.x) / 2);
    bz += Math.round((o.z - n.z) / 2);
  }
  const altitude = p.y * CELL + p.drop;
  for (const [kx, kz] of changed ? KICKS : [[0, 0]]) {
    const x = bx + kx, z = bz + kz;
    const y = validPlacement(game.grid, cells, x, z, game.bombColumn());
    if (y === null) continue;
    const drop = altitude - y * CELL;
    if (drop < 1) continue;
    if (!keepsMapOpen(game, cells, x, y, z)) continue;
    return { rot, pose, mirror, cells, x, y, z, drop };
  }
  return null;
}

// What the AI does with a block nobody is steering: one tidy-up that favours finishing lines.
export function directorAdjust(game, p) {
  const { rng, grid } = game;
  const score = (cells, x, y, z) => lineBonus(grid, cells, x, y, z) - y * 0.15;
  let best = null, bestScore = score(p.cells, p.x, p.y, p.z) + 0.25;
  for (let i = 0; i < 10; i++) {
    const cmd = { dx: Math.floor(rng() * 5) - 2, dz: Math.floor(rng() * 5) - 2 };
    const k = rng();
    if (k < 0.3) cmd.rot = rng() < 0.5 ? 1 : -1;
    else if (k < 0.45) cmd.mirror = true;
    else if (k < 0.5) cmd.tumble = 1;
    const r = adjustPlacement(game, p, cmd);
    if (!r) continue;
    const s = score(r.cells, r.x, r.y, r.z) + rng() * 0.4;
    if (s > bestScore) { best = r; bestScore = s; }
  }
  return best;
}
