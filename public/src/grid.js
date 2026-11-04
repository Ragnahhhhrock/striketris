import { CELL, GRID_W as W, GRID_D as D, GRID_H as H } from './config.js';

export const EMPTY = 0;
export const STATIC = 255; // values 1..7 are settled piece cubes (shape id + 1)

// The whole level is one voxel grid plus a short list of low crates.
export class Grid {
  constructor() {
    this.cells = new Uint8Array(W * D * H);
    this.base = null;
    this.crates = [];
    this.baseCrates = [];
    this.version = 0;
  }
  idx(x, y, z) { return x + z * W + y * W * D; }
  get(x, y, z) {
    if (y < 0) return STATIC;
    if (y >= H) return EMPTY;
    if (x < 0 || z < 0 || x >= W || z >= D) return STATIC;
    return this.cells[this.idx(x, y, z)];
  }
  set(x, y, z, v) { this.cells[this.idx(x, y, z)] = v; }
  solid(x, y, z) { return this.get(x, y, z) !== EMPTY; }
  isStatic(x, y, z) { return this.get(x, y, z) === STATIC; }
  columnOpen(x, z) { return !this.isStatic(x, 0, z); }

  freeze() { this.base = this.cells.slice(); this.baseCrates = this.crates.map(c => ({ ...c })); }
  reset() {
    this.cells.set(this.base);
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
    return false;
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
    return best;
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

export const cellCentre = (cx, cy, cz) => ({ x: (cx + 0.5) * CELL, y: cy * CELL, z: (cz + 0.5) * CELL });
