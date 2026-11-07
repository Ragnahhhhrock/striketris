import * as THREE from 'three';
import { CELL, GRID_W as W, GRID_D as D, GRID_H as H, PIT, BLOCK_HP } from './config.js';
import { STATIC, EMPTY, FLOOR } from './grid.js';

// The shifting arena. Every wall cube is its own instance that periodically rotates, flips or slides and comes
// back to rest on its own cell, with a travelling wave so the room ripples. Collision stays on the voxel grid, so
// those transforms are visual only. Every wall cube and floor tile follows the grid: shoot one away and it is gone,
// shoot the block in front of one and it appears. Floor tiles never move, so a gap in the floor is always a real hole.

export const BASE_COLOURS = [0xff3d81, 0x2dd4ff, 0xb6ff00, 0xff8a00, 0xffe11a, 0x8f5bff, 0x00e08a, 0xff4d2e];
export const NEON_COLOURS = [0x39ff14, 0xff10f0, 0x00f0ff, 0xfff700, 0xff6a00, 0xbc13fe];

const NEON_SHARE = 0.16;   // share of wall cubes that are neon
const ACTIVE = 0.24;       // share of each cube's cycle spent moving
const hash = (a, b, c) => { let h = Math.imul(a + 1, 374761393) ^ Math.imul(b + 7, 668265263) ^ Math.imul(c + 13, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const ease = s => s * s * (3 - 2 * s);
const NEIGHBOURS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// White frame with a dimmer centre. Multiplied by the cube colour it reads as a lit neon tube.
export function neonTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#8a8a8a'; x.fillRect(14, 14, 100, 100);
  x.fillStyle = '#c8c8c8'; x.fillRect(24, 24, 80, 80);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ArenaFx {
  constructor(grid, { tex, neonTex, calm = false }) {
    this.calm = calm;
    this.group = new THREE.Group();
    this.dummy = new THREE.Object3D();
    this.tmp = new THREE.Color();
    this.v = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.euler = new THREE.Euler();
    this.cubeGeo = new THREE.BoxGeometry(CELL, CELL, CELL);
    this.cubes = [];
    this.tiles = [];

    this.grid = grid;
    this.seen = this.seenDmg = -1;
    // Every wall cube the round starts with. Buried ones stay hidden until a neighbour is destroyed.
    const start = (x, y, z) => grid.base ? grid.base[grid.idx(x, y, z)] : grid.get(x, y, z);
    for (let y = -PIT + 1; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      if (start(x, y, z) !== STATIC) continue;
      this.cubes.push({ x, y, z, h: hash(x, y, z), neon: hash(z, x, y) < NEON_SHARE, dirty: true, vis: false, shown: false, dmgf: 0 });
    }
    // A floor tile over every floor cell, except under the lifts, which are their own floor.
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      if (start(x, -1, z) !== FLOOR || grid.liftAt(x, z)) continue;
      this.tiles.push({ x, z, h: hash(x, 99, z), dirty: true, vis: false, dmgf: 0 });
    }

    const solid = this.cubes.filter(c => !c.neon), neon = this.cubes.filter(c => c.neon);
    this.solid = solid; this.neon = neon;
    const wallMat = new THREE.MeshLambertMaterial({ map: tex });
    this.wallMesh = this.instanced(this.cubeGeo, wallMat, solid.length, true);
    this.neonMesh = this.instanced(this.cubeGeo, new THREE.MeshBasicMaterial({ map: neonTex, fog: false }), neon.length, false);
    this.haloMesh = this.instanced(this.cubeGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide, fog: false }), neon.length, false);
    this.tileGeo = new THREE.BoxGeometry(CELL - 0.06, CELL, CELL - 0.06);
    this.tileMesh = this.instanced(this.tileGeo, new THREE.MeshLambertMaterial({ map: tex }), this.tiles.length, true);

    // The pit under the floor: a bedrock floor and four walls, lit in a slowly cycling colour. This is what you see,
    // and land on, when a hole opens in the floor.
    const under = document.createElement('canvas'); under.width = under.height = 64;
    const ux = under.getContext('2d');
    ux.fillStyle = '#12062e'; ux.fillRect(0, 0, 64, 64);
    ux.strokeStyle = '#ff2fd6'; ux.lineWidth = 3; ux.strokeRect(0, 0, 64, 64);
    const underTex = new THREE.CanvasTexture(under);
    underTex.wrapS = underTex.wrapT = THREE.RepeatWrapping; underTex.repeat.set(W, D); underTex.colorSpace = THREE.SRGBColorSpace;
    const pitH = (PIT - 1) * CELL, wallTex = underTex.clone();
    wallTex.repeat.set(W, PIT - 1); wallTex.needsUpdate = true;
    this.pitMats = [new THREE.MeshBasicMaterial({ map: underTex, fog: false }), new THREE.MeshBasicMaterial({ map: wallTex, fog: false, side: THREE.DoubleSide })];
    this.under = new THREE.Group();
    const bottom = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL, D * CELL), this.pitMats[0]);
    bottom.rotation.x = -Math.PI / 2; bottom.position.set(W * CELL / 2, -pitH, D * CELL / 2);
    this.under.add(bottom);
    for (const [px, pz, ry] of [[W * CELL / 2, 0, 0], [W * CELL / 2, D * CELL, 0], [0, D * CELL / 2, Math.PI / 2], [W * CELL, D * CELL / 2, Math.PI / 2]]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL, pitH), this.pitMats[1]);
      wall.position.set(px, -pitH / 2, pz); wall.rotation.y = ry;
      this.under.add(wall);
    }

    // Neon blocks floating around the outside of the well.
    this.floaters = [];
    const count = 26;
    this.floatMesh = this.instanced(this.cubeGeo, new THREE.MeshBasicMaterial({ map: neonTex, fog: false }), count * 4, false);
    this.floatHalo = this.instanced(this.cubeGeo, this.haloMesh.material, count * 4, false);
    const cells = [[0, 0], [1, 0], [2, 0], [1, 1]];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + hash(i, 1, 1) * 0.5;
      this.floaters.push({ i0: i * 4, cells, a, rad: 62 + hash(i, 2, 1) * 40, y: 12 + hash(i, 3, 1) * 70, size: 3 + hash(i, 4, 1) * 3, orbit: (hash(i, 5, 1) - 0.5) * 0.12, spin: (hash(i, 6, 1) - 0.5) * 1.4, bob: hash(i, 7, 1) * 6.28, col: NEON_COLOURS[i % NEON_COLOURS.length], tilt: [hash(i, 8, 1) * 6.28, hash(i, 9, 1) * 6.28] });
    }

    this.group.add(this.wallMesh, this.neonMesh, this.haloMesh, this.tileMesh, this.under, this.floatMesh, this.floatHalo);
    this.update(0);
  }

  instanced(geo, mat, count, shadows) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
    m.count = count;
    m.frustumCulled = false;
    m.castShadow = m.receiveShadow = shadows;
    m.setColorAt(0, this.tmp.setHex(0xffffff));
    return m;
  }

  // Where a piece is in its cycle. cycle = which time round it is, s = 0..1 through the move (or -1 at rest).
  phase(c, t, period, wave) {
    const u = (t + wave + c.h * 0.6) / period;
    const cycle = Math.floor(u), f = u - cycle;
    return { cycle, s: this.calm || f >= ACTIVE ? -1 : ease(f / ACTIVE), kind: Math.floor(hash(c.x, cycle, c.z) * 4) };
  }

  // Colour comes from a band index (so neighbours share colours) plus the cycle count, which moves
  // the bands along each time a wave passes. It swaps halfway through a move so the change reads as part of it.
  colourFor(palette, band, cycle, s) {
    const n = cycle + (s < 0 || s > 0.5 ? 1 : 0);
    return palette[(band + (this.calm ? 0 : n)) % palette.length];
  }

  // Compare the grid with what is drawn: which cubes and tiles are gone, newly uncovered or more chipped.
  refresh() {
    const g = this.grid;
    const exposed = (x, y, z) => NEIGHBOURS.some(([a, b, c]) => g.get(x + a, y + b, z + c) === EMPTY);
    for (const c of this.cubes) {
      const live = g.get(c.x, c.y, c.z) === STATIC;
      const vis = live && exposed(c.x, c.y, c.z), dmgf = live ? Math.min(1, g.dmg[g.idx(c.x, c.y, c.z)] / BLOCK_HP) : 0;
      if (vis !== c.vis || dmgf !== c.dmgf) c.dirty = true;
      c.vis = vis; c.dmgf = dmgf;
    }
    for (const c of this.tiles) {
      const live = g.get(c.x, -1, c.z) === FLOOR, dmgf = live ? Math.min(1, g.dmg[g.idx(c.x, -1, c.z)] / BLOCK_HP) : 0;
      if (live !== c.vis || dmgf !== c.dmgf) c.dirty = true;
      c.vis = live; c.dmgf = dmgf;
    }
    this.seen = g.version; this.seenDmg = g.dmgVersion;
  }

  // Parks an instance out of sight.
  hideAt(mesh, i) {
    const d = this.dummy;
    d.position.set(0, -500, 0); d.quaternion.identity(); d.scale.setScalar(0.0001); d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
  }

  update(t) {
    if (this.seen !== this.grid.version || this.seenDmg !== this.grid.dmgVersion) this.refresh();
    const d = this.dummy, q = this.q, e = this.euler;
    const rest = (c, y) => d.position.set((c.x + 0.5) * CELL, (c.y + 0.5) * CELL + (y || 0), (c.z + 0.5) * CELL);

    const upd = (list, mesh, halo, palette, neon) => {
      list.forEach((c, i) => {
        if (!c.vis) {
          if (c.shown) { this.hideAt(mesh, i); if (halo) this.hideAt(halo, i); c.shown = false; }
          return;
        }
        c.shown = true;
        const wave = c.x * 0.55 + c.z * 0.8 + c.y * 0.35;
        const { cycle, s, kind } = this.phase(c, t, 12, wave);
        const pulse = neon ? 0.75 + 0.25 * Math.sin(t * 3 + c.h * 40) : 1;
        if (s < 0 && !c.dirty && !neon) return;
        rest(c);
        e.set(0, 0, 0);
        let scale = 1;
        if (s >= 0) {
          const a = s * Math.PI;
          if (kind === 0) e.y = s * Math.PI / 2;
          else if (kind === 1) e.x = s * Math.PI;
          else if (kind === 2) e.z = s * Math.PI;
          else {
            const dir = c.h < 0.5 ? 1 : -1, off = Math.sin(a) * CELL * 0.45;
            if (c.h * 10 % 1 < 0.5) d.position.x += dir * off; else d.position.z += dir * off;
            e.y = s * Math.PI / 2;
          }
          scale = 1 + Math.sin(a) * 0.06;
        }
        d.quaternion.setFromEuler(e);
        d.scale.setScalar(scale);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
        // Gunfire and blasts char a cube toward black as it nears breaking.
        const col = this.tmp.setHex(this.colourFor(palette, neon ? Math.floor(c.h * 97) : Math.floor((c.x + c.z) / 3) + Math.floor(c.y / 2), cycle, s)).multiplyScalar((neon ? pulse : 1) * (1 - 0.6 * c.dmgf));
        mesh.setColorAt(i, col);
        if (halo) {
          d.scale.setScalar(scale * (1.12 + 0.04 * Math.sin(t * 4 + c.h * 30)));
          d.updateMatrix();
          halo.setMatrixAt(i, d.matrix);
          halo.setColorAt(i, col);
        }
        c.dirty = s >= 0;
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (halo) { halo.instanceMatrix.needsUpdate = true; if (halo.instanceColor) halo.instanceColor.needsUpdate = true; }
    };
    upd(this.solid, this.wallMesh, null, BASE_COLOURS, false);
    upd(this.neon, this.neonMesh, this.haloMesh, NEON_COLOURS, true);

    // Floor: tiles never move. Each one is a real block of floor, so it only changes when the grid does.
    this.tiles.forEach((c, i) => {
      if (!c.dirty) return;
      c.dirty = false;
      if (!c.vis) { this.hideAt(this.tileMesh, i); return; }
      d.position.set((c.x + 0.5) * CELL, -CELL / 2, (c.z + 0.5) * CELL);
      d.quaternion.identity(); d.scale.setScalar(1);
      d.updateMatrix();
      this.tileMesh.setMatrixAt(i, d.matrix);
      this.tileMesh.setColorAt(i, this.tmp.setHex(BASE_COLOURS[(Math.floor(c.x / 2) + Math.floor(c.z / 2) + 3) % BASE_COLOURS.length]).multiplyScalar(1 - 0.6 * c.dmgf));
    });
    this.tileMesh.instanceMatrix.needsUpdate = true;
    if (this.tileMesh.instanceColor) this.tileMesh.instanceColor.needsUpdate = true;

    // Floating neon blocks drift round the well.
    const cx = W * CELL / 2, cz = D * CELL / 2;
    for (const f of this.floaters) {
      const ang = f.a + t * f.orbit;
      const px = cx + Math.cos(ang) * f.rad, pz = cz + Math.sin(ang) * f.rad, py = f.y;
      e.set(f.tilt[0] + t * f.spin * 0.5, t * f.spin, f.tilt[1]);
      q.setFromEuler(e);
      f.cells.forEach(([a, b], k) => {
        const p = this.v.set((a - 1) * f.size, 0, (b - 0.5) * f.size).applyQuaternion(q);
        d.position.set(px + p.x, py + p.y, pz + p.z);
        d.quaternion.copy(q);
        d.scale.setScalar(f.size / CELL);
        d.updateMatrix();
        this.floatMesh.setMatrixAt(f.i0 + k, d.matrix);
        this.floatMesh.setColorAt(f.i0 + k, this.tmp.setHex(f.col));
        d.scale.setScalar(f.size / CELL * 1.14);
        d.updateMatrix();
        this.floatHalo.setMatrixAt(f.i0 + k, d.matrix);
        this.floatHalo.setColorAt(f.i0 + k, this.tmp.setHex(f.col));
      });
    }
    this.floatMesh.instanceMatrix.needsUpdate = this.floatHalo.instanceMatrix.needsUpdate = true;
    this.floatMesh.instanceColor.needsUpdate = this.floatHalo.instanceColor.needsUpdate = true;
    for (const m of this.pitMats) m.color.setHSL((t * 0.04) % 1, 0.9, 0.5);
  }

  dispose() {
    this.cubeGeo.dispose(); this.tileGeo.dispose();
    this.under.traverse(o => o.geometry?.dispose());
    for (const m of this.pitMats) { m.map?.dispose(); m.dispose(); }
  }
}
