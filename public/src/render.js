import * as THREE from 'three';
import { CELL, GRID_W as W, GRID_D as D, GRID_H as H } from './config.js';
import { STATIC, EMPTY } from './grid.js';
import { SITES } from './map.js';
import { eyePos } from './actor.js';
import { SHAPES } from './pieces.js';
import { ArenaFx, NEON_COLOURS, neonTexture } from './arenaFx.js';
import { makeRig } from './characters.js';

// Classic Tetris colours, order matches SHAPES: I cyan, O yellow, T purple, S green, Z red, J blue, L orange.
export const SHAPE_TINT = [0x00e5ff, 0xffe600, 0xb44dff, 0x2ee62e, 0xff2d2d, 0x3a63ff, 0xff9a1a];

const FACES = [
  { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], s: 0.82 },
  { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], s: 0.78 },
  { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], s: 1 },
  { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], s: 0.55 },
  { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], s: 0.9 },
  { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], s: 0.72 },
];

function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(0,0,0,.09)'; x.lineWidth = 1;
  for (let i = 1; i < 3; i++) { const p = i * 256 / 3; x.beginPath(); x.moveTo(p, 0); x.lineTo(p, 256); x.moveTo(0, p); x.lineTo(256, p); x.stroke(); }
  x.strokeStyle = 'rgba(0,0,0,.32)'; x.lineWidth = 4; x.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Classic Tetris cube: flat face inside a darker frame. Multiplied by the block colour.
function bevelTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#c9c9c9'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#ffffff'; x.fillRect(12, 12, 104, 104);
  x.strokeStyle = '#555'; x.lineWidth = 4; x.strokeRect(2, 2, 124, 124);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// One cell of see-through playfield wall, tiled.
function glassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(110,190,255,0.07)'; x.fillRect(0, 0, 64, 64);
  x.strokeStyle = 'rgba(160,230,255,0.95)'; x.lineWidth = 2; x.strokeRect(1, 1, 62, 62);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#04050d'); g.addColorStop(0.6, '#10142c'); g.addColorStop(1, '#232a55');
  x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mesh(grid, wantStatic) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const colour = new THREE.Color();
  for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const v = grid.get(x, y, z);
    if (v === EMPTY || (v === STATIC) !== wantStatic) continue;
    colour.setHex(wantStatic ? (y >= 4 ? 0x9099ad : 0x7d869a) : SHAPE_TINT[v - 1]);
    for (const f of FACES) {
      if (grid.get(x + f.n[0], y + f.n[1], z + f.n[2]) !== EMPTY) continue;
      if (wantStatic && y + f.n[1] < 0) continue;
      const base = pos.length / 3;
      f.v.forEach(([a, b, c]) => {
        const wx = (x + a) * CELL, wy = (y + b) * CELL, wz = (z + c) * CELL;
        pos.push(wx, wy, wz); nor.push(...f.n);
        if (f.n[1]) uv.push(wx / CELL, wz / CELL); else if (f.n[0]) uv.push(wz / CELL, wy / CELL); else uv.push(wx / CELL, wy / CELL);
        col.push(colour.r * f.s, colour.g * f.s, colour.b * f.s);
      });
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function letterTexture(text, colour) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.font = '700 96px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = colour; x.fillText(text, 64, 70);
  return new THREE.CanvasTexture(c);
}

export class Renderer {
  constructor(canvas) {
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.r.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
    this.r.shadowMap.enabled = true;
    this.r.shadowMap.type = THREE.PCFShadowMap;
    this.r.autoClear = false;

    this.scene = new THREE.Scene();
    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog(0x10142c, 150, 400);
    this.camera = new THREE.PerspectiveCamera(78, 1, 0.05, 500);
    this.camera.rotation.order = 'YXZ';

    this.scene.add(new THREE.HemisphereLight(0xc8d4ff, 0x4a4f66, 1.25));
    const sun = new THREE.DirectionalLight(0xffffff, 1.35);
    sun.position.set(30, 110, 50);
    sun.target.position.set(W * CELL / 2, 0, D * CELL / 2);
    sun.position.add(sun.target.position);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera; s.left = -75; s.right = 75; s.top = 75; s.bottom = -75; s.near = 10; s.far = 280;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun, sun.target);

