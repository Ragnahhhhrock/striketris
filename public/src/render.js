import * as THREE from 'three';
import { CELL, GRID_W as W, GRID_D as D, GRID_H as H, MOVE, TEAM, PIECE, WEAPONS } from './config.js';
import { STATIC, EMPTY } from './grid.js';
import { SITES } from './map.js';
import { eyePos } from './actor.js';
import { SHAPES } from './pieces.js';
import { ArenaFx, NEON_COLOURS, neonTexture } from './arenaFx.js';

// Classic Tetris colours, order matches SHAPES: I cyan, O yellow, T purple, S green, Z red, J blue, L orange.
export const SHAPE_TINT = [0x00e5ff, 0xffe600, 0xb44dff, 0x2ee62e, 0xff2d2d, 0x3a63ff, 0xff9a1a];
const TEAM_COLOUR = { [TEAM.ATT]: 0xd98a3d, [TEAM.DEF]: 0x4a8fd9 };

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

// Soft glow with six hard spikes: the muzzle flash, drawn white and tinted per weapon.
function flashTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.22, 'rgba(255,255,255,.8)'); g.addColorStop(0.6, 'rgba(255,255,255,.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  x.translate(64, 64); x.fillStyle = 'rgba(255,255,255,.95)';
  for (let i = 0; i < 6; i++) {
    x.rotate(Math.PI / 3);
    x.beginPath(); x.moveTo(0, -4); x.lineTo(63, 0); x.lineTo(0, 4); x.lineTo(-14, 0); x.closePath(); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
    this.shotShake = 0;

    // Shared gunfire resources, so a shot allocates almost nothing.
    this.beamGeo = new THREE.BoxGeometry(1, 1, 1);
    this.sparkGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    this.puffGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd36b, fog: false });
    this.flashTex = flashTexture();
    this.beamMats = {}; this.flashMats = {};
    for (const [id, w] of Object.entries(WEAPONS)) {
      this.beamMats[id] = {
        shot: new THREE.MeshBasicMaterial({ color: w.tracer.colour, fog: false }),
        ricochet: new THREE.MeshBasicMaterial({ color: w.tracer.ricochet, fog: false }),
      };
      this.flashMats[id] = new THREE.SpriteMaterial({ map: this.flashTex, color: w.flash.colour, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    }
    // One light that jumps to whoever fired last, so muzzle flashes light the walls without recompiling shaders.
    this.muzzleLight = new THREE.PointLight(0xffaa44, 0, 24, 2);
    this.scene.add(this.muzzleLight);

    // Weapon drawn in its own pass so it never clips into walls.
    this.vmScene = new THREE.Scene();
    this.vmScene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2.2));
    this.vmCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.vm = new THREE.Group();
    const box = (grp, mat, w, h, d, x, y, z, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.rotation.x = rx; grp.add(b); return b; };
    const steel = new THREE.MeshLambertMaterial({ color: 0x3b3f47 }), dark = new THREE.MeshLambertMaterial({ color: 0x23252b });
    const orange = new THREE.MeshLambertMaterial({ color: 0xe8812a, emissive: 0x6b3208 });
    const silver = new THREE.MeshLambertMaterial({ color: 0xd2d7de }), cyan = new THREE.MeshLambertMaterial({ color: 0x38c8e8, emissive: 0x0e5e70 });

    // Rifle: long, dark and orange-trimmed, with a stock, curved magazine and muzzle brake.
    this.vmRifle = new THREE.Group();
    box(this.vmRifle, steel, 0.06, 0.09, 0.42, 0, 0, 0);
    box(this.vmRifle, dark, 0.056, 0.066, 0.26, 0, -0.004, -0.3);
    box(this.vmRifle, dark, 0.022, 0.022, 0.2, 0, 0.006, -0.52);
    box(this.vmRifle, steel, 0.042, 0.042, 0.05, 0, 0.006, -0.63);
    box(this.vmRifle, dark, 0.04, 0.17, 0.07, 0, -0.13, -0.1, 0.22);
    box(this.vmRifle, dark, 0.042, 0.1, 0.05, 0, -0.095, 0.09, -0.25);
    box(this.vmRifle, steel, 0.046, 0.1, 0.16, 0, -0.03, 0.27);
    box(this.vmRifle, orange, 0.02, 0.01, 0.3, 0, 0.05, -0.04);
    box(this.vmRifle, orange, 0.012, 0.034, 0.012, 0, 0.04, -0.58);
    box(this.vmRifle, orange, 0.03, 0.026, 0.012, 0, 0.062, 0.16);
    this.rifleFlashAt = new THREE.Vector3(0, 0.006, -0.68);

    // Pistol: short and bright, tall silver slide with a cyan stripe. Its slide racks back on every shot.
    this.vmPistol = new THREE.Group();
    box(this.vmPistol, dark, 0.05, 0.06, 0.2, 0, -0.025, 0.02);
    this.pistolSlide = new THREE.Group();
    box(this.pistolSlide, silver, 0.058, 0.07, 0.27, 0, 0.035, -0.02);
    box(this.pistolSlide, cyan, 0.012, 0.006, 0.2, 0, 0.073, -0.03);
    box(this.pistolSlide, dark, 0.012, 0.02, 0.012, 0, 0.082, -0.14);
    box(this.pistolSlide, dark, 0.03, 0.018, 0.012, 0, 0.082, 0.1);
    this.vmPistol.add(this.pistolSlide);
    box(this.vmPistol, steel, 0.034, 0.034, 0.06, 0, 0.035, -0.18);
    box(this.vmPistol, dark, 0.052, 0.16, 0.075, 0, -0.12, 0.1, -0.2);
    box(this.vmPistol, dark, 0.03, 0.02, 0.08, 0, -0.07, -0.02);
    this.pistolFlashAt = new THREE.Vector3(0, 0.035, -0.23);
    this.vmPistol.position.set(0, 0.02, 0.05);

    this.vm.add(this.vmRifle, this.vmPistol);
    this.vmPistol.visible = false;
    // Muzzle flash on the gun model: a glow sprite plus a short hot core.
    this.vmFlash = new THREE.Sprite(this.flashMats.rifle.clone());
    this.vmFlash.visible = false;
    this.vmCore = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.vmCore.visible = false;
    this.vm.add(this.vmFlash, this.vmCore);
    this.vm.position.set(0.2, -0.17, -0.42);
    this.vm.scale.setScalar(0.62);
    this.vmScene.add(this.vm);
    this.vmKick = 0;

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
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: TEAM_COLOUR[a.team] });
    const dark = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
    const add = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; group.add(b); return b; };
    const legs = add(0.5, 0.8, 0.3, 0, 0.4, 0, dark);
    const body = add(0.6, 0.72, 0.36, 0, 1.15, 0, mat);
    const head = add(0.28, 0.28, 0.28, 0, 1.66, 0, mat);
    const gunMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
    const gun = add(0.08, 0.1, 0.65, 0.22, 1.25, -0.3, gunMat);
    this.scene.add(group);
    return { actor: a, group, legs, body, head, gun, gunMat, gunCur: 'rifle', downT: 0 };
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

  addEffect(obj, life, update, dispose) { this.fx.add(obj); this.effects.push({ obj, t: 0, life, update, dispose, fresh: true }); }

  // Sparks thrown off a wall, plus a grey puff of dust. Strong sparks fan along the surface.
  impactFx(pos, n, count, power) {
    const puff = new THREE.Mesh(this.puffGeo, new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true }));
    puff.position.set(pos.x + n.x * 0.05, pos.y + n.y * 0.05, pos.z + n.z * 0.05);
    this.addEffect(puff, 0.45, (o, u) => { o.material.opacity = 1 - u; o.scale.setScalar(1 + u * 1.5); }, () => puff.material.dispose());
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 3, (Math.random() - 0.5) * 6).multiplyScalar(power);
      v.x += n.x * (2 + Math.random() * 4) * power; v.y += n.y * (2 + Math.random() * 4) * power; v.z += n.z * (2 + Math.random() * 4) * power;
      const sp = new THREE.Mesh(this.sparkGeo, this.sparkMat), life = 0.18 + Math.random() * 0.22;
      sp.position.set(pos.x, pos.y, pos.z);
      this.addEffect(sp, life, (o, u) => {
        const t = u * life;
        o.position.set(pos.x + v.x * t, pos.y + v.y * t - 6 * t * t, pos.z + v.z * t);
        o.scale.setScalar(Math.max(0.01, 1 - u));
      });
    }
  }

  handleEvent(e, viewer) {
    switch (e.type) {
      case 'shot': {
        const w = WEAPONS[e.weapon] ?? WEAPONS.rifle;
        const first = e.path[0], next = e.path[1];
        const len0 = Math.hypot(next.x - first.x, next.y - first.y, next.z - first.z) || 1;
        const fx = (next.x - first.x) / len0, fy = (next.y - first.y) / len0, fz = (next.z - first.z) / len0;
        const yaw = e.actor.yaw;
        // Where the barrel is: ahead of the eye, off to the right and a little low.
        const muzzle = new THREE.Vector3(first.x + fx * 0.8 + Math.cos(yaw) * 0.2, first.y + fy * 0.8 - 0.16, first.z + fz * 0.8 - Math.sin(yaw) * 0.2);
        const mine = e.actor === viewer;
        e.path.forEach((pt, i) => {
          if (!i) return;
          const a = i === 1 ? muzzle : new THREE.Vector3(e.path[i - 1].x, e.path[i - 1].y, e.path[i - 1].z);
          const b = new THREE.Vector3(pt.x, pt.y, pt.z);
          const length = a.distanceTo(b);
          if (length < 0.05) return;
          const beam = new THREE.Mesh(this.beamGeo, i === 1 ? this.beamMats[e.weapon].shot : this.beamMats[e.weapon].ricochet);
          beam.position.copy(a).add(b).multiplyScalar(0.5); beam.lookAt(b);
          const width = w.tracer.width * (i === 1 ? 1 : 0.8);
          beam.scale.set(width, width, length);
          this.addEffect(beam, w.tracer.life * (i === 1 ? 1 : 1.5), (o, u) => { const k = width * (1 - u); o.scale.set(k, k, length); });
        });
        // Flash at the muzzle for everyone, with a light on the walls around it.
        const flash = new THREE.Sprite(this.flashMats[e.weapon]);
        const size = w.flash.size * (mine ? 0 : 0.55) * (0.85 + Math.random() * 0.3);
        flash.position.copy(muzzle);
        if (size > 0) this.addEffect(flash, w.flash.life, (o, u) => { const k = size * (1 - u * u); o.scale.set(k, k * (0.8 + Math.random() * 0.4), 1); });
        const power = w.flash.light * 25 * (mine ? 1 : 0.7);
        if (power > this.muzzleLight.intensity * 0.5) {
          this.muzzleLight.color.setHex(w.flash.colour); this.muzzleLight.position.copy(muzzle); this.muzzleLight.intensity = power;
        }
        if (e.impact) this.impactFx(e.impact.pos, e.impact.normal, 4, 0.6);
        if (mine) {
          this.vmKick = Math.min(1.5, this.vmKick + (e.weapon === 'rifle' ? 0.55 : 1));
          this.shotShake = Math.max(this.shotShake, w.shake);
          this.flashT = w.flash.life; this.flashFresh = true;
          this.vmFlash.material.color.setHex(w.flash.colour);
          this.vmFlash.visible = this.vmCore.visible = true;
          const at = e.weapon === 'pistol' ? this.pistolFlashAt.clone().add(this.vmPistol.position) : this.rifleFlashAt;
          this.vmFlash.position.copy(at); this.vmCore.position.copy(at).z -= 0.04;
          const s = (e.weapon === 'pistol' ? 0.36 : 0.3) * (0.85 + Math.random() * 0.4);
          this.vmFlash.scale.set(s, s * (0.8 + Math.random() * 0.4), 1);
          this.vmFlash.material.rotation = Math.random() * 6.28;
          this.vmCore.material.color.setHex(w.flash.colour).lerp(new THREE.Color(0xffffff), 0.6);
        }
        break;
      }
      case 'ricochet': {
        this.impactFx(e.pos, e.normal, 9, 1);
        const w = WEAPONS[e.weapon] ?? WEAPONS.rifle;
        const glow = new THREE.Sprite(this.flashMats[e.weapon]);
        glow.position.set(e.pos.x + e.normal.x * 0.1, e.pos.y + e.normal.y * 0.1, e.pos.z + e.normal.z * 0.1);
        this.addEffect(glow, 0.09, (o, u) => { const k = 0.9 * (1 - u); o.scale.set(k, k, 1); });
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
      const a = v.actor;
      const self = view.actor === a && view.mode === 'first';
      v.group.visible = !self;
      if (self) continue;
      v.group.position.set(a.pos.x, a.pos.y, a.pos.z);
      v.group.rotation.y = a.yaw;
      const c = a.crouching ? MOVE.crouchHeight / MOVE.height : 1;
      v.group.scale.y = c;
      v.downT = a.alive ? 0 : Math.min(1, v.downT + dt * 3);
      v.group.rotation.x = -v.downT * Math.PI / 2;
      v.group.position.y += v.downT * 0.2;
    }

    const b = game.bomb;
    const showBomb = b.pos && b.state !== 'carried' && b.state !== 'exploded';
    this.bombView.visible = !!showBomb;
    if (showBomb) {
      this.bombView.position.set(b.pos.x, b.pos.y + 0.13, b.pos.z);
      const rate = b.state === 'planted' ? Math.max(1.5, 10 - b.fuse / 4) : 0;
      this.bombLed.visible = b.state === 'planted' ? Math.sin(performance.now() / 1000 * rate * 3) > 0 : false;
    }

    for (const e of [...this.effects]) {
      // Every effect gets one rendered frame at full strength, even when a slow frame is longer than its whole life.
      if (e.fresh) { e.fresh = false; e.update?.(e.obj, 0); continue; }
      e.t += dt;
      const u = Math.min(1, e.t / e.life);
      e.update?.(e.obj, u);
      if (u >= 1) { this.fx.remove(e.obj); e.dispose?.(); this.effects.splice(this.effects.indexOf(e), 1); }
    }

    this.shake *= Math.exp(-4 * dt);
    this.shotShake *= Math.exp(-18 * dt);
    this.muzzleLight.intensity *= Math.exp(-45 * dt);
    const jitter = (this.shake + this.shotShake * 0.8) * 0.06;
    this.camera.position.set(view.x, view.y, view.z);
    this.camera.rotation.set(view.pitch + (Math.random() - 0.5) * jitter, view.yaw + (Math.random() - 0.5) * jitter, 0);
    if (view.mode === 'first') this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.4;

    // Gun model: the model for the held weapon, kicked back and up by each shot.
    const cur = view.actor?.cur === 'pistol' ? 'pistol' : 'rifle', wp = WEAPONS[cur];
    this.vmRifle.visible = cur === 'rifle'; this.vmPistol.visible = cur === 'pistol';
    this.vmKick *= Math.exp(-wp.vmRecover * dt);
    const k = this.vmKick;
    this.vm.position.set(0.2 + (Math.random() - 0.5) * k * 0.004, -0.17 - (view.reloading ? 0.16 : 0) - k * 0.012, -0.42 + k * wp.vmBack);
    this.vm.rotation.set(k * wp.vmPitch, 0, (view.reloading ? 0.25 : 0) + k * 0.03 * (cur === 'pistol' ? 1 : 0.5));
    this.pistolSlide.position.z = k * 0.08;
    const fov = 78 + (view.mode === 'first' ? this.vmKick * wp.fov : 0);
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    if (this.flashFresh) this.flashFresh = false;
    else if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.vmFlash.visible = this.vmCore.visible = false; }

    // Third-person gun matches the weapon too.
    for (const v of this.actorViews) {
      if (v.gunCur === v.actor.cur) continue;
      v.gunCur = v.actor.cur;
      const pistol = v.gunCur === 'pistol';
      v.gun.scale.z = pistol ? 0.45 : 1; v.gun.position.z = pistol ? -0.16 : -0.3;
      v.gunMat.color.setHex(pistol ? 0xd2d7de : 0x2c2f36);
    }

    this.r.clear();
    this.r.render(this.scene, this.camera);
    if (view.mode === 'first' && view.actor?.alive) {
      this.r.clearDepth();
      this.r.render(this.vmScene, this.vmCam);
    }
  }
}

export { eyePos };
