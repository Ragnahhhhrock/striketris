import { CELL, CLOSE, GRID_W, GRID_D, GRID_H, MOVE } from './config.js';
import { actorHeight, hitsWorld } from './actor.js';

// Closing walls. Four slabs slide in from the arena edges and meet in the middle, so anyone still alive
// when they close is squashed. The slabs are plain boxes (like the lifts), so collision, shots and line of
// sight all see them. Order matters: west, east, north, south. Each slab runs the full length of its side.
const SIDES = ['west', 'east', 'north', 'south'];
const SKY = GRID_H * CELL * 2;

// Gap left between the slabs when they have fully closed, narrower than a player is wide.
const FULL = (GRID_W * CELL - 2 * CELL) / 2 - CLOSE.gap / 2;

// How far each slab has moved in, in metres, `t` seconds after the round went live.
export function wallInset(t) {
  if (t <= CLOSE.start) return 0;
  return FULL * Math.min(1, (t - CLOSE.start) / (CLOSE.end - CLOSE.start));
}

function place(w, inset) {
  w.inset = inset;
  const X = GRID_W * CELL, Z = GRID_D * CELL;
  if (w.side === 'west') { w.x0 = 0; w.x1 = CELL + inset; w.z0 = 0; w.z1 = Z; }
  else if (w.side === 'east') { w.x0 = X - CELL - inset; w.x1 = X; w.z0 = 0; w.z1 = Z; }
  else if (w.side === 'north') { w.x0 = 0; w.x1 = X; w.z0 = 0; w.z1 = CELL + inset; }
  else { w.x0 = 0; w.x1 = X; w.z0 = Z - CELL - inset; w.z1 = Z; }
}

export function makeWalls() {
  return SIDES.map((side, id) => { const w = { id, side, y0: -10, y1: SKY, inset: 0 }; place(w, 0); return w; });
}

export function resetWalls(game) {
  game.wallT = 0;
  game.wallsWarned = false;
  for (const w of game.grid.walls) place(w, 0);
}

// Seconds until the walls start to move, or 0 once they have.
export const wallsIn = game => Math.max(0, CLOSE.start - (game.wallT || 0));
export const wallsMoving = game => game.grid.walls.some(w => w.inset > 1e-3);

// Pushes a point back inside the open floor, keeping `margin` metres clear of the slabs.
export function clampOpen(grid, pos, margin = 0) {
  const o = grid.openBounds();
  if (!o) return pos;
  const mx = Math.min(margin, (o.x1 - o.x0) / 2), mz = Math.min(margin, (o.z1 - o.z0) / 2);
  return {
    ...pos,
    x: Math.max(o.x0 + mx, Math.min(o.x1 - mx, pos.x)),
    z: Math.max(o.z0 + mz, Math.min(o.z1 - mz, pos.z)),
  };
}

// Advances the walls and shoves whoever they reach inwards. Anyone left with nowhere to go is squashed.
// Runs while the round is live, before actors move each tick.
export function stepWalls(game, dt) {
  game.wallT += dt;
  if (!game.wallsWarned && game.wallT >= CLOSE.start) {
    game.wallsWarned = true;
    game.emit('walls');
    game.emit('feed', { text: 'The walls are closing in' });
  }
  const inset = wallInset(game.wallT);
  const walls = game.grid.walls;
  if (inset === walls[0].inset) return;
  for (const w of walls) place(w, inset);

  const [west, east, north, south] = walls, r = MOVE.radius + 1e-4;
  for (const a of game.actors) {
    if (!a.alive) continue;
    const p = a.pos;
    if (p.x - r < west.x1) p.x = west.x1 + r;
    if (p.x + r > east.x0) p.x = east.x0 - r;
    if (p.z - r < north.z1) p.z = north.z1 + r;
    if (p.z + r > south.z0) p.z = south.z0 - r;
    // Pushed into something solid, or the slabs have met: no room left.
    if (hitsWorld(game.grid, p.x, p.y, p.z, actorHeight(a))) game.kill(a, null, 'wall');
  }

  const b = game.bomb;
  if (!b.pos || b.state === 'carried') return;
  const o = game.grid.openBounds();
  const inside = b.pos.x > o.x0 && b.pos.x < o.x1 && b.pos.z > o.z0 && b.pos.z < o.z1;
  if (inside) return;
  // A planted bomb the walls reach goes off on the spot. A dropped one is nudged along ahead of them.
  if (b.state === 'planted') b.fuse = 0;
  else Object.assign(b.pos, clampOpen(game.grid, b.pos, 0.3));
}
