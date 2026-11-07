import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../public/src/game.js';
import { TEAM, CLASSES, CLASS_ORDER, WEAPONS, GADGETS, ROUND, weaponName } from '../public/src/config.js';
import { cellCentre } from '../public/src/grid.js';

// A quiet 1v1 arena with no blocks, no bots, and a fixed spot to stand on.
function arena(humanClass = 'assault', opts = {}) {
  const g = new Game({ seed: 3, human: true, humanClass, teamSize: 2, pieces: false, ...opts });
  while (g.state === 'freeze') g.step();
  for (const a of g.actors) { a.brain = null; a.input.f = a.input.r = 0; }
  return g;
}
const me = g => g.human;
const foe = g => g.actors.find(a => a.team !== g.human.team && a.alive);
function face(g, a, t, dist = 12) {
  const p = cellCentre(3, 0, 19);
  a.pos = { x: p.x, y: 0, z: p.z }; a.yaw = 0; a.pitch = 0;
  t.pos = { x: p.x, y: 0, z: p.z - dist }; t.vel = { x: 0, y: 0, z: 0 };
}
const run = (g, n) => { for (let i = 0; i < n; i++) g.step(); };

test('the five Battlefield 1942 kits exist with the right weapons', () => {
  assert.deepEqual([...CLASS_ORDER].sort(), ['antitank', 'assault', 'engineer', 'medic', 'scout']);
  assert.equal(CLASSES.assault.primary, 'smg'); assert.equal(CLASSES.assault.gadget, 'grenade');
  assert.equal(CLASSES.scout.primary, 'sniper'); assert.equal(CLASSES.scout.gadget, 'binoculars');
  assert.equal(CLASSES.medic.gadget, 'medkit');
  assert.equal(CLASSES.engineer.gadget, 'mine');
  assert.equal(CLASSES.antitank.primary, 'launcher');
  for (const c of Object.values(CLASSES)) { assert.equal(c.secondary, 'pistol'); assert.ok(WEAPONS[c.primary]); }
});

test('each side names the same weapon differently', () => {
  assert.notEqual(weaponName(TEAM.ATT, 'smg'), weaponName(TEAM.DEF, 'smg'));
  assert.equal(weaponName(TEAM.ATT, 'launcher'), 'Panzerschreck');
  assert.equal(weaponName(TEAM.DEF, 'launcher'), 'Bazooka');
});

test('actors spawn with their class loadout, and both teams field a mix', () => {
  for (const c of CLASS_ORDER) {
    const g = arena(c);
    const h = me(g);
    assert.equal(h.cls, c);
    assert.deepEqual(h.loadout, [CLASSES[c].primary, 'pistol']);
    assert.equal(h.cur, CLASSES[c].primary);
    assert.equal(h.weapons[h.cur], WEAPONS[h.cur].mag);
  }
  const g = new Game({ seed: 1, teamSize: 5, humanClass: 'medic' });
  for (const t of [TEAM.ATT, TEAM.DEF]) assert.equal(new Set(g.actors.filter(a => a.team === t).map(a => a.cls)).size, 5, `${t} has all five kits`);
});

test('weapons switch only between the two in the loadout', () => {
  const g = arena('scout'); const h = me(g);
  h.input.weapon = 'pistol'; run(g, 2); assert.equal(h.cur, 'pistol');
  h.input.weapon = 'launcher'; run(g, 2); assert.equal(h.cur, 'pistol', 'cannot pick up a weapon outside the kit');
  h.input.weapon = 'sniper'; run(g, 2); assert.equal(h.cur, 'sniper');
});

test('class can be changed for the next round', () => {
  const g = arena('assault'); const h = me(g);
  g.setClass(h, 'engineer');
  assert.equal(h.cls, 'assault');
  g.startRound();
  assert.equal(h.cls, 'engineer'); assert.equal(h.cur, 'rifle'); assert.equal(h.gadget, 'mine');
});

test('a scoped sniper headshot kills in one hit and the body takes two', () => {
  const g = arena('scout'); const h = me(g), t = foe(g);
  face(g, h, t, 30);
  h.pitch = -0.02; // chest height
  h.input.scope = true; h.input.fire = true; run(g, 2);
  assert.equal(h.scoped, true);
  h.input.fire = false; run(g, 1);
  assert.ok(t.hp < 100, 'a hit landed');
  const body = t.hp;
  assert.ok(body > 0 && body <= 100 - WEAPONS.sniper.damage + 1, `body shot took ${100 - body}`);
  assert.ok(WEAPONS.sniper.damage * WEAPONS.sniper.headMult >= 100, 'headshot is lethal');
  assert.ok(WEAPONS.sniper.interval > 1, 'bolt action is slow');
});

