import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../public/src/game.js';
import { cellCentre } from '../public/src/grid.js';

function arena() {
  const g = new Game({ seed: 3, human: true, teamSize: 2, pieces: false, items: false });
  while (g.state === 'freeze') g.step();
  for (const a of g.actors) { a.brain = null; a.input.f = a.input.r = 0; }
  return g;
}
const run = (g, n) => { for (let i = 0; i < n; i++) g.step(); };

test('a killed player drops their primary weapon with its ammo', () => {
  const g = arena();
  const foe = g.actors.find(a => a.team !== g.human.team && a.alive);
  const id = foe.loadout[0]; foe.weapons[id] = 7;
  g.kill(foe, g.human, id);
  assert.equal(g.drops.length, 1);
  assert.equal(g.drops[0].weapon, id);
  assert.equal(g.drops[0].ammo, 7);
});

test('pressing Use next to a dropped weapon swaps it for your primary, which drops at once', () => {
  const g = arena();
  const h = g.human, foe = g.actors.find(a => a.team !== h.team && a.alive);
  foe.loadout = ['sniper', 'pistol']; foe.weapons = { sniper: 4, pistol: 8 };
  const p = cellCentre(3, 0, 19);
  foe.pos = { x: p.x, y: 0, z: p.z };
  g.kill(foe, null, 'fall');
  h.pos = { x: p.x + 0.5, y: 0, z: p.z }; h.weapons.rifle = 11;
  assert.equal(h.loadout[0], 'rifle');
  h.input.use = true; run(g, 2); h.input.use = false;
  assert.equal(h.loadout[0], 'sniper');
  assert.equal(h.cur, 'sniper');
  assert.equal(h.weapons.sniper, 4);
  assert.equal(h.weapons.rifle, undefined);
  const left = g.drops.filter(d => d.weapon === 'rifle');
  assert.equal(left.length, 1);
  assert.equal(left[0].ammo, 11);
});

test('walking over a dropped weapon does nothing, and a new round clears drops', () => {
  const g = arena();
  const h = g.human, foe = g.actors.find(a => a.team !== h.team && a.alive);
  const p = cellCentre(3, 0, 19);
  foe.pos = { x: p.x, y: 0, z: p.z };
  g.kill(foe, null, 'fall');
  h.pos = { x: p.x, y: 0, z: p.z }; run(g, 5);
  assert.equal(h.loadout[0], 'rifle');
  g.startRound();
  assert.equal(g.drops.length, 0);
});
