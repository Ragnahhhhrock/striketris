import { CELL, GRID_W, TEAM, ROUND, WEAPONS, GADGETS } from './config.js';
import { cellCentre } from './grid.js';
import { SITES, POSTS } from './map.js';
import { eyePos, aimDir } from './actor.js';
import { wants } from './pickups.js';
import { clampOpen } from './walls.js';

const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const eyeOf = t => ({ x: t.pos.x, y: t.pos.y + (t.crouching ? 1.1 : 1.5), z: t.pos.z });

export function initBrains(game) {
  const defenders = game.actors.filter(a => a.team === TEAM.DEF && !a.isHuman);
  const attackers = game.actors.filter(a => a.team === TEAM.ATT && !a.isHuman);
  const postFor = i => {
    const pools = ['A', 'B', 'mid', 'A', 'B', 'mid'];
    const pool = POSTS[pools[i % pools.length]];
    return pool[i % pool.length];
  };
  defenders.forEach((a, i) => { a.brain = newBrain(game); a.brain.post = postFor(i); });
  attackers.forEach((a, i) => {
    a.brain = newBrain(game);
    const pool = POSTS[game.targetSite];
    a.brain.post = pool[i % pool.length];
  });
}

const newBrain = game => ({
  path: null, step: 0, goal: null, repath: game.rng() * 0.5, version: -1,
  target: null, seenFor: 0, sightCd: game.rng() * 0.1, heard: null, aimErrX: 0, aimErrY: 0,
  stuck: 0, weaponT: 0, tog: false, gadT: 3 + (game.brainN = ((game.brainN ?? 0) + 1) % 5), lastPos: null, strafe: 1, strafeT: 0, burstT: 0, burstPause: 0, lookT: 0, lookYaw: null,
});

// While the walls are closing, bots head for the shrinking floor: any goal outside it is pulled back in.
function goalFor(game, a) {
  const g = baseGoal(game, a);
  const o = game.grid.openBounds();
  if (!g || !o || game.grid.walls[0].inset <= 1e-3) return g;
  const c = cellCentre(g.x, g.y, g.z), m = clampOpen(game.grid, c, CELL * 1.5);
  return m.x === c.x && m.z === c.z ? g : game.nav.nearest(m) || g;
}

function baseGoal(game, a) {
  const b = a.brain, bomb = game.bomb, nav = game.nav;
  const danger = game.dangerColumns();
  // First priority: step out from under the incoming piece.
  if (danger && danger.has(cx(a) + cz(a) * GRID_W)) {
    const esc = escapeCell(game, a, danger);
    if (esc) return esc;
  }
  const item = pickupGoal(game, a);
  if (item) return item;
  if (a.team === TEAM.ATT) {
    if (bomb.state === 'dropped') {
      const nearest = game.alive(TEAM.ATT).filter(t => !t.isHuman).sort((p, q) => d2(p.pos, bomb.pos) - d2(q.pos, bomb.pos))[0];
      if (nearest === a) return nav.nearest(bomb.pos);
    }
    if (a.hasBomb) { const [x, z] = SITES[game.targetSite].centre; return { x, y: 0, z }; }
    if (bomb.state === 'planted') { const n = nav.nearest(bomb.pos); return offsetPost(game, a, n); }
  } else if (bomb.state === 'planted') {
    return nav.nearest(bomb.pos);
  }
  if (b.heard && !a.hasBomb && bomb.state !== 'planted') return nav.nearest(b.heard);
  const [x, z] = b.post;
  return nav.nearest(cellCentre(x, 0, z));
}

// How far a bot will go for an item, or 0 if it has no use for it. Health when hurt, the launcher when it has none
// (or is nearly out), rockets when low. The bomb carrier only stops for health, and nobody wanders off with the
// bomb planted or the clock nearly out.
function pickupReach(game, a, p) {
  if (!p.up || !wants(a, p) || game.bomb.state === 'planted') return 0;
  const rockets = a.weapons.rocket;
  if (p.kind === 'health') return a.hp < (a.hasBomb ? 45 : 65) ? (a.hasBomb ? 16 : 38) : 0;
  if (a.hasBomb || game.timer < 50) return 0;
  if (p.kind === 'rocket') return rockets === undefined ? 28 : rockets < 3 ? 20 : 0;
  return rockets !== undefined && rockets < 4 ? 20 : 0;
}

