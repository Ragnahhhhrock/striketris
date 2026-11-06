import { CELL, WEAPONS, PICKUP } from './config.js';
import { actorHeight } from './actor.js';

// Item spots in cell coordinates [x, z]. Every one is an open floor cell away from crates, lifts and spawns.
// Blocks never land on these columns (the map adds them to KEEPOUT), so an item is never buried.
// Rocket launchers sit in mid, one toward each team's half. Health and ammo sit near the sites and lanes.
export const PICKUP_SPOTS = [
  { kind: 'rocket', x: 14, z: 10 },
  { kind: 'rocket', x: 18, z: 22 },
  { kind: 'health', x: 2, z: 6 },
  { kind: 'health', x: 29, z: 6 },
  { kind: 'health', x: 16, z: 15 },
  { kind: 'health', x: 5, z: 20 },
  { kind: 'health', x: 26, z: 20 },
  { kind: 'ammo', x: 10, z: 6 },
  { kind: 'ammo', x: 21, z: 6 },
  { kind: 'ammo', x: 10, z: 16 },
  { kind: 'ammo', x: 21, z: 21 },
];

export const PICKUP_NAMES = { health: 'Health', ammo: 'Ammo', rocket: 'Rocket Launcher' };

export function makePickups() {
  return PICKUP_SPOTS.map((s, id) => ({
    id, kind: s.kind, cx: s.x, cz: s.z,
    x: (s.x + 0.5) * CELL, y: 0, z: (s.z + 0.5) * CELL,
    up: true, timer: 0,
  }));
}

export function resetPickups(game) {
  for (const p of game.pickups) { p.up = true; p.timer = 0; }
}

// Whether taking this item would do the actor any good. Full health or full ammo leaves it for someone else.
export function wants(a, p) {
  const rk = WEAPONS.rocket;
  if (p.kind === 'health') return a.hp < 100;
  if (p.kind === 'rocket') return a.weapons.rocket === undefined || a.weapons.rocket < rk.max;
  if (p.kind === 'ammo') {
    if (a.weapons.rocket !== undefined && a.weapons.rocket < rk.max) return true;
    return a.weapons.rifle < WEAPONS.rifle.mag || a.weapons.pistol < WEAPONS.pistol.mag;
  }
  return false;
}

// Hands the item over. Returns a short label for the feed.
function give(game, a, p) {
  const rk = WEAPONS.rocket;
  if (p.kind === 'health') {
    a.hp = Math.min(100, a.hp + PICKUP.health.amount);
    return 'health';
  }
  if (p.kind === 'ammo') {
    for (const id of ['rifle', 'pistol']) if (a.weapons[id] !== undefined) { a.weapons[id] = WEAPONS[id].mag; if (a.cur === id) a.reloadT = 0; }
    if (a.weapons.rocket !== undefined) a.weapons.rocket = Math.min(rk.max, a.weapons.rocket + PICKUP.ammo.rockets);
    return 'ammo';
  }
  const had = a.weapons.rocket !== undefined;
  a.weapons.rocket = Math.min(rk.max, (a.weapons.rocket ?? 0) + rk.start);
  // A fresh launcher goes straight into your hands, like Quake. A spare one just adds rockets.
  if (!had && a.cur !== 'rocket') { a.cur = 'rocket'; a.reloadT = 0; a.fireCd = 0.4; a.shotStreak = 0; }
  return had ? 'rockets' : 'launcher';
}

// Respawns spent items, then lets the nearest eligible actor on top of each live item take it.
export function stepPickups(game, dt) {
  for (const p of game.pickups) {
    if (!p.up) {
      p.timer -= dt;
      if (p.timer <= 0) { p.up = true; game.emit('pickupSpawn', { pickup: p }); }
      continue;
    }
    let best = null, bestD = PICKUP.reach;
    for (const a of game.actors) {
      if (!a.alive || a.pos.y > p.y + PICKUP.rise || a.pos.y + actorHeight(a) < p.y) continue;
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (d < bestD && wants(a, p)) { best = a; bestD = d; }
    }
    if (!best) continue;
    const what = give(game, best, p);
    p.up = false;
    p.timer = PICKUP[p.kind].respawn;
    game.emit('pickup', { actor: best, pickup: p, what });
  }
}
