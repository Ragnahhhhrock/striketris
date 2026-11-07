import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../public/src/game.js';
import { buildMap, SITES, SPAWNS } from '../public/src/map.js';
import { Nav } from '../public/src/nav.js';
import { orient, restHeight, findLines, clearCells, validPlacement, SHAPES } from '../public/src/pieces.js';
import { STATIC, EMPTY } from '../public/src/grid.js';
import { WEAPONS } from '../public/src/config.js';
import { TICK, MIN_LINE } from '../public/src/config.js';
import { makeActor, resetActor, stepMovement } from '../public/src/actor.js';

// Builds a hand-placed falling block that the director will not touch.
function mkPiece(game, shapeId, x, z, drop = 54, rot = 0, pose = 0, mirror = false) {
  const cells = orient(shapeId, rot, pose, mirror);
  const y = validPlacement(game.grid, cells, x, z, null);
  return { shapeId, rot, pose, mirror, cells, x, y, z, t: 0, drop, rev: 0, controlled: true, aiDone: true, fast: false };
}

test('every tetromino has four distinct cubes in every pose', () => {
  SHAPES.forEach((_, s) => { for (let r = 0; r < 4; r++) for (let p = 0; p < 3; p++) {
    const cells = orient(s, r, p);
    assert.equal(new Set(cells.map(c => `${c.x},${c.y},${c.z}`)).size, 4);
    assert.ok(cells.every(c => c.x >= 0 && c.y >= 0 && c.z >= 0));
  } });
});

test('all spawns reach both sites on the empty map', () => {
  const g = buildMap(), nav = new Nav(g);
  for (const team of Object.values(SPAWNS)) for (const [x, z] of team.cells) for (const s of Object.values(SITES)) {
    const p = nav.path({ x, y: 0, z }, { x: s.centre[0], y: 0, z: s.centre[1] });
    assert.ok(p && p.length > 3);
  }
});

test('a piece rests on the floor, then stacks on another', () => {
  const g = buildMap();
  const cells = orient(1, 0, 0);
  assert.equal(restHeight(g, cells, 14, 14), 0);
  for (const c of cells) g.set(14 + c.x, 0, 14 + c.z, 2);
  assert.equal(restHeight(g, cells, 14, 14), 1);
  assert.equal(restHeight(g, cells, 15, 15), 1, 'overlap stacks');
});

test('a full wall-to-wall run clears and things above it drop', () => {
  const g = buildMap();
  // The connector at x 8..12 spans z 14..18 between two lanes, so use mid: x 13..18 at z 15 is 6 wide but open to lanes.
  // Build an enclosed test row by walling either side.
  const z = 2, y = 0;
  for (let x = 2; x <= 2 + MIN_LINE + 1; x++) g.set(x, y, z, STATIC);
  for (let x = 3; x < 3 + MIN_LINE; x++) g.set(x, y, z, 1);
  g.set(4, 1, z, 3);
  const lines = findLines(g);
  assert.equal(lines.filter(c => c.z === z).length, MIN_LINE);
  clearCells(g, lines);
  assert.equal(g.get(3, 0, z), EMPTY);
  assert.equal(g.get(4, 0, z), 3, 'cube above drops one');
  assert.equal(g.get(4, 1, z), EMPTY);
});

test('a player can climb onto a one-cell block by mantling', () => {
  const g = buildMap();
  g.set(15, 0, 15, 1);
  const a = makeActor(0, 'attackers', 't', true); resetActor(a);
  a.pos = { x: 15.5 * 3, y: 0, z: 16.5 * 3 - 0.5 };
  a.yaw = 0; a.input.f = 1; a.input.jump = true;
  for (let i = 0; i < 90; i++) stepMovement(g, a, TICK);
  assert.ok(a.pos.y >= 3 - 0.01, `y=${a.pos.y}`);
});

test('piece crushes an actor standing under it', () => {
  const game = new Game({ seed: 3, human: false, teamSize: 2 });
  game.state = 'live'; game.timer = 100;
  const v = game.actors[0];
  v.pos = { x: 15.5 * 3, y: 0, z: 15.5 * 3 };
  game.piece = mkPiece(game, 1, 15, 15, 5);
  v.brain = null;
  for (let i = 0; i < 60; i++) game.stepPiece(TICK);
  assert.equal(v.alive, false);
  assert.equal(game.grid.get(15, 0, 15), 2);
});

for (const seed of [1, 2, 3, 4]) {
  test(`bots play a full match without breaking (seed ${seed})`, () => {
    const game = new Game({ seed, human: false, teamSize: 5 });
    const outcomes = {};
    let steps = 0, rounds = 0;
    while (!game.matchOver && steps < 60 * 60 * 90) {
      game.step(TICK); steps++;
      for (const e of game.drainEvents()) if (e.type === 'roundEnd') { outcomes[e.reason] = (outcomes[e.reason] || 0) + 1; rounds++; }
      if (steps % 60 === 0) for (const a of game.actors) {
        assert.ok(Number.isFinite(a.pos.x + a.pos.y + a.pos.z), 'position finite');
        assert.ok(a.pos.y > -1, 'stays above floor');
      }
    }
    assert.ok(game.matchOver, 'match finishes');
    console.log(`seed ${seed}: ${rounds} rounds, ${(steps / 3600).toFixed(1)} sim-min, score ${game.score.attackers}-${game.score.defenders}, pieces ${game.piecesLanded}, lines ${game.linesCleared}`, outcomes);
  });
}

