import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../public/src/game.js';
import { TEAM, MOVE, JET, SHELL, VEHICLES } from '../public/src/config.js';
import { enterVehicle, exitVehicle, damageVehicle } from '../public/src/vehicles.js';

// A quiet match with vehicles on, no blocks or items, and the clock past the freeze.
function arena(opts = {}) {
  const g = new Game({ seed: 3, human: true, teamSize: 2, pieces: false, items: false, classes: true, vehicles: true, ...opts });
  while (g.state === 'freeze') g.step();
  for (const a of g.actors) { a.brain = null; a.input.f = a.input.r = 0; }
  return g;
}
const run = (g, n) => { for (let i = 0; i < n; i++) g.step(); };
const vehicle = (g, type, team = TEAM.ATT) => g.vehicles.find(v => v.type === type && v.team === team);
// Mid lane, open floor running north to south.
const lane = (g, v, z = 60) => { v.pos.x = 43.5; v.pos.z = z; v.yaw = 0; v.turretYaw = 0; };
const enemy = g => g.actors.find(a => a.team !== g.human.team);

test('vehicles only exist when asked for', () => {
  assert.equal(new Game({ seed: 3, pieces: false }).vehicles.length, 0);
  const g = arena();
  assert.equal(g.vehicles.length, 6);
  assert.equal(g.vehicles.filter(v => v.type === 'tank').length, 2);
});

test('jetpack: a second jump press in the air climbs and burns fuel, the ground refills it', () => {
  const g = arena(), h = g.human;
  h.pos = { x: 43.5, y: 0, z: 60 }; h.vel = { x: 0, y: 0, z: 0 };
  h.input.jump = true; run(g, 3);            // ordinary jump
  assert.equal(h.jetting, false);
  h.input.jump = false; run(g, 6);
  const apex = h.pos.y;
  h.input.jump = true; run(g, 90);           // press again and hold
  assert.equal(h.jetting, true);
  assert.ok(h.pos.y > apex + 3, `climbed to ${h.pos.y}`);
  assert.ok(h.fuel < JET.fuel - 20);
  h.input.jump = false; run(g, 600);
  assert.ok(h.onGround);
  assert.equal(h.fuel, JET.fuel);
});

test('jetpack: running out of fuel cuts the burn, and crouch eases the landing', () => {
  const g = arena(), h = g.human;
  h.pos = { x: 43.5, y: 0, z: 60 };
  h.input.jump = true; run(g, 3); h.input.jump = false; run(g, 6);
  h.input.jump = true; run(g, 400);
  assert.equal(h.jetting, false);
  assert.equal(h.fuel, 0);
  // Fresh tank, climb, then hold crouch to sink slowly.
  h.input.jump = false; run(g, 900);
  h.input.jump = true; run(g, 3); h.input.jump = false; run(g, 6);
  h.input.jump = true; run(g, 80);
  h.input.crouch = true; run(g, 30);
  assert.ok(h.vel.y > JET.sink - 0.5 && h.vel.y < 1, `vy ${h.vel.y}`);
});

test('bike: get on, outrun a runner, get off beside it', () => {
  const g = arena(), h = g.human, b = vehicle(g, 'bike');
  h.pos = { x: b.pos.x + 1.5, y: 0, z: b.pos.z };
  h.input.mount = true; run(g, 2);
  assert.equal(h.input.mount, false, 'the tap is consumed');
  assert.equal(h.vehicle, b);
  lane(g, b, 80); h.yaw = 0;
  const z0 = b.pos.z;
  h.input.f = 1; run(g, 120);
  assert.ok(b.speed > MOVE.run * 2.4, `speed ${b.speed}`);
  assert.ok(z0 - b.pos.z > 15);
  assert.ok(Math.hypot(h.pos.x - b.pos.x, h.pos.z - b.pos.z) < 0.01, 'rider travels with the bike');
  h.input.f = 0; run(g, 100);
  h.input.mount = true; run(g, 2);
  assert.equal(h.vehicle, null);
  assert.equal(b.driver, null);
  assert.ok(Math.hypot(h.pos.x - b.pos.x, h.pos.z - b.pos.z) > VEHICLES.bike.r);
});

test('bike: steers toward where the rider looks and stops at walls', () => {
  const g = arena(), h = g.human, b = vehicle(g, 'bike');
  lane(g, b, 70); enterVehicle(g, h, b);
  h.yaw = 0.6; h.input.f = 1; run(g, 40);
  assert.ok(b.yaw > 0.15, `yaw ${b.yaw}`);
  h.yaw = 0; run(g, 600);
  const z = b.pos.z;
  run(g, 120);
  assert.ok(Math.abs(b.pos.z - z) < 0.5, 'held at the far wall');
  assert.ok(b.pos.z > 0);
});

