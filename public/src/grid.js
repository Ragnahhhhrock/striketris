import { CELL, GRID_W as W, GRID_D as D, GRID_H as H, PIT } from './config.js';

export const EMPTY = 0;
export const FLOOR = 253;    // the floor layer at y = -1; breaks like any other block and leaves a hole
export const BEDROCK = 254;  // the bottom of the world at y = -PIT, and the only thing that cannot be destroyed
export const STATIC = 255;   // map wall cube. Values 1..7 are settled piece cubes (shape id + 1)
export const CRATE = 252;    // only used to describe a broken crate in a blocksBroken event

// Everything inside the grid can be shot or blown apart except bedrock. Past the sides of the grid is an invisible
// boundary, and below the bedrock is more bedrock, so nothing can leave the world.
export const breakable = v => v !== EMPTY && v !== BEDROCK;

// The whole level is one voxel grid, from the bedrock (y = -PIT) up to the sky, plus a short list of low crates.
export class Grid {
  constructor() {
    this.cells = new Uint8Array(W * D * (H + PIT));
    this.dmg = new Uint8Array(W * D * (H + PIT));   // damage taken by each block, from bullets and rockets
    this.base = null;
    this.crates = [];
    this.baseCrates = [];
    this.lifts = [];     // elevator floor sections, moved by lifts.js
    this.walls = [];     // closing wall slabs, moved by walls.js
    this.version = 0;    // bumps when a block is broken, placed or the round resets
    this.dmgVersion = 0; // bumps when a block is only chipped, which the renderer can pick up less urgently
  }
  idx(x, y, z) { return x + z * W + (y + PIT) * W * D; }
  get(x, y, z) {
    if (y < -PIT) return BEDROCK;
    if (y >= H) return EMPTY;
    if (x < 0 || z < 0 || x >= W || z >= D) return STATIC;
    return this.cells[this.idx(x, y, z)];
  }
  set(x, y, z, v) { const i = this.idx(x, y, z); this.cells[i] = v; this.dmg[i] = 0; }
  solid(x, y, z) { return this.get(x, y, z) !== EMPTY; }
  isStatic(x, y, z) { return this.get(x, y, z) === STATIC; }
  columnOpen(x, z) { return !this.isStatic(x, 0, z); }
  // Clears everything above the floor and leaves a flat floor over bedrock. For tests and tools.
  flatten() {
    this.cells.fill(EMPTY); this.dmg.fill(0);
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) { this.set(x, -1, z, FLOOR); this.set(x, -PIT, z, BEDROCK); }
    this.crates = [];
    this.version++;
  }

  freeze() { this.base = this.cells.slice(); this.baseCrates = this.crates.map(c => ({ ...c })); }
  reset() {
    this.cells.set(this.base);
    this.dmg.fill(0);
    this.crates = this.baseCrates.map(c => ({ ...c }));
    this.version++;
  }
  crateAt(x, y, z) {
    return this.crates.some(c => c.cx === x && c.cz === z && c.cy === y);
  }
  removeCratesAt(x, y, z) {
    const n = this.crates.length;
    this.crates = this.crates.filter(c => !(c.cx === x && c.cz === z && c.cy === y));
    return n !== this.crates.length;
  }

  boxHits(x0, y0, z0, x1, y1, z1) {
    const e = 1e-6;
    const ax = Math.floor(x0 / CELL), bx = Math.floor((x1 - e) / CELL);
    const ay = Math.floor(y0 / CELL), by = Math.floor((y1 - e) / CELL);
    const az = Math.floor(z0 / CELL), bz = Math.floor((z1 - e) / CELL);
    for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) {
      if (this.solid(x, y, z)) return true;
    }
    for (const c of this.crates) {
      if (x1 > c.x0 && x0 < c.x1 && y1 > c.y0 && y0 < c.y1 && z1 > c.z0 && z0 < c.z1) return true;
    }
    for (const c of this.lifts) {
      if (c.y1 - c.y0 > 0.02 && x1 > c.x0 && x0 < c.x1 && y1 > c.y0 && y0 < c.y1 && z1 > c.z0 && z0 < c.z1) return true;
    }
    for (const w of this.walls) {
      if (w.inset > 1e-3 && x1 > w.x0 && x0 < w.x1 && z1 > w.z0 && z0 < w.z1) return true;
    }
    return false;
  }
  // The floor the closing walls have left open, in metres, or null when there are no walls.
  openBounds() {
    const w = this.walls;
    return w.length ? { x0: w[0].x1, x1: w[1].x0, z0: w[2].z1, z1: w[3].z0 } : null;
  }
  // Has the centre of this cell been swallowed by a wall, or is it within `margin` metres of one?
  cellClosed(cx, cz, margin = 0) {
    const o = this.openBounds();
    if (!o || this.walls[0].inset <= 1e-3) return false;
    const x = (cx + 0.5) * CELL, z = (cz + 0.5) * CELL;
    return x < o.x0 + margin || x > o.x1 - margin || z < o.z0 + margin || z > o.z1 - margin;
  }
  liftAt(cx, cz) {
    return this.lifts.some(L => cx >= L.cx0 && cx <= L.cx1 && cz >= L.cz0 && cz <= L.cz1);
  }

  // Grid traversal. Returns distance to the first solid surface, or maxDist.
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist;
    let x = Math.floor(ox / CELL), y = Math.floor(oy / CELL), z = Math.floor(oz / CELL);
    const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
    const tdx = dx ? Math.abs(CELL / dx) : Infinity;
    const tdy = dy ? Math.abs(CELL / dy) : Infinity;
    const tdz = dz ? Math.abs(CELL / dz) : Infinity;
    const next = (o, c, s, d) => d ? (((c + (s > 0 ? 1 : 0)) * CELL - o) / d) : Infinity;
    let tx = next(ox, x, sx, dx), ty = next(oy, y, sy, dy), tz = next(oz, z, sz, dz);
    let t = 0;
    while (t < best) {
      if (this.solid(x, y, z)) { best = Math.min(best, t); break; }
      if (y >= H && sy >= 0) break;
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; }
      else if (ty < tz) { y += sy; t = ty; ty += tdy; }
      else { z += sz; t = tz; tz += tdz; }
    }
    for (const c of this.crates) {
      const h = rayBox(ox, oy, oz, dx, dy, dz, c.x0, c.y0, c.z0, c.x1, c.y1, c.z1);
      if (h !== null && h < best) best = h;
    }
    for (const c of this.lifts) {
      if (c.y1 - c.y0 <= 0.02) continue;
      const h = rayBox(ox, oy, oz, dx, dy, dz, c.x0, c.y0, c.z0, c.x1, c.y1, c.z1);
      if (h !== null && h < best) best = h;
    }
    for (const c of this.walls) {
      if (c.inset <= 1e-3) continue;
      const h = rayBox(ox, oy, oz, dx, dy, dz, c.x0, c.y0, c.z0, c.x1, c.y1, c.z1);
      if (h !== null && h < best) best = h;
    }
    return best;
  }
  // Same walk as raycast, but also says which face was struck. The normal is zero when
  // nothing solid was hit within maxDist (open sky, out of range) or the ray starts inside a solid.
  raycastHit(ox, oy, oz, dx, dy, dz, maxDist) {
    const out = { dist: maxDist, nx: 0, ny: 0, nz: 0 };
    let x = Math.floor(ox / CELL), y = Math.floor(oy / CELL), z = Math.floor(oz / CELL);
    const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
    const tdx = dx ? Math.abs(CELL / dx) : Infinity;
    const tdy = dy ? Math.abs(CELL / dy) : Infinity;
    const tdz = dz ? Math.abs(CELL / dz) : Infinity;
    const next = (o, c, s, d) => d ? (((c + (s > 0 ? 1 : 0)) * CELL - o) / d) : Infinity;
    let tx = next(ox, x, sx, dx), ty = next(oy, y, sy, dy), tz = next(oz, z, sz, dz);
    let t = 0, axis = -1;
    while (t < out.dist) {
      if (this.solid(x, y, z)) {
        out.dist = t;
        if (axis === 0) out.nx = -sx; else if (axis === 1) out.ny = -sy; else if (axis === 2) out.nz = -sz;
        break;
      }
      if (y >= H && sy >= 0) break;
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; axis = 0; }
      else if (ty < tz) { y += sy; t = ty; ty += tdy; axis = 1; }
      else { z += sz; t = tz; tz += tdz; axis = 2; }
    }
    for (const c of this.crates) {
      const h = rayBoxHit(ox, oy, oz, dx, dy, dz, c.x0, c.y0, c.z0, c.x1, c.y1, c.z1);
      if (h && h.t < out.dist) { out.dist = h.t; out.nx = h.nx; out.ny = h.ny; out.nz = h.nz; out.crate = c; }
    }
    for (const c of this.lifts) {
      if (c.y1 - c.y0 <= 0.02) continue;
      const h = rayBoxHit(ox, oy, oz, dx, dy, dz, c.x0, c.y0, c.z0, c.x1, c.y1, c.z1);
      if (h && h.t < out.dist) { out.dist = h.t; out.nx = h.nx; out.ny = h.ny; out.nz = h.nz; out.crate = null; }
    }
    for (const c of this.walls) {
      if (c.inset <= 1e-3) continue;
      const h = rayBoxHit(ox, oy, oz, dx, dy, dz, c.x0, c.y0, c.z0, c.x1, c.y1, c.z1);
      if (h && h.t < out.dist) { out.dist = h.t; out.nx = h.nx; out.ny = h.ny; out.nz = h.nz; out.crate = null; }
    }
    return out;
  }
  los(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    return this.raycast(a.x, a.y, a.z, dx / len, dy / len, dz / len, len) >= len - 0.01;
  }
}