    this.tex = gridTexture();
    this.voxelMat = new THREE.MeshLambertMaterial({ map: this.tex, vertexColors: true });
    this.bevelTex = bevelTexture();
    this.pieceMat = new THREE.MeshLambertMaterial({ map: this.bevelTex, vertexColors: true });

    this.neonTex = neonTexture();
    this.fxT = 0;

    for (const site of Object.values(SITES)) {
      const [x0, x1, z0, z1] = site.zone;
      const zone = new THREE.Mesh(new THREE.PlaneGeometry((x1 - x0 + 1) * CELL, (z1 - z0 + 1) * CELL), new THREE.MeshBasicMaterial({ color: 0xc4403a, transparent: true, opacity: 0.2, depthWrite: false }));
      zone.rotation.x = -Math.PI / 2; zone.position.set((x0 + x1 + 1) / 2 * CELL, 0.02, (z0 + z1 + 1) / 2 * CELL);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: letterTexture(site.name, '#7a1f1a'), transparent: true, depthWrite: false }));
      label.rotation.x = -Math.PI / 2; label.position.set(zone.position.x, 0.03, zone.position.z);
      this.scene.add(zone, label);
    }

    this.dynamicGroup = new THREE.Group();
    this.fx = new THREE.Group();
    this.scene.add(this.dynamicGroup, this.fx);
    this.cubeGeo = new THREE.BoxGeometry(CELL, CELL, CELL);
    this.pieceLight = new THREE.PointLight(0xffffff, 0, 80, 2);
    this.scene.add(this.pieceLight);
    this.buildArena();
    this.effects = [];
    this.shake = 0;

    // Weapon drawn in its own pass so it never clips into walls.
    this.vmScene = new THREE.Scene();
    this.vmScene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2.2));
    this.vmCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.vm = new THREE.Group();
    const vmMat = new THREE.MeshLambertMaterial({ color: 0x4d4d4d });
    const wood = new THREE.MeshLambertMaterial({ color: 0x6a4527 });
    const olive = new THREE.MeshLambertMaterial({ color: 0x4a5236 });
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffdf8a });
    // One first-person model per weapon: [w, h, d, x, y, z, material], muzzle z for the flash.
    const VM = {
      pistol: { muzzle: -0.3, parts: [[0.04, 0.06, 0.26, 0, 0, -0.1], [0.04, 0.12, 0.05, 0, -0.08, 0.02]] },
      smg: { muzzle: -0.62, parts: [[0.06, 0.09, 0.4, 0, 0, -0.05], [0.04, 0.04, 0.3, 0, 0.01, -0.4], [0.03, 0.2, 0.05, 0, -0.14, -0.1], [0.05, 0.1, 0.05, 0, -0.08, 0.1, wood], [0.045, 0.08, 0.16, 0, -0.02, 0.28, wood]] },
      lmg: { muzzle: -0.9, parts: [[0.08, 0.12, 0.5, 0, 0, -0.08], [0.05, 0.05, 0.5, 0, 0.01, -0.58], [0.1, 0.12, 0.14, 0, -0.12, -0.1], [0.05, 0.1, 0.05, 0, -0.1, 0.1, wood], [0.05, 0.1, 0.22, 0, -0.02, 0.32, wood], [0.012, 0.16, 0.012, -0.04, -0.08, -0.7], [0.012, 0.16, 0.012, 0.04, -0.08, -0.7]] },
      rifle: { muzzle: -0.82, parts: [[0.06, 0.09, 0.42, 0, 0, 0], [0.03, 0.035, 0.34, 0, 0.012, -0.34], [0.05, 0.14, 0.06, 0, -0.1, -0.06], [0.045, 0.1, 0.14, 0, -0.03, 0.26, wood], [0.06, 0.08, 0.3, 0, 0.0, -0.2, wood]] },
      sniper: { muzzle: -0.82, parts: [[0.06, 0.09, 0.42, 0, 0, 0], [0.03, 0.035, 0.34, 0, 0.012, -0.34], [0.05, 0.1, 0.06, 0, -0.08, -0.06], [0.045, 0.1, 0.14, 0, -0.03, 0.26, wood], [0.06, 0.08, 0.3, 0, 0.0, -0.2, wood], [0.04, 0.04, 0.3, 0, 0.09, -0.1], [0.06, 0.06, 0.05, 0, 0.09, -0.26], [0.055, 0.055, 0.05, 0, 0.09, 0.06]] },
      launcher: { muzzle: -1.1, parts: [[0.14, 0.14, 1.3, 0, 0.0, -0.4, olive], [0.18, 0.18, 0.08, 0, 0, -1.04, olive], [0.18, 0.18, 0.08, 0, 0, 0.26, olive], [0.05, 0.12, 0.05, 0, -0.12, -0.1], [0.03, 0.08, 0.14, 0.1, 0.1, -0.5]] },
    };
    this.vmGuns = {};
    for (const [k, def] of Object.entries(VM)) {
      const g = new THREE.Group();
      for (const [w, h, d, x, y, z, m] of def.parts) { const bx = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m ?? vmMat); bx.position.set(x, y, z); g.add(bx); }
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.02), flashMat); f.position.set(0, 0.012, def.muzzle); f.visible = false; g.add(f);
      g.visible = false; g.userData.flash = f;
      this.vm.add(g); this.vmGuns[k] = g;
    }
    this.vmCur = null;
    this.vm.position.set(0.2, -0.17, -0.42);
    this.vm.scale.setScalar(0.62);
    this.vmScene.add(this.vm);
    this.vmKick = 0; this.zoom = 1;

    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.r.setSize(w, h);
    this.camera.aspect = this.vmCam.aspect = w / h;
    this.camera.updateProjectionMatrix(); this.vmCam.updateProjectionMatrix();
  }

  setGame(game) {
    this.game = game;
    if (this.arenaFx) { this.scene.remove(this.arenaFx.group); this.arenaFx.dispose(); }
    this.arenaFx = new ArenaFx(game.grid, { tex: this.tex, neonTex: this.neonTex, calm: matchMedia('(prefers-reduced-motion: reduce)').matches });
    this.scene.add(this.arenaFx.group);
    this.gridVersion = -1;
    if (this.actorViews) for (const v of this.actorViews) this.scene.remove(v.group);
    this.actorViews = game.actors.map(a => this.makeActorView(a));
    this.clearEffects();
    this.clearPieceViews();
    if (!this.bombView) {
      this.bombView = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.32), new THREE.MeshLambertMaterial({ color: 0x2a2a2a }));
      this.bombLed = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.1), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
      this.bombLed.position.y = 0.15;
      this.bombView.add(this.bombLed);
      this.scene.add(this.bombView);
    }
    this.crateGroup && this.scene.remove(this.crateGroup);
    this.crateGroup = new THREE.Group(); this.scene.add(this.crateGroup);
    this.crateCount = -1;
  }

  makeActorView(a) {
    const rig = makeRig(a);
    this.scene.add(rig.group);
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.17), new THREE.MeshBasicMaterial({ color: 0xff3b30, depthTest: false, transparent: true }));
    marker.position.y = 2.35; marker.renderOrder = 20; marker.visible = false;
    rig.group.add(marker);
    return { actor: a, rig, group: rig.group, marker };
  }

  clearEffects() { for (const e of this.effects) { this.fx.remove(e.obj); e.dispose?.(); } this.effects = []; }
  clearPieceViews() {
    if (this.pieceView) { this.scene.remove(this.pieceView.ghost, this.pieceView.solid); this.pieceView = null; }
    this.pieceLight.intensity = 0;
  }

  // Ghost at the landing spot with a beam up to the sky, plus the real block above it.
  // Rebuilt whenever the block is steered; the new copy slides from where the old one was.
  buildPieceView(p, prev) {
    const ghost = new THREE.Group(), solid = new THREE.Group();
    const tint = SHAPE_TINT[p.shapeId];
    const ghostMat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.32, depthWrite: false });
    const beamMat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    const solidEdge = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
    const edgeGeo = new THREE.EdgesGeometry(this.cubeGeo);
    const solidMat = new THREE.MeshLambertMaterial({ color: tint, map: this.bevelTex, emissive: tint, emissiveIntensity: 0.3 });
    const beamH = 160;
    const columns = new Set();
    let sx = 0, sz = 0, sy = 0;
    for (const c of p.cells) {
      const x = (p.x + c.x + 0.5) * CELL, y = (p.y + c.y + 0.5) * CELL, z = (p.z + c.z + 0.5) * CELL;
      sx += x; sy += y; sz += z;
      const m = new THREE.Mesh(this.cubeGeo, ghostMat); m.position.set(x, y, z);
      const e = new THREE.LineSegments(edgeGeo, edgeMat); e.position.copy(m.position);
      ghost.add(m, e);
      const key = `${c.x},${c.z}`;
      if (!columns.has(key)) {
        columns.add(key);
        const b = new THREE.Mesh(new THREE.BoxGeometry(CELL, beamH, CELL), beamMat);
        b.position.set(x, y + beamH / 2, z);
        ghost.add(b);
      }
      const s = new THREE.Mesh(this.cubeGeo, solidMat); s.position.set(x, y, z); s.castShadow = true;
      const se = new THREE.LineSegments(edgeGeo, solidEdge); se.position.copy(s.position);
      solid.add(s, se);
    }
    const n = p.cells.length;
    this.scene.add(ghost, solid);
    this.pieceLight.color.setHex(tint);
    this.pieceLight.intensity = 700;
    const view = { ghost, solid, ghostMat, source: p, rev: p.rev, cx: sx / n, cy: sy / n, cz: sz / n, slide: { x: 0, z: 0 } };
    if (prev) view.slide = { x: prev.cx - view.cx + prev.slide.x, z: prev.cz - view.cz + prev.slide.z };
    this.pieceView = view;
  }

  // Coloured rim and corner towers, glass walls to the sky, and distant blocks drifting down.
  buildArena() {
    const rimMat = new THREE.MeshBasicMaterial({ map: this.neonTex, fog: false });
    const spots = [];
    for (let i = 0; i < W; i++) spots.push([i, 8, 0], [i, 8, D - 1]);
    for (let k = 1; k < D - 1; k++) spots.push([0, 8, k], [W - 1, 8, k]);
    for (const [cx, cz] of [[0, 0], [W - 1, 0], [0, D - 1], [W - 1, D - 1]]) for (let y = 9; y < 37; y++) spots.push([cx, y, cz]);
    const rim = new THREE.InstancedMesh(this.cubeGeo, rimMat, spots.length);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    spots.forEach(([x, y, z], i) => {
      m.makeTranslation((x + 0.5) * CELL, (y + 0.5) * CELL, (z + 0.5) * CELL);
      rim.setMatrixAt(i, m); rim.setColorAt(i, col.setHex(NEON_COLOURS[i % NEON_COLOURS.length]));
    });
    rim.frustumCulled = false;
    this.scene.add(rim);

    const glassH = 135, glassTex = glassTexture();
    glassTex.repeat.set(W, glassH / CELL);
    const glassMat = new THREE.MeshBasicMaterial({ map: glassTex, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const y0 = 9 * CELL + glassH / 2, half = CELL / 2;
    for (const [px, pz, ry] of [[W * CELL / 2, half, 0], [W * CELL / 2, D * CELL - half, 0], [half, D * CELL / 2, Math.PI / 2], [W * CELL - half, D * CELL / 2, Math.PI / 2]]) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL, glassH), glassMat);
      g.position.set(px, y0, pz); g.rotation.y = ry;
      this.scene.add(g);
    }

    this.sky = [];
    const total = 28;
    const cubes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false }), total * 4);
    for (let i = 0; i < total; i++) {
      const shapeId = i % 7, ang = Math.random() * Math.PI * 2, rad = 120 + Math.random() * 120;
      this.sky.push({
        i0: i * 4, cells: SHAPES[shapeId].cells,
        x: W * CELL / 2 + Math.cos(ang) * rad, z: D * CELL / 2 + Math.sin(ang) * rad, y: Math.random() * 260,
        fall: 3 + Math.random() * 6, spin: (Math.random() - 0.5) * 0.8, ang: Math.random() * 6.28,
        tx: (Math.random() - 0.5) * 0.8, tz: (Math.random() - 0.5) * 0.8, size: 6 + Math.random() * 5,
      });
      for (let k = 0; k < 4; k++) cubes.setColorAt(i * 4 + k, col.setHex(NEON_COLOURS[shapeId % NEON_COLOURS.length]));
    }
    cubes.frustumCulled = false;
    this.skyCubes = cubes;
    this.scene.add(cubes);
  }

  updateArena(dt) {
    const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), m = new THREE.Matrix4(), sc = new THREE.Vector3();
    for (const p of this.sky) {
      p.y -= p.fall * dt;
      if (p.y < -30) p.y = 260;
      p.ang += p.spin * dt;
      e.set(p.tx, p.ang, p.tz); q.setFromEuler(e); sc.setScalar(p.size);
      p.cells.forEach(([a, b], k) => {
        v.set((a - 1.5) * p.size, 0, (b - 0.5) * p.size).applyQuaternion(q);
        v.x += p.x; v.y += p.y; v.z += p.z;
        m.compose(v, q, sc);
        this.skyCubes.setMatrixAt(p.i0 + k, m);
      });
    }
    this.skyCubes.instanceMatrix.needsUpdate = true;
  }

  addEffect(obj, life, update) { this.fx.add(obj); this.effects.push({ obj, t: 0, life, update }); }

  stepProjectiles(dt, game) {
    this.projViews ??= new Map();
    const seen = new Set();
    const make = kind => {
      const m = new THREE.Mesh(
        kind === 'rocket' ? new THREE.BoxGeometry(0.16, 0.16, 0.85) : kind === 'mine' ? new THREE.BoxGeometry(0.62, 0.12, 0.62) : new THREE.BoxGeometry(0.14, 0.2, 0.14),
        new THREE.MeshLambertMaterial({ color: kind === 'rocket' ? 0x6b6f4a : kind === 'mine' ? 0x4a5a30 : 0x3a4030 }),
      );
      if (kind === 'rocket') { const tip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.2), new THREE.MeshBasicMaterial({ color: 0xff6a30 })); tip.position.z = -0.5; m.add(tip); }
      if (kind === 'mine') { const led = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.1), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); led.position.y = 0.08; m.add(led); m.userData.led = led; }
      this.scene.add(m);
      return m;
    };
    const touch = (id, kind) => {
      let m = this.projViews.get(id);
      if (!m) { m = make(kind); this.projViews.set(id, m); }
      seen.add(id);
      return m;
    };
    for (const p of game.projectiles) {
      const m = touch('p' + p.id, p.kind);
      m.position.set(p.pos.x, p.pos.y, p.pos.z);
      if (p.kind === 'rocket') {
        m.lookAt(p.pos.x + p.vel.x, p.pos.y + p.vel.y, p.pos.z + p.vel.z);
        if ((m.userData.t = (m.userData.t || 0) + dt) > 0.025) {
          m.userData.t = 0;
          const puff = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, depthWrite: false }));
          puff.position.copy(m.position);
          this.addEffect(puff, 0.7, (o, u) => { o.material.opacity = 0.7 * (1 - u); o.scale.setScalar(1 + u * 2.4); });
        }
      } else { m.rotation.x += dt * 9; m.rotation.z += dt * 5; }
    }
    for (const mine of game.mines) {
      const m = touch('m' + mine.id, 'mine');
      m.position.set(mine.pos.x, mine.pos.y + 0.06, mine.pos.z);
      const armed = mine.arm <= 0;
      m.userData.led.visible = armed ? Math.sin(performance.now() / 150 + mine.id) > 0 : true;
      m.userData.led.material.color.setHex(armed ? 0xff2a1a : 0xffb000);
    }
    for (const [id, m] of this.projViews) {
      if (seen.has(id)) continue;
      this.scene.remove(m); m.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
      this.projViews.delete(id);
    }
  }

  handleEvent(e, viewer) {
    switch (e.type) {
      case 'shot': {
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(e.from.x, e.from.y - 0.1, e.from.z), new THREE.Vector3(e.to.x, e.to.y, e.to.z)]);
        const m = new THREE.LineBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.8 });
        this.addEffect(new THREE.Line(g, m), 0.08, (o, u) => { m.opacity = 0.8 * (1 - u); });
        if (!e.hit) {
          const puff = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true }));
          puff.position.set(e.to.x, e.to.y, e.to.z);
          this.addEffect(puff, 0.5, (o, u) => { o.material.opacity = 1 - u; });
        }
        this.actorViews[e.actor.id]?.rig.shot();
        if (e.actor === viewer) { this.vmKick = 1; const f = this.vmGuns[e.weapon]?.userData.flash; if (f) { f.visible = true; this.flashT = 0.04; this.flashObj = f; } }
        break;
      }
      case 'land': {
        const d = viewer ? Math.hypot(viewer.pos.x - e.pos.x, viewer.pos.z - e.pos.z) : 40;
        this.shake = Math.max(this.shake, 0.55 * Math.max(0, 1 - d / 55));
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.6, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(e.pos.x, e.pos.y + 0.15, e.pos.z);
        this.addEffect(ring, 0.6, (o, u) => { o.scale.setScalar(1 + u * 9); o.material.opacity = 0.6 * (1 - u); });
        break;
      }
      case 'lines': {
        const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
        const g = new THREE.Group();
        for (const c of e.cells) { const b = new THREE.Mesh(this.cubeGeo, m); b.position.set((c.x + 0.5) * CELL, (c.y + 0.5) * CELL, (c.z + 0.5) * CELL); g.add(b); }
        this.addEffect(g, 0.7, (o, u) => { m.opacity = 1 - u; o.children.forEach(k => k.scale.setScalar(1 + u * 0.3)); });
        this.shake = Math.max(this.shake, 0.3);
        break;
      }
      case 'boom': {
        const d = viewer ? Math.hypot(viewer.pos.x - e.pos.x, viewer.pos.z - e.pos.z) : 30;
        this.shake = Math.max(this.shake, 0.5 * Math.max(0, 1 - d / 30));
        const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, depthWrite: false }));
        ball.position.set(e.pos.x, e.pos.y, e.pos.z);
        this.addEffect(ball, 0.45, (o, u) => { o.scale.setScalar(0.4 + u * e.radius * 0.55); o.material.opacity = 0.9 * (1 - u); });
        const smoke = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, depthWrite: false }));
        smoke.position.set(e.pos.x, e.pos.y + 0.5, e.pos.z);
        this.addEffect(smoke, 1.2, (o, u) => { o.scale.setScalar(0.5 + u * e.radius * 0.5); o.position.y += 0.012; o.material.opacity = 0.5 * (1 - u); });
        break;
      }
      case 'heal': {
        const a = e.actor, ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.6, 24), new THREE.MeshBasicMaterial({ color: 0x4cff7a, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        this.addEffect(ring, 0.8, (o, u) => { o.position.set(a.pos.x, a.pos.y + 0.1 + u * 1.7, a.pos.z); o.scale.setScalar(1 + u * 0.4); o.material.opacity = 0.9 * (1 - u); });
        break;
      }
      case 'explode': {
        const b = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, depthWrite: false }));
        b.position.set(e.pos.x, e.pos.y + 1, e.pos.z);
        this.addEffect(b, 1.1, (o, u) => { o.scale.setScalar(1 + u * 30); o.material.opacity = 0.9 * (1 - u); });
        this.shake = 1;
        break;
      }
      case 'round':
        this.clearEffects(); this.clearPieceViews();
        break;
    }
  }

  update(dt, view) {
    const game = this.game;
    if (this.gridVersion !== game.grid.version) {
      this.gridVersion = game.grid.version;
      if (this.dynamicMesh) { this.dynamicGroup.remove(this.dynamicMesh); this.dynamicMesh.geometry.dispose(); }
      this.dynamicMesh = new THREE.Mesh(mesh(game.grid, false), this.pieceMat);
      this.dynamicMesh.castShadow = this.dynamicMesh.receiveShadow = true;
      this.dynamicGroup.add(this.dynamicMesh);
    }
    if (this.crateCount !== game.grid.crates.length) {
      this.crateCount = game.grid.crates.length;
      this.crateGroup.clear();
      const mat = new THREE.MeshLambertMaterial({ color: 0x7c7468 });
      for (const c of game.grid.crates) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(c.x1 - c.x0, c.y1 - c.y0, c.z1 - c.z0), mat);
        b.position.set((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, (c.z0 + c.z1) / 2);
        b.castShadow = b.receiveShadow = true;
        this.crateGroup.add(b);
      }
    }

    const p = game.piece;
    if (this.pieceView && this.pieceView.source !== p) this.clearPieceViews();
    if (p && this.pieceView && this.pieceView.rev !== p.rev) {
      const prev = this.pieceView;
      this.scene.remove(prev.ghost, prev.solid);
      this.pieceView = null;
      this.buildPieceView(p, prev);
    }
    if (p && !this.pieceView) this.buildPieceView(p);
    if (this.pieceView) {
      const v = this.pieceView;
      v.ghostMat.opacity = 0.22 + 0.16 * Math.sin(p.t * 12);
      v.slide.x *= Math.exp(-16 * dt); v.slide.z *= Math.exp(-16 * dt);
      v.ghost.position.set(v.slide.x, 0, v.slide.z);
      v.solid.position.set(v.slide.x, p.drop, v.slide.z);
      this.pieceLight.position.set(v.cx + v.slide.x, v.cy + p.drop + 2, v.cz + v.slide.z);
    }
    this.updateArena(dt);
    this.fxT += dt;
    this.arenaFx.update(this.fxT);

    for (const v of this.actorViews) {
      const self = view.actor === v.actor && view.mode === 'first';
      v.group.visible = !self;
      if (!self) v.rig.update(dt);
      const myTeam = view.actor?.team ?? game.human?.team;
      v.marker.visible = !self && v.actor.alive && v.actor.team !== myTeam && v.actor.spottedUntil > game.time;
      if (v.marker.visible) v.marker.rotation.y += dt * 3;
    }

    // Rockets, grenades and mines.
    this.stepProjectiles(dt, game);

    const b = game.bomb;
    const showBomb = b.pos && b.state !== 'carried' && b.state !== 'exploded';
    this.bombView.visible = !!showBomb;
    if (showBomb) {
      this.bombView.position.set(b.pos.x, b.pos.y + 0.13, b.pos.z);
      const rate = b.state === 'planted' ? Math.max(1.5, 10 - b.fuse / 4) : 0;
      this.bombLed.visible = b.state === 'planted' ? Math.sin(performance.now() / 1000 * rate * 3) > 0 : false;
    }

    for (const e of [...this.effects]) {
      e.t += dt;
      const u = Math.min(1, e.t / e.life);
      e.update?.(e.obj, u);
      if (u >= 1) { this.fx.remove(e.obj); this.effects.splice(this.effects.indexOf(e), 1); }
    }

    this.shake *= Math.exp(-4 * dt);
    this.camera.position.set(view.x, view.y, view.z);
    this.camera.rotation.set(view.pitch + (Math.random() - 0.5) * this.shake * 0.06, view.yaw + (Math.random() - 0.5) * this.shake * 0.06, 0);
    if (view.mode === 'first') this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.4;

    if (view.weapon !== this.vmCur) { this.vmCur = view.weapon; for (const [k, g] of Object.entries(this.vmGuns)) g.visible = k === view.weapon; }
    this.zoom += ((view.scoped ? view.zoom : 1) - this.zoom) * (1 - Math.exp(-14 * dt));
    const fov = 78 / this.zoom;
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.vmKick *= Math.exp(-14 * dt);
    this.vm.position.z = -0.42 + this.vmKick * 0.05;
    this.vm.rotation.x = this.vmKick * 0.05;
    this.vm.position.y = -0.17 - (view.reloading ? 0.16 : 0);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0 && this.flashObj) this.flashObj.visible = false; }

    this.r.clear();
    this.r.render(this.scene, this.camera);
    if (view.mode === 'first' && view.actor?.alive && !(view.scoped && this.zoom > 1.6)) {
      this.r.clearDepth();
      this.r.render(this.vmScene, this.vmCam);
    }
  }
}

export { eyePos };