test('a human carrier plants on site and the defender side can defuse', () => {
  const game = new Game({ seed: 5, teamSize: 1, humanTeam: 'attackers', pieces: false, items: false });
  const h = game.human, bot = game.actors.find(a => !a.isHuman);
  game.state = 'live'; game.timer = 100;
  for (const a of game.actors) { a.hasBomb = false; }
  h.hasBomb = true; game.bomb.carrier = h;
  h.pos = { x: 6.5 * 3, y: 0, z: 7.5 * 3 };
  h.input.use = true;
  bot.pos = { x: 15 * 3, y: 0, z: 4 * 3 };
  bot.brain.post = [15, 3];
  let safety = 0;
  while (game.bomb.state === 'carried' && safety++ < 400) game.step(TICK);
  assert.equal(game.bomb.state, 'planted');
  assert.equal(game.bomb.site, 'A');
  h.input.use = false;
  h.hp = 1e9;
  bot.hp = 1e9; h.pos = { x: 45, y: 0, z: 45 };
  safety = 0;
  while (game.state === 'live' && safety++ < 60 * 45) { h.hp = 1e9; bot.hp = 1e9; game.step(TICK); }
  assert.equal(game.roundWinner, 'defenders', game.roundReason);
});

test('an invulnerable player survives a block landing on them and is lifted clear', () => {
  const game = new Game({ seed: 9, teamSize: 1, god: true, pieces: true });
  game.state = 'live'; game.timer = 100;
  const h = game.human;
  h.pos = { x: 15.5 * 3, y: 0, z: 15.5 * 3 };
  game.piece = mkPiece(game, 1, 15, 15, 5);
  for (let i = 0; i < 60; i++) game.stepPiece(TICK);
  assert.equal(h.alive, true);
  assert.ok(h.pos.y >= 3 - 0.01, `lifted to y=${h.pos.y}`);
});

test('flipping an S over gives a Z', () => {
  const key = cells => cells.map(c => `${c.x},${c.z}`).sort().join('|');
  const flipped = key(orient(3, 0, 0, true));
  assert.ok([0, 1, 2, 3].some(r => key(orient(4, r, 0, false)) === flipped));
});

test('a falling block can be moved, rotated, flipped and tumbled', () => {
  const game = new Game({ seed: 4, human: false, teamSize: 1 });
  game.state = 'live'; game.timer = 100;
  game.piece = mkPiece(game, 2, 15, 14, 40);
  game.piece.controlled = false;
  assert.ok(game.adjustPiece({ dx: 1 }));
  assert.equal(game.piece.x, 16);
  assert.equal(game.piece.controlled, true, 'steering stops the AI director');
  const before = game.piece.cells.map(c => `${c.x},${c.y},${c.z}`).join('|');
  assert.ok(game.adjustPiece({ rot: 1 }));
  assert.notEqual(game.piece.cells.map(c => `${c.x},${c.y},${c.z}`).join('|'), before);
  assert.ok(game.adjustPiece({ mirror: true }));
  assert.equal(game.piece.mirror, true);
  assert.ok(game.adjustPiece({ tumble: 1 }));
  assert.equal(game.piece.pose, 1);
  assert.ok(game.piece.rev >= 4);
  assert.ok(game.piece.drop > 30, 'altitude is preserved');
});

test('steering is refused near the ground and out of bounds', () => {
  const game = new Game({ seed: 4, human: false, teamSize: 1 });
  game.state = 'live'; game.timer = 100;
  game.piece = mkPiece(game, 1, 16, 14, 3);
  assert.equal(game.adjustPiece({ dx: 1 }), false, 'locked in the last stretch');
  game.piece = mkPiece(game, 1, 16, 14, 40);
  assert.equal(game.adjustPiece({ dx: -50 }), false);
  assert.equal(game.piece.x, 16);
});

test('a steered block lands where it was steered', () => {
  const game = new Game({ seed: 4, human: false, teamSize: 1 });
  game.state = 'live'; game.timer = 100;
  game.piece = mkPiece(game, 1, 16, 14, 40);
  game.adjustPiece({ dx: 1 });
  for (let i = 0; i < 60 * 5 && game.piece; i++) game.stepPiece(TICK);
  assert.equal(game.piece, null);
  assert.notEqual(game.grid.get(17, 0, 14), EMPTY);
  assert.equal(game.grid.get(16, 0, 14), EMPTY);
});

