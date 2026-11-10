import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { TEAM, MOVE, TEAM_PIECES, PIECE_COLOURS, PRIMARIES, SECONDARIES, WEAPONS } from '../public/src/config.js';
import { makeActor, resetActor } from '../public/src/actor.js';
import { lookFor, PIECES } from '../public/src/looks.js';

register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const { makeRig, BODY } = await import('../public/src/characters.js');

function fighter(piece = 'Z', team = TEAM.ATT, id = 0, loadout) {
  const a = makeActor(id, team, `Bot${id}`, false, piece, loadout);
  resetActor(a);
  return a;
}
const settle = (rig, frames = 90, dt = 1 / 60) => { for (let i = 0; i < frames; i++) rig.update(dt); rig.group.updateMatrixWorld(true); };
const bounds = rig => new THREE.Box3().setFromObject(rig.group, true);

test('there is one team per Tetris shape, each with its own block colour', () => {
  assert.deepEqual([...PIECES].sort(), ['I', 'J', 'L', 'O', 'S', 'T', 'Z']);
  assert.deepEqual([...TEAM_PIECES].sort(), [...PIECES].sort());
  assert.equal(new Set(TEAM_PIECES.map(p => PIECE_COLOURS[p])).size, 7, 'seven different colours');
  // The standard Tetris colours.
  assert.deepEqual(PIECE_COLOURS, { I: 0x00e5ff, O: 0xffe600, T: 0xb44dff, S: 0x2ee62e, Z: 0xff2d2d, J: 0x3a63ff, L: 0xff9a1a });
  for (const p of TEAM_PIECES) assert.equal(lookFor({ piece: p }).colour, PIECE_COLOURS[p]);
  assert.equal(lookFor({ piece: 'nope' }).piece, 'T', 'unknown teams fall back to T');
});

// Direction of a colour, ignoring brightness (the rig shades faces darker and lighter).
const dir = ([r, g, b]) => { const n = Math.hypot(r, g, b) || 1; return [r / n, g / n, b / n]; };
const cos = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];

test('a fighter is one block colour, their team colour, apart from the face', () => {
  for (const piece of TEAM_PIECES) {
    const rig = makeRig(fighter(piece));
    const names = new Set();
    rig.group.traverse(o => {
      if (!o.isMesh || o.name === 'face' || o.parent === rig.parts.weapon || o.parent?.parent === rig.parts.weapon) return;
      if (rig.parts.weapon.getObjectById(o.id) || o.name === 'bomb') return;
      names.add(o.name);
      const c = o.geometry.attributes.color;
      for (let i = 0; i < c.count; i++) {
        // Plates are the team colour, shaded darker or lightened a little toward white. Nothing else.
        const d = dir([c.getX(i), c.getY(i), c.getZ(i)]), team = new THREE.Color(PIECE_COLOURS[piece]);
        let ok = false;
        for (let t = 0; t <= 0.3 && !ok; t += 0.02) { const m = team.clone().lerp(new THREE.Color(0xffffff), t); ok = cos(d, dir([m.r, m.g, m.b])) > 0.9995; }
        assert.ok(ok, `${piece} fighter: ${o.name} vertex ${d.map(x => x.toFixed(2))} is not the team colour`);
      }
    });
    for (const n of ['block', 'head', 'upper', 'fore', 'thigh', 'shin', 'foot', 'pelvis']) assert.ok(names.has(n), `${piece} has a ${n}`);
  }
});

test('every team builds a rig with a sane mesh count and finite geometry', () => {
  for (const piece of TEAM_PIECES) for (const team of [TEAM.ATT, TEAM.DEF]) {
    const rig = makeRig(fighter(piece, team));
    assert.ok(rig.meshCount <= 24, `${piece}: ${rig.meshCount} meshes`);
    rig.group.traverse(o => { if (o.isMesh) for (const v of o.geometry.attributes.position.array) assert.ok(Number.isFinite(v)); });
  }
});

test('the figure is a cube head on a box torso, the same for every team', () => {
  const sizes = new Set();
  for (const piece of TEAM_PIECES) {
    const rig = makeRig(fighter(piece)); settle(rig, 5);
    const head = rig.parts.head.children.find(c => c.name === 'head');
    const box = new THREE.Box3().setFromObject(head, true), s = box.getSize(new THREE.Vector3());
    assert.ok(Math.abs(s.x - s.y) < 0.02 && Math.abs(s.y - s.z) < 0.02, `${piece} head is a cube: ${s.toArray()}`);
    sizes.add(s.x.toFixed(2));
  }
  assert.equal(sizes.size, 1, 'one standard figure');
});

test('standing fighters match the 1.8 m hitbox and stand on the floor', () => {
  for (const n of TEAM_PIECES) {
    const rig = makeRig(fighter(n)); settle(rig);
    const b = bounds(rig);
    assert.ok(Math.abs(b.min.y) < 0.02, `${n} feet at ${b.min.y}`);
    assert.ok(b.max.y > 1.7 && b.max.y < 2.0, `${n} is ${b.max.y} m tall`);
    assert.ok(b.max.x - b.min.x < 1.0 && b.max.z - b.min.z < 1.6, `${n} fits in his space`);
  }
});

