import { CELL, LIFT, MOVE } from './config.js';
import { actorHeight, hitsWorld } from './actor.js';

// Elevator floor sections. Each is a solid box from the floor up to its current height, so it blocks
// movement and shots while raised and carries whoever stands on it. Cell rects are [x0, x1, z0, z1]
// inclusive; the third value in each spot is its timing offset in seconds. Mirrored lifts share an offset.
export const LIFT_SPOTS = [
  { rect: [16, 17, 20, 21], offset: 0 },   // mid
  { rect: [7, 8, 10, 11], offset: 6 },     // site A
  { rect: [23, 24, 10, 11], offset: 6 },   // site B
  { rect: [4, 5, 14, 15], offset: 3 },     // long A
  { rect: [26, 27, 14, 15], offset: 3 },   // long B
];

const CYCLE = LIFT.down + LIFT.travel * 2 + LIFT.up;
const ease = s => s * s * (3 - 2 * s);

// Height of the lift's top surface at time t.
export function liftTop(t, offset) {
  let u = (t + offset) % CYCLE;
  if (u < LIFT.down) return 0;
  u -= LIFT.down;
  if (u < LIFT.travel) return LIFT.rise * ease(u / LIFT.travel);
  u -= LIFT.travel;
  if (u < LIFT.up) return LIFT.rise;
  u -= LIFT.up;
  return LIFT.rise * (1 - ease(u / LIFT.travel));
}

export function makeLifts() {
  return LIFT_SPOTS.map(({ rect: [cx0, cx1, cz0, cz1], offset }, id) => ({
    id, offset, cx0, cx1, cz0, cz1,
    x0: cx0 * CELL, x1: (cx1 + 1) * CELL, z0: cz0 * CELL, z1: (cz1 + 1) * CELL,
    y0: 0, y1: liftTop(0, offset), moving: false,
  }));
}

export function resetLifts(game) {
  game.liftT = 0;
  for (const L of game.grid.lifts) { L.y1 = liftTop(0, L.offset); L.moving = false; }
}

const over = (L, p, r) => p.x + r > L.x0 && p.x - r < L.x1 && p.z + r > L.z0 && p.z - r < L.z1;

// Advances every lift and moves whoever it carries or shoves. Runs before actors move each tick.
export function stepLifts(game, dt) {
  game.liftT += dt;
  for (const L of game.grid.lifts) {
    const old = L.y1, next = liftTop(game.liftT, L.offset);
    L.moving = next !== old;
    if (!L.moving) continue;
    L.y1 = next;
    for (const a of game.actors) {
      if (!a.alive || a.mantle || !over(L, a.pos, MOVE.radius)) continue;
      const riding = a.onGround && Math.abs(a.pos.y - old) < 0.06;
      if (!riding && a.pos.y >= next - 1e-6) continue;
      a.pos.y = next;
      if (riding || a.vel.y < 0) a.vel.y = 0;
      if (riding) a.onGround = true;
      if (hitsWorld(game.grid, a.pos.x, a.pos.y, a.pos.z, actorHeight(a))) game.kill(a, null, 'lift');
    }
    const b = game.bomb;
    if (b.pos && b.state !== 'carried' && over(L, b.pos, 0.2) && (Math.abs(b.pos.y - old) < 0.1 || b.pos.y < next)) b.pos.y = next;
  }
}
