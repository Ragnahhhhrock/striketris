import * as THREE from 'three';
import { MOVE, WEAPONS } from './config.js';
import { FACE, lookFor } from './looks.js';

// Procedural fighters: one standard blocky figure, Minecraft style: a cube head, a box torso, box arms and legs.
// Every part is the fighter's team colour (one Tetris colour per team); only the face is a different colour.
// Boxy like the rest of the grey box, but with a real skeleton.
// Each bone is one merged vertex-coloured mesh, so a whole squad is a few hundred draws at most.
// Front is -Z, up is +Y, origin is the soles of the feet, matching actor.pos and actor.yaw.

// Bone lengths in metres. Standing hip height is FOOT + SHIN + THIGH = 0.86.
export const BODY = {
  thigh: 0.40, shin: 0.38, foot: 0.08,
  torsoY: 0.02, torsoH: 0.58, torsoW: 0.46, torsoD: 0.26, // the torso box, measured from the hips up
  headS: 0.34,                                            // the head is a cube sitting on the torso
  upper: 0.31, fore: 0.29,
  shoulderDrop: 0.1, shoulderGap: 0.04,                   // shoulder sits this far below the top of the torso and beside it
};
const REACH = BODY.upper + BODY.fore;

// ---------------------------------------------------------------------------
// Geometry helpers

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const col = c => (c instanceof THREE.Color ? c.clone() : new THREE.Color(c));
const shade = (c, f) => col(c).multiplyScalar(f);
const mix = (a, b, t) => col(a).lerp(col(b), t);

// Collects boxes into one vertex-coloured geometry.
class Mesher {
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; }
  box(w, h, d, x, y, z, colour, rot) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0)),
      new THREE.Vector3(w, h, d),
    );
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const c = col(colour);
    const pos = UNIT.attributes.position, nor = UNIT.attributes.normal;
    const base = this.p.length / 3;
    const v = new THREE.Vector3(), nv = new THREE.Vector3();
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k).applyMatrix4(m);
      nv.fromBufferAttribute(nor, k).applyMatrix3(nm).normalize();
      const s = 0.82 + 0.18 * nv.y;
      this.p.push(v.x, v.y, v.z); this.n.push(nv.x, nv.y, nv.z); this.c.push(c.r * s, c.g * s, c.b * s);
    }
    for (const i of UNIT.index.array) this.i.push(base + i);
    return this;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

let sharedMat = null;
const material = () => (sharedMat ??= new THREE.MeshLambertMaterial({ vertexColors: true }));
const flashMat = () => new THREE.MeshBasicMaterial({ color: 0xffdf8a, transparent: true, opacity: 0.95, depthWrite: false });

