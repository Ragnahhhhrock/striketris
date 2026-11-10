import { CELL, TICK, MOVE, WEAPONS, BULLET_RANGE, BLOCK_HP, ROUND, PIECE, SKILL, TEAM, GRID_W, GRID_D, GRID_H, GADGETS, PRIMARIES, SECONDARIES, TEAM_PIECES, cleanLoadout, PIT, RIM, weaponName } from './config.js';
import { rayBox, rayBoxHit, cellCentre, EMPTY, breakable, CRATE } from './grid.js';
import { buildMap, SITES, SPAWNS, inRect } from './map.js';
import { Nav } from './nav.js';
import { SHAPES, restHeight, choosePlacement, findLines, clearCells, adjustPlacement, directorAdjust } from './pieces.js';
import { makeActor, resetActor, stepMovement, eyePos, aimDir, actorHeight, hitsWorld } from './actor.js';
import { updateBot, initBrains } from './bots.js';
import { stepLifts, resetLifts } from './lifts.js';
import { stepWalls, resetWalls } from './walls.js';
import { makePickups, resetPickups, stepPickups } from './pickups.js';
import { makeDrops, dropPrimary, nearestDrop, stepDropPickup } from './drops.js';

export function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KILL_NAMES = { grenade: 'Grenade', mine: 'Mine' };
const ATT_NAMES = ['Ash', 'Brick', 'Cole', 'Dune', 'Echo', 'Flint'];
const DEF_NAMES = ['Grit', 'Hale', 'Ivo', 'Jett', 'Knox', 'Lark'];

// The full match simulation. It knows nothing about rendering, so it can run headless in tests.
export class Game {
  constructor(opts = {}) {
    this.opts = { seed: Date.now() & 0xffff, teamSize: 5, humanTeam: TEAM.ATT, human: true, pieceInterval: PIECE.interval, skill: 'normal', pieces: true, items: true, friendlyFire: true, ...opts };
    this.rng = mulberry(this.opts.seed);
    this.grid = buildMap();
    this.nav = new Nav(this.grid);
    this.skill = SKILL[this.opts.skill];
    this.actors = [];
    this.events = [];
    this.score = { attackers: 0, defenders: 0 };
    this.round = 0;
    this.matchOver = false;
    this.linesCleared = 0;
    this.piecesLanded = 0;
    this.nextShape = this.bagNext();
    this.pickups = this.opts.items ? makePickups() : [];
    this.drops = makeDrops();
    this.projectiles = [];
    this.nextProj = 1;
    this.thrown = []; this.mines = []; this.time = 0;

    // Characters belong to teams, one team per Tetris shape. A match pits two of the seven against each other: the
    // human's pick (or a random one when nobody is playing) and a rival. Picks use their own generator so they never
    // disturb the sequence of the main one.
    const pr = mulberry((this.opts.seed ^ 0x5eed) >>> 0);
    const mine = TEAM_PIECES.includes(this.opts.humanPiece) ? this.opts.humanPiece : TEAM_PIECES[Math.floor(pr() * 7)];
    const others = TEAM_PIECES.filter(p => p !== mine);
    const rival = others.includes(this.opts.rivalPiece) ? this.opts.rivalPiece : others[Math.floor(pr() * others.length)];
    this.teamPiece = this.opts.human && this.opts.humanTeam === TEAM.DEF ? { attackers: rival, defenders: mine } : { attackers: mine, defenders: rival };

    for (const team of [TEAM.ATT, TEAM.DEF]) {
      const names = team === TEAM.ATT ? ATT_NAMES : DEF_NAMES;
      for (let i = 0; i < this.opts.teamSize; i++) {
        const human = this.opts.human && team === this.opts.humanTeam && i === 0;
        // Bots take a mix of loadouts so every side has rifles, machine guns and snipers.
        const off = team === TEAM.ATT ? 0 : 1;
        const loadout = human ? cleanLoadout(this.opts.humanLoadout) : { primary: PRIMARIES[(i + off) % PRIMARIES.length], secondary: SECONDARIES[(i + off) % SECONDARIES.length] };
        const a = makeActor(this.actors.length, team, human ? 'You' : names[i], human, this.teamPiece[team], loadout);
        this.actors.push(a);
        if (human) this.human = a;
      }
    }
    this.startRound();
  }

