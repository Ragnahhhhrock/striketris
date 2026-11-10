import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../public/src/game.js';
import { CELL, RIM } from '../public/src/config.js';

function arena() {
  const g = new Game({ seed: 3, human: true, teamSize: 2, pieces: false, items: false });
  while (g.state === 'freeze') g.step();
  for (const a of g.actors) { a.brain = null; a.input.f = a.input.r = 0; }
  return g;
}
const run = (g, n) => { for (let i = 0; i < n; i++) g.step(); };
const z = (RIM.z0 + RIM.z1 + 1) / 2 * CELL;

test('the west rim ledge is open air past the wall line and the rest of the wall is not', () => {
  const g = arena().grid;
  assert.equal(g.get(-1, 3, RIM.z0), 0);
  assert.notEqual(g.get(-1, 3, RIM.z0 - 1), 0);
  assert.notEqual(g.get(2, 2, RIM.z0), 0);   // the ledge itself is solid under your feet
  assert.equal(g.get(0, 4, RIM.z0), 0);      // and the wall above it is cut away
});

test('walking off the end of a rim ledge kills you, with no credit', () => {
  const g = arena(), h = g.human;
  const foe = g.actors.find(a => a.team !== h.team);
  const before = foe.kills + h.kills;
  h.pos = { x: 1.5, y: 9.05, z }; h.vel = { x: 0, y: 0, z: 0 }; h.yaw = Math.PI / 2; h.input.f = 1; h.onGround = true;
  run(g, 240);
  assert.equal(h.alive, false);
  assert.equal(foe.kills + h.kills, before);
});

test('a rocket blast that shoves someone off the edge credits the shooter', () => {
  const g = arena(), h = g.human;
  const foe = g.actors.find(a => a.team !== h.team);
  foe.pos = { x: 1.0, y: 9.05, z }; foe.vel = { x: 0, y: 0, z: 0 }; foe.onGround = true; foe.hp = 100;
  h.pos = { x: 10, y: 9.05, z }; h.alive = true;
  // blast on the inland side, at the target's feet, so the shove carries them outward
  g.explodeRocket({ owner: h, pos: { x: 3.2, y: 9.3, z } }, { x: 3.2, y: 9.3, z }, null);
  run(g, 240);
  assert.equal(foe.alive, false);
  assert.equal(h.kills, 1);
});

test('a teammate knocked off by your rocket does not count as a kill', () => {
  const g = arena(), h = g.human;
  const mate = g.actors.find(a => a.team === h.team && a !== h);
  mate.pos = { x: 1.0, y: 9.05, z }; mate.vel = { x: 0, y: 0, z: 0 }; mate.onGround = true;
  g.explodeRocket({ owner: h, pos: { x: 3.2, y: 9.3, z } }, { x: 3.2, y: 9.3, z }, null);
  run(g, 240);
  assert.equal(mate.alive, false);
  assert.equal(h.kills, 0);
});
