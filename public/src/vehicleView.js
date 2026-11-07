import * as THREE from 'three';
import { TEAM } from './config.js';

// Procedural models for the vehicles and the jetpack. Everything points toward -Z, like the characters.
const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const box = (w, h, d, x, y, z, mat, parent) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; parent.add(m);
  return m;
};
const wheelGeo = (r, w) => { const g = new THREE.CylinderGeometry(r, r, w, 16); g.rotateZ(Math.PI / 2); return g; };

const HULL = { [TEAM.ATT]: 0x9c6a2e, [TEAM.DEF]: 0x365f94 };
const TRIM = { [TEAM.ATT]: 0xe0a04a, [TEAM.DEF]: 0x6aa6e6 };

function bikeModel(team) {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const paint = lam(HULL[team]), trim = lam(TRIM[team]), dark = lam(0x1d1f22), steel = lam(0x8a9097), rubber = lam(0x111214);
  const wheels = [-0.78, 0.78].map(z => {
    const w = new THREE.Group(); w.position.set(0, 0.36, z);
    const tyre = new THREE.Mesh(wheelGeo(0.36, 0.16), rubber); tyre.castShadow = true;
    const hub = new THREE.Mesh(wheelGeo(0.18, 0.2), steel);
    const spoke = box(0.05, 0.62, 0.05, 0, 0, 0, steel, w);
    w.add(tyre, hub); body.add(w);
    return w;
  });
  box(0.28, 0.26, 1.35, 0, 0.62, 0.05, paint, body);                 // frame
  box(0.36, 0.24, 0.56, 0, 0.88, -0.2, trim, body);                  // fuel tank
  box(0.3, 0.1, 0.62, 0, 0.76, 0.42, dark, body);                    // seat
  box(0.42, 0.3, 0.4, 0, 0.5, 0.1, steel, body);                     // engine
  box(0.08, 0.7, 0.08, 0, 0.66, -0.74, steel, body).rotation.x = -0.35; // fork
  box(1.0, 0.06, 0.06, 0, 1.02, -0.62, dark, body);                  // bars
  box(0.18, 0.16, 0.1, 0, 0.94, -0.82, lam(0xfff2a0, { emissive: 0xffe680, emissiveIntensity: 0.8 }), body); // headlight
  box(0.1, 0.1, 0.7, 0.24, 0.4, 0.55, steel, body);                  // exhaust
  box(0.3, 0.05, 0.4, 0, 0.5, 1.05, paint, body);                    // rear fender
  return { group: g, body, wheels };
}

function tankModel(team) {
  const g = new THREE.Group();
  const hullMat = lam(HULL[team]), trim = lam(TRIM[team]), dark = lam(0x24262a), steel = lam(0x70767d), track = lam(0x17181a);
  const body = new THREE.Group(); g.add(body);
  const wheels = [];
  for (const s of [-1, 1]) {
    box(0.74, 0.85, 4.5, s * 1.03, 0.5, 0, track, body);                 // track block
    box(0.9, 0.12, 4.7, s * 1.03, 0.98, 0, hullMat, body);               // mudguard
    for (let i = 0; i < 6; i++) {
      const w = new THREE.Mesh(wheelGeo(0.34, 0.12), steel); w.position.set(s * 1.44, 0.45, -1.8 + i * 0.72); w.castShadow = true; body.add(w); wheels.push(w);
    }
  }
  box(2.1, 0.7, 4.0, 0, 0.95, 0, hullMat, body);                          // hull
  const nose = box(2.1, 0.12, 1.5, 0, 1.12, -2.1, hullMat, body); nose.rotation.x = 0.42;
  box(1.6, 0.14, 0.5, 0, 1.4, 1.85, dark, body);                          // engine deck
  box(0.5, 0.08, 0.4, -0.55, 1.34, -1.2, trim, body);                     // headlamp pad
  const turret = new THREE.Group(); turret.position.set(0, 1.3, 0.1); body.add(turret);
  box(1.8, 0.6, 2.2, 0, 0.3, 0, hullMat, turret);
  box(1.5, 0.1, 1.7, 0, 0.64, 0.05, trim, turret);
  box(0.5, 0.22, 0.5, -0.4, 0.78, 0.4, dark, turret);                     // hatch
  box(0.06, 0.8, 0.06, 0.55, 1.05, 0.7, steel, turret);                   // aerial
  const mantlet = box(0.7, 0.55, 0.4, 0, 0.35, -1.12, dark, turret);
  const barrel = new THREE.Group(); barrel.position.set(0, 0.35, -1.3); turret.add(barrel);
  box(0.22, 0.22, 3.6, 0, 0, -1.8, steel, barrel);
  box(0.34, 0.34, 0.45, 0, 0, -3.5, dark, barrel);                        // muzzle brake
  return { group: g, body, wheels, turret, barrel };
}

export function makeVehicleView(v) {
  const m = v.type === 'tank' ? tankModel(v.team) : bikeModel(v.team);
  m.v = v; m.kick = 0; m.spin = 0; m.lean = 0; m.lastYaw = v.yaw;
  m.group.traverse(o => { if (o.isMesh) o.receiveShadow = false; });
  return m;
}

export function updateVehicleView(m, dt) {
  const v = m.v;
  m.group.visible = !v.dead;
  if (v.dead) return;
  m.group.position.set(v.pos.x, v.pos.y, v.pos.z);
  m.group.rotation.y = v.yaw;
  m.spin += v.speed * dt;
  for (const w of m.wheels) w.rotation.x = -m.spin / (v.type === 'tank' ? 0.34 : 0.36);
  if (v.type === 'bike') {
    // Lean into the turn.
    const turn = ((((v.yaw - m.lastYaw) + Math.PI * 3) % (Math.PI * 2)) - Math.PI) / Math.max(dt, 1e-3);
    m.lean += (Math.max(-0.5, Math.min(0.5, turn * Math.min(1, Math.abs(v.speed) / 14) * 0.18)) - m.lean) * (1 - Math.exp(-8 * dt));
    m.body.rotation.z = m.lean;
  } else {
    m.turret.rotation.y = v.turretYaw - v.yaw;
    m.kick *= Math.exp(-7 * dt);
    m.barrel.position.z = -1.3 + m.kick * 0.55;
    m.body.rotation.x = m.kick * 0.015;
  }
  m.lastYaw = v.yaw;
}

// A pair of tanks with nozzles, worn on the back. The flame is shown while the jetpack burns.
export function makeJetpack() {
  const g = new THREE.Group();
  const shell = lam(0x8a9097), band = lam(0xd23a2a), dark = lam(0x2a2c30);
  for (const s of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 10), shell); t.position.set(s * 0.12, 0, 0);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.07, 10), band); b.position.set(s * 0.12, 0.1, 0);
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.12, 8), dark); n.position.set(s * 0.12, -0.3, 0);
    g.add(t, b, n);
  }
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.12), dark); strap.position.set(0, 0.12, -0.03);
  g.add(strap);
  const flames = [-1, 1].map(s => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.6, 8), new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: 0.9, fog: false }));
    f.rotation.x = Math.PI; f.position.set(s * 0.12, -0.66, 0); f.visible = false; g.add(f);
    return f;
  });
  return { group: g, flames };
}
