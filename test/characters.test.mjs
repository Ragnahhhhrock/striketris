import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { TEAM, MOVE, CLASSES, CLASS_ORDER } from '../public/src/config.js';
import { makeActor, resetActor } from '../public/src/actor.js';
import { ROSTER, generateLook, lookFor, silhouette } from '../public/src/looks.js';

register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { makeRig, BODY } = await import('../public/src/characters.js');

const ATT = ['Ash', 'Brick', 'Cole', 'Dune', 'Echo', 'Flint'];
const DEF = ['Grit', 'Hale', 'Ivo', 'Jett', 'Knox', 'Lark'];

function fighter(name = 'Ash', team = TEAM.ATT, id = 0, cls = 'rifleman') {
  const a = makeActor(id, team, name, false, cls);
  resetActor(a);
  return a;
}
const settle = (rig, frames = 90, dt = 1 / 60) => { for (let i = 0; i < frames; i++) rig.update(dt); rig.group.updateMatrixWorld(true); };
const bounds = rig => new THREE.Box3().setFromObject(rig.group, true);
const bodyBounds = rig => { const b = new THREE.Box3(); rig.parts.fall.traverse(o => { if (o.isMesh && o.parent !== rig.parts.weapon && !o.parent.parent?.isGroup === false) b.expandByObject(o, true); }); return b; };

test('every bot has a hand-made look, and teammates read differently at range', () => {
  for (const names of [ATT, DEF]) {
    for (const n of names) assert.ok(ROSTER[n], `${n} has a look`);
    const sils = names.map(n => silhouette(ROSTER[n]));
    assert.equal(new Set(sils).size, names.length, `silhouettes differ: ${sils.join(' | ')}`);
    const hats = names.map(n => ROSTER[n].hat?.[0]).filter(Boolean);
    assert.equal(new Set(hats).size, hats.length, 'no two teammates share a hat style');
  }
  assert.ok(ROSTER.You);
});

test('the roster covers hats, moustaches, beards, eyewear and several builds', () => {
  const all = [...ATT, ...DEF].map(n => ROSTER[n]);
  const hats = new Set(all.map(l => l.hat?.[0]).filter(Boolean));
  const stash = new Set(all.map(l => l.moustache?.[0]).filter(Boolean));
  const beards = new Set(all.map(l => l.beard?.[0]).filter(Boolean));
  const eyewear = new Set(all.map(l => l.eyewear?.[0]).filter(Boolean));
  assert.ok(hats.size >= 8, `hats: ${[...hats]}`);
  assert.ok(stash.size >= 4, `moustaches: ${[...stash]}`);
  assert.ok(beards.size >= 5, `beards: ${[...beards]}`);
  assert.ok(eyewear.size >= 4, `eyewear: ${[...eyewear]}`);
  assert.equal(new Set(all.map(l => l.build)).size, 3);
});

test('generated looks are stable per seed and cover unnamed fighters', () => {
  assert.deepEqual(generateLook(9), generateLook(9));
  assert.notDeepEqual(generateLook(9), generateLook(10));
  assert.equal(lookFor({ name: 'Nobody', id: 3 }).skin >= 0, true);
});

test('every look builds a rig with a sane mesh count and finite geometry', () => {
  const names = [...ATT, ...DEF, 'You'];
  for (const n of names) for (const team of [TEAM.ATT, TEAM.DEF]) {
    const rig = makeRig(fighter(n, team));
    assert.ok(rig.meshCount <= 24, `${n}: ${rig.meshCount} meshes`);
    rig.group.traverse(o => { if (o.isMesh) for (const v of o.geometry.attributes.position.array) assert.ok(Number.isFinite(v)); });
  }
  for (let i = 0; i < 40; i++) assert.ok(makeRig(fighter('Gen', TEAM.DEF, 100 + i)).meshCount <= 24);
});