test('bike: runs enemies down for heavy damage, and passes through friends', () => {
  const g = arena(), h = g.human, b = vehicle(g, 'bike'), foe = enemy(g), mate = g.actors.find(a => a.team === h.team && a !== h);
  lane(g, b, 70); enterVehicle(g, h, b); h.yaw = 0;
  foe.pos = { x: 43.5, y: 0, z: 50 }; foe.hp = 100;
  mate.pos = { x: 43.5, y: 0, z: 56 }; mate.hp = 100;
  h.input.f = 1; run(g, 150);
  assert.ok(!foe.alive || foe.hp < 40, `foe hp ${foe.hp}`);
  assert.equal(mate.hp, 100);
  assert.ok(h.kills >= (foe.alive ? 0 : 1));
});

test('tank: the cannon fires a big shell on a cooldown, and it breaks blocks', () => {
  const g = arena(), h = g.human, t = vehicle(g, 'tank');
  lane(g, t, 78); enterVehicle(g, h, t); h.yaw = 0; h.pitch = 0;
  h.input.fire = true; run(g, 2);
  assert.equal(g.projectiles.length, 1);
  assert.equal(g.projectiles[0].spec, SHELL);
  assert.ok(t.cd > 1);
  run(g, 20);
  assert.equal(g.projectiles.length, 1, 'cooldown holds the second shell');
  const events = [];
  for (let i = 0; i < 180; i++) { g.step(); events.push(...g.drainEvents()); }
  assert.ok(events.some(e => e.type === 'rocketExplode' && e.radius === SHELL.radius));
  assert.ok(events.filter(e => e.type === 'rocket').length >= 2, 'fires again once reloaded');
});

test('tank: turns on the spot, the turret follows the mouse, and walls stop it', () => {
  const g = arena(), h = g.human, t = vehicle(g, 'tank');
  lane(g, t, 70); enterVehicle(g, h, t);
  h.input.r = -1; run(g, 60);
  assert.ok(t.yaw > 0.8, `hull ${t.yaw}`);
  assert.ok(Math.hypot(t.pos.x - 43.5, t.pos.z - 70) < 0.01, 'pivots without moving');
  h.input.r = 0; h.yaw = -1.2; run(g, 90);
  assert.ok(t.turretYaw < -0.8, `turret ${t.turretYaw}`);
  assert.ok(Math.abs(t.yaw - t.turretYaw) > 1.5);
});

test('tank: shields its driver from bullets, takes heavy rocket damage, and dies with a bang', () => {
  const g = arena(), h = g.human, t = vehicle(g, 'tank'), foe = enemy(g);
  lane(g, t, 70); enterVehicle(g, h, t);
  const hp = t.hp;
  foe.pos = { x: 43.5, y: 0, z: 50 }; foe.vel = { x: 0, y: 0, z: 0 };
  foe.yaw = Math.PI; foe.pitch = 0; foe.input.fire = true; foe.cur = foe.loadout[0];
  run(g, 60);
  foe.input.fire = false;
  assert.equal(h.hp, 100, 'driver untouched by rifle fire');
  assert.ok(t.hp < hp && t.hp > hp - 60, `armour soaked bullets: ${t.hp}`);
  const events = [];
  damageVehicle(g, t, 700, foe, 'blast');
  events.push(...g.drainEvents());
  assert.ok(t.dead);
  assert.ok(!h.alive, 'the driver goes with it');
  assert.equal(h.vehicle, null);
  assert.ok(events.some(e => e.type === 'boom'));
});

test('an empty vehicle can be shot to pieces, and a friendly driver protects theirs', () => {
  const g = arena(), h = g.human, b = vehicle(g, 'bike', TEAM.DEF), foe = enemy(g);
  damageVehicle(g, b, 50, h, 'bullet');
  assert.equal(b.hp, VEHICLES.bike.hp - 50);
  enterVehicle(g, foe, b);
  const mate = g.actors.find(a => a.team === foe.team && a !== foe);
  damageVehicle(g, b, 500, mate, 'bullet');
  assert.equal(b.hp, VEHICLES.bike.hp - 50, 'teammates cannot wreck a ridden vehicle');
  damageVehicle(g, b, 500, h, 'bullet');
  assert.ok(b.dead);
});

test('dying kicks you out of the vehicle, and a new round puts everything back', () => {
  const g = arena(), h = g.human, b = vehicle(g, 'bike');
  enterVehicle(g, h, b);
  g.kill(h, null, 'fall');
  assert.equal(b.driver, null);
  assert.equal(h.vehicle, null);
  b.dead = true; b.hp = 0;
  g.startRound();
  assert.ok(!b.dead && b.hp === VEHICLES.bike.hp);
  assert.equal(b.pos.x, (b.cx + 0.5) * 3);
});

test('exitVehicle finds clear ground when one side is a wall', () => {
  const g = arena(), h = g.human, b = vehicle(g, 'bike');
  b.pos = { x: 40.5, y: 0, z: 82.5 };
  enterVehicle(g, h, b);
  exitVehicle(g, h);
  assert.ok(!g.grid.boxHits(h.pos.x - 0.35, h.pos.y + 0.02, h.pos.z - 0.35, h.pos.x + 0.35, h.pos.y + 1.8, h.pos.z + 0.35));
});