test('hard drop lands much faster than a normal fall', () => {
  const run = fast => {
    const game = new Game({ seed: 4, human: false, teamSize: 1 });
    game.state = 'live'; game.timer = 100;
    game.piece = mkPiece(game, 1, 16, 14, 40);
    if (fast) game.adjustPiece({ fast: true });
    let n = 0;
    while (game.piece && n < 2000) { game.stepPiece(TICK); n++; }
    return n;
  };
  assert.ok(run(true) * 2 < run(false));
});

test('the director steers an unattended block once', () => {
  const game = new Game({ seed: 8, human: false, teamSize: 1 });
  game.state = 'live'; game.timer = 100;
  game.piece = mkPiece(game, 0, 16, 14, 54);
  game.piece.controlled = false; game.piece.aiDone = false;
  for (let i = 0; i < 60; i++) game.stepPiece(TICK);
  assert.equal(game.piece.aiDone, true);
  assert.ok(game.piece.rev <= 1);
});

// An open arena with the shooter in the middle and everyone else parked in a corner.
function openRange(weapon) {
  const game = new Game({ seed: 9, teamSize: 1, human: false, pieces: false });
  game.grid.cells.fill(EMPTY); game.grid.crates = [];
  game.drainEvents();
  const [shooter, target] = [game.actors.find(a => a.team === 'attackers'), game.actors.find(a => a.team === 'defenders')];
  Object.assign(shooter.pos, { x: 48, y: 0, z: 70 }); shooter.yaw = 0; shooter.cur = weapon; shooter.isHuman = true;
  Object.assign(target.pos, { x: 6, y: 0, z: 6 });
  game.state = 'live';
  return { game, shooter, target };
}

test('raycastHit reports the face it struck', () => {
  const { game } = openRange('rifle');
  const down = game.grid.raycastHit(48, 1.6, 48, 0, -1, 0, 50);
  assert.ok(Math.abs(down.dist - 1.6) < 1e-6);
  assert.deepEqual([down.nx, down.ny, down.nz], [0, 1, 0]);
  game.grid.set(20, 0, 16, STATIC);
  const side = game.grid.raycastHit(30, 1, 50, 1, 0, 0, 100);
  assert.deepEqual([side.nx, side.ny, side.nz], [-1, 0, 0]);
  assert.ok(Math.abs(side.dist - 30) < 1e-6);
  const sky = game.grid.raycastHit(48, 10, 48, 0, 1, 0, 80);
  assert.equal(sky.dist, 80);
  assert.deepEqual([sky.nx, sky.ny, sky.nz], [0, 0, 0]);
});

test('a rifle round skips off the floor and hits a target downrange for reduced damage', () => {
  const { game, shooter, target } = openRange('rifle');
  const w = WEAPONS.rifle;
  // Aim at the floor 10m ahead; the round comes back up and meets a target 16.17m away at about waist height.
  shooter.pitch = -Math.atan(1.62 / 10);
  Object.assign(target.pos, { x: 48, y: 0, z: 70 - 16.17 });
  game.fire(shooter, w);
  const ev = game.drainEvents();
  assert.equal(ev.filter(e => e.type === 'ricochet').length, 1);
  const shot = ev.find(e => e.type === 'shot');
  assert.equal(shot.bounces, 1);
  assert.equal(shot.path.length, 3);
  assert.ok(shot.hit);
  const lost = 100 - target.hp;
  assert.ok(Math.abs(lost - w.damage * w.bounceKeep) < 0.01, `lost ${lost}`);
});

test('rounds stop bouncing at the weapon limit and a ricochet never gets the headshot bonus', () => {
  const { game, shooter } = openRange('pistol');
  shooter.pitch = -0.2;
  game.fire(shooter, WEAPONS.pistol);
  const ev = game.drainEvents();
  // Floor, then the far wall, then the round is spent on the next surface.
  assert.equal(ev.filter(e => e.type === 'ricochet').length, WEAPONS.pistol.bounces);
  const pistolShot = ev.find(e => e.type === 'shot');
  assert.equal(pistolShot.path.length, WEAPONS.pistol.bounces + 2);
  assert.ok(pistolShot.impact, 'the last wall leaves a mark');
  const rifle = openRange('rifle');
  rifle.shooter.pitch = -0.001;
  rifle.game.fire(rifle.shooter, WEAPONS.rifle);
  const shot = rifle.game.drainEvents().find(e => e.type === 'shot');
  assert.ok(shot.path.length <= WEAPONS.rifle.bounces + 2);
  // A target whose head sits on the bounced line takes body damage, not the head multiplier.
  const hs = openRange('rifle');
  hs.shooter.pitch = -Math.atan(1.62 / 10);
  Object.assign(hs.target.pos, { x: 48, y: 0, z: 70 - 17.5 });
  hs.game.fire(hs.shooter, WEAPONS.rifle);
  const hurt = hs.game.drainEvents().find(e => e.type === 'hurt');
  if (hurt) { assert.equal(hurt.head, false); assert.ok(hurt.amount <= WEAPONS.rifle.damage * WEAPONS.rifle.bounceKeep + 1e-6); }
});

