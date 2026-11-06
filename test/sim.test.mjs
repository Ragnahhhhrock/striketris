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
  const game = new Game({ seed: 5, teamSize: 1, humanTeam: 'attackers', pieces: false });
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
