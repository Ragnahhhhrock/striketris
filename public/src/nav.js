import { CELL, GRID_W as W, GRID_D as D, GRID_H as H } from './config.js';

// Bots path over the live voxel grid. A node is an empty cell with a floor under it.
// Moves: walk flat (with diagonals), climb one cell by mantling, or drop any distance.
export class Nav {
  constructor(grid) {
    this.g = grid;
    const n = W * D * H;
    this.cost = new Float32Array(n);
    this.from = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.run = 0;
    this.buf = [];
  }
  id(x, y, z) { return x + z * W + y * W * D; }
  unpack(i) { const y = Math.floor(i / (W * D)); const r = i - y * W * D; return { x: r % W, y, z: Math.floor(r / W) }; }
  walkable(x, y, z) {
    const g = this.g;
    return y >= 0 && y < H && !g.solid(x, y, z) && g.solid(x, y - 1, z) && !g.crateAt(x, y, z);
  }
  neighbours(x, y, z) {
    const g = this.g, out = this.buf; out.length = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (g.solid(nx, y, nz)) {
        // Climb one cell: needs headroom above us and a free spot on top.
        if (!g.solid(x, y + 1, z) && this.walkable(nx, y + 1, nz)) out.push(this.id(nx, y + 1, nz));
        continue;
      }
      if (this.walkable(nx, y, nz)) { out.push(this.id(nx, y, nz)); continue; }
      if (g.crateAt(nx, y, nz)) continue;
      let ly = y - 1;
      while (ly >= 0 && !g.solid(nx, ly, nz)) { if (this.walkable(nx, ly, nz)) { out.push(this.id(nx, ly, nz)); break; } ly--; }
    }
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (this.walkable(nx, y, nz) && this.walkable(nx, y, z) && this.walkable(x, y, nz)) out.push(this.id(nx, y, nz));
    }
    return out;
  }
  // Nearest node to a world position, searching outward.
  nearest(pos) {
    const cx = Math.floor(pos.x / CELL), cz = Math.floor(pos.z / CELL);
    const cy = Math.max(0, Math.floor((pos.y + 0.1) / CELL));
    for (let r = 0; r <= 3; r++) {
      for (let dy = 0; dy <= 3; dy++) for (const yy of dy ? [cy - dy, cy + dy] : [cy]) {
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (this.walkable(cx + dx, yy, cz + dz)) return { x: cx + dx, y: yy, z: cz + dz };
        }
      }
    }
    return null;
  }
  // A* with a soft penalty for cells under the incoming piece.
  path(a, b, danger) {
    if (!a || !b) return null;
    const run = ++this.run, goal = this.id(b.x, b.y, b.z), start = this.id(a.x, a.y, a.z);
    const heap = new Heap();
    this.cost[start] = 0; this.stamp[start] = run; this.from[start] = -1;
    heap.push(start, 0);
    const closed = new Set();
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goal) break;
      if (closed.has(cur)) continue;
      closed.add(cur);
      const c = this.unpack(cur);
      for (const n of [...this.neighbours(c.x, c.y, c.z)]) {
        const p = this.unpack(n);
        const diag = p.x !== c.x && p.z !== c.z;
        let step = diag ? 1.41 : 1;
        if (p.y > c.y) step += 2;
        if (danger && danger.has(p.x + p.z * W)) step += 25;
        const g = this.cost[cur] + step;
        if (this.stamp[n] !== run || g < this.cost[n]) {
          this.stamp[n] = run; this.cost[n] = g; this.from[n] = cur;
          heap.push(n, g + Math.max(Math.abs(p.x - b.x), Math.abs(p.z - b.z)));
        }
      }
    }
    if (this.stamp[goal] !== run) return null;
    const out = [];
    for (let i = goal; i !== -1; i = this.from[i]) out.push(this.unpack(i));
    return out.reverse();
  }
  // Flood fill from a node; used to reject pieces that would seal the map.
  flood(a) {
    const seen = new Uint8Array(W * D * H);
    if (!a) return seen;
    const stack = [this.id(a.x, a.y, a.z)];
    seen[stack[0]] = 1;
    while (stack.length) {
      const c = this.unpack(stack.pop());
      for (const n of this.neighbours(c.x, c.y, c.z)) if (!seen[n]) { seen[n] = 1; stack.push(n); }
    }
    return seen;
  }
}

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(v, p) {
    const a = this.a; a.push([p, v]);
    let i = a.length - 1;
    while (i > 0) { const q = (i - 1) >> 1; if (a[q][0] <= a[i][0]) break; [a[q], a[i]] = [a[i], a[q]]; i = q; }
  }
  pop() {
    const a = this.a, top = a[0][1], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}