test('firing kicks the view up and the kick settles back down', () => {
  for (const id of ['rifle', 'pistol']) {
    const { game, shooter } = openRange(id);
    game.fire(shooter, WEAPONS[id]);
    assert.ok(shooter.recoil >= WEAPONS[id].kick - 1e-9, `${id} kicks`);
    const kicked = shooter.recoil;
    for (let i = 0; i < 120; i++) game.step(TICK);
    assert.ok(shooter.recoil < kicked * 0.1, `${id} settles`);
  }
  assert.ok(WEAPONS.pistol.kick > WEAPONS.rifle.kick * 2, 'the pistol hits much harder than a rifle round');
});

// ---- elevator floor sections ----
import { liftTop, stepLifts, LIFT_SPOTS } from '../public/src/lifts.js';
import { LIFT } from '../public/src/config.js';

// One tick of lifts and movement for a single actor, without bots getting in the way.
function tick(game, a) { stepLifts(game, TICK); stepMovement(game.grid, a, TICK); }

// A game with one lift forced to a known phase and one actor standing on it.
function liftGame() {
  const game = new Game({ seed: 4, human: false, teamSize: 1, pieces: false });
  game.state = 'live'; game.timer = 100;
  const L = game.grid.lifts[0];
  L.offset = 0; game.liftT = 0;
  const a = game.actors[0];
  a.pos = { x: (L.x0 + L.x1) / 2, y: 0, z: (L.z0 + L.z1) / 2 };
  a.vel = { x: 0, y: 0, z: 0 }; a.onGround = true;
  a.input.f = a.input.r = 0;
  return { game, L, a };
}

test('a lift rests flush, rises to its full height, holds, then lowers', () => {
  assert.equal(liftTop(0, 0), 0);
  assert.equal(liftTop(LIFT.down + LIFT.travel + 0.1, 0), LIFT.rise);
  assert.equal(liftTop(LIFT.down + LIFT.travel + LIFT.up + LIFT.travel, 0), 0);
  const mid = liftTop(LIFT.down + LIFT.travel / 2, 0);
  assert.ok(mid > 0 && mid < LIFT.rise);
});

test('a lift carries a player up and back down', () => {
  const { game, L, a } = liftGame();
  let peak = 0;
  for (let i = 0; i < 60 * 15; i++) {
    tick(game, a);
    assert.ok(a.alive);
    if (Math.abs(a.pos.x - (L.x0 + L.x1) / 2) < 0.01) assert.ok(Math.abs(a.pos.y - L.y1) < 0.1, `rider stays on the platform at t=${game.liftT.toFixed(2)}`);
    peak = Math.max(peak, a.pos.y);
  }
  assert.ok(peak > LIFT.rise - 0.1, 'rider reached the top');
});

test('a raised lift blocks movement and shots, a lowered one does not', () => {
  const { game, L } = liftGame();
  const g = game.grid;
  const y = 1, x = L.x0 + 1.5;
  assert.equal(g.boxHits(x - 0.3, y, L.z0 + 1, x + 0.3, y + 1.8, L.z0 + 1.6), false, 'flush lift is walkable');
  L.y1 = LIFT.rise;
  assert.equal(g.boxHits(x - 0.3, y, L.z0 + 1, x + 0.3, y + 1.8, L.z0 + 1.6), true);
  const d = g.raycast(L.x0 - 5, 1, (L.z0 + L.z1) / 2, 1, 0, 0, 50);
  assert.ok(Math.abs(d - 5) < 0.01, 'rays stop at the raised lift');
  L.y1 = 0;
  assert.ok(g.raycast(L.x0 - 5, 1, (L.z0 + L.z1) / 2, 1, 0, 0, 50) > 10, 'rays pass over a flush lift');
});

test('a rising lift pushes up whoever is standing over it', () => {
  const { game, L, a } = liftGame();
  a.pos.y = 0.3; a.onGround = false; // mid-jump just above the floor
  game.liftT = LIFT.down - 0.01;
  for (let i = 0; i < 60; i++) tick(game, a);
  assert.ok(a.pos.y >= L.y1 - 0.01 && a.pos.y > 0.3, 'lifted onto the platform');
  assert.ok(a.alive);
});

test('pieces never land on a lift', () => {
  const game = new Game({ seed: 9, human: false, teamSize: 1 });
  for (const { rect: [x0, x1, z0, z1] } of LIFT_SPOTS) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      assert.equal(validPlacement(game.grid, orient(1, 0, 0), x, z, null) === null, true, `piece refused at ${x},${z}`);
    }
  }
});

test('lifts and floor tiles do not share a cell', () => {
  const g = buildMap();
  for (const L of g.lifts) for (let z = L.cz0; z <= L.cz1; z++) for (let x = L.cx0; x <= L.cx1; x++) assert.ok(g.liftAt(x, z) && g.get(x, 0, z) === EMPTY);
});