// Only the nearest bot on a team that wants an item goes for it, so the whole squad never trails after one launcher.
function pickupGoal(game, a) {
  let best = null, bestD = Infinity;
  for (const p of game.pickups) {
    const d = Math.hypot(p.x - a.pos.x, p.z - a.pos.z);
    if (d >= pickupReach(game, a, p) || d >= bestD) continue;
    const beaten = game.actors.some(t => t !== a && t.alive && t.brain && t.team === a.team && Math.hypot(p.x - t.pos.x, p.z - t.pos.z) < d && Math.hypot(p.x - t.pos.x, p.z - t.pos.z) < pickupReach(game, t, p));
    if (!beaten) { best = p; bestD = d; }
  }
  return best ? game.nav.nearest({ x: best.x, y: 0, z: best.z }) : null;
}

function offsetPost(game, a, n) {
  if (!n) return null;
  const i = a.id % 4;
  const off = [[2, 1], [-2, 1], [1, -2], [-1, 2]][i];
  return game.nav.nearest(cellCentre(n.x + off[0], n.y, n.z + off[1])) || n;
}

const cx = a => Math.floor(a.pos.x / CELL);
const cz = a => Math.floor(a.pos.z / CELL);
const d2 = (p, q) => (p.x - q.x) ** 2 + (p.z - q.z) ** 2;

function escapeCell(game, a, danger) {
  const n = game.nav.nearest(a.pos);
  if (!n) return null;
  for (let r = 1; r <= 6; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const x = n.x + dx, z = n.z + dz;
      if (danger.has(x + z * GRID_W)) continue;
      if (game.nav.walkable(x, n.y, z)) return { x, y: n.y, z };
    }
  }
  return null;
}

function perceive(game, a, dt) {
  const b = a.brain;
  b.sightCd -= dt;
  if (b.sightCd > 0) return;
  b.sightCd = 0.1;
  const eye = eyePos(a);
  let best = null, bestD = Infinity;
  for (const t of game.actors) {
    if (!t.alive || t.team === a.team) continue;
    const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z, d = Math.hypot(dx, dz);
    if (d > 90 || d >= bestD) continue;
    const ang = Math.abs(wrap(Math.atan2(-dx, -dz) - a.yaw));
    if (ang > 1.2 && d > 7) continue;
    if (game.grid.los(eye, eyeOf(t))) { best = t; bestD = d; }
  }
  if (best !== b.target) {
    b.target = best;
    b.seenFor = 0;
    const e = game.skill.aimError;
    b.aimErrX = (game.rng() - 0.5) * e * 4;
    b.aimErrY = (game.rng() - 0.5) * e * 2;
  }
}

function followPath(game, a, b, dt) {
  const nav = game.nav;
  b.repath -= dt;
  const version = game.grid.version;
  if (b.repath <= 0 || b.version !== version || !b.path) {
    b.repath = 0.8 + game.rng() * 0.4;
    b.version = version;
    b.goal = goalFor(game, a);
    const start = nav.nearest(a.pos);
    b.path = b.goal && start ? nav.path(start, b.goal, game.dangerColumns()) : null;
    b.step = b.path && b.path.length > 1 ? 1 : 0;
  }
  if (!b.path || b.step >= b.path.length) return null;
  let wp = b.path[b.step];
  let c = cellCentre(wp.x, wp.y, wp.z);
  const last = b.step === b.path.length - 1;
  const reach = last ? 0.6 : 1.1;
  if (Math.hypot(c.x - a.pos.x, c.z - a.pos.z) < reach && a.pos.y >= c.y - 0.3) {
    b.step++;
    if (b.step >= b.path.length) return null;
    wp = b.path[b.step];
    c = cellCentre(wp.x, wp.y, wp.z);
  }
  return { x: c.x, y: c.y, z: c.z, climb: c.y > a.pos.y + 0.5 };
}

function setWish(a, dirX, dirZ, scale = 1) {
  const sin = Math.sin(a.yaw), cos = Math.cos(a.yaw);
  a.input.f = (-sin * dirX - cos * dirZ) * scale;
  a.input.r = (cos * dirX - sin * dirZ) * scale;
}

function turnTowards(a, yaw, pitch, rate, dt) {
  const k = Math.min(1, rate * dt);
  a.yaw = wrap(a.yaw + wrap(yaw - a.yaw) * k);
  a.pitch += (pitch - a.pitch) * k;
}

