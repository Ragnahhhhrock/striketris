import { CELL, MOVE, VEHICLES, VEHICLE_SPOTS, MOUNT_REACH, SHELL, TEAM } from './config.js';
import { rayBox } from './grid.js';
import { actorHeight, aimDir, hitsWorld } from './actor.js';

// Rideable vehicles: a fast bike and a slow armoured tank, both driven by a human from a chase camera.
// Bike: W/S throttle and it steers toward where you look. Tank: A/D turn the hull, the turret follows the mouse, fire shoots the cannon.
// Everything here is plain sim state, so it runs headless like the rest of the game.

const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const forward = yaw => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });

export function makeVehicles() {
  return VEHICLE_SPOTS.map(([type, cx, cz, team], id) => ({
    id, type, team, cx, cz, spec: VEHICLES[type],
    pos: { x: 0, y: 0, z: 0 }, vy: 0, yaw: 0, speed: 0, turretYaw: 0, hp: 0, driver: null, dead: false, cd: 0, hitCd: {}, onGround: true,
  }));
}

export function resetVehicles(game) {
  for (const v of game.vehicles) {
    v.pos = { x: (v.cx + 0.5) * CELL, y: 0, z: (v.cz + 0.5) * CELL };
    v.yaw = v.turretYaw = v.team === TEAM.ATT ? 0 : Math.PI;
    v.vy = 0; v.speed = 0; v.hp = v.spec.hp; v.driver = null; v.dead = false; v.cd = 0; v.hitCd = {}; v.onGround = true;
  }
}

const boxHits = (grid, v, x, y, z) => grid.boxHits(x - v.spec.r, y, z - v.spec.r, x + v.spec.r, y + v.spec.h, z + v.spec.r);

export function enterVehicle(game, a, v) {
  if (a.vehicle || v.driver || v.dead || !a.alive) return false;
  a.vehicle = v; v.driver = a;
  a.jetting = false; a.crouching = false; a.scoped = false; a.reloadT = 0; a.mantle = null;
  a.pitch = 0;
  a.yaw = v.type === 'tank' ? v.turretYaw : v.yaw;
  game.emit('mount', { actor: a, vehicle: v });
  return true;
}

// Puts the driver on the nearest free spot beside the vehicle (right, left, behind, ahead), or on top if boxed in.
export function exitVehicle(game, a) {
  const v = a.vehicle;
  if (!v) return false;
  a.vehicle = null; v.driver = null;
  v.speed *= 0.5;
  const f = forward(v.yaw), r = { x: -f.z, z: f.x };
  const gap = v.spec.r + 0.8, h = actorHeight(a);
  const tries = [[r.x, r.z], [-r.x, -r.z], [-f.x, -f.z], [f.x, f.z]];
  let spot = null;
  for (const [dx, dz] of tries) {
    const x = v.pos.x + dx * gap, z = v.pos.z + dz * gap;
    if (!hitsWorld(game.grid, x, v.pos.y + 0.02, z, h)) { spot = { x, y: v.pos.y, z }; break; }
  }
  a.pos = spot ?? { x: v.pos.x, y: v.pos.y + v.spec.h + 0.1, z: v.pos.z };
  a.vel = { x: f.x * v.speed, y: 0, z: f.z * v.speed };
  a.onGround = false; a.crouching = false;
  game.emit('dismount', { actor: a, vehicle: v });
  return true;
}

function nearestMountable(game, a) {
  let best = null, bd = Infinity;
  for (const v of game.vehicles) {
    if (v.dead || v.driver) continue;
    const d = Math.hypot(a.pos.x - v.pos.x, a.pos.z - v.pos.z);
    if (d < v.spec.r + MOUNT_REACH - 1 && Math.abs(a.pos.y - v.pos.y) < 2.5 && d < bd) { bd = d; best = v; }
  }
  return best;
}

// Where the chase camera sits: behind and above the vehicle along the driver's view, pulled in by walls.
export function chaseCam(game, a) {
  const v = a.vehicle, tank = v.type === 'tank';
  const base = { x: v.pos.x, y: v.pos.y + (tank ? 2.5 : 1.7), z: v.pos.z };
  const d = aimDir({ pitch: a.pitch, recoil: 0, yaw: a.yaw, recoilYaw: 0 });
  const want = tank ? 8 : 4.6;
  const free = game.grid.raycast(base.x, base.y, base.z, -d.x, -d.y, -d.z, want + 0.4);
  const dist = Math.max(0.6, Math.min(want, free - 0.4));
  return { x: base.x - d.x * dist, y: Math.max(0.35, base.y - d.y * dist), z: base.z - d.z * dist, dir: d };
}