// ---- Quake 3 style pickups and the rocket launcher ----
import { PICKUP_SPOTS, makePickups, wants } from '../public/src/pickups.js';
import { KEEPOUT, inRect } from '../public/src/map.js';
import { PICKUP, PIECE } from '../public/src/config.js';
import { CELL } from '../public/src/config.js';

// Two attackers and two defenders on the real map, nobody thinking for themselves, round live.
function pickupGame(opts = {}) {
  const game = new Game({ seed: 11, human: false, teamSize: 2, pieces: false, ...opts });
  game.state = 'live'; game.timer = 100;
  for (const a of game.actors) { a.brain = null; a.input.f = a.input.r = 0; a.pos = { x: 3, y: 0, z: 3 }; }
  game.drainEvents();
  return game;
}
const stand = (a, p) => { a.pos = { x: p.x, y: 0, z: p.z }; };
const spot = (game, kind, n = 0) => game.pickups.filter(p => p.kind === kind)[n];

test('every pickup sits on open floor, off crates and lifts, and blocks keep off its column', () => {
  const g = buildMap(), nav = new Nav(g);
  assert.ok(PICKUP_SPOTS.some(s => s.kind === 'rocket') && PICKUP_SPOTS.some(s => s.kind === 'health') && PICKUP_SPOTS.some(s => s.kind === 'ammo'));
  for (const s of PICKUP_SPOTS) {
    assert.equal(g.get(s.x, 0, s.z), EMPTY, `${s.kind} at ${s.x},${s.z} is open`);
    assert.equal(g.get(s.x, 1, s.z), EMPTY);
    assert.ok(!g.crates.some(c => c.cx === s.x && c.cz === s.z), 'not under a crate');
    assert.ok(!g.liftAt(s.x, s.z), 'not on a lift');
    assert.ok(KEEPOUT.some(r => inRect(r, s.x, s.z)), 'blocks cannot bury it');
    for (const team of Object.values(SPAWNS)) {
      const [sx, sz] = team.cells[0];
      assert.ok(nav.path({ x: sx, y: 0, z: sz }, { x: s.x, y: 0, z: s.z }), `${s.kind} at ${s.x},${s.z} is reachable`);
    }
  }
});

test('pieces never land on a pickup spot', () => {
  const game = new Game({ seed: 9, human: false, teamSize: 1 });
  for (const s of PICKUP_SPOTS) assert.equal(validPlacement(game.grid, orient(1, 0, 0), s.x, s.z, null) === null, true, `refused at ${s.x},${s.z}`);
});

test('a health pack heals up to 100, is refused at full health, and comes back later', () => {
  const game = pickupGame();
  const a = game.actors[0], p = spot(game, 'health');
  stand(a, p); a.hp = 100;
  game.step(TICK);
  assert.equal(p.up, true, 'full health leaves it for someone else');
  a.hp = 50; game.step(TICK);
  assert.equal(a.hp, 50 + PICKUP.health.amount);
  assert.equal(p.up, false);
  assert.ok(game.drainEvents().some(e => e.type === 'pickup' && e.what === 'health' && e.actor === a));
  a.hp = 10; game.step(TICK);
  assert.equal(a.hp, 10, 'spent pack gives nothing');
  stand(a, { x: 3, z: 3 });
  for (let i = 0; i < PICKUP.health.respawn * 60 + 5; i++) game.step(TICK);
  assert.equal(p.up, true);
  assert.ok(game.drainEvents().some(e => e.type === 'pickupSpawn'));
  a.hp = 95; stand(a, p); game.step(TICK);
  assert.equal(a.hp, 100, 'never above 100');
});

test('only the nearest eligible player takes an item', () => {
  const game = pickupGame();
  const [a, b] = game.actors, p = spot(game, 'health');
  a.hp = b.hp = 40;
  a.pos = { x: p.x + 1.2, y: 0, z: p.z }; b.pos = { x: p.x + 0.3, y: 0, z: p.z };
  game.step(TICK);
  assert.equal(b.hp, 40 + PICKUP.health.amount);
  assert.equal(a.hp, 40);
});

test('the launcher is not carried at the start; picking it up gives rockets and puts it in your hands', () => {
  const game = pickupGame();
  const a = game.actors[0], p = spot(game, 'rocket');
  assert.equal(a.weapons.rocket, undefined);
  assert.equal(game.canSelect(a, 'rocket'), false);
  stand(a, p); game.step(TICK);
  assert.equal(a.weapons.rocket, WEAPONS.rocket.start);
  assert.equal(a.cur, 'rocket');
  assert.ok(game.drainEvents().some(e => e.type === 'pickup' && e.what === 'launcher'));
  // A second launcher only tops up the rockets, capped at the maximum.
  const q = spot(game, 'rocket', 1);
  a.weapons.rocket = WEAPONS.rocket.max - 2; a.cur = 'rifle';
  stand(a, q); game.step(TICK);
  assert.equal(a.weapons.rocket, WEAPONS.rocket.max);
  assert.equal(a.cur, 'rifle', 'a spare launcher does not change your weapon');
  const r = spot(game, 'rocket');
  r.up = true; stand(a, r); game.step(TICK);
  assert.equal(r.up, true, 'full of rockets, leave it');
});