test('standing fighters match the 1.8 m hitbox and stand on the floor', () => {
  for (const n of ['Brick', 'Knox', 'Echo', 'Jett']) { // hatless or flat-headed, so height is the head
    const rig = makeRig(fighter(n)); settle(rig);
    const b = bounds(rig);
    assert.ok(Math.abs(b.min.y) < 0.02, `${n} feet at ${b.min.y}`);
    assert.ok(b.max.y > 1.7 && b.max.y < 2.0, `${n} is ${b.max.y} m tall`);
    assert.ok(b.max.x - b.min.x < 1.0 && b.max.z - b.min.z < 1.6, `${n} fits in his space`);
  }
  const top = makeRig(fighter('Ivo', TEAM.DEF, 1)); settle(top);
  assert.ok(bounds(top).max.y > 2.0, 'the top hat towers');
});

test('crouching drops the head to about the crouch hitbox', () => {
  const a = fighter('Brick'); const rig = makeRig(a);
  settle(rig); const standing = bounds(rig).max.y;
  a.crouching = true; settle(rig, 120);
  const b = bounds(rig);
  assert.ok(Math.abs(b.min.y) < 0.03, `still on the floor: ${b.min.y}`);
  assert.ok(b.max.y < standing - 0.3, `crouched ${b.max.y} vs standing ${standing}`);
  assert.ok(b.max.y < MOVE.crouchHeight + 0.25, `${b.max.y} close to ${MOVE.crouchHeight}`);
});

test('feet never sink through the floor while running, strafing or backpedalling', () => {
  for (const dir of [[0, 1], [1, 0], [-1, 0], [0, -1], [0.7, 0.7]]) {
    const a = fighter('Cole'); const rig = makeRig(a);
    a.vel.x = -Math.sin(a.yaw) * dir[1] * 6.5 + Math.cos(a.yaw) * dir[0] * 6.5;
    a.vel.z = -Math.cos(a.yaw) * dir[1] * 6.5 - Math.sin(a.yaw) * dir[0] * 6.5;
    let min = Infinity;
    for (let i = 0; i < 180; i++) { rig.update(1 / 60); if (i > 30) { rig.group.updateMatrixWorld(true); min = Math.min(min, bounds(rig).min.y); } }
    assert.ok(min > -0.03, `dir ${dir}: lowest point ${min}`);
  }
});

test('legs actually swing while running and stay still when idle', () => {
  const a = fighter('Ash'); const rig = makeRig(a);
  settle(rig);
  const idle = rig.legs.map(l => l.hip.rotation.x);
  assert.ok(idle.every(x => Math.abs(x) < 0.1));
  a.vel.z = -6.5;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 120; i++) { rig.update(1 / 60); lo = Math.min(lo, rig.legs[0].hip.rotation.x); hi = Math.max(hi, rig.legs[0].hip.rotation.x); }
  assert.ok(hi - lo > 0.8, `thigh swing ${hi - lo}`);
  const [l, r] = rig.legs.map(x => x.hip.rotation.x);
  assert.ok(Math.sign(l) !== Math.sign(r) || Math.abs(l - r) > 0.1, 'legs are out of phase');
});

test('both hands reach the weapon in every stance and while looking up or down', () => {
  for (const [cls, cur] of [['assault', 'smg'], ['medic', 'lmg'], ['engineer', 'bolt'], ['scout', 'sniper'], ['antitank', 'rocket'], ['assault', 'pistol']]) for (const pitch of [-1, -0.4, 0, 0.5, 1]) for (const n of ['Ash', 'Brick', 'Jett']) {
    for (const stance of ['stand', 'crouch', 'run', 'fire']) {
      const a = fighter(n, TEAM.ATT, 0, cls); a.cur = cur; a.pitch = pitch;
      if (stance === 'crouch') a.crouching = true;
      if (stance === 'run') a.vel.z = -6.5;
      if (stance === 'fire') a.recoil = 0.1;
      const rig = makeRig(a); settle(rig, 100);
      assert.ok(rig.gap[0] < 0.045 && rig.gap[1] < 0.045, `${n} ${cur} pitch ${pitch} ${stance}: gaps ${rig.gap.map(g => g.toFixed(3))}`);
    }
  }
});

