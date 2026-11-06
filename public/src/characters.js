import * as THREE from 'three';
import { TEAM, MOVE, WEAPONS } from './config.js';
import { SKIN, HAIR, BUILDS, lookFor } from './looks.js';

// Procedural fighters: boxy like the rest of the grey box, but with a real skeleton.
// Each bone is one merged vertex-coloured mesh, so a whole squad is a few hundred draws at most.
// Front is -Z, up is +Y, origin is the soles of the feet, matching actor.pos and actor.yaw.

export const TEAM_SHIRT = { [TEAM.ATT]: 0xd98a3d, [TEAM.DEF]: 0x4a8fd9 };

// Bone lengths in metres. Standing hip height is FOOT + SHIN + THIGH = 0.86.
export const BODY = {
  thigh: 0.40, shin: 0.38, foot: 0.08,
  torso: 0.58, head: 0.28, headY: 0.76,
  upper: 0.31, fore: 0.29,
  shoulderX: 0.31, shoulderY: 0.5,
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
// Head: face, hair, facial hair, eyewear and headwear

function buildHead(look, skin, teamC) {
  const m = new Mesher();
  const skinC = col(skin);
  const hairC = col(HAIR[look.hair[1]] ?? look.hair[1]);
  const resolve = c => (c === 'team' ? teamC : c === 'teamDark' ? shade(teamC, 0.6) : col(c));
  const hat = look.hat ? { style: look.hat[0], c: resolve(look.hat[1]) } : null;
  const beard = look.beard ? { style: look.beard[0], c: col(HAIR[look.beard[1]] ?? look.beard[1]) } : null;
  const stache = look.moustache ? { style: look.moustache[0], c: col(HAIR[look.moustache[1]] ?? look.moustache[1]) } : null;

  // Skull, ears, nose, eyes, brows, mouth.
  m.box(0.28, 0.28, 0.28, 0, 0, 0, skinC);
  for (const s of [-1, 1]) m.box(0.035, 0.075, 0.045, s * 0.157, -0.005, 0.01, shade(skinC, 0.94));
  m.box(0.05, 0.065, 0.045, 0, -0.025, -0.16, shade(skinC, 0.93));
  const browC = beard?.c ?? hairC;
  for (const s of [-1, 1]) {
    m.box(0.062, 0.044, 0.012, s * 0.065, 0.025, -0.143, 0xf4f4f4);
    m.box(0.032, 0.038, 0.012, s * 0.065, 0.025, -0.1485, look.eyes ?? 0x2a1a10);
    m.box(0.016, 0.022, 0.012, s * 0.065, 0.025, -0.154, 0x0d0d0d);
    m.box(0.078, 0.022, 0.016, s * 0.065, 0.077, -0.146, look.hair[0] === 'bald' && !beard ? shade(skinC, 0.7) : hairC, [0, 0, -s * 0.08]);
  }

  // Beards sit in front of the jaw. mouthZ keeps the mouth visible on top of them.
  let mouthZ = -0.1465;
  if (beard) {
    const b = beard.c;
    switch (beard.style) {
      case 'stubble': m.box(0.289, 0.13, 0.289, 0, -0.075, 0, mix(skinC, b, 0.42)); break;
      case 'full':
        m.box(0.304, 0.17, 0.304, 0, -0.065, 0, b);
        m.box(0.26, 0.09, 0.07, 0, -0.16, -0.125, b);
        mouthZ = -0.1555;
        break;
      case 'goatee': m.box(0.075, 0.105, 0.042, 0, -0.115, -0.155, b); m.box(0.14, 0.022, 0.02, 0, -0.1, -0.152, b); break;
      case 'chinstrap':
        m.box(0.2, 0.05, 0.03, 0, -0.13, -0.15, b);
        for (const s of [-1, 1]) { m.box(0.032, 0.1, 0.22, s * 0.15, -0.08, -0.02, b); m.box(0.03, 0.09, 0.06, s * 0.15, 0.0, 0.03, b); }
        break;
      case 'chops': for (const s of [-1, 1]) { m.box(0.05, 0.17, 0.13, s * 0.155, -0.04, -0.015, b); m.box(0.05, 0.07, 0.08, s * 0.155, -0.125, -0.05, b); } break;
      case 'soulpatch': m.box(0.036, 0.045, 0.022, 0, -0.118, -0.151, b); break;
    }
  }
  m.box(0.09, 0.02, 0.012, 0, -0.092, mouthZ, beard?.style === 'full' ? 0xb86a62 : 0x8a4640);

  if (stache) {
    const s = stache.c, z = mouthZ - 0.012;
    switch (stache.style) {
      case 'classic': m.box(0.13, 0.036, 0.036, 0, -0.066, z - 0.008, s); break;
      case 'handlebar':
        m.box(0.11, 0.032, 0.034, 0, -0.066, z - 0.008, s);
        for (const k of [-1, 1]) { m.box(0.05, 0.026, 0.03, k * 0.075, -0.07, z - 0.004, s); m.box(0.03, 0.05, 0.028, k * 0.108, -0.045, z - 0.002, s, [0, 0, k * 0.3]); }
        break;
      case 'pencil': m.box(0.11, 0.016, 0.016, 0, -0.064, z - 0.004, s); break;
      case 'walrus':
        m.box(0.18, 0.06, 0.045, 0, -0.068, z - 0.014, s);
        for (const k of [-1, 1]) m.box(0.04, 0.08, 0.035, k * 0.075, -0.1, z - 0.006, s);
        break;
    }
  }

  // Hair. The crown is left out under hats so it cannot poke through.
  const hatCoversTop = hat && !['headphones', 'headband'].includes(hat.style);
  const hs = look.hair[0];
  const shell = (top, fringe = true, lift = 0) => {
    if (!hatCoversTop) m.box(0.3, top, 0.3, 0, 0.14 + top / 2 - 0.005 + lift, 0, hairC);
    m.box(0.3, 0.13, 0.04, 0, 0.075, 0.15, hairC);
    for (const s of [-1, 1]) m.box(0.034, 0.12, 0.23, s * 0.156, 0.08, 0.03, hairC);
    if (fringe && !hatCoversTop) m.box(0.3, 0.05, 0.04, 0, 0.12, -0.152, hairC);
  };
  switch (hs) {
    case 'buzz': shell(0.04, false); break;
    case 'short': shell(0.07); break;
    case 'quiff': shell(0.07); if (!hatCoversTop) m.box(0.25, 0.1, 0.17, 0, 0.245, -0.07, hairC, [0.32, 0, 0]); break;
    case 'mohawk':
      for (const [z, h] of [[-0.11, 0.1], [-0.03, 0.15], [0.05, 0.14], [0.12, 0.09]]) m.box(0.07, h, 0.075, 0, 0.14 + h / 2, z, hairC);
      m.box(0.3, 0.02, 0.3, 0, 0.14, 0, shade(hairC, 0.5));
      break;
    case 'long':
      shell(0.07);
      m.box(0.31, 0.3, 0.05, 0, -0.01, 0.165, hairC);
      for (const s of [-1, 1]) m.box(0.04, 0.24, 0.2, s * 0.16, 0.0, 0.05, hairC);
      break;
    case 'ponytail':
      shell(0.07);
      m.box(0.085, 0.06, 0.075, 0, 0.06, 0.18, shade(hairC, 0.55));
      m.box(0.095, 0.26, 0.085, 0, -0.09, 0.215, hairC, [-0.18, 0, 0]);
      break;
    case 'afro':
      m.box(0.42, 0.26, 0.4, 0, 0.215, 0.02, hairC);
      m.box(0.36, 0.06, 0.34, 0, 0.36, 0.02, hairC);
      m.box(0.42, 0.28, 0.12, 0, 0.02, 0.16, hairC);
      for (const s of [-1, 1]) m.box(0.05, 0.2, 0.22, s * 0.17, 0.06, 0.02, hairC);
      break;
  }

  // Eyewear.
  if (look.eyewear) {
    const [style, fc] = look.eyewear;
    const f = col(fc);
    const temples = y => { for (const s of [-1, 1]) m.box(0.012, 0.014, 0.14, s * 0.1435, y, -0.075, f); };
    const rim = (cx, cy, w, h, t = 0.009) => {
      m.box(w, t, 0.014, cx, cy + h / 2, -0.152, f); m.box(w, t, 0.014, cx, cy - h / 2, -0.152, f);
      m.box(t, h, 0.014, cx - w / 2, cy, -0.152, f); m.box(t, h, 0.014, cx + w / 2, cy, -0.152, f);
    };
    switch (style) {
      case 'sunglasses':
        for (const s of [-1, 1]) m.box(0.088, 0.05, 0.016, s * 0.065, 0.025, -0.152, 0x0d0d10);
        m.box(0.045, 0.012, 0.016, 0, 0.037, -0.152, 0x0d0d10); temples(0.037);
        break;
      case 'aviators':
        for (const s of [-1, 1]) { m.box(0.088, 0.07, 0.012, s * 0.065, 0.012, -0.151, 0x233226); rim(s * 0.065, 0.012, 0.094, 0.076); }
        m.box(0.04, 0.01, 0.014, 0, 0.04, -0.152, f); temples(0.045);
        break;
      case 'round':
        for (const s of [-1, 1]) rim(s * 0.065, 0.025, 0.078, 0.074);
        m.box(0.04, 0.009, 0.014, 0, 0.035, -0.152, f); temples(0.035);
        break;
      case 'eyepatch':
        m.box(0.09, 0.08, 0.016, 0.065, 0.02, -0.152, f, [0, 0, 0.18]);
        m.box(0.296, 0.014, 0.296, 0, 0.062, 0, f, [0, 0, 0.1]);
        break;
      case 'monocle':
        rim(0.065, 0.025, 0.08, 0.08, 0.01); m.box(0.01, 0.13, 0.01, 0.1, -0.04, -0.15, f);
        break;
    }
  }

  // Headwear.
  if (hat) {
    const h = hat.c, dark = shade(h, 0.7), light = mix(h, 0xffffff, 0.3);
    switch (hat.style) {
      case 'cap':
        m.box(0.315, 0.115, 0.315, 0, 0.178, 0, h);
        m.box(0.27, 0.018, 0.17, 0, 0.122, -0.225, dark, [0.12, 0, 0]);
        m.box(0.04, 0.02, 0.04, 0, 0.24, 0, dark);
        m.box(0.1, 0.03, 0.02, 0, 0.13, 0.16, dark);
        break;
      case 'capBack':
        m.box(0.315, 0.115, 0.315, 0, 0.178, 0, h);
        m.box(0.27, 0.018, 0.17, 0, 0.122, 0.225, dark, [-0.12, 0, 0]);
        m.box(0.04, 0.02, 0.04, 0, 0.24, 0, dark);
        m.box(0.1, 0.03, 0.02, 0, 0.13, -0.16, dark);
        break;
      case 'beanie':
        m.box(0.318, 0.15, 0.318, 0, 0.17, 0, h);
        m.box(0.33, 0.055, 0.33, 0, 0.118, 0, light);
        m.box(0.075, 0.06, 0.075, 0, 0.275, 0, light);
        break;
      case 'cowboy':
        m.box(0.23, 0.12, 0.24, 0, 0.2, 0, h);
        m.box(0.17, 0.03, 0.19, 0, 0.268, 0, dark);
        m.box(0.58, 0.022, 0.52, 0, 0.138, 0, h);
        for (const s of [-1, 1]) m.box(0.1, 0.024, 0.5, s * 0.285, 0.165, 0, h, [0, 0, s * 0.32]);
        m.box(0.24, 0.03, 0.25, 0, 0.165, 0, 0x2b1f16);
        break;
      case 'hardhat':
        m.box(0.32, 0.115, 0.32, 0, 0.17, 0, h);
        m.box(0.07, 0.04, 0.3, 0, 0.24, 0, light);
        m.box(0.28, 0.02, 0.1, 0, 0.115, -0.19, h);
        m.box(0.325, 0.03, 0.325, 0, 0.12, 0, dark);
        m.box(0.06, 0.05, 0.04, 0, 0.17, -0.165, 0xfff3b0);
        break;
      case 'helmet':
        m.box(0.34, 0.14, 0.34, 0, 0.18, 0, h);
        m.box(0.26, 0.04, 0.26, 0, 0.265, 0, h);
        m.box(0.352, 0.045, 0.352, 0, 0.105, 0, dark);
        m.box(0.347, 0.03, 0.347, 0, 0.15, 0, mix(h, 0x2b2b2b, 0.45));
        for (const s of [-1, 1]) m.box(0.03, 0.12, 0.24, s * 0.172, 0.07, 0.02, dark);
        break;
      case 'bucket':
        m.box(0.3, 0.1, 0.3, 0, 0.165, 0, h);
        m.box(0.43, 0.025, 0.43, 0, 0.113, 0, dark);
        m.box(0.305, 0.025, 0.305, 0, 0.14, 0, shade(h, 0.8));
        break;
      case 'tophat':
        m.box(0.42, 0.02, 0.42, 0, 0.125, 0, h);
        m.box(0.245, 0.3, 0.245, 0, 0.285, 0, h);
        m.box(0.255, 0.05, 0.255, 0, 0.175, 0, 0xb3342e);
        break;
      case 'headband':
        m.box(0.3, 0.045, 0.3, 0, 0.105, 0, h);
        m.box(0.05, 0.05, 0.05, 0, 0.105, 0.165, dark);
        for (const s of [-1, 1]) m.box(0.025, 0.12, 0.02, s * 0.025, 0.04, 0.19, h, [-0.2, 0, s * 0.15]);
        break;
      case 'flatcap':
        m.box(0.325, 0.08, 0.325, 0, 0.15, 0, h);
        m.box(0.22, 0.016, 0.09, 0, 0.113, -0.19, dark);
        break;
      case 'headphones':
        m.box(0.31, 0.028, 0.045, 0, 0.172, 0, h);
        for (const s of [-1, 1]) {
          m.box(0.03, 0.11, 0.045, s * 0.158, 0.115, 0, h);
          m.box(0.06, 0.12, 0.12, s * 0.18, 0.0, 0.01, h);
          m.box(0.012, 0.09, 0.09, s * 0.21, 0.0, 0.01, 0xff4a3d);
        }
        break;
    }
  }
  return m;
}

// ---------------------------------------------------------------------------
// Torso, limbs

function buildTorso(look, skin, teamC, bw) {
  const m = new Mesher();
  const T = BODY.torso;
  m.box(0.5 * bw, T, 0.27 * bw, 0, T / 2, 0, teamC);
  m.box(0.505 * bw, 0.05, 0.275 * bw, 0, 0.4, 0, mix(teamC, 0xffffff, 0.35));
  m.box(0.2, 0.04, 0.2, 0, T + 0.01, 0, shade(teamC, 0.8));
  m.box(0.1, 0.1, 0.1, 0, T + 0.05, 0, skin);
  m.box(0.52 * bw, 0.06, 0.29 * bw, 0, 0.03, 0, 0x2b2b2b);
  m.box(0.06, 0.05, 0.02, 0, 0.03, -0.148 * bw, 0xd4af37);
  if (look.vest != null) {
    const v = col(look.vest);
    m.box(0.54 * bw, 0.38, 0.31 * bw, 0, 0.34, 0, v);
    for (const x of [-0.15, 0, 0.15]) m.box(0.1, 0.1, 0.05, x * bw, 0.25, -0.17 * bw, shade(v, 0.7));
    for (const s of [-1, 1]) m.box(0.07, 0.1, 0.33 * bw, s * 0.17 * bw, 0.55, 0, shade(v, 0.85));
  }
  if (look.backpack != null) {
    const b = col(look.backpack);
    m.box(0.38 * bw, 0.44, 0.16, 0, 0.3, 0.225 * bw, b);
    m.box(0.4 * bw, 0.07, 0.18, 0, 0.55, 0.225 * bw, shade(b, 0.75));
  }
  if (look.scarf != null) {
    const s = col(look.scarf);
    m.box(0.24, 0.075, 0.24, 0, T + 0.04, 0, s);
    m.box(0.075, 0.22, 0.03, 0.06, 0.46, -0.14 * bw, s);
  }
  return m;
}

function buildPelvis(look, bw) {
  return new Mesher().box(0.46 * bw, 0.17, 0.26 * bw, 0, 0, 0, look.pants);
}

function buildUpperArm(look, skin, teamC, bw, sleeveLong) {
  const m = new Mesher();
  const L = BODY.upper;
  const stripe = shade(teamC, 0.65);
  m.box(0.17 * bw, 0.1, 0.17 * bw, 0, 0.0, 0, teamC);
  if (sleeveLong) {
    m.box(0.14 * bw, L, 0.145 * bw, 0, -L / 2, 0, teamC);
    m.box(0.15 * bw, 0.04, 0.155 * bw, 0, -0.1, 0, stripe);
  } else {
    m.box(0.15 * bw, 0.15, 0.155 * bw, 0, -0.075, 0, teamC);
    m.box(0.157 * bw, 0.035, 0.162 * bw, 0, -0.13, 0, stripe);
    m.box(0.125 * bw, L - 0.15, 0.13 * bw, 0, -0.15 - (L - 0.15) / 2, 0, skin);
  }
  return m;
}

function buildForeArm(look, skin, teamC, bw, sleeveLong) {
  const m = new Mesher();
  const L = BODY.fore;
  const glove = look.gloves != null;
  const handC = glove ? col(look.gloves) : skin;
  if (sleeveLong) {
    m.box(0.125 * bw, 0.22, 0.13 * bw, 0, -0.11, 0, teamC);
    if (glove) m.box(0.12 * bw, 0.05, 0.125 * bw, 0, -0.215, 0, shade(handC, 0.8));
  } else {
    m.box(0.115 * bw, 0.22, 0.12 * bw, 0, -0.11, 0, glove ? skin : skin);
  }
  m.box(0.105 * bw, 0.11, 0.115 * bw, 0, -L + 0.02, 0, handC);
  return m;
}

function buildThigh(look, bw) {
  return new Mesher().box(0.19 * bw, BODY.thigh, 0.21 * bw, 0, -BODY.thigh / 2, 0, look.pants);
}

function buildShin(look, bw) {
  const m = new Mesher();
  m.box(0.165 * bw, 0.3, 0.18 * bw, 0, -0.15, 0, look.pants);
  m.box(0.185 * bw, 0.1, 0.2 * bw, 0, -0.31, 0, look.boots);
  return m;
}

function buildFoot(look, bw) {
  const m = new Mesher();
  m.box(0.18 * bw, 0.065, 0.3 * bw, 0, -0.0425, -0.05, look.boots);
  m.box(0.185 * bw, 0.018, 0.305 * bw, 0, -0.071, -0.05, 0x161616);
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

// Where each weapon is held, in spine space (origin at the waist, chest pivot at shoulderY).
const HOLD = {
  rifle: { pos: [0.04, 0.4, -0.26] },
  pistol: { pos: [0.06, 0.47, -0.36] },
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
    const bw = BUILDS[look.build] ?? 1;
    this.bw = bw;
    const skin = col(SKIN[look.skin] ?? SKIN[0]);
    const teamC = col(TEAM_SHIRT[actor.team] ?? 0x888888);
    const sleeveLong = look.sleeves !== 'short';
    const root = new THREE.Group(), fall = new THREE.Group(), body = new THREE.Group();
    const lower = new THREE.Group(), spine = new THREE.Group();
    root.add(fall); fall.add(body); body.add(lower, spine);

    const pelvis = bone(buildPelvis(look, bw), 'pelvis'); lower.add(pelvis);

    this.legs = [-1, 1].map(s => {
      const hip = new THREE.Group(); hip.position.set(s * 0.115 * bw, 0, 0);
      const thigh = bone(buildThigh(look, bw), 'thigh');
      const knee = new THREE.Group(); knee.position.y = -BODY.thigh;
      const shin = bone(buildShin(look, bw), 'shin');
      const ankle = new THREE.Group(); ankle.position.y = -BODY.shin;
      const foot = bone(buildFoot(look, bw), 'foot');
      ankle.add(foot); knee.add(shin, ankle); hip.add(thigh, knee); lower.add(hip);
      return { hip, knee, ankle };
    });

    spine.add(bone(buildTorso(look, skin, teamC, bw), 'torso'));

    const head = new THREE.Group(); head.position.y = BODY.headY;
    head.add(bone(buildHead(look, skin, teamC), 'head'));
    spine.add(head);

    // Index 0 is the left arm (-x), 1 the right.
    this.arms = [-1, 1].map(s => {
      const upper = new THREE.Group();
      upper.position.set(s * BODY.shoulderX * bw, BODY.shoulderY, 0);
      upper.add(bone(buildUpperArm(look, skin, teamC, bw, sleeveLong), 'upper'));
      const fore = new THREE.Group(); fore.position.y = -BODY.upper;
      fore.add(bone(buildForeArm(look, skin, teamC, bw, sleeveLong), 'fore'));
      upper.add(fore); spine.add(upper);
      return { upper, fore, shoulder: upper.position.clone(), pole: new THREE.Vector3(s * 0.5, -1, 0.35) };
    });

    // Weapons share one group so the hands only have to follow that.
    const weapon = new THREE.Group();
    this.guns = {};
    for (const [name, make] of [['rifle', buildRifle], ['pistol', buildPistol]]) {
      const spec = make();
      const g = new THREE.Group();
      const flash = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.03), flashMat());
      flash.position.set(...spec.muzzle); flash.visible = false;
      const mag = bone(spec.mag, `${name}Mag`);
      g.add(bone(spec.body, name), mag, flash);
      g.visible = false;
      weapon.add(g);
      this.guns[name] = { group: g, mag, flash, right: new THREE.Vector3(...spec.right), left: new THREE.Vector3(...spec.left), magWell: new THREE.Vector3(...spec.magWell) };
    }
    spine.add(weapon);

    // The bomb rides on the carrier's back.
    const bm = new Mesher().box(0.34, 0.18, 0.2, 0, 0, 0, 0x2a2a2a).box(0.3, 0.04, 0.16, 0, 0.11, 0, 0x4d4d4d).box(0.06, 0.04, 0.06, 0.08, 0.14, 0, 0xff2a1a);
    const bomb = bone(bm, 'bomb'); bomb.position.set(0, 0.26, (look.backpack != null ? 0.4 : 0.26) * bw); bomb.visible = false;
    spine.add(bomb);

    this.group = root;
    this.parts = { root, fall, body, lower, spine, head, weapon, bomb, pelvis };
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
    const yawRel = P.spine.rotation.y;
    P.head.rotation.set(clamp(a.pitch, -1.2, 1.2) * 0.8 + lean, -yawRel, 0);

    // Weapon: aimed along the actor's view, kicked by recoil and shots.
    this.kick *= Math.exp(-16 * dt);
    if (this.flashT > 0) this.flashT -= dt;
    if (a.cur !== this.curGun) { this.curGun = a.cur; this.swapT = 0.28; for (const [n, g] of Object.entries(this.guns)) g.group.visible = n === a.cur; }
    this.swapT = Math.max(0, this.swapT - dt);
    const gun = this.guns[a.cur] ?? this.guns.rifle;
    for (const [n, g] of Object.entries(this.guns)) g.flash.visible = n === a.cur && this.flashT > 0 && !a.mantle;
    if (gun.flash.visible) gun.flash.scale.setScalar(0.7 + Math.random() * 0.8);

    const reloadDur = WEAPONS[a.cur]?.reload ?? 2;
    const rp = a.reloadT > 0 ? clamp(1 - a.reloadT / reloadDur, 0, 1) : -1;
    const bump = rp < 0 ? 0 : Math.sin(Math.min(1, rp / 0.85) * Math.PI);
    const aimPitch = clamp(a.pitch + a.recoil, -1.3, 1.3) + lean;
    const q = T.q.setFromEuler(T.eu.set(aimPitch - 0.38 * bump + this.kick * 0.04, -P.spine.rotation.y, 0.25 * bump, 'YXZ'));
    const hold = HOLD[a.cur] ?? HOLD.rifle;
    const pivot = T.pivot.set(0, BODY.shoulderY, 0);
    const wpos = T.wpos.set(hold.pos[0] * bw, hold.pos[1], hold.pos[2]).sub(pivot).applyQuaternion(q).add(pivot);
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
    P.head.rotation.set(-dir * 0.35 * k, 0, 0);
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

  pickUp() {
    this.dropped = false; this.lift = null;
    this.parts.spine.add(this.parts.weapon);
    this.curGun = null;
    this.swapT = 0.28;
  }
}

export function makeRig(actor, look) { return new Rig(actor, look); }