test('ammo refills magazines and adds rockets only for someone who has the launcher', () => {
  const game = pickupGame();
  const [a, b] = game.actors, p = spot(game, 'ammo');
  assert.equal(wants(a, p), false, 'full magazines, no launcher');
  a.weapons.rifle = 3; a.weapons.pistol = 2;
  stand(a, p); game.step(TICK);
  assert.equal(a.weapons.rifle, WEAPONS.rifle.mag);
  assert.equal(a.weapons.pistol, WEAPONS.pistol.mag);
  assert.equal(a.weapons.rocket, undefined, 'ammo does not hand out a launcher');
  const q = spot(game, 'ammo', 1);
  b.weapons.rocket = 1; stand(b, q); game.step(TICK);
  assert.equal(b.weapons.rocket, 1 + PICKUP.ammo.rockets);
});

test('a new round puts every item back', () => {
  const game = pickupGame();
  for (const p of game.pickups) { p.up = false; p.timer = 99; }
  game.projectiles.push({ id: 99, owner: game.actors[0], pos: { x: 1, y: 1, z: 1 }, dir: { x: 1, y: 0, z: 0 }, speed: 20, age: 0 });
  game.startRound();
  assert.ok(game.pickups.every(p => p.up));
  assert.equal(game.projectiles.length, 0);
});

// An open arena for rocket tests: shooter at the south end facing north, a teammate and two enemies to place.
function rocketRange() {
  const game = new Game({ seed: 9, teamSize: 2, human: false, pieces: false });
  game.grid.cells.fill(EMPTY); game.grid.crates = []; game.grid.lifts = [];
  game.state = 'live'; game.timer = 100;
  const [s, mate] = game.actors.filter(a => a.team === 'attackers'), [e1, e2] = game.actors.filter(a => a.team === 'defenders');
  for (const a of game.actors) { a.brain = null; a.pos = { x: 6, y: 0, z: 6 }; }
  s.isHuman = true; s.pos = { x: 48, y: 0, z: 80 }; s.yaw = 0; s.pitch = 0; s.cur = 'rocket'; s.weapons.rocket = 5;
  game.drainEvents();
  return { game, s, mate, e1, e2 };
}
const fly = (game, ticks = 600) => { for (let i = 0; i < ticks && game.projectiles.length; i++) game.stepProjectiles(TICK); };

test('firing the launcher spends a rocket and sends it forward at its own speed', () => {
  const { game, s } = rocketRange();
  s.input.fire = true; game.stepWeapon(s, TICK);
  assert.equal(s.weapons.rocket, 4);
  assert.equal(game.projectiles.length, 1);
  const p = game.projectiles[0], z0 = p.pos.z;
  for (let i = 0; i < 30; i++) game.stepProjectiles(TICK);
  assert.ok(Math.abs((z0 - p.pos.z) - WEAPONS.rocket.speed * 0.5) < 0.01, 'half a second of flight');
  s.input.fire = true; game.stepWeapon(s, TICK);
  assert.equal(game.projectiles.length, 1, 'refire is gated by the launcher interval');
  assert.ok(game.drainEvents().some(e => e.type === 'rocket'));
});

test('a rocket bursts on a wall and the blast fades with distance', () => {
  const { game, s, e1, e2 } = rocketRange();
  game.grid.set(16, 0, 10, STATIC); game.grid.set(16, 1, 10, STATIC);   // a wall at z 30..33 across the line of fire
  s.pos.x = 49.5;                       // fire down the middle of the wall's cell column
  e1.pos = { x: 51.9, y: 0, z: 34.5 };  // beside the line of fire, about 2 m from where the rocket lands
  e2.pos = { x: 56.5, y: 0, z: 33.5 };  // more than 5 m away
  s.input.fire = true; game.stepWeapon(s, TICK);
  fly(game);
  const ev = game.drainEvents().find(x => x.type === 'rocketExplode');
  assert.ok(ev, 'it exploded');
  assert.ok(Math.abs(ev.pos.z - 33) < 0.2 && ev.pos.z > 33, `burst at the wall face, z=${ev.pos.z}`);
  assert.ok(e1.hp < 100 - 40, `near target hurt, hp=${e1.hp}`);
  assert.equal(e2.hp, 100, 'far target untouched');
  // Closer takes more.
  const near = rocketRange();
  near.game.explodeRocket({ owner: near.s, id: 1 }, { x: 48, y: 1, z: 50 }, null);
  near.e1.pos = { x: 48, y: 0, z: 49 }; near.e2.pos = { x: 48, y: 0, z: 46 };
  near.game.explodeRocket({ owner: near.s, id: 2 }, { x: 48, y: 1, z: 50 }, null);
  assert.ok(near.e1.hp < near.e2.hp && near.e2.hp < 100);
});