export function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = Infinity;
  for (const [o, d, a, b] of [[ox, dx, x0, x1], [oy, dy, y0, y1], [oz, dz, z0, z1]]) {
    if (Math.abs(d) < 1e-9) { if (o < a || o > b) return null; continue; }
    let t0 = (a - o) / d, t1 = (b - o) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tmin = Math.max(tmin, t0); tmax = Math.min(tmax, t1);
    if (tmin > tmax) return null;
  }
  return tmin;
}

// Like rayBox, but also returns the normal of the face the ray enters through.
export function rayBoxHit(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = Infinity, axis = -1, sign = 0;
  const slabs = [[ox, dx, x0, x1], [oy, dy, y0, y1], [oz, dz, z0, z1]];
  for (let i = 0; i < 3; i++) {
    const [o, d, a, b] = slabs[i];
    if (Math.abs(d) < 1e-9) { if (o < a || o > b) return null; continue; }
    let t0 = (a - o) / d, t1 = (b - o) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > tmin) { tmin = t0; axis = i; sign = -Math.sign(d); }
    tmax = Math.min(tmax, t1);
    if (tmin > tmax) return null;
  }
  return { t: tmin, nx: axis === 0 ? sign : 0, ny: axis === 1 ? sign : 0, nz: axis === 2 ? sign : 0 };
}

export const cellCentre =(cx, cy, cz) => ({ x: (cx + 0.5) * CELL, y: cy * CELL, z: (cz + 0.5) * CELL });
