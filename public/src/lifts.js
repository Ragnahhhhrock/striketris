import { CELL, LIFT, MOVE, PIT } from './config.js';
import { actorHeight, hitsWorld } from './actor.js';

// Elevator floor sections. Each is a solid box that blocks movement and shots and carries whoever stands on it.
// Cell rects are [x0, x1, z0, z1] inclusive; `offset` is the timing offset in seconds and mirrored lifts share one.
//   rise  metres above the floor at the top of the ride (defaults to LIFT.rise)
//   deep  a piston: its box runs from the bedrock up to its top, so it sinks out of sight into a shaft in the floor
//         and rises through it again. Ordinary lifts rest flush with the floor and only rise.
export const LIFT_SPOTS = [
  { rect: [16, 17, 20, 21], offset: 0 },   // mid
  { rect: [7, 8, 10, 11], offset: 6 },     // site A
  { rect: [23, 24, 10, 11], offset: 6 },   // site B
  { rect: [4, 5, 14, 15], offset: 3 },     // long A
  { rect: [26, 27, 14, 15], offset: 3 },   // long B
  { rect: [4, 5, 22, 23], offset: 9, rise: 3 },       // long A, south end
  { rect: [26, 27, 22, 23], offset: 9, rise: 3 },     // long B, south end
  { rect: [14, 15, 13, 14], offset: 1.5, rise: 6 },   // mid, tall
  { rect: [11, 12, 15, 16], offset: 7.5, rise: 4.5 }, // connector A
  // Pistons. They start the round standing up, then sink into the floor and come back.
  { rect: [9, 10, 3, 4], offset: 13, deep: true },    // site A
  { rect: [28, 29, 3, 4], offset: 13, deep: true },   // site B
  { rect: [16, 17, 16, 17], offset: 6, deep: true, rise: 6 },   // mid
  { rect: [6, 7, 27, 28], offset: 0, deep: true },    // south of long A
  { rect: [24, 25, 27, 28], offset: 0, deep: true },  // south of long B
];

// Top of the bedrock in metres: where a piston rests and where anyone who falls into a hole ends up.
export const BEDROCK_TOP = -(PIT - 1) * CELL;

const ease = s => s * s * (3 - 2 * s);

// The timing of one lift: where it rests, how high it goes and how long each stage takes.
export function liftSpec(spot = {}) {
  const t = spot.deep ? LIFT.deep : LIFT;
  return { rise: spot.rise ?? LIFT.rise, low: spot.deep ? BEDROCK_TOP : 0, down: t.down, travel: t.travel, up: t.up };
}
const DEFAULT_SPEC = liftSpec();

// Height of the lift's top surface at time t.
export function liftTop(t, offset, spec = DEFAULT_SPEC) {
  const cycle = spec.down + spec.travel * 2 + spec.up, span = spec.rise - spec.low;
  let u = (t + offset) % cycle;
  if (u < spec.down) return spec.low;
  u -= spec.down;
  if (u < spec.travel) return spec.low + span * ease(u / spec.travel);
  u -= spec.travel;
  if (u < spec.up) return spec.rise;
  u -= spec.up;
  return spec.low + span * (1 - ease(u / spec.travel));
}

export function makeLifts() {
  return LIFT_SPOTS.map((spot, id) => {
    const { rect: [cx0, cx1, cz0, cz1], offset } = spot, spec = liftSpec(spot);
    return {
      id, offset, spec, deep: !!spot.deep, cx0, cx1, cz0, cz1,
      x0: cx0 * CELL, x1: (cx1 + 1) * CELL, z0: cz0 * CELL, z1: (cz1 + 1) * CELL,
      // A flush lift is its own floor, a block thick, so it holds you up even if the floor under it is shot away.
      y0: spot.deep ? BEDROCK_TOP : -CELL, y1: liftTop(0, offset, spec), moving: false,
    };
  });
}

export function resetLifts(game) {
  game.liftT = 0;
  for (const L of game.grid.lifts) { L.y1 = liftTop(0, L.offset, L.spec); L.moving = false; }
}

const over = (L, p, r) => p.x + r > L.x0 && p.x - r < L.x1 && p.z + r > L.z0 && p.z - r < L.z1;

// Advances every lift and moves whoever it carries or shoves. Runs before actors move each tick.
export function stepLifts(game, dt) {
  game.liftT += dt;
  for (const L of game.grid.lifts) {
    const old = L.y1, next = liftTop(game.liftT, L.offset, L.spec);
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