export function updateBot(game, a, dt, frozen) {
  const b = a.brain, inp = a.input;
  if (!b) return;
  inp.f = inp.r = 0; inp.jump = false; inp.fire = false; inp.use = false; inp.reload = false; inp.walk = false; inp.crouch = false; inp.gadget = false; inp.scope = false;
  if (frozen) return;
  if (a.pos.y < -CELL * 0.5 && !a.mantle) { climbOut(game, a, dt); return; }
  perceive(game, a, dt);

  const bomb = game.bomb;
  const site = game.siteAt(a.pos);
  const wantsPlant = a.hasBomb && site && site.name === game.targetSite && d2(a.pos, cellCentre(...centre3(site))) < 9;
  const canDefuse = a.team === TEAM.DEF && bomb.state === 'planted' && Math.hypot(a.pos.x - bomb.pos.x, a.pos.y - bomb.pos.y, a.pos.z - bomb.pos.z) < ROUND.defuseRange - 0.2;
  const channel = (wantsPlant || canDefuse) && !b.target;
  if (channel) { inp.use = true; a.crouching = false; }

  const inDanger = (() => { const d = game.dangerColumns(); return d && d.has(cx(a) + cz(a) * GRID_W); })();
  const wp = channel ? null : followPath(game, a, b, dt);
  let dirX = 0, dirZ = 0;
  if (wp) {
    const dx = wp.x - a.pos.x, dz = wp.z - a.pos.z, n = Math.hypot(dx, dz) || 1;
    dirX = dx / n; dirZ = dz / n;
    if (wp.climb) inp.jump = true;
  }

  if (b.target && b.target.alive && !inDanger) {
    b.seenFor += dt;
    const t = b.target, eye = eyePos(a);
    // Rocket in hand: aim low at the feet and lead the target, since the splash does the work.
    const rocket = a.cur === 'rocket';
    const range = Math.hypot(t.pos.x - eye.x, t.pos.z - eye.z), lead = rocket ? range / WEAPONS.rocket.speed : 0;
    const dx = t.pos.x + (rocket ? t.vel.x * lead : 0) - eye.x, dz = t.pos.z + (rocket ? t.vel.z * lead : 0) - eye.z;
    const dy = (rocket ? t.pos.y + 0.3 : eyeOf(t).y - 0.3) - eye.y, d = Math.hypot(dx, dz);
    // The launcher is a mid-range tool: with a clear flight to the target's feet and room to spare it comes out,
    // and the moment the target is close or the path is cluttered the bot goes back to the rifle.
    b.weaponT -= dt;
    // The kit gun a bot falls back to whenever the launcher is wrong for the moment.
    const home = a.loadout[0] === 'rocket' ? a.loadout[1] : a.loadout[0];
    if (a.weapons.rocket > 0) {
      const feet = { x: t.pos.x, y: t.pos.y + 0.3, z: t.pos.z };
      const fx = feet.x - eye.x, fy = feet.y - eye.y, fz = feet.z - eye.z, fl = Math.hypot(fx, fy, fz) || 1;
      const clear = game.grid.raycast(eye.x, eye.y, eye.z, fx / fl, fy / fl, fz / fl, fl) >= fl - 0.5;
      if (rocket && (range < 7 || !clear)) { inp.weapon = home; b.weaponT = 2.5; }
      else if (!rocket && range > 11 && range < 45 && clear && b.weaponT <= 0) inp.weapon = 'rocket';
    } else if (rocket) inp.weapon = home;
    else if (a.cur !== a.loadout[0] && range >= 9 && a.loadout[0] !== 'rocket') inp.weapon = a.loadout[0];
    const w = WEAPONS[a.cur];
    if (w.scope && range > 22) inp.scope = true;
    const yaw = Math.atan2(-dx, -dz) + b.aimErrX;
    const pitch = Math.atan2(dy, d) + b.aimErrY;
    turnTowards(a, yaw, pitch, game.skill.turn * 3, dt);
    b.aimErrX *= Math.exp(-1.6 * dt); b.aimErrY *= Math.exp(-1.6 * dt);
    const offAim = Math.abs(wrap(yaw - a.yaw)) + Math.abs(pitch - a.pitch);
    // Never fire a rocket into a wall right in front of you.
    const ad = aimDir(a);
    const blocked = rocket && game.grid.raycast(eye.x, eye.y, eye.z, ad.x, ad.y, ad.z, 6) < 6;
    if (b.seenFor > game.skill.reaction + (w.scope ? 0.35 : 0) && offAim < (rocket ? 0.13 : w.scope ? 0.03 : 0.09) && !blocked) {
      if (!w.auto && !rocket) { b.tog = !b.tog; inp.fire = b.tog; }
      else if (b.burstPause > 0) b.burstPause -= dt;
      else {
        inp.fire = true;
        b.burstT += dt;
        if (b.burstT > (d > 28 ? 0.22 : 0.55)) { b.burstT = 0; b.burstPause = d > 28 ? 0.4 : 0.22; }
      }
    }
    // Grenades go out at targets in the sweet spot between cover fire and splash range.
    if (a.gadget === 'grenade' && d > 9 && d < 24 && b.seenFor > 0.5 && a.gadgetCd <= 0 && game.rng() < 0.02) inp.gadget = true;
    // Duck and weave rather than stand still; carriers keep pushing at distance.
    b.strafeT -= dt;
    if (b.strafeT <= 0) { b.strafe = game.rng() < 0.5 ? -1 : 1; b.strafeT = 0.4 + game.rng() * 0.8; }
    const keepMoving = a.hasBomb && d > 20;
    if (!keepMoving) { dirX = -Math.cos(Math.atan2(-dx, -dz)) * b.strafe; dirZ = Math.sin(Math.atan2(-dx, -dz)) * b.strafe; setWish(a, dirX, dirZ, 0.55); }
    else setWish(a, dirX, dirZ);
  } else {
    if (b.target && !b.target.alive) b.target = null;
    if (wp) {
      turnTowards(a, Math.atan2(-dirX, -dirZ), 0, game.skill.turn, dt);
    } else {
      b.lookT -= dt;
      if (b.lookT <= 0) { b.lookT = 1.2 + game.rng() * 1.8; b.lookYaw = a.yaw + (game.rng() - 0.5) * 2.4; }
      turnTowards(a, b.lookYaw ?? a.yaw, 0, 2, dt);
      if (b.heard) b.heard = null;
    }
    setWish(a, dirX, dirZ);
    if (!WEAPONS[a.cur].noReload && a.weapons[a.cur] < Math.ceil(WEAPONS[a.cur].mag * 0.4)) inp.reload = true;
    if (a.cur !== a.loadout[0] && !(a.loadout[0] === 'rocket' && !a.weapons.rocket)) inp.weapon = a.loadout[0];
    classUtility(game, a, b, dt);
  }

  // Unstick: if a walking bot has barely moved, hop and find a new route.
  if (wp) {
    if (b.lastPos && Math.hypot(a.pos.x - b.lastPos.x, a.pos.z - b.lastPos.z) < 0.01 && !a.mantle) b.stuck += dt; else b.stuck = 0;
    b.lastPos = { ...a.pos };
    if (b.stuck > 0.8) { inp.jump = true; b.repath = 0; if (b.stuck > 2.5) { b.heard = null; b.stuck = 0; } }
  }
}