test('a direct hit does extra damage and kills at full health', () => {
  const { game, s, e1 } = rocketRange();
  e1.pos = { x: 48, y: 0, z: 50 };
  s.input.fire = true; game.stepWeapon(s, TICK);
  fly(game);
  assert.equal(e1.alive, false);
  const ev = game.drainEvents();
  assert.ok(ev.some(e => e.type === 'feed' && /Rocket Launcher/.test(e.text)), 'kill feed names the launcher');
  assert.equal(s.kills, 1);
});

test('walls shield from the blast, teammates take no damage, and your own damage is halved', () => {
  const { game, s, mate, e1 } = rocketRange();
  const at = { x: 48, y: 1, z: 50 };
  e1.pos = { x: 48, y: 0, z: 52 };
  game.grid.set(16, 0, 17, STATIC); game.grid.set(16, 1, 17, STATIC);   // wall between the blast and the target
  game.grid.set(15, 0, 17, STATIC); game.grid.set(17, 0, 17, STATIC);
  game.explodeRocket({ owner: s, id: 1 }, { ...at, z: 50 }, null);
  assert.equal(e1.hp, 100, 'wall shields');
  game.grid.cells.fill(EMPTY);
  mate.pos = { x: 48, y: 0, z: 51 }; mate.vel = { x: 0, y: 0, z: 0 };
  game.explodeRocket({ owner: s, id: 2 }, at, null);
  assert.equal(mate.hp, 100, 'friendly fire off');
  assert.ok(Math.hypot(mate.vel.x, mate.vel.y, mate.vel.z) > 3, 'but teammates are shoved');
  s.pos = { x: 48, y: 0, z: 50 }; s.vel = { x: 0, y: 0, z: 0 };
  game.explodeRocket({ owner: s, id: 3 }, at, null);
  const lost = 100 - s.hp;
  assert.ok(lost > 20 && lost <= WEAPONS.rocket.splash * WEAPONS.rocket.selfScale + 1e-6, `self damage ${lost}`);
});

test('a rocket jump: firing at your feet launches you well above a normal jump', () => {
  const { game, s } = rocketRange();
  s.pitch = -Math.PI / 2; s.weapons.rocket = 5; s.hp = 100;
  s.input.fire = true; game.stepWeapon(s, TICK); s.input.fire = false;
  fly(game);
  assert.ok(s.vel.y > 8, `launched upward at ${s.vel.y.toFixed(1)} m/s`);
  assert.ok(s.hp < 100 && s.hp > 40, `it costs health, hp=${s.hp}`);
  let peak = 0;
  for (let i = 0; i < 180; i++) { stepMovement(game.grid, s, TICK); peak = Math.max(peak, s.pos.y); }
  const normalJump = MOVE_JUMP_HEIGHT();
  assert.ok(peak > normalJump * 2.5, `peak ${peak.toFixed(2)} m vs a normal jump ${normalJump.toFixed(2)} m`);
});
function MOVE_JUMP_HEIGHT() { return 5.2 * 5.2 / (2 * 14); }

test('the launcher falls back to the rifle when the last rocket is gone, and cannot be chosen empty', () => {
  const { game, s } = rocketRange();
  s.weapons.rocket = 1;
  s.input.fire = true; game.stepWeapon(s, TICK); s.input.fire = false;
  assert.equal(s.weapons.rocket, 0);
  for (let i = 0; i < 80; i++) game.stepWeapon(s, TICK);
  assert.equal(s.cur, 'rifle');
  s.input.weapon = 'rocket'; game.stepWeapon(s, TICK);
  assert.equal(s.cur, 'rifle', 'no rockets, no switch');
});

test('a rocket that hits no one and nothing eventually expires', () => {
  const { game, s } = rocketRange();
  s.pitch = 1.2;
  s.input.fire = true; game.stepWeapon(s, TICK); s.input.fire = false;
  for (let i = 0; i < 60 * 8; i++) game.stepProjectiles(TICK);
  assert.equal(game.projectiles.length, 0);
});

test('an injured bot near a health pack goes and takes it', () => {
  const game = new Game({ seed: 21, human: false, teamSize: 1, pieces: false });
  game.state = 'live'; game.timer = 100;
  const att = game.actors.find(a => a.team === 'attackers'), def = game.actors.find(a => a.team === 'defenders');
  att.hasBomb = false; game.bomb.carrier = null;
  const p = spot(game, 'health', 2);
  att.pos = { x: (p.cx - 1 + 0.5) * CELL, y: 0, z: (p.cz + 3 + 0.5) * CELL }; att.hp = 30;
  def.brain.post = [15, 3];
  for (let i = 0; i < 60 * 12 && att.hp === 30; i++) { def.hp = 1e9; game.step(TICK); }
  assert.ok(att.hp > 30, `bot healed to ${att.hp}`);
  assert.equal(p.up, false);
});