  // Seven-bag so every shape turns up regularly.
  bagNext() {
    if (!this.bag || !this.bag.length) {
      this.bag = SHAPES.map((_, i) => i);
      for (let i = 6; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]]; }
    }
    return this.bag.pop();
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  startRound() {
    this.round++;
    this.grid.reset();
    resetLifts(this);
    resetWalls(this);
    resetPickups(this);
    this.drops = [];
    this.projectiles = [];
    this.thrown = []; this.mines = [];
    this.state = 'freeze';
    this.timer = ROUND.freeze;
    this.roundWinner = null;
    this.bomb = { state: 'carried', carrier: null, pos: null, fuse: 0, site: null };
    this.plantProgress = 0; this.defuseProgress = 0;
    this.piece = null;
    this.recentCells = [];
    this.pieceTimer = PIECE.firstDelay;
    this.pieceInterval = this.opts.pieceInterval;
    this.targetSite = this.rng() < 0.5 ? 'A' : 'B';

    const counters = { attackers: 0, defenders: 0 };
    for (const a of this.actors) {
      resetActor(a);
      const [cx, cz] = SPAWNS[a.team].cells[counters[a.team]++ % SPAWNS[a.team].cells.length];
      const p = cellCentre(cx, 0, cz);
      a.pos = { x: p.x, y: 0, z: p.z };
      a.yaw = a.team === TEAM.ATT ? 0 : Math.PI;
      a.pitch = 0;
    }
    const atts = this.actors.filter(a => a.team === TEAM.ATT);
    const carrier = atts[Math.floor(this.rng() * atts.length)];
    carrier.hasBomb = true;
    this.bomb.carrier = carrier;
    initBrains(this);
    this.emit('round', { round: this.round });
  }

  // Takes effect at the start of the next round.
  setLoadout(a, loadout) { a.nextLoadout = cleanLoadout(loadout); }

  bombColumn() {
    if (this.bomb.state === 'carried' || !this.bomb.pos) return null;
    return { x: Math.floor(this.bomb.pos.x / CELL), z: Math.floor(this.bomb.pos.z / CELL) };
  }

  alive(team) { return this.actors.filter(a => a.alive && a.team === team); }

  step(dt = TICK) {
    if (this.matchOver) return;
    stepLifts(this, dt);
    stepPickups(this, dt);
    this.stepProjectiles(dt);
    this.stepThrown(dt);
    if (this.state === 'post') {
      this.timer -= dt;
      this.stepActors(dt, false);
      this.stepPiece(dt);
      if (this.timer <= 0) {
        if (Math.max(this.score.attackers, this.score.defenders) >= ROUND.winScore) { this.matchOver = true; this.emit('match', { winner: this.score.attackers > this.score.defenders ? TEAM.ATT : TEAM.DEF }); } else this.startRound();
      }
      return;
    }
    if (this.state === 'freeze') {
      this.timer -= dt;
      this.stepActors(dt, true);
      if (this.timer <= 0) { this.state = 'live'; this.timer = ROUND.time; this.emit('live'); }
      return;
    }
    this.timer -= dt;
    stepWalls(this, dt);
    this.stepActors(dt, false);
    this.stepPiece(dt);
    this.stepBomb(dt);
    this.checkRoundEnd();
  }

  stepActors(dt, frozen) {
    for (const a of this.actors) {
      if (!a.alive) continue;
      if (!a.isHuman) updateBot(this, a, dt, frozen);
      if (frozen) { a.input.f = a.input.r = 0; a.input.jump = false; a.input.fire = false; }
      if (this.isChannelling(a)) { a.input.f = a.input.r = 0; a.input.jump = false; }
      const fall = stepMovement(this.grid, a, dt);
      if (fall) { this.emit('fall', { actor: a, damage: fall }); this.damage(a, fall, null, 'fall'); }
      if (a.alive && this.overTheEdge(a)) this.fallIntoVoid(a);
      if (!a.alive) continue;
      if (!frozen) this.stepWeapon(a, dt);
      if (a.isHuman && !frozen) stepDropPickup(this, a);
      const settle = Math.exp(-(WEAPONS[a.cur]?.recover ?? 5) * dt);
      a.recoil *= settle; a.recoilYaw *= settle;
      if (this.bomb.state === 'dropped' && a.team === TEAM.ATT && dist2d(a.pos, this.bomb.pos) < 1.4 && Math.abs(a.pos.y - this.bomb.pos.y) < 2) {
        a.hasBomb = true; this.bomb.state = 'carried'; this.bomb.carrier = a; this.bomb.pos = null;
        this.emit('feed', { text: `${a.name} picked up the bomb` });
      }
    }
  }

  // Past the wall line and dropping: only the rim ledges lead here.
  overTheEdge(a) {
    const X = GRID_W * CELL;
    return (a.pos.x < 0 || a.pos.x > X) && a.pos.y < RIM.killY;
  }

  // Dies to whoever last shoved them off (rocket blast within RIM.credit seconds), else it is a plain fall.
  // An invulnerable player is put back on the ledge instead, so they cannot wander the outside of the map.
  fallIntoVoid(a) {
    if (a.isHuman && this.opts.god) {
      const X = GRID_W * CELL;
      a.pos.x = a.pos.x < 0 ? 4.5 : X - 4.5; a.pos.y = 9.05; a.pos.z = (RIM.z0 + RIM.z1 + 1) / 2 * CELL;
      a.vel.x = a.vel.y = a.vel.z = 0; a.onGround = true;
      return;
    }
    const by = a.shover && a.shover !== a && this.time - a.shoveT <= RIM.credit ? a.shover : null;
    this.emit('void', { actor: a, by });
    this.kill(a, by, 'void');
  }

  // True while Use already means plant or defuse, so it should not also pick up a weapon.
  useBusy(a) {
    if (this.isChannelling(a)) return true;
    if (a.hasBomb && this.siteAt(a.pos)) return true;
    const b = this.bomb;
    return a.team === TEAM.DEF && b.state === 'planted' && Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z) < ROUND.defuseRange;
  }

  nearestDrop(a) { return nearestDrop(this, a); }

  isChannelling(a) {
    return (this.planter === a && this.plantProgress > 0) || (this.defuser === a && this.defuseProgress > 0);
  }

  stepWeapon(a, dt) {
    const inp = a.input;
    a.fireCd -= dt;
    a.gadgetCd -= dt;
    if (inp.weapon && inp.weapon !== a.cur && this.canSelect(a, inp.weapon)) { a.cur = inp.weapon; a.reloadT = 0; a.fireCd = 0.3; a.shotStreak = 0; this.emit('switch', { actor: a }); }
    inp.weapon = null;
    // Out of rockets: fall back to the kit's other gun once the last one has left the tube.
    if (a.cur === 'rocket' && !a.weapons.rocket && a.fireCd <= 0) { a.cur = a.loadout[0] === 'rocket' ? a.loadout[1] : a.loadout[0]; a.reloadT = 0; a.fireCd = 0.3; a.shotStreak = 0; this.emit('switch', { actor: a }); }
    const w = WEAPONS[a.cur];
    a.scoped = !!(w.scope && inp.scope && a.reloadT <= 0 && !a.mantle);
    const g = inp.gadget && !a.lastGadget;
    a.lastGadget = inp.gadget;
    if (g) this.useGadget(a);
    if (a.reloadT > 0) {
      a.reloadT -= dt;
      a.scoped = false;
      if (a.reloadT <= 0) a.weapons[a.cur] = w.mag;
      a.lastFireHeld = inp.fire;
      return;
    }
    if (!w.noReload && ((inp.reload && a.weapons[a.cur] < w.mag) || (inp.fire && a.weapons[a.cur] === 0))) {
      a.reloadT = w.reload; a.shotStreak = 0; this.emit('reload', { actor: a });
      return;
    }
    const trigger = inp.fire && (w.auto || !a.lastFireHeld) && a.weapons[a.cur] > 0;
    a.lastFireHeld = inp.fire;
    if (!inp.fire) a.shotStreak = Math.max(0, a.shotStreak - dt * 10);
    if (trigger && a.fireCd <= 0 && !this.isChannelling(a)) {
      a.fireCd = w.interval;
      if (!w.melee) a.weapons[a.cur]--;
      if (a.cur === 'rocket') this.fireRocket(a, w); else if (w.melee) this.stab(a, w); else this.fire(a, w);
    }
  }

  // Friendly fire: with it on (the default) your bullets, blasts and blade hurt teammates as well as enemies.
  canHurt(by, t) { return t !== by && (this.opts.friendlyFire || t.team !== by.team); }

  // The knife: one stab along the crosshair. It hits the nearest body inside reach that no wall, block or piece
  // stands in front of, and only injures. Teammates are fair game under friendly fire.
  stab(a, w) {
    const d = aimDir(a), eye = eyePos(a);
    let dist = this.grid.raycast(eye.x, eye.y, eye.z, d.x, d.y, d.z, w.range);
    let victim = null;
    for (const t of this.actors) {
      if (!t.alive || !this.canHurt(a, t)) continue;
      const h = actorHeight(t), r = MOVE.radius;
      const bd = rayBox(eye.x, eye.y, eye.z, d.x, d.y, d.z, t.pos.x - r, t.pos.y, t.pos.z - r, t.pos.x + r, t.pos.y + h, t.pos.z + r);
      if (bd !== null && bd < dist) { dist = bd; victim = t; }
    }
    const cube = this.rayPiece(eye, d, dist);
    if (cube) victim = null;
    this.emit('stab', { actor: a, from: eye, dir: d, hit: !!victim, victim });
    if (victim) this.damage(victim, w.damage, a, 'knife');
  }

  // A weapon can be selected once you own it, and a rocket launcher only while it has rockets.
  canSelect(a, id) {
    const w = WEAPONS[id];
    return !!w && a.weapons[id] !== undefined && (!w.noReload || a.weapons[id] > 0);
  }

  // The rocket leaves the eye along the crosshair. stepProjectiles flies it.
  fireRocket(a, w) {
    const d = aimDir(a), eye = eyePos(a);
    const proj = { id: this.nextProj++, owner: a, weapon: 'rocket', pos: { ...eye }, dir: d, speed: w.speed, age: 0 };
    this.projectiles.push(proj);
    const steady = a.isHuman ? 1 : 0.35;
    a.shotStreak += 1;
    a.recoil = Math.min(w.kickMax, a.recoil + w.kick * steady);
    a.recoilYaw = Math.max(-w.kickYawMax, Math.min(w.kickYawMax, a.recoilYaw + (this.rng() - 0.5) * 2 * w.kickYaw * steady));
    this.emit('rocket', { actor: a, proj, from: eye, weapon: 'rocket' });
    for (const t of this.actors) if (t.alive && t.brain && t.team !== a.team && dist2d(t.pos, a.pos) < 45) t.brain.heard = { ...a.pos };
  }

  // Flies every rocket one tick. A rocket bursts on the first wall, crate, lift or body (other than its owner) in its path.
  stepProjectiles(dt) {
    if (!this.projectiles.length) return;
    const w = WEAPONS.rocket, keep = [];
    for (const p of this.projectiles) {
      const step = p.speed * dt, d = p.dir, o = p.pos;
      p.age += dt;
      let dist = this.grid.raycast(o.x, o.y, o.z, d.x, d.y, d.z, step);
      let hit = dist < step - 1e-9, victim = null;
      for (const t of this.actors) {
        if (!t.alive || t === p.owner) continue;
        const h = actorHeight(t), r = MOVE.radius + 0.1;
        const bd = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, t.pos.x - r, t.pos.y, t.pos.z - r, t.pos.x + r, t.pos.y + h, t.pos.z + r);
        if (bd !== null && bd < dist) { dist = bd; hit = true; victim = t; }
      }
      const cube = this.rayPiece(o, d, dist);
      if (cube) { dist = cube.t; hit = true; victim = null; }
      if (hit) {
        // Burst just short of the surface so the blast origin is in open air.
        const back = Math.max(0, dist - 0.06);
        this.explodeRocket(p, { x: o.x + d.x * back, y: o.y + d.y * back, z: o.z + d.z * back }, victim);
        continue;
      }
      o.x += d.x * step; o.y += d.y * step; o.z += d.z * step;
      if (p.age < w.life && o.y > -(PIT + 1) * CELL && o.y < 200) keep.push(p);
    }
    this.projectiles = keep;
  }

  // Blasts chew through every block in the arena, map walls and the floor included. Cubes the blast can see within
  // blockCrush break outright, so a rocket always destroys the block it hits; further out each cube takes the same
  // falloff damage a player would and breaks once it has taken BLOCK_HP. Only bedrock survives. Crates go the same
  // way, at half the toughness. `w` needs radius, splash and blockCrush.
  damageBlocks(at, w) {
    const g = this.grid, R = w.radius, broken = [];
    let touched = false;
    const lo = (v, n) => Math.max(0, Math.min(n - 1, Math.floor(v / CELL)));
    const loY = v => Math.max(-PIT, Math.min(GRID_H - 1, Math.floor(v / CELL)));
    for (let y = loY(at.y - R); y <= loY(at.y + R); y++) for (let z = lo(at.z - R, GRID_D); z <= lo(at.z + R, GRID_D); z++) for (let x = lo(at.x - R, GRID_W); x <= lo(at.x + R, GRID_W); x++) {
      const v = g.get(x, y, z);
      if (!breakable(v)) continue;
      const nx = Math.max(x * CELL, Math.min(at.x, (x + 1) * CELL)), ny = Math.max(y * CELL, Math.min(at.y, (y + 1) * CELL)), nz = Math.max(z * CELL, Math.min(at.z, (z + 1) * CELL));
      const len = Math.hypot(nx - at.x, ny - at.y, nz - at.z);
      if (len >= R) continue;
      // Skip cubes hidden behind others: the ray to the nearest face must arrive about where the face is.
      if (len > 0.01 && g.raycast(at.x, at.y, at.z, (nx - at.x) / len, (ny - at.y) / len, (nz - at.z) / len, len) < len - 0.3) continue;
      const i = g.idx(x, y, z), taken = g.dmg[i] + Math.round(w.splash * (1 - len / R));
      touched = true;
      if (len <= w.blockCrush || taken >= BLOCK_HP) { broken.push({ x, y, z, v }); g.set(x, y, z, EMPTY); } else g.dmg[i] = taken;
    }
    for (const c of g.crates.slice()) {
      const len = Math.hypot(Math.max(c.x0, Math.min(at.x, c.x1)) - at.x, Math.max(c.y0, Math.min(at.y, c.y1)) - at.y, Math.max(c.z0, Math.min(at.z, c.z1)) - at.z);
      if (len >= R) continue;
      const taken = (c.dmg || 0) + Math.round(w.splash * (1 - len / R));
      touched = true;
      if (len <= w.blockCrush || taken >= BLOCK_HP / 2) { g.crates.splice(g.crates.indexOf(c), 1); broken.push({ x: c.cx, y: c.cy, z: c.cz, v: CRATE }); } else c.dmg = taken;
    }
    if (!touched) return;
    this.blocksChanged(broken, at);
  }

  // A bullet hit on the face of a block chips it. The point is nudged back into the cube to find it. A crate is
  // chipped directly: it breaks after half the damage a block takes.
  hitBlock(end, normal, amount) {
    if (!(amount > 0)) return;
    const g = this.grid;
    const c = normal.crate;
    if (c) {
      c.dmg = (c.dmg || 0) + amount;
      if (c.dmg >= BLOCK_HP / 2) { g.crates.splice(g.crates.indexOf(c), 1); this.blocksChanged([{ x: c.cx, y: c.cy, z: c.cz, v: CRATE }], end); }
      else g.dmgVersion++;
      return;
    }
    const x = Math.floor((end.x - normal.nx * 0.01) / CELL), y = Math.floor((end.y - normal.ny * 0.01) / CELL), z = Math.floor((end.z - normal.nz * 0.01) / CELL);
    const v = g.get(x, y, z);
    if (!breakable(v) || x < 0 || z < 0 || x >= GRID_W || z >= GRID_D) return;
    const i = g.idx(x, y, z), taken = g.dmg[i] + amount;
    if (taken >= BLOCK_HP) { g.set(x, y, z, EMPTY); this.blocksChanged([{ x, y, z, v }], end); }
    else { g.dmg[i] = Math.ceil(taken); g.dmgVersion++; }
  }

  // Tell the renderer the grid changed, announce any broken cubes, and drop what rested on them.
  blocksChanged(broken, at) {
    const g = this.grid;
    if (!broken.length) { g.dmgVersion++; return; }
    g.version++;
    this.emit('blocksBroken', { cells: broken, pos: at });
    // Whatever was resting on a broken block falls: the bomb drops to the next floor down, or into the pit.
    const b = this.bomb;
    if (b.pos && b.state !== 'carried') {
      let cy = Math.floor(b.pos.y / CELL + 1e-6);
      const bx = Math.floor(b.pos.x / CELL), bz = Math.floor(b.pos.z / CELL);
      if (!g.liftAt(bx, bz)) while (cy > -PIT && !g.solid(bx, cy - 1, bz)) cy--;
      b.pos.y = Math.min(b.pos.y, cy * CELL);
    }
  }

  // Blast damage falls off linearly with distance from the nearest point of each body, walls shield, and
  // everyone in range gets shoved away, friends included. Teammates take damage only with friendly fire on; you take half of yours.
  explodeRocket(p, at, victim) {
    const w = WEAPONS.rocket, by = p.owner;
    this.emit('rocketExplode', { pos: at, proj: p, radius: w.radius, by });
    this.damageBlocks(at, w);
    this.damagePiece(at, w);
    for (const t of this.actors) {
      if (!t.alive) continue;
      const h = actorHeight(t), r = MOVE.radius;
      const nx = Math.max(t.pos.x - r, Math.min(at.x, t.pos.x + r)), ny = Math.max(t.pos.y, Math.min(at.y, t.pos.y + h)), nz = Math.max(t.pos.z - r, Math.min(at.z, t.pos.z + r));
      const dist = Math.hypot(at.x - nx, at.y - ny, at.z - nz);
      if (dist >= w.radius) continue;
      const chest = { x: t.pos.x, y: t.pos.y + h * 0.55, z: t.pos.z };
      if (!this.grid.los(at, chest)) continue;
      const fall = 1 - dist / w.radius;
      let ux = chest.x - at.x, uy = chest.y - at.y, uz = chest.z - at.z;
      const l = Math.hypot(ux, uy, uz) || 1;
      ux /= l; uy = uy / l + 0.25; uz /= l;
      const ul = Math.hypot(ux, uy, uz), kb = w.knock * fall;
      t.vel.x += ux / ul * kb; t.vel.y += uy / ul * kb; t.vel.z += uz / ul * kb;
      t.mantle = null;
      if (by && t !== by && kb > 1) { t.shover = by; t.shoveT = this.time; }   // who gets the kill if this ends over the edge
      if (uy / ul * kb > 1) t.onGround = false;
      if (t !== by && !this.canHurt(by, t)) continue;
      let dmg = w.splash * fall + (t === victim ? w.direct : 0);
      if (t === by) dmg *= w.selfScale;
      this.damage(t, dmg, by, 'rocket');
    }
  }

  fire(a, w) {
    const moving = Math.hypot(a.vel.x, a.vel.z) / MOVE.run;
    let spread = w.spread + w.moveSpread * Math.max(0, moving - 0.3) + (a.onGround ? 0 : 0.05) + Math.min(a.shotStreak, 12) * 0.0018;
    if (a.crouching) spread *= 0.7;
    if (a.scoped) spread *= 0.25;
    const d0 = aimDir(a);
    const dx = d0.x + (this.rng() - 0.5) * 2 * spread, dy = d0.y + (this.rng() - 0.5) * 2 * spread, dz = d0.z + (this.rng() - 0.5) * 2 * spread;
    const n = Math.hypot(dx, dy, dz);
    let dir = { x: dx / n, y: dy / n, z: dz / n };
    const eye = eyePos(a);

    // Walk the round through the map. Each wall it meets either stops it or, while it has
    // bounces left, turns it into a new segment that keeps part of its damage.
    const path = [eye];
    let origin = eye, left = w.range ?? BULLET_RANGE, keep = 1, bounces = 0;
    let victim = null, head = false, impact = null;
    for (;;) {
      const hit = this.grid.raycastHit(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, left);
      let dist = hit.dist;
      victim = null; head = false;
      for (const t of this.actors) {
        if (!t.alive || !this.canHurt(a, t)) continue;
        const h = actorHeight(t), r = MOVE.radius;
        const headH = 0.3;
        const hd = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, t.pos.x - 0.14, t.pos.y + h - headH, t.pos.z - 0.14, t.pos.x + 0.14, t.pos.y + h, t.pos.z + 0.14);
        const bd = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, t.pos.x - r, t.pos.y, t.pos.z - r, t.pos.x + r, t.pos.y + h - headH, t.pos.z + r);
        if (hd !== null && hd < dist) { dist = hd; victim = t; head = true; }
        if (bd !== null && bd < dist) { dist = bd; victim = t; head = false; }
      }
      const cube = this.rayPiece(origin, dir, dist);
      if (cube) { dist = cube.t; victim = null; head = false; }
      const end = { x: origin.x + dir.x * dist, y: origin.y + dir.y * dist, z: origin.z + dir.z * dist };
      path.push(end);
      if (cube) { impact = { pos: end, normal: { x: cube.nx, y: cube.ny, z: cube.nz } }; this.hitPieceCube(cube.k, (w.blockDmg || 0) * keep, end); break; }
      if (victim) break;
      const surface = hit.nx || hit.ny || hit.nz;
      if (!surface) break;
      this.hitBlock(end, hit, (w.blockDmg || 0) * keep);
      const dn = dir.x * hit.nx + dir.y * hit.ny + dir.z * hit.nz;
      left -= dist;
      if (bounces >= w.bounces || dn >= 0 || left < 1) { impact = { pos: end, normal: { x: hit.nx, y: hit.ny, z: hit.nz } }; break; }
      // Mirror the direction about the wall, with a little scatter so a ricochet is never a laser mirror.
      const rx = dir.x - 2 * dn * hit.nx + (this.rng() - 0.5) * 0.03, ry = dir.y - 2 * dn * hit.ny + (this.rng() - 0.5) * 0.03, rz = dir.z - 2 * dn * hit.nz + (this.rng() - 0.5) * 0.03;
      const rl = Math.hypot(rx, ry, rz);
      dir = { x: rx / rl, y: ry / rl, z: rz / rl };
      origin = { x: end.x + hit.nx * 0.03, y: end.y + hit.ny * 0.03, z: end.z + hit.nz * 0.03 };
      keep *= w.bounceKeep;
      bounces++;
      this.emit('ricochet', { actor: a, pos: end, normal: { x: hit.nx, y: hit.ny, z: hit.nz }, weapon: a.cur, bounce: bounces });
    }

    // Bots steady their aim, so they only feel part of the punch.
    const steady = a.isHuman ? 1 : 0.35;
    a.shotStreak += 1;
    a.recoil = Math.min(w.kickMax, a.recoil + w.kick * steady);
    a.recoilYaw = Math.max(-w.kickYawMax, Math.min(w.kickYawMax, a.recoilYaw + (this.rng() - 0.5) * 2 * w.kickYaw * steady));
    this.emit('shot', { actor: a, from: eye, to: path[path.length - 1], path, hit: !!victim, weapon: a.cur, bounces, impact });
    for (const t of this.actors) if (t.alive && t.brain && t.team !== a.team && dist2d(t.pos, a.pos) < 45) t.brain.heard = { ...a.pos };
    // A round that has bounced no longer finds the head: the one-tap belongs to straight shots.
    if (victim) this.damage(victim, w.damage * keep * (head && !bounces ? w.headMult : 1), a, a.cur, head && !bounces, bounces);
  }

  damage(t, amount, by, cause, head = false, bounces = 0) {
    if (!t.alive || this.state === 'freeze') return;
    if (t.isHuman && this.opts.god) return;
    t.hp -= amount;
    this.emit('hurt', { actor: t, by, amount, head, bounces, cause });
    if (t.brain && by) t.brain.heard = { ...by.pos };
    if (t.hp <= 0) this.kill(t, by, cause, head, bounces);
  }

  kill(t, by, cause, head, bounces = 0) {
    if (!t.alive) return;
    if (t.isHuman && this.opts.god) return;
    t.hp = 0; t.alive = false; t.deaths++; t.mantle = null;
    const teamKill = !!by && by !== t && by.team === t.team;
    if (by && by !== t && !teamKill) by.kills++;
    if (t.hasBomb) {
      t.hasBomb = false;
      const y = t.pos.y;
      this.bomb.state = 'dropped'; this.bomb.carrier = null;
      this.bomb.pos = { x: t.pos.x, y, z: t.pos.z };
      this.emit('feed', { text: 'The bomb was dropped' });
    }
    dropPrimary(this, t);
    if (this.planter === t) this.plantProgress = 0;
    if (this.defuser === t) this.defuseProgress = 0;
    const you = t.name === 'You';
    const how = { void: by ? undefined : 'fell off the map', piece: 'was crushed', fall: 'fell too far', blast: 'was caught in the blast', lift: 'was squashed by a lift', line: 'was caught in a line clear', wall: 'was squashed by the walls' }[cause]?.replace(/^was /, you ? 'were ' : 'was ')
      ?? (cause === 'rocket' && by === t ? (you ? 'blew yourself up' : 'blew themselves up') : undefined);
    this.emit('feed', { text: how ? `${t.name} ${how}` : `${by?.name ?? '?'} [${WEAPONS[cause]?.name ?? (cause === 'void' ? 'Off the edge' : cause)}${bounces ? ' Ricochet' : ''}${head ? ' HS' : ''}${teamKill ? ' Team kill' : ''}] ${t.name}`, crush: cause === 'piece' });
    this.emit('death', { actor: t, cause, by, reason: how ? `${you ? 'You' : t.name} ${how}` : `Killed by ${by?.name ?? '?'}` });
  }

  // ---- gadgets and projectiles ----
  useGadget(a) {
    if (!a.gadget || a.gadgetCd > 0 || a.gadgetN <= 0 || this.isChannelling(a) || a.mantle) return false;
    const g = GADGETS[a.gadget];
    if (a.gadget === 'grenade') {
      const d = aimDir(a), eye = eyePos(a);
      const up = 0.22;
      const n = Math.hypot(d.x, d.y + up, d.z);
      const pos = { x: eye.x + d.x * 0.5, y: eye.y - 0.1, z: eye.z + d.z * 0.5 };
      this.thrown.push({ id: this.nextProj++, kind: 'grenade', owner: a, team: a.team, pos, vel: { x: d.x / n * g.speed + a.vel.x * 0.5, y: (d.y + up) / n * g.speed, z: d.z / n * g.speed + a.vel.z * 0.5 }, life: g.fuse, weapon: 'grenade' });
      this.emit('launch', { actor: a, kind: 'grenade', from: pos });
    } else if (a.gadget === 'mine') {
      if (!a.onGround || this.mines.filter(m => m.owner === a).length >= g.n) return false;
      const m = { id: this.nextProj++, owner: a, team: a.team, pos: { x: a.pos.x, y: a.pos.y, z: a.pos.z }, arm: g.arm };
      this.mines.push(m);
      this.emit('mine', { mine: m, actor: a });
    } else if (a.gadget === 'medkit') {
      // Heals the most hurt teammate in reach. With nobody hurt nearby it patches the medic instead.
      let best = null, need = 0;
      for (const t of this.actors) {
        if (!t.alive || t.team !== a.team || t === a || t.hp >= 100) continue;
        if (Math.hypot(t.pos.x - a.pos.x, t.pos.y - a.pos.y, t.pos.z - a.pos.z) > g.range) continue;
        if (100 - t.hp > need) { need = 100 - t.hp; best = t; }
      }
      const who = best || (a.hp < 100 ? a : null);
      if (!who) return false;
      who.hp = Math.min(100, who.hp + g.heal);
      this.emit('heal', { actor: who, by: a });
    } else if (a.gadget === 'binoculars') {
      const d = aimDir(a), eye = eyePos(a);
      let n = 0;
      for (const t of this.actors) {
        if (!t.alive || t.team === a.team) continue;
        const dx = t.pos.x - eye.x, dy = t.pos.y + 1 - eye.y, dz = t.pos.z - eye.z, dist = Math.hypot(dx, dy, dz);
        if (dist > g.range || (dx * d.x + dy * d.y + dz * d.z) / dist < 1 - g.cone * g.cone / 2) continue;
        if (!this.grid.los(eye, { x: t.pos.x, y: t.pos.y + 1.3, z: t.pos.z })) continue;
        t.spottedUntil = this.time + g.time; n++;
      }
      this.emit('spot', { actor: a, count: n });
    }
    if (g.n !== Infinity) a.gadgetN--;
    a.gadgetCd = g.cd;
    return true;
  }

  explode(pos, radius, damage, owner, cause) {
    this.emit('boom', { pos: { ...pos }, radius, cause });
    this.damageBlocks(pos, { radius, splash: damage * 0.9, blockCrush: 0.8 });
    for (const t of this.actors) {
      if (!t.alive) continue;
      if (t !== owner && !this.canHurt(owner, t)) continue;
      const c = { x: t.pos.x, y: t.pos.y + 0.9, z: t.pos.z };
      const d = Math.hypot(c.x - pos.x, c.y - pos.y, c.z - pos.z);
      if (d > radius) continue;
      if (d > 0.6 && !this.grid.los({ x: pos.x, y: pos.y + 0.1, z: pos.z }, c)) continue;
      const k = 1 - d / radius;
      this.damage(t, damage * k * (t === owner ? 0.5 : 1), owner, cause);
    }
  }

  stepThrown(dt) {
    this.time = (this.time || 0) + dt;
    for (const m of this.mines) {
      if (m.arm > 0) { m.arm -= dt; continue; }
      const g = GADGETS.mine;
      const hit = this.actors.find(t => t.alive && (this.opts.friendlyFire || t.team !== m.team) && Math.hypot(t.pos.x - m.pos.x, t.pos.z - m.pos.z) < g.trigger && Math.abs(t.pos.y - m.pos.y) < 1.2);
      if (hit) { m.dead = true; this.explode({ x: m.pos.x, y: m.pos.y + 0.2, z: m.pos.z }, g.radius, g.damage, m.owner, 'mine'); }
    }
    this.mines = this.mines.filter(m => !m.dead);
    if (!this.thrown.length) return;
    for (const p of this.thrown) {
      p.life -= dt;
      {
        p.vel.y -= MOVE.gravity * dt;
        for (const ax of ['x', 'y', 'z']) {
          const n = { ...p.pos }; n[ax] += p.vel[ax] * dt;
          if (this.grid.boxHits(n.x - 0.1, n.y - 0.1, n.z - 0.1, n.x + 0.1, n.y + 0.1, n.z + 0.1)) {
            p.vel[ax] *= -0.35;
            for (const o of ['x', 'y', 'z']) if (o !== ax) p.vel[o] *= 0.8;
          } else p.pos[ax] = n[ax];
        }
        if (p.pos.y < -(PIT + 1) * CELL) p.life = 0;
        if (p.life <= 0) { p.dead = true; this.explode(p.pos, GADGETS.grenade.radius, GADGETS.grenade.damage, p.owner, 'grenade'); }
      }
    }
    this.thrown = this.thrown.filter(p => !p.dead);
  }

  // ---- falling pieces ----
  stepPiece(dt) {
    if (!this.opts.pieces) return;
    const p = this.piece;
    if (p) {
      p.t += dt;
      if (!p.controlled && !p.aiDone && p.drop <= PIECE.directorAt) {
        p.aiDone = true;
        const r = directorAdjust(this, p);
        if (r) { Object.assign(p, r); p.rev++; this.emit('adjust', { piece: p, by: 'ai' }); }
      }
      p.drop = Math.max(0, p.drop - (p.fast ? PIECE.fastSpeed : PIECE.fallSpeed) * dt);
      this.crushCheck(p);
      if (p.drop === 0) this.landPiece(p);
      return;
    }
    if (this.state !== 'live') return;
    this.pieceTimer -= dt;
    if (this.pieceTimer <= 0) this.spawnPiece();
  }

  spawnPiece(shape = this.nextShape) {
    const c = choosePlacement(this, shape);
    this.pieceInterval = Math.max(PIECE.minInterval, this.pieceInterval * PIECE.ramp);
    this.pieceTimer = this.pieceInterval;
    if (!c) return false;
    this.nextShape = this.bagNext();
    this.piece = { ...c, t: 0, drop: PIECE.dropHeight, rev: 0, controlled: false, aiDone: false, fast: false, ids: c.cells.map((_, i) => i), dmg: c.cells.map(() => 0), cubeRev: 0 };
    this.emit('telegraph', { piece: this.piece });
    return true;
  }

  // Steer the falling block: { dx, dz } move, { rot: +-1 } rotate, { mirror } flip over,
  // { tumble } stand it up or lay it down, { fast } hard drop. Returns whether it applied.
  adjustPiece(cmd, by = 'player') {
    const p = this.piece;
    if (!p || p.drop < PIECE.lockHeight) return false;
    p.controlled = true;
    if (cmd.fast) { p.fast = true; this.emit('adjust', { piece: p, by }); return true; }
    const r = adjustPlacement(this, p, cmd);
    if (!r) { this.emit('blocked'); return false; }
    Object.assign(p, r);
    p.rev++;
    this.emit('adjust', { piece: p, by });
    return true;
  }

  // ---- shooting the falling block ----
  // Each cube of the falling block has BLOCK_HP like a settled one. Cubes are boxes in the air, so bullets and
  // rockets meet them with ray tests rather than the voxel grid.
  pieceCubeBox(p, k) {
    const c = p.cells[k], y0 = (p.y + c.y) * CELL + p.drop;
    return [(p.x + c.x) * CELL, y0, (p.z + c.z) * CELL, (p.x + c.x + 1) * CELL, y0 + CELL, (p.z + c.z + 1) * CELL];
  }

  // Nearest falling cube along a ray within maxDist, or null. Returns { k, t, nx, ny, nz }.
  rayPiece(o, d, maxDist) {
    const p = this.piece;
    if (!p || !p.dmg) return null;
    let best = null;
    for (let k = 0; k < p.cells.length; k++) {
      const h = rayBoxHit(o.x, o.y, o.z, d.x, d.y, d.z, ...this.pieceCubeBox(p, k));
      if (h && h.t < maxDist && (!best || h.t < best.t)) best = { k, ...h };
    }
    return best;
  }

  // Damage one cube of the falling block. Past BLOCK_HP it breaks and drops out of the shape; the block keeps
  // its altitude but its landing spot is worked out again from the cubes that are left.
  hitPieceCube(k, amount, at) {
    const p = this.piece;
    if (!p || !(amount > 0) || k >= p.cells.length) return;
    p.dmg[k] += amount;
    p.cubeRev++;
    if (p.dmg[k] < BLOCK_HP) return;
    const [x0, y0, z0] = this.pieceCubeBox(p, k);
    const v = p.shapeId + 1;
    p.cells.splice(k, 1); p.ids.splice(k, 1); p.dmg.splice(k, 1);
    this.emit('blocksBroken', { cells: [{ x: x0 / CELL, y: y0 / CELL, z: z0 / CELL, v }], pos: at, falling: true });
    if (!p.cells.length) { this.piece = null; this.emit('pieceDestroyed', { piece: p }); return; }
    const altitude = p.y * CELL + p.drop;
    const y = restHeight(this.grid, p.cells, p.x, p.z);
    if (y >= -PIT && y <= p.y) { p.y = y; p.drop = Math.max(0, altitude - y * CELL); }
  }

  // A rocket blast against the falling block: cubes within blockCrush break outright, others take falloff damage.
  damagePiece(at, w) {
    const p = this.piece;
    if (!p || !p.dmg) return;
    for (let k = p.cells.length - 1; k >= 0; k--) {
      if (!this.piece || k >= this.piece.cells.length) continue;
      const [x0, y0, z0, x1, y1, z1] = this.pieceCubeBox(p, k);
      const len = Math.hypot(Math.max(x0, Math.min(at.x, x1)) - at.x, Math.max(y0, Math.min(at.y, y1)) - at.y, Math.max(z0, Math.min(at.z, z1)) - at.z);
      if (len >= w.radius) continue;
      this.hitPieceCube(k, len <= w.blockCrush ? BLOCK_HP : w.splash * (1 - len / w.radius), at);
    }
  }

  // Columns a piece will hit. Bots treat them as dangerous while it is on its way.
  dangerColumns() {
    if (!this.piece || this.piece.drop > PIECE.dangerHeight) return null;
    const s = new Set();
    for (const c of this.piece.cells) s.add((this.piece.x + c.x) + (this.piece.z + c.z) * 32);
    return s;
  }

  crushCheck(p) {
    const baseY = p.y * CELL + p.drop;
    for (const a of this.actors) {
      if (!a.alive) continue;
      const h = actorHeight(a), r = MOVE.radius;
      for (const c of p.cells) {
        const x0 = (p.x + c.x) * CELL, z0 = (p.z + c.z) * CELL, y0 = baseY + c.y * CELL;
        if (a.pos.x + r > x0 && a.pos.x - r < x0 + CELL && a.pos.z + r > z0 && a.pos.z - r < z0 + CELL && a.pos.y + h > y0 && a.pos.y < y0 + CELL) {
          this.kill(a, null, 'piece'); break;
        }
      }
    }
  }

  landPiece(p) {
    p.cells.forEach((c, k) => {
      const x = p.x + c.x, y = p.y + c.y, z = p.z + c.z;
      this.grid.set(x, y, z, p.shapeId + 1);
      if (p.dmg?.[k]) this.grid.dmg[this.grid.idx(x, y, z)] = Math.min(254, Math.ceil(p.dmg[k]));   // a chipped block lands chipped
      this.grid.removeCratesAt(x, y, z);
    });
    this.grid.version++;
    this.piece = null;
    this.piecesLanded++;
    this.recentCells = [...(this.recentCells || []), ...p.cells.map(c => ({ x: p.x + c.x, z: p.z + c.z }))].slice(-16);
    this.emit('land', { pos: { x: (p.x + 1) * CELL, y: p.y * CELL, z: (p.z + 1) * CELL }, cells: p.cells.map(c => ({ x: p.x + c.x, y: p.y + c.y, z: p.z + c.z })) });
    this.resolveLines();
    this.unstickActors();
  }

  resolveLines() {
    for (let pass = 0; pass < 6; pass++) {
      const cells = findLines(this.grid);
      if (!cells.length) return;
      clearCells(this.grid, cells);
      this.grid.version++;
      this.linesCleared++;
      this.emit('lines', { cells, count: cells.length });
      for (const a of this.actors) {
        if (!a.alive) continue;
        let near = Infinity;
        for (const c of cells) near = Math.min(near, Math.hypot((c.x + 0.5) * CELL - a.pos.x, (c.y + 0.5) * CELL - a.pos.y - 0.9, (c.z + 0.5) * CELL - a.pos.z));
        if (near < PIECE.clearBlastRadius) this.damage(a, PIECE.clearBlastDamage * (1 - near / PIECE.clearBlastRadius), null, 'line');
      }
    }
  }

  unstickActors() {
    for (const a of this.actors) {
      if (!a.alive || !hitsWorld(this.grid, a.pos.x, a.pos.y, a.pos.z, actorHeight(a))) continue;
      if (a.isHuman && this.opts.god) {
        // Invulnerable players get lifted onto the new block instead of being trapped inside it.
        for (let n = 0; n < 120 && hitsWorld(this.grid, a.pos.x, a.pos.y, a.pos.z, actorHeight(a)); n++) a.pos.y += 0.5;
        a.vel.y = 0;
      } else this.kill(a, null, 'piece');
    }
    if (this.bomb.pos && this.bomb.state !== 'carried') {
      while (this.grid.solid(Math.floor(this.bomb.pos.x / CELL), Math.floor(this.bomb.pos.y / CELL), Math.floor(this.bomb.pos.z / CELL))) this.bomb.pos.y += CELL;
    }
  }

  // ---- bomb ----
  siteAt(pos) {
    const x = Math.floor(pos.x / CELL), z = Math.floor(pos.z / CELL);
    for (const s of Object.values(SITES)) if (inRect(s.zone, x, z)) return s;
    return null;
  }

  stepBomb(dt) {
    const b = this.bomb;
    if (b.state === 'carried' && b.carrier) {
      const a = b.carrier;
      const site = this.siteAt(a.pos);
      if (a.alive && a.input.use && site && a.onGround) {
        this.planter = a;
        this.plantProgress += dt / (ROUND.plantTime);
        if (this.plantProgress >= 1) {
          a.hasBomb = false;
          b.state = 'planted'; b.carrier = null; b.pos = { ...a.pos }; b.site = site.name; b.fuse = ROUND.bombFuse;
          this.plantProgress = 0; this.planter = null;
          this.emit('planted', { site: site.name });
          this.emit('feed', { text: `Bomb planted at ${site.name}` });
        }
      } else { this.plantProgress = 0; this.planter = null; }
    }
    if (b.state === 'planted') {
      b.fuse -= dt;
      const d = this.actors.find(a => a.alive && a.team === TEAM.DEF && a.input.use && a.onGround && Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z) < ROUND.defuseRange);
      if (d) {
        if (this.defuser !== d) this.defuseProgress = 0;
        this.defuser = d;
        this.defuseProgress += dt / (ROUND.defuseTime);
        if (this.defuseProgress >= 1) {
          b.state = 'defused'; this.defuseProgress = 0; this.defuser = null;
          this.emit('feed', { text: `${d.name} defused the bomb` });
          this.endRound(TEAM.DEF, 'Bomb defused');
          return;
        }
      } else { this.defuseProgress = 0; this.defuser = null; }
      if (b.fuse <= 0) {
        b.state = 'exploded';
        this.emit('explode', { pos: b.pos });
        for (const a of this.actors) {
          if (!a.alive) continue;
          const dist = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z);
          if (dist < ROUND.blastRadius) this.damage(a, ROUND.blastDamage * (1 - dist / ROUND.blastRadius), null, 'blast');
        }
        this.endRound(TEAM.ATT, 'Target destroyed');
      }
    }
  }

  checkRoundEnd() {
    if (this.state !== 'live') return;
    const planted = this.bomb.state === 'planted';
    // Nobody left on either side (the walls closing, say) and no bomb down: the attackers failed to plant.
    if (!this.alive(TEAM.DEF).length && !this.alive(TEAM.ATT).length && !planted) return this.endRound(TEAM.DEF, 'Everyone was crushed');
    if (!this.alive(TEAM.DEF).length) return this.endRound(TEAM.ATT, 'Defenders eliminated');
    if (!this.alive(TEAM.ATT).length && !planted) return this.endRound(TEAM.DEF, 'Attackers eliminated');
    if (this.timer <= 0 && !planted) return this.endRound(TEAM.DEF, 'Time ran out');
  }

  endRound(winner, reason) {
    if (this.state === 'post') return;
    this.state = 'post';
    this.timer = ROUND.post;
    this.score[winner]++;
    this.roundWinner = winner;
    this.roundReason = reason;
    this.emit('roundEnd', { winner, reason });
  }
}

export const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