test('reloading takes the magazine out and puts it back', () => {
  const a = fighter('Ash'); const rig = makeRig(a);
  settle(rig);
  const mag = rig.guns.rifle.mag; // engineer kit
  assert.equal(mag.visible, true);
  a.reloadT = 1.2; rig.update(1 / 60); // halfway through a 2.4 s reload
  assert.equal(mag.visible, false);
  a.reloadT = 0; rig.update(1 / 60);
  assert.equal(mag.visible, true);
});

test('only the active weapon is shown, and the bomb shows on the carrier', () => {
  const a = fighter('Ash'); const rig = makeRig(a); settle(rig, 5);
  assert.equal(rig.guns.rifle.group.visible, true); assert.equal(rig.guns.pistol.group.visible, false);
  a.cur = 'pistol'; a.hasBomb = true; settle(rig, 5);
  assert.equal(rig.guns.rifle.group.visible, false); assert.equal(rig.guns.pistol.group.visible, true);
  assert.equal(rig.parts.bomb.visible, true);
  a.hasBomb = false; settle(rig, 2);
  assert.equal(rig.parts.bomb.visible, false);
});

test('the dead lie on the floor, drop the weapon, and get up next round', () => {
  for (const id of [0, 1]) {
    const a = fighter('Hale', TEAM.DEF, id); const rig = makeRig(a);
    settle(rig);
    a.alive = false; settle(rig, 120);
    const b = bounds(rig);
    assert.ok(b.min.y > -0.06, `id ${id} sinks to ${b.min.y}`);
    assert.ok(b.max.y < 0.8, `id ${id} lies flat, top ${b.max.y}`);
    assert.equal(rig.parts.weapon.parent, rig.parts.root, 'weapon dropped beside the body');
    a.alive = true; settle(rig, 60);
    assert.equal(rig.parts.weapon.parent, rig.parts.spine, 'weapon back in hand');
    const up = bounds(rig);
    assert.ok(up.max.y > 1.6 && Math.abs(up.min.y) < 0.03);
  }
});

test('climbing a ledge raises both hands above the head', () => {
  const a = fighter('Ash'); const rig = makeRig(a);
  a.mantle = { t: 0.6 }; a.onGround = false; settle(rig, 30);
  rig.group.updateMatrixWorld(true);
  const hand = new THREE.Vector3();
  for (const arm of rig.arms) { arm.fore.getWorldPosition(hand); hand.y += 0; }
  const ys = rig.arms.map(arm => { const p = new THREE.Vector3(0, -BODY.fore, 0); arm.fore.localToWorld(p); return p.y; });
  assert.ok(ys.every(y => y > 1.4), `hands at ${ys}`);
});

test('every class carries its own weapons and wears its own kit', () => {
  const sizes = new Set();
  for (const c of CLASS_ORDER) {
    const a = fighter('Ash', TEAM.ATT, 0, c); const rig = makeRig(a); settle(rig, 5);
    const k = CLASSES[c];
    assert.deepEqual(Object.keys(rig.guns).sort(), [k.primary, k.secondary].sort(), `${c} guns`);
    assert.equal(rig.guns[k.primary].group.visible, true, `${c} draws its primary`);
    sizes.add(rig.kit.children[0].geometry.attributes.position.count);
  }
  assert.equal(sizes.size, CLASS_ORDER.length, 'each class has different gear');
});

test('a rig re-dresses when the actor changes class between rounds', () => {
  const a = fighter('Ash', TEAM.ATT, 0, 'assault'); const rig = makeRig(a); settle(rig, 5);
  assert.ok(rig.guns.smg);
  a.nextCls = 'antitank'; resetActor(a); settle(rig, 5);
  assert.ok(rig.guns.rocket && !rig.guns.smg);
  assert.equal(rig.kitCls, 'antitank');
});