test('crouching drops the head to about the crouch hitbox', () => {
  const a = fighter('O'); const rig = makeRig(a);
  settle(rig); const standing = bounds(rig).max.y;
  a.crouching = true; settle(rig, 120);
  const b = bounds(rig);
  assert.ok(Math.abs(b.min.y) < 0.03, `still on the floor: ${b.min.y}`);
  assert.ok(b.max.y < standing - 0.3, `crouched ${b.max.y} vs standing ${standing}`);
  assert.ok(b.max.y < MOVE.crouchHeight + 0.25, `${b.max.y} close to ${MOVE.crouchHeight}`);
});

test('feet never sink through the floor while running, strafing or backpedalling', () => {
  for (const dir of [[0, 1], [1, 0], [-1, 0], [0, -1], [0.7, 0.7]]) {
    const a = fighter('J'); const rig = makeRig(a);
    a.vel.x = -Math.sin(a.yaw) * dir[1] * 6.5 + Math.cos(a.yaw) * dir[0] * 6.5;
    a.vel.z = -Math.cos(a.yaw) * dir[1] * 6.5 - Math.sin(a.yaw) * dir[0] * 6.5;
    let min = Infinity;
    for (let i = 0; i < 180; i++) { rig.update(1 / 60); if (i > 30) { rig.group.updateMatrixWorld(true); min = Math.min(min, bounds(rig).min.y); } }
    assert.ok(min > -0.03, `dir ${dir}: lowest point ${min}`);
  }
});

test('legs actually swing while running and stay still when idle', () => {
  const a = fighter('Z'); const rig = makeRig(a);
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
  for (const cur of [...PRIMARIES, ...SECONDARIES, 'knife', 'rocket']) for (const pitch of [-1, -0.4, 0, 0.5, 1]) for (const piece of ['Z', 'O', 'I']) {
    for (const stance of ['stand', 'crouch', 'run', 'fire']) {
      const a = fighter(piece); a.cur = cur; a.pitch = pitch;
      if (stance === 'crouch') a.crouching = true;
      if (stance === 'run') a.vel.z = -6.5;
      if (stance === 'fire') a.recoil = 0.1;
      const rig = makeRig(a); settle(rig, 100);
      assert.ok(rig.gap[0] < 0.045 && rig.gap[1] < 0.045, `${piece} ${cur} pitch ${pitch} ${stance}: gaps ${rig.gap.map(g => g.toFixed(3))}`);
    }
  }
});

test('reloading takes the magazine out and puts it back', () => {
  const a = fighter('Z'); const rig = makeRig(a);
  settle(rig);
  const mag = rig.guns.rifle.mag;
  assert.equal(mag.visible, true);
  a.reloadT = WEAPONS.rifle.reload / 2; rig.update(1 / 60);
  assert.equal(mag.visible, false);
  a.reloadT = 0; rig.update(1 / 60);
  assert.equal(mag.visible, true);
});

test('only the active weapon is shown, and the bomb shows on the carrier', () => {
  const a = fighter('Z'); const rig = makeRig(a); settle(rig, 5);
  assert.equal(rig.guns.rifle.group.visible, true); assert.equal(rig.guns.pistol.group.visible, false);
  a.cur = 'pistol'; a.hasBomb = true; settle(rig, 5);
  assert.equal(rig.guns.rifle.group.visible, false); assert.equal(rig.guns.pistol.group.visible, true);
  assert.equal(rig.parts.bomb.visible, true);
  a.hasBomb = false; settle(rig, 2);
  assert.equal(rig.parts.bomb.visible, false);
});

test('the dead lie on the floor, drop the weapon, and get up next round', () => {
  for (const id of [0, 1]) {
    const a = fighter('S', TEAM.DEF, id); const rig = makeRig(a);
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
  const a = fighter('Z'); const rig = makeRig(a);
  a.mantle = { t: 0.6 }; a.onGround = false; settle(rig, 30);
  rig.group.updateMatrixWorld(true);
  const hand = new THREE.Vector3();
  for (const arm of rig.arms) { arm.fore.getWorldPosition(hand); hand.y += 0; }
  const ys = rig.arms.map(arm => { const p = new THREE.Vector3(0, -BODY.fore, 0); arm.fore.localToWorld(p); return p.y; });
  assert.ok(ys.every(y => y > 1.4), `hands at ${ys}`);
});

test('every loadout carries its primary, its pistol and the knife', () => {
  for (const primary of PRIMARIES) for (const secondary of SECONDARIES) {
    const a = fighter('Z', TEAM.ATT, 0, { primary, secondary }); const rig = makeRig(a); settle(rig, 5);
    assert.deepEqual(Object.keys(rig.guns).sort(), [primary, secondary, 'knife'].sort(), `${primary}+${secondary} guns`);
    assert.equal(rig.guns[primary].group.visible, true, `${primary} is drawn first`);
  }
});

test('a rig re-dresses when the actor picks a new loadout between rounds', () => {
  const a = fighter('Z', TEAM.ATT, 0, { primary: 'rifle', secondary: 'pistol' }); const rig = makeRig(a); settle(rig, 5);
  assert.ok(rig.guns.rifle && rig.guns.pistol);
  a.nextLoadout = { primary: 'sniper', secondary: 'pistol2' }; resetActor(a); settle(rig, 5);
  assert.ok(rig.guns.sniper && rig.guns.pistol2 && !rig.guns.rifle && !rig.guns.pistol);
});