// Nearest vehicle along a ray. A bike with a rider is skipped, since the rider is the target. Friendly drivers' rides are skipped too.
export function rayVehicle(game, o, d, maxDist, team, skip = null) {
  let best = null, bt = maxDist;
  for (const v of game.vehicles ?? []) {
    if (v.dead || v === skip || (v.type === 'bike' && v.driver)) continue;
    if (team && v.driver && v.driver.team === team) continue;
    const r = v.spec.r;
    const t = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, v.pos.x - r, v.pos.y, v.pos.z - r, v.pos.x + r, v.pos.y + v.spec.h, v.pos.z + r);
    if (t !== null && t < bt) { bt = t; best = v; }
  }
  return best ? { t: bt, v: best } : null;
}

// Whether a driver inside this vehicle is shielded from fire. Only tanks are closed in.
export const shielded = a => a.vehicle?.type === 'tank';

// Blast and bullet damage to a vehicle. Bullets are scaled by armour. A friendly driver makes it immune to your fire.
export function damageVehicle(game, v, amount, by, kind = 'blast') {
  if (v.dead || game.state === 'freeze' || !(amount > 0)) return;
  if (by && v.driver && v.driver.team === by.team && v.driver !== by) return;
  v.hp -= amount * (kind === 'bullet' ? v.spec.armour : 1);
  game.emit('vehicleHit', { vehicle: v, by });
  if (v.hp <= 0) destroyVehicle(game, v, by);
}

function destroyVehicle(game, v, by) {
  v.dead = true; v.hp = 0; v.speed = 0;
  const d = v.driver;
  game.emit('feed', { text: `${by?.name ?? 'Someone'} destroyed a ${v.spec.name}` });
  const at = { x: v.pos.x, y: v.pos.y + 0.6, z: v.pos.z };
  if (d) {
    exitVehicle(game, d);
    game.damage(d, 999, by, 'wreck');
  }
  game.explode(at, v.type === 'tank' ? 8 : 4, v.type === 'tank' ? 160 : 70, by ?? { team: null, name: 'Wreck', pos: at }, 'wreck');
  game.emit('vehicleWreck', { vehicle: v });
}

function moveVehicle(game, v, dt) {
  const f = forward(v.yaw), g = game.grid;
  let blocked = false;
  for (const ax of ['x', 'z']) {
    const delta = f[ax] * v.speed * dt;
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.1)), s = delta / steps;
    for (let i = 0; i < steps; i++) {
      const n = { x: v.pos.x, z: v.pos.z }; n[ax] += s;
      if (boxHits(g, v, n.x, v.pos.y + 0.02, n.z)) { blocked = true; break; }
      v.pos[ax] = n[ax];
    }
  }
  if (blocked) v.speed *= 0.88;
  // A rising lift or a settling block can overlap the vehicle: ride it up instead of sticking inside it.
  for (let k = 0; k < 40 && boxHits(g, v, v.pos.x, v.pos.y + 0.02, v.pos.z); k++) v.pos.y += 0.05;
  // Gravity, so a vehicle rolls off a ledge or settles when the floor under it breaks away.
  v.vy -= MOVE.gravity * dt;
  const dy = v.vy * dt;
  if (boxHits(g, v, v.pos.x, v.pos.y + dy, v.pos.z)) { v.onGround = true; v.vy = 0; } else { v.pos.y += dy; v.onGround = false; }
  if (v.pos.y < -5) { v.hp = 0; v.dead = true; if (v.driver) { const d = v.driver; exitVehicle(game, d); game.damage(d, 999, null, 'fall'); } }
}

function crush(game, v, dt) {
  const d = v.driver, sp = Math.abs(v.speed), spec = v.spec;
  if (!d || sp < spec.ram) return;
  const f = forward(v.yaw);
  for (const t of game.actors) {
    if (!t.alive || t.team === d.team || shielded(t)) continue;
    if ((v.hitCd[t.id] ?? 0) > game.time) continue;
    const reach = spec.r + 0.45;
    if (Math.abs(t.pos.x - v.pos.x) > reach || Math.abs(t.pos.z - v.pos.z) > reach) continue;
    if (t.pos.y > v.pos.y + spec.h || t.pos.y + actorHeight(t) < v.pos.y) continue;
    v.hitCd[t.id] = game.time + 0.5;
    t.vel.x += f.x * Math.sign(v.speed) * sp * 0.7; t.vel.z += f.z * Math.sign(v.speed) * sp * 0.7; t.vel.y = 4.5; t.onGround = false; t.mantle = null;
    game.damage(t, spec.ramDmg * Math.min(1, sp / spec.speed), d, 'ram');
    game.emit('ram', { actor: t, vehicle: v });
  }
}