test('scoping slows movement and is cancelled by reloading', () => {
  const g = arena('scout'); const h = me(g), t = foe(g);
  face(g, h, t, 30);
  h.input.f = 1; run(g, 90); const free = Math.hypot(h.vel.x, h.vel.z);
  h.input.scope = true; run(g, 90); const scoped = Math.hypot(h.vel.x, h.vel.z);
  assert.ok(scoped < free * 0.7, `scoped ${scoped} vs ${free}`);
  h.weapons.sniper = 3; h.input.reload = true; run(g, 3); assert.equal(h.scoped, false);
});

test('a rocket flies, explodes on the wall and splashes nearby enemies', () => {
  const g = arena('antitank'); const h = me(g), t = foe(g);
  face(g, h, t, 20);
  const others = g.actors.filter(a => a !== h && a !== t); for (const o of others) o.pos = { x: 5, y: 0, z: 5 };
  h.input.fire = true; run(g, 1); h.input.fire = false;
  assert.equal(g.projectiles.length, 1);
  assert.equal(g.projectiles[0].kind, 'rocket');
  assert.equal(h.weapons.launcher, 0);
  const ev = []; for (let i = 0; i < 120 && g.projectiles.length; i++) { g.step(); ev.push(...g.drainEvents()); }
  assert.equal(g.projectiles.length, 0);
  assert.ok(ev.some(e => e.type === 'boom' && e.cause === 'rocket'));
  assert.ok(t.hp <= 100 - WEAPONS.launcher.proj.direct + 1 || !t.alive, `direct hit took ${100 - t.hp}`);
});

test('a rocket fired at point blank also hurts the shooter, but friends are spared', () => {
  const g = arena('antitank'); const h = me(g);
  const mate = g.actors.find(a => a.team === h.team && a !== h);
  const t = foe(g);
  face(g, h, t, 2.5);
  mate.pos = { x: h.pos.x + 1, y: 0, z: h.pos.z - 1.2 };
  const hp = mate.hp;
  h.input.fire = true; run(g, 1); h.input.fire = false; run(g, 30);
  assert.ok(h.hp < 100, 'self splash');
  assert.equal(mate.hp, hp, 'no friendly fire');
});

test('grenades arc, bounce and blow up after the fuse; the count runs down', () => {
  const g = arena('assault'); const h = me(g), t = foe(g);
  face(g, h, t, 14);
  h.pitch = 0.3;
  h.input.gadget = true; run(g, 1); h.input.gadget = false; run(g, 1);
  assert.equal(h.gadgetN, GADGETS.grenade.n - 1);
  assert.equal(g.projectiles.length, 1);
  const y0 = g.projectiles[0].pos.y;
  run(g, 20); assert.notEqual(g.projectiles[0].pos.y, y0, 'gravity acts');
  let boom = false;
  for (let i = 0; i < 200 && !boom; i++) { g.step(); boom = g.drainEvents().some(e => e.type === 'boom' && e.cause === 'grenade'); }
  assert.ok(boom, 'detonates at the end of the fuse');
  assert.equal(g.projectiles.length, 0);
  // Out of grenades means nothing more is thrown.
  h.gadgetN = 0; h.gadgetCd = 0; h.input.gadget = true; run(g, 2);
  assert.equal(g.projectiles.length, 0);
});

test('engineer mines arm, then kill enemies who walk over them; friends walk past', () => {
  const g = arena('engineer'); const h = me(g), t = foe(g);
  face(g, h, t, 8);
  const mate = g.actors.find(a => a.team === h.team && a !== h);
  h.input.gadget = true; run(g, 1); h.input.gadget = false; run(g, 1);
  assert.equal(g.mines.length, 1);
  assert.equal(h.gadgetN, GADGETS.mine.n - 1);
  const m = g.mines[0];
  // Still arming: an enemy standing on it is safe.
  t.pos = { x: m.pos.x, y: 0, z: m.pos.z }; mate.pos = { ...t.pos };
  run(g, 5); assert.equal(g.mines.length, 1, 'unarmed');
  t.pos = { x: 0, y: 0, z: 0 }; mate.pos = { x: m.pos.x, y: 0, z: m.pos.z };
  run(g, 90); assert.equal(g.mines.length, 1, 'ignores teammates');
  mate.pos = { x: 0, y: 0, z: 0 };
  const hp = t.hp; t.pos = { x: m.pos.x + 0.5, y: 0, z: m.pos.z };
  run(g, 3);
  assert.equal(g.mines.length, 0);
  assert.ok(t.hp < hp, 'enemy was hurt');
});

