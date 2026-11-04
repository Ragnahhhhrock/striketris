import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../public/src/game.js';
import { buildMap, SITES, SPAWNS } from '../public/src/map.js';
import { Nav } from '../public/src/nav.js';
import { orient, restHeight, findLines, clearCells, SHAPES } from '../public/src/pieces.js';
import { STATIC, EMPTY } from '../public/src/grid.js';
import { TICK, MIN_LINE } from '../public/src/config.js';
import { makeActor, resetActor, stepMovement } from '../public/src/actor.js';

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
  game.piece = { shapeId: 1, cells: orient(1, 0, 0), x: 15, y: 0, z: 15, t: 2.2, drop: 60 };
  v.brain = null;
  for (let i = 0; i < 70; i++) game.stepPiece(TICK);
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
