import { MOVE, WEAPONS, CLASSES, GADGETS } from './config.js';

export function makeActor(id, team, name, isHuman, cls = 'rifleman') {
  return {
    id, team, name, isHuman, cls, nextCls: cls, loadout: ['rifle', 'pistol'], gadget: null, gadgetN: 0, gadgetCd: 0, lastGadget: false, spottedUntil: 0, scoped: false,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0, recoil: 0, recoilYaw: 0,
    hp: 100, alive: true, onGround: true, crouching: false, mantle: null,
    weapons: {}, cur: 'rifle', fireCd: 0, reloadT: 0, shotStreak: 0, lastFireHeld: false,
    hasBomb: false, kills: 0, deaths: 0,
    input: { f: 0, r: 0, jump: false, crouch: false, walk: false, fire: false, use: false, reload: false, weapon: null, gadget: false, scope: false },
    brain: null,
  };
}

export function resetActor(a) {
  a.hp = 100; a.alive = true; a.vel = { x: 0, y: 0, z: 0 }; a.mantle = null;
  a.hasBomb = false; a.recoil = 0; a.recoilYaw = 0; a.crouching = false; a.onGround = true;
  a.cls = a.nextCls || a.cls;
  const k = CLASSES[a.cls];
  a.loadout = [k.primary, k.secondary];
  a.weapons = {};
  for (const id of a.loadout) a.weapons[id] = id === 'rocket' ? (k.rockets ?? WEAPONS.rocket.start) : WEAPONS[id].mag;
  a.gadget = k.gadget; a.gadgetN = k.gadget ? GADGETS[k.gadget].n : 0; a.gadgetCd = 0; a.lastGadget = false;
  a.spottedUntil = 0; a.scoped = false;
  a.cur = k.primary; a.fireCd = 0; a.reloadT = 0; a.shotStreak = 0;
  a.brain = null;
}

export const actorHeight = a => (a.crouching ? MOVE.crouchHeight : MOVE.height);
export const eyePos = a => ({ x: a.pos.x, y: a.pos.y + (a.crouching ? MOVE.crouchEye : MOVE.eye), z: a.pos.z });

export function aimDir(a) {
  const p = a.pitch + a.recoil, yaw = a.yaw + a.recoilYaw;
  const c = Math.cos(p);
  return { x: -Math.sin(yaw) * c, y: Math.sin(p), z: -Math.cos(yaw) * c };
}

const R = MOVE.radius;
export const hitsWorld = (grid, x, y, z, h) => grid.boxHits(x - R, y, z - R, x + R, y + h, z + R);

function tryMove(grid, a, axis, delta, h) {
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.05));
  const s = delta / steps;
  for (let i = 0; i < steps; i++) {
    const n = { ...a.pos }; n[axis] += s;
    if (hitsWorld(grid, n.x, n.y, n.z, h)) return false;
    a.pos[axis] = n[axis];
  }
  return true;
}

// Finds a ledge ahead of the actor and starts climbing onto it.
function tryMantle(grid, a, dirX, dirZ) {
  const h = actorHeight(a);
  const px = a.pos.x + dirX * (R + 0.45), pz = a.pos.z + dirZ * (R + 0.45);
  if (!hitsWorld(grid, px, a.pos.y + 0.05, pz, 0.3) && !hitsWorld(grid, px, a.pos.y + 0.4, pz, 0.3)) return false;
  for (let top = a.pos.y + 0.3; top <= a.pos.y + MOVE.mantleReach; top += 0.1) {
    if (hitsWorld(grid, px, top, pz, h)) continue;
    if (hitsWorld(grid, a.pos.x, a.pos.y, a.pos.z, top - a.pos.y + h)) return false;
    // Settle exactly on the surface below the free spot.
    let y = top;
    while (y > a.pos.y && !hitsWorld(grid, px, y - 0.02, pz, h)) y -= 0.02;
    a.mantle = { t: 0, x0: a.pos.x, y0: a.pos.y, z0: a.pos.z, x1: px, y1: y, z1: pz };
    a.vel.x = a.vel.y = a.vel.z = 0;
    return true;
  }
  return false;
}

// Damage for landing after a drop of `drop` metres, or null when it is a safe one. The last stretch is rounded up to a
// sure kill so float error at exactly fallLethal can never leave someone on 0.001 health.
export function fallDamage(drop) {
  if (drop <= MOVE.fallSafe) return null;
  const t = (drop - MOVE.fallSafe) / (MOVE.fallLethal - MOVE.fallSafe);
  return t >= 0.999 ? 1000 : t * 100;
}

export function stepMovement(grid, a, dt) {
  if (a.mantle) {
    const m = a.mantle;
    m.t += dt / MOVE.mantleTime;
    const t = Math.min(1, m.t);
    const up = Math.min(1, t / 0.7), across = Math.max(0, (t - 0.7) / 0.3);
    a.pos.y = m.y0 + (m.y1 - m.y0) * up;
    a.pos.x = m.x0 + (m.x1 - m.x0) * across;
    a.pos.z = m.z0 + (m.z1 - m.z0) * across;
    if (t >= 1) { a.mantle = null; a.onGround = true; }
    return null;
  }
  const inp = a.input;
  // Crouch only releases when there is headroom.
  if (inp.crouch) a.crouching = true;
  else if (a.crouching && !hitsWorld(grid, a.pos.x, a.pos.y, a.pos.z, MOVE.height)) a.crouching = false;

  const h = actorHeight(a);
  const sin = Math.sin(a.yaw), cos = Math.cos(a.yaw);
  let wx = -sin * inp.f + cos * inp.r, wz = -cos * inp.f - sin * inp.r;
  const len = Math.hypot(wx, wz);
  if (len > 1) { wx /= len; wz /= len; }
  const speed = (a.crouching ? MOVE.crouch : inp.walk ? MOVE.walk : MOVE.run) * (WEAPONS[a.cur]?.slow ?? 1) * (a.scoped ? 0.55 : 1);
  const k = 1 - Math.exp(-(a.onGround ? MOVE.groundAccel : MOVE.airAccel) * dt);
  a.vel.x += (wx * speed - a.vel.x) * k;
  a.vel.z += (wz * speed - a.vel.z) * k;

  if (inp.jump && len > 0.1 && !a.crouching) {
    const n = Math.hypot(wx, wz);
    if (tryMantle(grid, a, wx / n, wz / n)) return null;
  }
  if (inp.jump && a.onGround && !a.crouching) { a.vel.y = MOVE.jump; a.onGround = false; }

  a.vel.y -= MOVE.gravity * dt;
  if (!tryMove(grid, a, 'x', a.vel.x * dt, h)) a.vel.x = 0;
  if (!tryMove(grid, a, 'z', a.vel.z * dt, h)) a.vel.z = 0;

  let impact = null;
  const vy = a.vel.y;
  if (!tryMove(grid, a, 'y', vy * dt, h)) {
    if (vy < 0) {
      if (!a.onGround) impact = fallDamage(vy * vy / (2 * MOVE.gravity));
      a.onGround = true;
    }
    a.vel.y = 0;
  } else {
    a.onGround = false;
  }
  return impact;
}
