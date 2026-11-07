import { CELL, TICK, MOVE, WEAPONS, ROUND, PIECE, SKILL, TEAM, GADGETS, CLASSES, CLASS_ORDER, weaponName } from './config.js';
import { rayBox, cellCentre } from './grid.js';
import { buildMap, SITES, SPAWNS, inRect } from './map.js';
import { Nav } from './nav.js';
import { SHAPES, choosePlacement, findLines, clearCells, adjustPlacement, directorAdjust } from './pieces.js';
import { makeActor, resetActor, stepMovement, eyePos, aimDir, actorHeight, hitsWorld } from './actor.js';
import { updateBot, initBrains } from './bots.js';

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

const KILL_NAMES = { grenade: 'Grenade', mine: 'Mine', rocket: 'Rocket' };
const ATT_NAMES = ['Ash', 'Brick', 'Cole', 'Dune', 'Echo', 'Flint'];
const DEF_NAMES = ['Grit', 'Hale', 'Ivo', 'Jett', 'Knox', 'Lark'];

// The full match simulation. It knows nothing about rendering, so it can run headless in tests.
export class Game {
  constructor(opts = {}) {
    this.opts = { seed: Date.now() & 0xffff, teamSize: 5, humanTeam: TEAM.ATT, human: true, pieceInterval: PIECE.interval, skill: 'normal', pieces: true, ...opts };
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
    this.time = 0;

    for (const team of [TEAM.ATT, TEAM.DEF]) {
      const names = team === TEAM.ATT ? ATT_NAMES : DEF_NAMES;
      for (let i = 0; i < this.opts.teamSize; i++) {
        const human = this.opts.human && team === this.opts.humanTeam && i === 0;
        const hc = this.opts.humanClass && CLASSES[this.opts.humanClass] ? this.opts.humanClass : 'assault';
        // The human takes their pick; teammates fill the other kits in order so every side is mixed.
        const rest = CLASS_ORDER.filter(c => c !== hc);
        const humanHere = this.opts.human && team === this.opts.humanTeam;
        const cls = human ? hc : humanHere ? rest[(i - 1) % rest.length] : CLASS_ORDER[i % CLASS_ORDER.length];
        const a = makeActor(this.actors.length, team, human ? 'You' : names[i], human, cls);
        this.actors.push(a);
        if (human) this.human = a;
      }
    }
    // The player may wear any roster look. If a bot already has it, that bot takes the default recruit look.
    const pick = this.opts.humanLook;
    if (this.human && pick && pick !== 'You') {
      this.human.lookName = pick;
      for (const b of this.actors) if (b !== this.human && b.name === pick) b.lookName = 'You';
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
    this.state = 'freeze';
    this.timer = ROUND.freeze;
    this.roundWinner = null;
    this.bomb = { state: 'carried', carrier: null, pos: null, fuse: 0, site: null };
    this.plantProgress = 0; this.defuseProgress = 0;
    this.piece = null;
    this.projectiles = []; this.mines = []; this.nextProj = 1;
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

  // Takes effect at the start of the next round, as in a kit-select screen.
  setClass(a, cls) { if (CLASSES[cls]) a.nextCls = cls; }

  bombColumn() {
    if (this.bomb.state === 'carried' || !this.bomb.pos) return null;
    return { x: Math.floor(this.bomb.pos.x / CELL), z: Math.floor(this.bomb.pos.z / CELL) };
  }

  alive(team) { return this.actors.filter(a => a.alive && a.team === team); }

  step(dt = TICK) {
    if (this.matchOver) return;
    if (this.state === 'post') {
      this.timer -= dt;
      this.stepActors(dt, false);
      this.stepProjectiles(dt);
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
    this.stepActors(dt, false);
    this.stepProjectiles(dt);
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
      if (fall) this.damage(a, fall, null, 'fall');
      if (!a.alive) continue;
      if (!frozen) this.stepWeapon(a, dt);
      a.recoil *= Math.exp(-5 * dt);
      if (this.bomb.state === 'dropped' && a.team === TEAM.ATT && dist2d(a.pos, this.bomb.pos) < 1.4 && Math.abs(a.pos.y - this.bomb.pos.y) < 2) {
        a.hasBomb = true; this.bomb.state = 'carried'; this.bomb.carrier = a; this.bomb.pos = null;
        this.emit('feed', { text: `${a.name} picked up the bomb` });
      }
    }
  }

  isChannelling(a) {
    return (this.planter === a && this.plantProgress > 0) || (this.defuser === a && this.defuseProgress > 0);
  }

  stepWeapon(a, dt) {
    const inp = a.input;
    a.fireCd -= dt;
    a.gadgetCd -= dt;
    if (inp.weapon && inp.weapon !== a.cur && inp.weapon in a.weapons) { a.cur = inp.weapon; a.reloadT = 0; a.fireCd = 0.3; a.shotStreak = 0; this.emit('switch', { actor: a }); }
    inp.weapon = null;
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
    if ((inp.reload && a.weapons[a.cur] < w.mag) || (inp.fire && a.weapons[a.cur] === 0)) {
      a.reloadT = w.reload; a.shotStreak = 0; this.emit('reload', { actor: a });
      return;
    }
    const trigger = inp.fire && (w.auto || !a.lastFireHeld);
    a.lastFireHeld = inp.fire;
    if (!inp.fire) a.shotStreak = Math.max(0, a.shotStreak - dt * 10);
    if (trigger && a.fireCd <= 0 && !this.isChannelling(a)) {
      a.fireCd = w.interval;
      a.weapons[a.cur]--;
      this.fire(a, w);
    }
  }

  fire(a, w) {
    const moving = Math.hypot(a.vel.x, a.vel.z) / MOVE.run;
    let spread = w.spread + w.moveSpread * Math.max(0, moving - 0.3) + (a.onGround ? 0 : 0.05) + Math.min(a.shotStreak, 12) * 0.0018;
    if (a.crouching) spread *= 0.7;
    if (a.scoped) spread *= 0.25;
    const d = aimDir(a);
    const dx = d.x + (this.rng() - 0.5) * 2 * spread, dy = d.y + (this.rng() - 0.5) * 2 * spread, dz = d.z + (this.rng() - 0.5) * 2 * spread;
    const n = Math.hypot(dx, dy, dz);
    const dir = { x: dx / n, y: dy / n, z: dz / n };
    const eye = eyePos(a);
    if (w.proj) {
      a.shotStreak += 1;
      a.recoil = Math.min(w.kickMax, a.recoil + w.kick);
      const o = { x: eye.x + dir.x * 0.9, y: eye.y - 0.15 + dir.y * 0.9, z: eye.z + dir.z * 0.9 };
      this.projectiles.push({ id: this.nextProj++, kind: w.proj.kind, owner: a, team: a.team, pos: o, vel: { x: dir.x * w.proj.speed, y: dir.y * w.proj.speed, z: dir.z * w.proj.speed }, life: w.proj.life, weapon: a.cur });
      this.emit('launch', { actor: a, kind: w.proj.kind, from: o, weapon: a.cur });
      this.emit('shot', { actor: a, from: eye, to: o, hit: false, weapon: a.cur, rocket: true });
      for (const t of this.actors) if (t.alive && t.brain && t.team !== a.team && dist2d(t.pos, a.pos) < 55) t.brain.heard = { ...a.pos };
      return;
    }
    let dist = this.grid.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, 200);
    let victim = null, head = false;
    for (const t of this.actors) {
      if (!t.alive || t.team === a.team) continue;
      const h = actorHeight(t), r = MOVE.radius;
      const headH = 0.3;
      const hd = rayBox(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, t.pos.x - 0.14, t.pos.y + h - headH, t.pos.z - 0.14, t.pos.x + 0.14, t.pos.y + h, t.pos.z + 0.14);
      const bd = rayBox(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, t.pos.x - r, t.pos.y, t.pos.z - r, t.pos.x + r, t.pos.y + h - headH, t.pos.z + r);
      if (hd !== null && hd < dist) { dist = hd; victim = t; head = true; }
      if (bd !== null && bd < dist) { dist = bd; victim = t; head = false; }
    }
    a.shotStreak += 1;
    a.recoil = Math.min(w.kickMax, a.recoil + w.kick);
    const end = { x: eye.x + dir.x * dist, y: eye.y + dir.y * dist, z: eye.z + dir.z * dist };
    this.emit('shot', { actor: a, from: eye, to: end, hit: !!victim, weapon: a.cur });
    for (const t of this.actors) if (t.alive && t.brain && t.team !== a.team && dist2d(t.pos, a.pos) < 45) t.brain.heard = { ...a.pos };
    if (victim) this.damage(victim, w.damage * (head ? w.headMult : 1), a, a.cur, head);
  }

  damage(t, amount, by, cause, head = false) {
    if (!t.alive || this.state === 'freeze') return;
    if (t.isHuman && this.opts.god) return;
    t.hp -= amount;
    this.emit('hurt', { actor: t, by, amount, head });
    if (t.brain && by) t.brain.heard = { ...by.pos };
    if (t.hp <= 0) this.kill(t, by, cause, head);
  }

  kill(t, by, cause, head) {
    if (!t.alive) return;
    if (t.isHuman && this.opts.god) return;
    t.hp = 0; t.alive = false; t.deaths++; t.mantle = null;
    if (by && by !== t) by.kills++;
    if (t.hasBomb) {
      t.hasBomb = false;
      const y = Math.max(0, t.pos.y);
      this.bomb.state = 'dropped'; this.bomb.carrier = null;
      this.bomb.pos = { x: t.pos.x, y, z: t.pos.z };
      this.emit('feed', { text: 'The bomb was dropped' });
    }
    if (this.planter === t) this.plantProgress = 0;
    if (this.defuser === t) this.defuseProgress = 0;
    const how = { piece: 'was crushed', fall: 'fell too far', blast: 'was caught in the blast', line: 'was caught in a line clear' }[cause];
    this.emit('feed', { text: how ? `${t.name} ${how}` : `${by?.name ?? '?'} [${KILL_NAMES[cause] ?? weaponName(by?.team, cause)}${head ? ' HS' : ''}] ${t.name}`, crush: cause === 'piece' });
    this.emit('death', { actor: t, cause });
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
      this.projectiles.push({ id: this.nextProj++, kind: 'grenade', owner: a, team: a.team, pos, vel: { x: d.x / n * g.speed + a.vel.x * 0.5, y: (d.y + up) / n * g.speed, z: d.z / n * g.speed + a.vel.z * 0.5 }, life: g.fuse, weapon: 'grenade' });
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
    for (const t of this.actors) {
      if (!t.alive) continue;
      if (t.team === owner.team && t !== owner) continue;
      const c = { x: t.pos.x, y: t.pos.y + 0.9, z: t.pos.z };
      const d = Math.hypot(c.x - pos.x, c.y - pos.y, c.z - pos.z);
      if (d > radius) continue;
      if (d > 0.6 && !this.grid.los({ x: pos.x, y: pos.y + 0.1, z: pos.z }, c)) continue;
      const k = 1 - d / radius;
      this.damage(t, damage * k * (t === owner ? 0.5 : 1), owner, cause);
    }
  }

  stepProjectiles(dt) {
    this.time = (this.time || 0) + dt;
    for (const m of this.mines) {
      if (m.arm > 0) { m.arm -= dt; continue; }
      const g = GADGETS.mine;
      const hit = this.actors.find(t => t.alive && t.team !== m.team && Math.hypot(t.pos.x - m.pos.x, t.pos.z - m.pos.z) < g.trigger && Math.abs(t.pos.y - m.pos.y) < 1.2);
      if (hit) { m.dead = true; this.explode({ x: m.pos.x, y: m.pos.y + 0.2, z: m.pos.z }, g.radius, g.damage, m.owner, 'mine'); }
    }
    this.mines = this.mines.filter(m => !m.dead);
    if (!this.projectiles.length) return;
    for (const p of this.projectiles) {
      p.life -= dt;
      if (p.kind === 'rocket') {
        const spd = Math.hypot(p.vel.x, p.vel.y, p.vel.z), len = spd * dt;
        const dx = p.vel.x / spd, dy = p.vel.y / spd, dz = p.vel.z / spd;
        let hit = this.grid.raycast(p.pos.x, p.pos.y, p.pos.z, dx, dy, dz, len), direct = null;
        for (const t of this.actors) {
          if (!t.alive || t.team === p.team) continue;
          const h = actorHeight(t), r = MOVE.radius + 0.1;
          const d = rayBox(p.pos.x, p.pos.y, p.pos.z, dx, dy, dz, t.pos.x - r, t.pos.y, t.pos.z - r, t.pos.x + r, t.pos.y + h, t.pos.z + r);
          if (d !== null && d < hit) { hit = d; direct = t; }
        }
        if (hit < len || p.life <= 0) {
          const at = { x: p.pos.x + dx * Math.min(hit, len), y: p.pos.y + dy * Math.min(hit, len), z: p.pos.z + dz * Math.min(hit, len) };
          p.dead = true;
          const cfg = WEAPONS.launcher.proj;
          if (direct) this.damage(direct, cfg.direct, p.owner, 'rocket');
          this.explode(at, cfg.radius, cfg.splash, p.owner, 'rocket');
        } else { p.pos.x += dx * len; p.pos.y += dy * len; p.pos.z += dz * len; }
      } else {
        p.vel.y -= MOVE.gravity * dt;
        for (const ax of ['x', 'y', 'z']) {
          const n = { ...p.pos }; n[ax] += p.vel[ax] * dt;
          if (this.grid.boxHits(n.x - 0.1, n.y - 0.1, n.z - 0.1, n.x + 0.1, n.y + 0.1, n.z + 0.1)) {
            p.vel[ax] *= -0.35;
            for (const o of ['x', 'y', 'z']) if (o !== ax) p.vel[o] *= 0.8;
          } else p.pos[ax] = n[ax];
        }
        if (p.pos.y < -5) p.life = 0;
        if (p.life <= 0) { p.dead = true; this.explode(p.pos, GADGETS.grenade.radius, GADGETS.grenade.damage, p.owner, 'grenade'); }
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);
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
    this.piece = { ...c, t: 0, drop: PIECE.dropHeight, rev: 0, controlled: false, aiDone: false, fast: false };
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
    for (const c of p.cells) {
      const x = p.x + c.x, y = p.y + c.y, z = p.z + c.z;
      this.grid.set(x, y, z, p.shapeId + 1);
      this.grid.removeCratesAt(x, y, z);
    }
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
        this.plantProgress += dt / (ROUND.plantTime * CLASSES[a.cls].plant);
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
        this.defuseProgress += dt / (ROUND.defuseTime * CLASSES[d.cls].defuse);
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
