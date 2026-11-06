import { CELL, GRID_W, TEAM, ROUND, WEAPONS, GADGETS } from './config.js';
import { cellCentre } from './grid.js';
import { SITES, POSTS } from './map.js';
import { eyePos } from './actor.js';

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
  stuck: 0, tog: false, gadT: 3 + game.rng() * 5, lastPos: null, strafe: 1, strafeT: 0, burstT: 0, burstPause: 0, lookT: 0, lookYaw: null,
});

function goalFor(game, a) {
  const b = a.brain, bomb = game.bomb, nav = game.nav;
  const danger = game.dangerColumns();
  // First priority: step out from under the incoming piece.
  if (danger && danger.has(cx(a) + cz(a) * GRID_W)) {
    const esc = escapeCell(game, a, danger);
    if (esc) return esc;
  }
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
    const dx = t.pos.x - eye.x, dz = t.pos.z - eye.z, dy = eyeOf(t).y - 0.3 - eye.y, d = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dx, -dz) + b.aimErrX;
    const pitch = Math.atan2(dy, d) + b.aimErrY;
    turnTowards(a, yaw, pitch, game.skill.turn * 3, dt);
    b.aimErrX *= Math.exp(-1.6 * dt); b.aimErrY *= Math.exp(-1.6 * dt);
    const offAim = Math.abs(wrap(yaw - a.yaw)) + Math.abs(pitch - a.pitch);
    // Pick the right tool: rockets hurt the shooter at point-blank, so switch to the sidearm up close.
    const want = a.cur === a.loadout[0] && a.loadout[0] === 'launcher' && d < 7 ? a.loadout[1] : (a.cur === a.loadout[1] && d >= 9 ? a.loadout[0] : a.cur);
    if (want !== a.cur) inp.weapon = want;
    const w = WEAPONS[a.cur];
    if (w.scope && d > 22) inp.scope = true;
    const tight = w.scope ? 0.03 : w.proj ? 0.05 : 0.09;
    const wait = game.skill.reaction + (w.scope ? 0.35 : 0);
    if (b.seenFor > wait && offAim < tight) {
      if (!w.auto) { b.tog = !b.tog; inp.fire = b.tog; }
      else if (b.burstPause > 0) b.burstPause -= dt;
      else {
        inp.fire = true;
        b.burstT += dt;
        const far = d > 28;
        if (b.burstT > (w.interval > 0.09 ? (far ? 0.22 : 0.55) : (far ? 0.3 : 0.7))) { b.burstT = 0; b.burstPause = far ? 0.4 : 0.22; }
      }
    }
    // Grenades are thrown at targets in the sweet spot between cover-fire and splash range.
    if (a.gadget === 'grenade' && d > 9 && d < 24 && b.seenFor > 0.5 && a.gadgetCd <= 0 && game.rng() < 0.02) { inp.gadget = true; }
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
    if (a.weapons[a.cur] < Math.ceil(WEAPONS[a.cur].mag * 0.4)) inp.reload = true;
    if (a.cur !== a.loadout[0]) inp.weapon = a.loadout[0];
    classUtility(game, a, b, dt);
  }

  // Unstick: if a walking bot has barely moved, hop and find a new route.
  if (wp) {
    if (b.lastPos && Math.hypot(a.pos.x - b.lastPos.x, a.pos.z - b.lastPos.z) < 0.01 && !a.mantle) b.stuck += dt; else b.stuck = 0;
    b.lastPos = { ...a.pos };
    if (b.stuck > 0.8) { inp.jump = true; b.repath = 0; if (b.stuck > 2.5) { b.heard = null; b.stuck = 0; } }
  }
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