// A bot that has fallen through the floor can't path anywhere, so it walks to the nearest piston, waits for it to come
// down if it is up, and rides it back to the surface. Nothing in the pit gets in the way, so it just walks straight.
function climbOut(game, a, dt) {
  const b = a.brain, inp = a.input;
  let best = null, bestD = Infinity;
  for (const L of game.grid.lifts) {
    if (!L.deep) continue;
    const d = Math.hypot((L.x0 + L.x1) / 2 - a.pos.x, (L.z0 + L.z1) / 2 - a.pos.z);
    if (d < bestD) { best = L; bestD = d; }
  }
  b.path = null; b.target = null;
  if (!best) return;
  const tx = (best.x0 + best.x1) / 2, tz = (best.z0 + best.z1) / 2;
  const dx = tx - a.pos.x, dz = tz - a.pos.z, n = Math.hypot(dx, dz);
  if (n < 0.8) return;   // on the piston: stand still and let it carry us
  a.yaw = wrap(a.yaw + wrap(Math.atan2(-dx, -dz) - a.yaw) * Math.min(1, 8 * dt));
  setWish(a, dx / n, dz / n);
  inp.jump = best.y1 > a.pos.y + 0.3;
}

// Off-duty behaviour for the kit gadgets: heal friends, lay mines, spot ahead.
function classUtility(game, a, b, dt) {
  const inp = a.input;
  b.gadT -= dt;
  if (a.gadget === 'medkit') {
    const g = GADGETS.medkit;
    const hurt = game.actors.some(t => t.alive && t.team === a.team && t !== a && t.hp < 70 && Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z) < g.range);
    if (hurt || a.hp < 50) inp.gadget = true;
  } else if (b.gadT <= 0) {
    if (a.gadget === 'mine' && a.onGround && a.gadgetN > 0) { inp.gadget = true; b.gadT = 7 + game.rng() * 6; }
    else if (a.gadget === 'binoculars') { inp.gadget = true; b.gadT = GADGETS.binoculars.cd + 1; }
    else b.gadT = 5;
  }
}

function centre3(site) { const [x, z] = site.centre; return [x, 0, z]; }