test('bots in a full match pick things up and fire rockets without breaking anything', () => {
  const game = new Game({ seed: 2, human: false, teamSize: 5 });
  const n = { rocket: 0, explode: 0, pickup: 0, launcher: 0 };
  let steps = 0;
  while (!game.matchOver && steps < 60 * 60 * 90) {
    game.step(TICK); steps++;
    for (const e of game.drainEvents()) { if (e.type === 'rocket') n.rocket++; if (e.type === 'rocketExplode') n.explode++; if (e.type === 'pickup') { n.pickup++; if (e.what === 'launcher') n.launcher++; } }
    if (steps % 60 === 0) for (const a of game.actors) {
      assert.ok(Number.isFinite(a.pos.x + a.pos.y + a.pos.z + a.vel.x + a.vel.y + a.vel.z), 'finite');
      assert.ok(a.hp <= 100 && a.hp >= 0);
      if (a.weapons.rocket !== undefined) assert.ok(a.weapons.rocket >= 0 && a.weapons.rocket <= WEAPONS.rocket.max);
    }
  }
  assert.ok(game.matchOver);
  assert.ok(n.pickup > 10 && n.launcher > 0 && n.rocket > 0, JSON.stringify(n));
  assert.equal(n.rocket, n.explode + game.projectiles.length, 'every rocket burst or is still flying');
});

// ---- rockets versus blocks ----
test('a rocket cracks the blocks around it and a second one breaks them; walls and crates stay', () => {
  const { game, s } = rocketRange();
  const g = game.grid;
  for (let z = 10; z <= 12; z++) { g.set(16, 0, z, 3); g.set(16, 1, z, 3); }   // a block wall three cells deep in front of the shooter
  g.set(10, 0, 10, STATIC);
  const v0 = g.version;
  const at = { x: 49.5, y: 1.5, z: 33.06 };   // against the face of the nearest cube (z cell 10 spans 30..33)
  game.explodeRocket({ owner: s, id: 1 }, at, null);
  assert.ok(g.version > v0, 'grid changed so the renderer remeshes');
  assert.ok(g.dmg[g.idx(16, 0, 10)] > 60, 'cube at the blast is hurt');
  assert.equal(g.get(16, 0, 10), 3, 'one rocket does not break it');
  assert.equal(g.dmg[g.idx(16, 0, 12)], 0, 'cubes hidden behind others are not touched');
  game.explodeRocket({ owner: s, id: 2 }, at, null);
  assert.equal(g.get(16, 0, 10), EMPTY, 'second rocket breaks it');
  assert.equal(g.dmg[g.idx(16, 0, 10)], 0);
  assert.ok(game.drainEvents().some(e => e.type === 'blocksBroken' && e.cells.length > 0));
  assert.equal(g.get(10, 0, 10), STATIC, 'map walls are permanent');
});

test('a rocket fired at a block wall opens a hole and breaks the real thing', () => {
  const { game, s } = rocketRange();
  const g = game.grid;
  g.set(16, 0, 10, 2); g.set(16, 1, 10, 2);
  for (let n = 0; n < 2; n++) {
    s.pos.x = 49.5; s.weapons.rocket = 5; s.fireCd = 0; s.input.fire = true; game.stepWeapon(s, TICK); s.input.fire = false;
    fly(game);
  }
  assert.ok(game.drainEvents().some(e => e.type === 'blocksBroken'));
  assert.ok(g.get(16, 0, 10) === EMPTY || g.get(16, 1, 10) === EMPTY, 'something broke');
});

test('block damage resets with the round, and a new block starts undamaged', () => {
  const game = new Game({ seed: 3, human: false, teamSize: 1, pieces: false });
  const g = game.grid;
  g.set(16, 0, 16, 2); g.dmg[g.idx(16, 0, 16)] = 100;
  g.reset();
  assert.equal(g.dmg[g.idx(16, 0, 16)], 0);
  g.set(5, 0, 5, 2); g.dmg[g.idx(5, 0, 5)] = 90; g.set(5, 0, 5, 4);
  assert.equal(g.dmg[g.idx(5, 0, 5)], 0, 'replacing a cube clears its damage');
});

test('a planted bomb whose block is destroyed drops to the floor', () => {
  const { game, s } = rocketRange();
  const g = game.grid;
  g.set(16, 0, 10, 2);
  game.bomb.state = 'planted'; game.bomb.pos = { x: 49.5, y: 3, z: 31.5 };   // on top of the cube
  g.dmg[g.idx(16, 0, 10)] = 119;
  game.explodeRocket({ owner: s, id: 1 }, { x: 49.5, y: 1.5, z: 33.5 }, null);
  assert.equal(g.get(16, 0, 10), EMPTY);
  assert.equal(game.bomb.pos.y, 0);
});