function fireCannon(game, v, d) {
  const cam = chaseCam(game, d);
  const reach = 140;
  const free = game.grid.raycast(cam.x, cam.y, cam.z, cam.dir.x, cam.dir.y, cam.dir.z, reach);
  const target = { x: cam.x + cam.dir.x * free, y: cam.y + cam.dir.y * free, z: cam.z + cam.dir.z * free };
  const tf = forward(v.turretYaw);
  const muzzle = { x: v.pos.x + tf.x * 2.1, y: v.pos.y + 1.45, z: v.pos.z + tf.z * 2.1 };
  let dx = target.x - muzzle.x, dy = target.y - muzzle.y, dz = target.z - muzzle.z;
  let len = Math.hypot(dx, dy, dz);
  // A target closer than the barrel is long just goes straight ahead.
  if (len < 3) { dx = cam.dir.x; dy = cam.dir.y; dz = cam.dir.z; len = 1; }
  const dir = { x: dx / len, y: dy / len, z: dz / len };
  const proj = { id: game.nextProj++, owner: d, weapon: 'shell', spec: SHELL, pos: { ...muzzle }, dir, speed: SHELL.speed, age: 0 };
  game.projectiles.push(proj);
  v.cd = SHELL.interval;
  game.emit('rocket', { actor: d, proj, from: muzzle, weapon: 'shell', vehicle: v });
  for (const t of game.actors) if (t.alive && t.brain && t.team !== d.team && Math.hypot(t.pos.x - v.pos.x, t.pos.z - v.pos.z) < 60) t.brain.heard = { x: v.pos.x, y: v.pos.y, z: v.pos.z };
}

export function stepVehicles(game, dt) {
  // Mount and dismount on a key tap: the input flag is a one-shot that the sim clears as it reads it.
  for (const a of game.actors) {
    const edge = a.input.mount;
    a.input.mount = false;
    if (!edge || !a.alive || game.isChannelling(a)) continue;
    if (a.vehicle) exitVehicle(game, a);
    else { const v = nearestMountable(game, a); if (v) enterVehicle(game, a, v); }
  }
  for (const v of game.vehicles) {
    if (v.dead) continue;
    const d = v.driver, spec = v.spec;
    v.cd -= dt;
    const throttle = d ? d.input.f : 0;
    const target = throttle > 0 ? spec.speed : throttle < 0 ? -spec.speed * spec.back : 0;
    const braking = Math.sign(target) !== Math.sign(v.speed) && v.speed !== 0;
    const rate = (throttle === 0 ? spec.accel * 0.45 : braking ? spec.accel * 2.2 : spec.accel) * dt;
    v.speed += clamp(target - v.speed, -rate, rate);
    if (d) {
      if (v.type === 'bike') {
        // The bike turns toward where the rider looks, as fast as its steering allows.
        const diff = wrap(d.yaw - v.yaw), room = spec.turn * dt * (0.35 + 0.65 * Math.min(1, Math.abs(v.speed) / 8));
        v.yaw = wrap(v.yaw + clamp(diff, -room, room));
      } else {
        v.yaw = wrap(v.yaw - d.input.r * spec.turn * dt * (v.speed < -0.5 ? -1 : 1));
        const diff = wrap(d.yaw - v.turretYaw), room = spec.turret * dt;
        v.turretYaw = wrap(v.turretYaw + clamp(diff, -room, room));
        if (d.input.fire && v.cd <= 0 && game.state !== 'freeze') fireCannon(game, v, d);
      }
    }
    moveVehicle(game, v, dt);
    if (v.dead) continue;
    if (d) {
      const f = forward(v.yaw);
      d.pos = { x: v.pos.x, y: v.pos.y, z: v.pos.z };
      d.vel = { x: f.x * v.speed, y: 0, z: f.z * v.speed };
      d.onGround = true; d.mantle = null; d.crouching = false; d.jetting = false;
      d.recoil = d.recoilYaw = 0;
      crush(game, v, dt);
    }
  }
}