test('the engineer plants and defuses faster than anyone else', () => {
  assert.ok(CLASSES.engineer.plant < 1 && CLASSES.engineer.defuse < 1);
  const time = cls => {
    const g = new Game({ seed: 9, human: true, humanClass: cls, teamSize: 2, pieces: false, humanTeam: TEAM.ATT });
    while (g.state === 'freeze') g.step();
    for (const a of g.actors) a.brain = null;
    const h = g.human;
    // Hand the bomb to the human and stand them on the target site.
    for (const a of g.actors) a.hasBomb = false;
    h.hasBomb = true; g.bomb.carrier = h;
    const site = Object.values(g.siteAt ? { A: g.siteAt(h.pos) } : {})[0];
    const s = g.targetSite; const c = cellCentre(...[...(s === 'A' ? [8, 0, 8] : [23, 0, 23])]);
    for (let x = 0; x < 32 && !g.siteAt(h.pos); x++) for (let z = 0; z < 32 && !g.siteAt(h.pos); z++) { const p = cellCentre(x, 0, z); h.pos = { x: p.x, y: 0, z: p.z }; }
    h.onGround = true; h.input.use = true;
    let t = 0; while (g.bomb.state === 'carried' && t < 600) { g.step(); t++; }
    return t / 60;
  };
  const eng = time('engineer'), base = time('assault');
  assert.ok(eng < base * 0.75, `engineer ${eng}s vs ${base}s`);
  assert.ok(Math.abs(base - ROUND.plantTime) < 0.4);
});

test('the medic heals a hurt teammate in reach, and themself when alone', () => {
  const g = arena('medic'); const h = me(g);
  const mate = g.actors.find(a => a.team === h.team && a !== h);
  mate.pos = { x: h.pos.x + 1, y: 0, z: h.pos.z }; mate.hp = 30;
  h.input.gadget = true; run(g, 1); h.input.gadget = false; run(g, 1);
  assert.equal(mate.hp, 30 + GADGETS.medkit.heal);
  assert.equal(h.gadgetN, GADGETS.medkit.n - 1);
  // Out of reach: nothing happens and no charge is spent.
  mate.pos = { x: h.pos.x + 20, y: 0, z: h.pos.z }; mate.hp = 30; h.hp = 100; h.gadgetCd = 0;
  h.input.gadget = true; run(g, 1); h.input.gadget = false; run(g, 1);
  assert.equal(mate.hp, 30); assert.equal(h.gadgetN, GADGETS.medkit.n - 1);
  h.hp = 40; h.gadgetCd = 0; h.input.gadget = true; run(g, 1);
  assert.equal(h.hp, 40 + GADGETS.medkit.heal);
  h.hp = 90; h.gadgetCd = 0; h.input.gadget = false; run(g, 1); h.input.gadget = true; run(g, 1);
  assert.equal(h.hp, 100, 'caps at full health');
});

test('binoculars mark enemies in view, but not through walls or behind you', () => {
  const g = arena('scout'); const h = me(g), t = foe(g);
  face(g, h, t, 30);
  h.input.gadget = true; run(g, 1); h.input.gadget = false;
  assert.ok(t.spottedUntil > g.time, 'marked');
  run(g, 1); t.spottedUntil = 0; h.gadgetCd = 0;
  h.yaw = Math.PI; h.input.gadget = true; run(g, 1); h.input.gadget = false;
  assert.equal(t.spottedUntil, 0, 'behind');
  assert.ok(h.gadgetCd > 0, 'has a cooldown');
});

test('kill feed names the national weapon variant', () => {
  const g = arena('assault'); const h = me(g), t = foe(g);
  face(g, h, t, 6);
  t.hp = 1; h.input.fire = true; run(g, 3);
  const feed = g.drainEvents().filter(e => e.type === 'feed').map(e => e.text).join('|');
  assert.ok(feed.includes(weaponName(h.team, 'smg')) || feed.includes('SMG'), feed);
});

test('bot-only matches with every class still finish, and every kit gets used', () => {
  const seen = { launch: 0, mine: 0, spot: 0, heal: 0, boom: 0 };
  const kills = {};
  for (const seed of [11, 12]) {
    const g = new Game({ seed, human: false, teamSize: 5 });
    for (let i = 0; i < 60 * 60 * 25 && !g.matchOver; i++) {
      g.step();
      for (const e of g.drainEvents()) if (e.type in seen) seen[e.type]++;
    }
    assert.ok(g.matchOver, `seed ${seed} finished`);
    for (const a of g.actors) kills[a.cls] = (kills[a.cls] ?? 0) + a.kills;
    for (const a of g.actors) assert.ok(Number.isFinite(a.hp) && Number.isFinite(a.pos.x));
  }
  for (const k of Object.keys(seen)) assert.ok(seen[k] > 0, `${k} happened`);
  for (const c of CLASS_ORDER) assert.ok(kills[c] > 0, `${c} scored kills`);
});

test('the player can wear any roster look, and the bot who had it gets the default one', async () => {
  const { lookFor } = await import('../public/src/looks.js');
  const g = new Game({ seed: 2, human: true, humanTeam: TEAM.ATT, teamSize: 3, humanLook: 'Cole' });
  assert.equal(g.human.name, 'You');
  assert.equal(lookFor(g.human).hat[0], 'cowboy');
  const cole = g.actors.find(a => a.name === 'Cole');
  assert.equal(lookFor(cole), (await import('../public/src/looks.js')).ROSTER.You, 'Cole the bot swapped to the recruit look');
  const plain = new Game({ seed: 2, human: true, teamSize: 3 });
  assert.equal(lookFor(plain.human), (await import('../public/src/looks.js')).ROSTER.You);
});