function bone(mesher, name) {
  const mesh = new THREE.Mesh(mesher.geometry(), material());
  mesh.name = name; mesh.castShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Body: a box torso and a cube head, both in the team colour. The face sits on the front of the head.

function bodyLayout() {
  const { torsoY, torsoH, torsoW, torsoD, headS, shoulderDrop, shoulderGap } = BODY;
  const headY = torsoY + torsoH + headS / 2;               // head centre, measured from the hips up
  return { torsoY, torsoH, W: torsoW, d: torsoD, headS, headY, shoulderY: torsoY + torsoH - shoulderDrop, shoulderX: torsoW / 2 + shoulderGap };
}

// A bevelled, glossy block like a Tetris cell: darker body, lighter front and back plates and top. One colour throughout.
function cell(m, w, h, d, x, y, z, colour) {
  const pc = col(colour), dark = shade(pc, 0.78), light = mix(pc, 0xffffff, 0.28), g = 0.012;
  m.box(w - g, h - g, d - g, x, y, z, dark);
  for (const s of [-1, 1]) m.box(w - 0.07, h - 0.07, 0.014, x, y, z + s * (d / 2 - 0.004), pc);
  m.box(w - 0.07, 0.014, d - 0.07, x, y + h / 2 - 0.004, z, light);
  for (const s of [-1, 1]) m.box(0.014, h - 0.07, d - 0.07, x + s * (w / 2 - 0.004), y, z, shade(pc, 0.9));
  return m;
}

function buildTorso(teamC, L) {
  return cell(new Mesher(), L.W, L.torsoH, L.d, 0, L.torsoY + L.torsoH / 2, 0, teamC);
}

// The head is its own group so it can nod a little as the fighter looks up and down. Origin is the head centre.
function buildHead(teamC, L) {
  return cell(new Mesher(), L.headS, L.headS, L.headS, 0, 0, 0, teamC);
}

// Face on the front of the head: eyes and a mouth, the only parts that are not the team colour.
function buildFace(look, L) {
  const m = new Mesher();
  const z = -L.headS / 2 - 0.004;
  const sp = 0.075;
  for (const s of [-1, 1]) {
    m.box(0.062, 0.078, 0.012, s * sp, 0.03, z, FACE.eyeWhite);
    m.box(0.034, 0.05, 0.012, s * sp, 0.03, z - 0.005, look.eyes ?? FACE.iris);
    m.box(0.017, 0.03, 0.012, s * sp, 0.03, z - 0.01, FACE.pupil);
  }
  m.box(0.1, 0.02, 0.012, 0, -0.07, z, FACE.mouth);
  return m;
}

// ---------------------------------------------------------------------------
// Pelvis, limbs

function buildPelvis(teamC) {
  return new Mesher().box(0.46, 0.17, 0.26, 0, 0, 0, shade(teamC, 0.72));
}

// A limb segment is a straight block bar: n bevelled cells stacked downward from `top`.
function bar(m, w, d, top, len, n, colour) {
  const c = col(colour), dark = shade(c, 0.78), g = 0.01, h = len / n;
  for (let i = 0; i < n; i++) {
    const y = top - (i + 0.5) * h;
    m.box(w - g, h - g, d - g, 0, y, 0, dark);
    for (const z of [-1, 1]) m.box(w - 0.04, h - 0.04, 0.012, 0, y, z * (d / 2 - 0.004), c);
    for (const x of [-1, 1]) m.box(0.012, h - 0.04, d - 0.04, x * (w / 2 - 0.004), y, 0, shade(c, 0.9));
  }
  m.box(w - 0.04, 0.012, d - 0.04, 0, top - 0.004, 0, mix(c, 0xffffff, 0.28));
  return m;
}

function buildUpperArm(teamC) {
  return bar(new Mesher(), 0.15, 0.15, 0.05, BODY.upper + 0.05, 2, teamC);
}

// Hands are the same colour as the rest of the arm: the whole figure is one block colour.
function buildForeArm(teamC) {
  const m = bar(new Mesher(), 0.13, 0.13, 0, 0.22, 2, teamC);
  m.box(0.105, 0.11, 0.115, 0, -BODY.fore + 0.02, 0, shade(teamC, 0.85));
  return m;
}

function buildThigh(teamC) {
  return bar(new Mesher(), 0.19, 0.21, 0, BODY.thigh, 2, teamC);
}

function buildShin(teamC) {
  const m = bar(new Mesher(), 0.17, 0.18, 0, 0.3, 2, teamC);
  m.box(0.185, 0.1, 0.2, 0, -0.31, 0, shade(teamC, 0.85));
  return m;
}

function buildFoot(teamC) {
  const m = new Mesher();
  m.box(0.18, 0.065, 0.3, 0, -0.0425, -0.05, shade(teamC, 0.85));
  m.box(0.185, 0.018, 0.305, 0, -0.071, -0.05, shade(teamC, 0.55));
  return m;
}

// ---------------------------------------------------------------------------
// Weapons. Origin is the pistol grip, barrel points down -Z.

const GUN = 0x34373c, GUN_DARK = 0x1d1e21, GUN_MID = 0x2a2c30;

function buildRifle() {
  const body = new Mesher();
  body.box(0.06, 0.1, 0.3, 0, 0.035, -0.1, GUN);
  body.box(0.03, 0.025, 0.26, 0, 0.1, -0.1, GUN_DARK);
  body.box(0.07, 0.075, 0.2, 0, 0.025, -0.28, GUN_MID);
  body.box(0.026, 0.026, 0.24, 0, 0.045, -0.53, GUN_DARK);
  body.box(0.04, 0.04, 0.05, 0, 0.045, -0.66, GUN_DARK);
  body.box(0.015, 0.04, 0.015, 0, 0.1, -0.6, GUN_DARK);
  body.box(0.05, 0.095, 0.17, 0, 0.02, 0.15, GUN_MID);
  body.box(0.052, 0.12, 0.03, 0, 0.015, 0.245, 0x111111);
  body.box(0.045, 0.11, 0.055, 0, -0.07, 0.04, GUN_DARK, [-0.25, 0, 0]);
  body.box(0.045, 0.05, 0.14, 0, 0.15, -0.1, GUN_DARK);
  body.box(0.03, 0.035, 0.02, 0, 0.15, -0.18, 0x6ec6ff);
  const mag = new Mesher().box(0.04, 0.16, 0.06, 0, -0.1, -0.075, GUN_DARK, [0.2, 0, 0]);
  return { body, mag, right: [0, -0.075, 0.04], left: [0, -0.04, -0.2], magWell: [0, -0.14, -0.08], muzzle: [0, 0.045, -0.7] };
}

function buildPistol() {
  const body = new Mesher();
  body.box(0.04, 0.05, 0.2, 0, 0.045, -0.07, GUN);
  body.box(0.036, 0.03, 0.17, 0, 0.01, -0.055, GUN_DARK);
  body.box(0.04, 0.11, 0.05, 0, -0.05, 0.025, GUN_DARK, [-0.18, 0, 0]);
  body.box(0.03, 0.02, 0.05, 0, -0.012, -0.07, GUN_DARK);
  body.box(0.02, 0.02, 0.04, 0, 0.045, -0.19, GUN_MID);
  body.box(0.014, 0.014, 0.014, 0, 0.076, -0.17, GUN_DARK);
  const mag = new Mesher().box(0.032, 0.09, 0.04, 0, -0.07, 0.03, GUN_MID, [-0.18, 0, 0]);
  return { body, mag, right: [0, -0.045, 0.02], left: [-0.045, -0.06, 0.02], magWell: [0, -0.12, 0.03], muzzle: [0, 0.045, -0.22] };
}


// Light machine gun: heavy barrel, bipod folded under the muzzle, box magazine.
function buildLmg() {
  const body = new Mesher();
  body.box(0.07, 0.11, 0.42, 0, 0.04, -0.1, GUN);
  body.box(0.05, 0.05, 0.4, 0, 0.055, -0.5, GUN_MID);
  body.box(0.03, 0.03, 0.16, 0, 0.055, -0.78, GUN_DARK);
  body.box(0.07, 0.07, 0.07, 0, 0.055, -0.62, GUN_DARK);
  body.box(0.014, 0.05, 0.014, 0, 0.11, -0.84, GUN_DARK);
  for (const x of [-1, 1]) body.box(0.012, 0.16, 0.012, x * 0.035, -0.04, -0.62, GUN_DARK, [0.5, 0, x * 0.1]);
  body.box(0.05, 0.12, 0.05, 0, -0.07, 0.04, 0x5a3a22, [-0.25, 0, 0]);
  body.box(0.05, 0.1, 0.2, 0, 0.0, 0.27, 0x5a3a22);
  body.box(0.03, 0.05, 0.12, 0, 0.13, -0.05, GUN_DARK);
  const mag = new Mesher().box(0.1, 0.13, 0.13, 0, -0.1, -0.1, GUN_DARK).box(0.12, 0.02, 0.15, 0, -0.17, -0.1, 0x6b5a2a);
  return { body, mag, right: [0, -0.075, 0.04], left: [0, -0.02, -0.33], magWell: [0, -0.15, -0.1], muzzle: [0, 0.055, -0.88] };
}

// Bolt-action sniper: the rifle with a scope on top.
function buildSniper() {
  const r = buildRifle();
  r.body.box(0.042, 0.042, 0.3, 0, 0.17, -0.12, GUN_DARK);
  r.body.box(0.06, 0.06, 0.06, 0, 0.17, -0.3, GUN_DARK);
  r.body.box(0.055, 0.055, 0.05, 0, 0.17, 0.04, GUN_DARK);
  r.body.box(0.02, 0.03, 0.02, 0, 0.12, -0.2, GUN_DARK);
  r.body.box(0.02, 0.03, 0.02, 0, 0.12, -0.02, GUN_DARK);
  r.body.box(0.03, 0.04, 0.012, 0, 0.17, -0.335, 0x6ec6ff);
  r.muzzle = [0, 0.045, -0.7];
  return r;
}

// Rocket launcher: a long open tube rested on the shoulder.
function buildLauncher() {
  const body = new Mesher();
  body.box(0.13, 0.13, 1.3, 0, 0.1, -0.15, 0x4a5236);
  body.box(0.16, 0.16, 0.08, 0, 0.1, -0.84, 0x2d3320);
  body.box(0.16, 0.16, 0.08, 0, 0.1, 0.52, 0x2d3320);
  body.box(0.05, 0.12, 0.05, 0, 0.0, 0.0, GUN_DARK, [-0.1, 0, 0]);
  body.box(0.05, 0.12, 0.05, 0, 0.0, -0.4, GUN_DARK);
  body.box(0.03, 0.08, 0.14, 0.09, 0.19, -0.3, GUN_MID);
  body.box(0.02, 0.03, 0.02, 0.09, 0.25, -0.34, 0xff5a3a);
  body.box(0.12, 0.12, 0.06, 0, 0.1, 0.56, 0x1d2016);
  const mag = new Mesher().box(0.09, 0.09, 0.2, 0, 0.1, -0.78, 0x6b6f4a).box(0.07, 0.07, 0.06, 0, 0.1, -0.9, 0xb04a2a);
  return { body, mag, right: [0, -0.06, 0.0], left: [0, -0.06, -0.4], magWell: [0, 0.1, -0.7], muzzle: [0, 0.1, -0.9] };
}

// Knife: a short blade held point-forward, no magazine. The empty mag mesh keeps the rig's reload code happy.
function buildKnife() {
  const body = new Mesher();
  body.box(0.03, 0.035, 0.11, 0, 0, 0.02, GUN_DARK);
  body.box(0.05, 0.012, 0.012, 0, 0, -0.04, GUN_MID);
  body.box(0.012, 0.04, 0.22, 0, 0.005, -0.16, 0xd8dde2);
  body.box(0.012, 0.014, 0.06, 0, 0.026, -0.3, 0xd8dde2);
  const mag = new Mesher().box(0.001, 0.001, 0.001, 0, 0, 0, GUN_DARK);
  return { body, mag, right: [0, -0.02, 0.04], left: [0, -0.02, 0.04], magWell: [0, 0, 0], muzzle: [0, 0, -0.3] };
}

const BUILDERS = { knife: buildKnife, rifle: buildRifle, pistol: buildPistol, pistol2: buildPistol, lmg: buildLmg, sniper: buildSniper, rocket: buildLauncher };

// Where each weapon is held, in spine space (origin at the waist, chest pivot at shoulderY).
const HOLD = {
  rifle: { pos: [0.04, 0.4, -0.26] },
  pistol: { pos: [0.06, 0.47, -0.36] },
  pistol2: { pos: [0.06, 0.47, -0.36] },
  lmg: { pos: [0.04, 0.4, -0.22] },
  sniper: { pos: [0.04, 0.4, -0.26] },
  rocket: { pos: [0.1, 0.46, -0.12] },
};

// ---------------------------------------------------------------------------
// Rig

const DOWN = new THREE.Vector3(0, -1, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const tmp = {
  d: new THREE.Vector3(), p: new THREE.Vector3(), e: new THREE.Vector3(), u: new THREE.Vector3(),
  f: new THREE.Vector3(), hand: new THREE.Vector3(), q: new THREE.Quaternion(),
};
const T = {
  q: new THREE.Quaternion(), eu: new THREE.Euler(), pivot: new THREE.Vector3(), wpos: new THREE.Vector3(), kick: new THREE.Vector3(),
  rt: new THREE.Vector3(), lt: new THREE.Vector3(), away: new THREE.Vector3(), well: new THREE.Vector3(), tmp: new THREE.Vector3(),
};

// Two-bone arm solve. Poses the shoulder and elbow bones so the hand reaches target
// (shoulder space), as far as the arm allows. Returns the gap left, in metres.
function solveArm(arm, shoulder, target, pole) {
  const { d, p, e, u, f, hand, q } = tmp;
  d.copy(target).sub(shoulder);
  const want = d.length();
  const dist = clamp(want, 0.1, REACH - 0.003);
  d.normalize();
  const a = (BODY.upper ** 2 - BODY.fore ** 2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, BODY.upper ** 2 - a * a));
  p.copy(pole); p.addScaledVector(d, -pole.dot(d));
  if (p.lengthSq() < 1e-6) p.set(0, -1, 0);
  p.normalize();
  e.copy(shoulder).addScaledVector(d, a).addScaledVector(p, h);
  hand.copy(shoulder).addScaledVector(d, dist);
  u.copy(e).sub(shoulder).normalize();
  f.copy(hand).sub(e).normalize();
  arm.upper.quaternion.setFromUnitVectors(DOWN, u);
  q.copy(arm.upper.quaternion).invert();
  f.applyQuaternion(q);
  arm.fore.quaternion.setFromUnitVectors(DOWN, f);
  return want - dist;
}

export class Rig {
  constructor(actor, look = lookFor(actor)) {
    this.actor = actor;
    this.look = look;
    const bw = 1;
    this.bw = bw;
    const layout = bodyLayout();
    this.layout = layout;
    this.shoulderY = layout.shoulderY;
    const teamC = col(look.colour);
    const root = new THREE.Group(), fall = new THREE.Group(), body = new THREE.Group();
    const lower = new THREE.Group(), spine = new THREE.Group();
    root.add(fall); fall.add(body); body.add(lower, spine);

    const pelvis = bone(buildPelvis(teamC), 'pelvis'); lower.add(pelvis);

    this.legs = [-1, 1].map(s => {
      const hip = new THREE.Group(); hip.position.set(s * 0.115, 0, 0);
      const thigh = bone(buildThigh(teamC), 'thigh');
      const knee = new THREE.Group(); knee.position.y = -BODY.thigh;
      const shin = bone(buildShin(teamC), 'shin');
      const ankle = new THREE.Group(); ankle.position.y = -BODY.shin;
      const foot = bone(buildFoot(teamC), 'foot');
      ankle.add(foot); knee.add(shin, ankle); hip.add(thigh, knee); lower.add(hip);
      return { hip, knee, ankle };
    });

    spine.add(bone(buildTorso(teamC, layout), 'block'));

    const head = new THREE.Group(); head.position.set(0, layout.headY, 0);
    head.add(bone(buildHead(teamC, layout), 'head'), bone(buildFace(look, layout), 'face'));
    spine.add(head);

    // Index 0 is the left arm (-x), 1 the right.
    this.arms = [-1, 1].map(s => {
      const upper = new THREE.Group();
      upper.position.set(s * layout.shoulderX, layout.shoulderY, 0);
      upper.add(bone(buildUpperArm(teamC), 'upper'));
      const fore = new THREE.Group(); fore.position.y = -BODY.upper;
      fore.add(bone(buildForeArm(teamC), 'fore'));
      upper.add(fore); spine.add(upper);
      return { upper, fore, shoulder: upper.position.clone(), pole: new THREE.Vector3(s * 0.5, -1, 0.35) };
    });

    // Weapons share one group so the hands only have to follow that.
    const weapon = new THREE.Group();
    this.guns = {};
    this.weaponGroup = weapon;
    spine.add(weapon);

    // The bomb rides on the carrier's back.
    const bm = new Mesher().box(0.34, 0.18, 0.2, 0, 0, 0, 0x2a2a2a).box(0.3, 0.04, 0.16, 0, 0.11, 0, 0x4d4d4d).box(0.06, 0.04, 0.06, 0.08, 0.14, 0, 0xff2a1a);
    const bomb = bone(bm, 'bomb'); bomb.position.set(0, 0.3, 0.24); bomb.visible = false;
    spine.add(bomb);

    this.group = root;
    this.parts = { root, fall, body, lower, spine, head, weapon, bomb, pelvis };
    this.loadoutKey = '';
    this.sync(actor);
    this.meshCount = 0;
    root.traverse(o => { if (o.isMesh) this.meshCount++; });

    // Animation state.
    this.phase = 0; this.sp = 0; this.legYaw = 0; this.backpedal = false;
    this.crouchW = 0; this.airW = 0; this.downT = 0; this.kick = 0; this.flashT = 0; this.swapT = 0;
    this.dropped = false; this.lift = null; this.curGun = null; this.clock = Math.random() * 10; this.hipY = BODY.thigh + BODY.shin + BODY.foot;
    this.gap = [0, 0];
  }

  shot() { this.kick = 1; this.flashT = 0.05; }

  update(dt) {
    dt = Math.min(dt, 0.1);
    const a = this.actor, P = this.parts;
    this.clock += dt;
    P.root.position.set(a.pos.x, a.pos.y, a.pos.z);
    P.root.rotation.y = a.yaw;
    this.downT = a.alive ? 0 : Math.min(1, this.downT + dt * 2.6);
    if (!a.alive) return this.poseDead(dt);
    if (this.dropped) this.pickUp();

    const bw = this.bw;
    // Gait: legs follow velocity, torso keeps facing where the actor aims.
    const vx = a.vel.x, vz = a.vel.z;
    const sin = Math.sin(a.yaw), cos = Math.cos(a.yaw);
    const fwd = -vx * sin - vz * cos, right = vx * cos - vz * sin;
    const speed = Math.hypot(vx, vz);
    this.sp += (speed - this.sp) * (1 - Math.exp(-14 * dt));
    const moving = clamp((this.sp - 0.25) / 1.2, 0, 1);
    const s = clamp(this.sp / MOVE.run, 0, 1.15);
    let targetYaw = 0;
    if (speed > 0.5) {
      const ang = Math.atan2(right, fwd);
      if (!this.backpedal && Math.abs(ang) > 2.0) this.backpedal = true;
      else if (this.backpedal && Math.abs(ang) < 1.1) this.backpedal = false;
      targetYaw = -clamp(this.backpedal ? ang - Math.sign(ang) * Math.PI : ang, -1.1, 1.1);
    }
    this.legYaw += (targetYaw - this.legYaw) * (1 - Math.exp(-10 * dt));
    if (a.onGround && !a.mantle) this.phase += dt * this.sp * 2.2 * (this.backpedal ? -1 : 1);

    this.crouchW += ((a.crouching ? 1 : 0) - this.crouchW) * (1 - Math.exp(-14 * dt));
    this.airW += ((a.onGround || a.mantle ? 0 : 1) - this.airW) * (1 - Math.exp(-12 * dt));
    const cw = this.crouchW, aw = this.airW;

    // Legs.
    const amp = (0.26 + 0.55 * s) * moving * (1 - 0.65 * cw) * (1 - aw);
    let hipY = 0;
    this.legs.forEach((leg, i) => {
      const ph = this.phase + i * Math.PI;
      const swing = Math.max(0, Math.cos(ph));
      let t1 = amp * Math.sin(ph) + (i ? 0.03 : -0.03) * (1 - moving);
      let k = 0.04 + moving * (0.12 + (0.5 + 0.9 * s) * swing * swing) * (1 - 0.5 * cw);
      if (a.mantle) { const climb = Math.sin(a.mantle.t * 16 + i * Math.PI); t1 = 0.7 + 0.5 * climb; k = 1.3 + 0.5 * climb; }
      else { t1 = lerp(t1, i ? 0.75 : 0.1, aw); k = lerp(k, i ? 1.3 : 0.5, aw); }
      t1 = lerp(t1, 1.2, cw); k = lerp(k, 2.1, cw);
      leg.hip.rotation.x = t1; leg.knee.rotation.x = -k; leg.ankle.rotation.x = k - t1 + (1 - cw) * 0.15 * moving * swing;
      hipY = Math.max(hipY, BODY.foot + BODY.thigh * Math.cos(t1) + BODY.shin * Math.cos(t1 - k));
    });
    this.hipY = hipY;
    P.body.position.y = hipY;
    P.lower.rotation.y = this.legYaw;
    P.fall.rotation.x = 0; P.fall.position.y = 0;

    // Spine and head.
    const lean = 0.04 + 0.1 * s * moving + 0.33 * cw + (a.mantle ? 0.25 : 0);
    const twist = Math.sin(this.phase) * 0.09 * moving * (1 - aw);
    P.spine.rotation.set(-lean, twist + this.legYaw * 0.3, 0);
    P.head.rotation.set(clamp(a.pitch, -1.2, 1.2) * 0.35, 0, 0);   // the head nods as the fighter looks up and down

    // Weapon: aimed along the actor's view, kicked by recoil and shots.
    this.kick *= Math.exp(-16 * dt);
    if (this.flashT > 0) this.flashT -= dt;
    this.sync(a);
    if (a.cur !== this.curGun) { this.curGun = a.cur; this.swapT = 0.28; for (const [n, g] of Object.entries(this.guns)) g.group.visible = n === a.cur; }
    this.swapT = Math.max(0, this.swapT - dt);
    const gun = this.guns[a.cur] ?? Object.values(this.guns)[0];
    for (const [n, g] of Object.entries(this.guns)) g.flash.visible = n === a.cur && this.flashT > 0 && !a.mantle;
    if (gun.flash.visible) gun.flash.scale.setScalar(0.7 + Math.random() * 0.8);

    const reloadDur = WEAPONS[a.cur]?.reload ?? 2;
    const rp = a.reloadT > 0 ? clamp(1 - a.reloadT / reloadDur, 0, 1) : -1;
    const bump = rp < 0 ? 0 : Math.sin(Math.min(1, rp / 0.85) * Math.PI);
    const aimPitch = clamp(a.pitch + a.recoil, -1.3, 1.3) + lean;
    const q = T.q.setFromEuler(T.eu.set(aimPitch - 0.38 * bump + this.kick * 0.04, -P.spine.rotation.y, 0.25 * bump, 'YXZ'));
    const hold = HOLD[a.cur] ?? HOLD.rifle;
    const pivot = T.pivot.set(0, this.shoulderY, 0);
    const wpos = T.wpos.set(hold.pos[0] * bw, hold.pos[1] + this.shoulderY - 0.5, hold.pos[2]).sub(pivot).applyQuaternion(q).add(pivot);
    wpos.y += Math.sin(this.clock * 1.7) * 0.003 - (this.swapT / 0.28) * 0.28;
    wpos.add(T.kick.set(0, 0, this.kick * 0.05).applyQuaternion(q));
    P.weapon.position.copy(wpos);
    P.weapon.quaternion.copy(q);
    P.weapon.visible = !a.mantle;

    // Magazine is out of the gun for the middle of a reload.
    gun.mag.visible = !(rp > 0.22 && rp < 0.62);

    // Hands. If the support hand would be out of reach (steep aim, big build), the weapon
    // is drawn in toward the body instead of the hand letting go.
    const toSpine = (v, out) => out.copy(v).applyQuaternion(q).add(wpos);
    const off = T.tmp.copy(toSpine(gun.left, T.lt)).sub(this.arms[0].shoulder);
    const over = off.length() - (REACH - 0.012);
    if (over > 0) wpos.addScaledVector(off, -over / off.length());
    P.weapon.position.copy(wpos);
    const rt = toSpine(gun.right, T.rt);
    const lt = toSpine(gun.left, T.lt);
    if (rp >= 0) {
      // Left hand: to the magazine, away for a fresh one, back and in, then back on the gun.
      const away = toSpine(T.tmp.set(-0.05, -0.34, 0.0), T.away);
      const well = toSpine(gun.magWell, T.well);
      if (rp < 0.22) lt.lerp(well, ease(rp / 0.22));
      else if (rp < 0.45) lt.copy(well).lerp(away, ease((rp - 0.22) / 0.23));
      else if (rp < 0.68) lt.copy(away).lerp(well, ease((rp - 0.45) / 0.23));
      else lt.copy(well).lerp(lt, ease((rp - 0.68) / 0.32));
    }
    if (a.mantle) {
      const reach = Math.min(1, a.mantle.t / 0.7);
      rt.set(0.2 * bw, lerp(0.7, 1.05, reach), -0.4); lt.set(-0.2 * bw, lerp(0.7, 1.05, reach), -0.4);
    }
    this.gap[1] = solveArm(this.arms[1], this.arms[1].shoulder, rt, this.arms[1].pole);
    this.gap[0] = solveArm(this.arms[0], this.arms[0].shoulder, lt, this.arms[0].pole);

    P.bomb.visible = !!a.hasBomb;
  }

  // Falls forward or backward, drops the weapon, arms and legs go slack.
  poseDead(dt) {
    const a = this.actor, P = this.parts;
    const k = ease(this.downT), dir = a.id % 2 ? 1 : -1;
    P.fall.rotation.x = dir * k * Math.PI / 2;
    if (this.downT >= 1 && this.lift == null) {
      // Fully down: measure how far the body sank and rest it exactly on the floor.
      const keep = P.fall.position.y;
      P.fall.position.y = 0; P.root.updateMatrixWorld(true);
      const low = new THREE.Box3().setFromObject(P.fall, true).min.y - P.root.position.y;
      this.lift = clamp(-low + 0.01, 0.05, 0.6);
      P.fall.position.y = keep;
    }
    const liftTo = this.lift ?? (dir > 0 ? 0.3 : 0.17) * k;
    P.fall.position.y += (liftTo - P.fall.position.y) * (1 - Math.exp(-14 * dt));
    P.body.position.y = lerp(this.hipY, BODY.foot + BODY.thigh + BODY.shin, k);
    P.spine.rotation.set(0, 0, 0);
    P.lower.rotation.y = lerp(this.legYaw, 0, k);
    P.head.rotation.set(0, 0, 0);
    this.legs.forEach((leg, i) => {
      const s = i ? 1 : -1;
      leg.hip.rotation.set(lerp(leg.hip.rotation.x, 0.15 * dir + (i ? 0.25 : -0.05) * k, 0.3), 0, s * 0.22 * k);
      leg.knee.rotation.x = lerp(leg.knee.rotation.x, -0.35 * k, 0.3);
      leg.ankle.rotation.x = lerp(leg.ankle.rotation.x, 0, 0.3);
    });
    this.arms.forEach((arm, i) => {
      const s = i ? 1 : -1;
      arm.upper.rotation.set(-0.4 * k * dir, 0, s * (1.1 * k + (i ? 0.2 : 0)));
      arm.fore.rotation.set(-0.55 * k, 0, 0);
    });
    P.bomb.visible = false;
    for (const g of Object.values(this.guns)) g.flash.visible = false;
    if (!this.dropped) {
      this.dropped = true;
      P.root.updateMatrixWorld(true);
      P.root.attach(P.weapon);
      P.weapon.visible = true;
    }
    const tp = T.tmp.set(0.55 * (a.id % 3 - 1 || 1), 0.05, -0.45), tq = T.q.setFromEuler(T.eu.set(0, 0.7 + a.id, Math.PI / 2));
    P.weapon.position.lerp(tp, 1 - Math.exp(-6 * dt));
    P.weapon.quaternion.slerp(tq, 1 - Math.exp(-6 * dt));
  }

  // Rebuild the carried weapons when the loadout changes (a new round can bring a new pick).
  sync(a) {
    const key = [...(a.loadout ?? ['rifle', 'pistol']), 'knife'].join();
    if (key !== this.loadoutKey) {
      this.loadoutKey = key;
      for (const g of Object.values(this.guns)) { this.weaponGroup.remove(g.group); g.group.traverse(o => o.geometry?.dispose()); }
      this.guns = {};
      for (const name of key.split(',')) {
        const spec = BUILDERS[name]();
        const g = new THREE.Group();
        const flash = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.03), flashMat());
        flash.position.set(...spec.muzzle); flash.visible = false;
        const mag = bone(spec.mag, `${name}Mag`);
        g.add(bone(spec.body, name), mag, flash);
        g.visible = false;
        this.weaponGroup.add(g);
        this.guns[name] = { group: g, mag, flash, right: new THREE.Vector3(...spec.right), left: new THREE.Vector3(...spec.left), magWell: new THREE.Vector3(...spec.magWell) };
      }
      this.curGun = null;
    }
  }

  pickUp() {
    this.dropped = false; this.lift = null;
    this.parts.spine.add(this.parts.weapon);
    this.curGun = null;
    this.swapT = 0.28;
  }
}

export function makeRig(actor, look) { return new Rig(actor, look); }
