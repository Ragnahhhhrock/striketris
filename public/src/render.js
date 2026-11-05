import * as THREE from 'three';
import { CELL, GRID_W as W, GRID_D as D, GRID_H as H, MOVE, TEAM, PIECE } from './config.js';
import { STATIC, EMPTY } from './grid.js';
import { SITES } from './map.js';
import { eyePos } from './actor.js';

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

function mesh(grid, wantStatic) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const colour = new THREE.Color();
  for (let y = 0; y < H; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const v = grid.get(x, y, z);
    if (v === EMPTY || (v === STATIC) !== wantStatic) continue;
    colour.setHex(wantStatic ? (y >= 4 ? 0xd0d0d0 : 0xb4b4b4) : SHAPE_TINT[v - 1]);
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
    this.r.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.r.shadowMap.enabled = true;
    this.r.shadowMap.type = THREE.PCFShadowMap;
    this.r.autoClear = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xc9ced3);
    this.scene.fog = new THREE.Fog(0xc9ced3, 90, 260);
    this.camera = new THREE.PerspectiveCamera(78, 1, 0.05, 500);
    this.camera.rotation.order = 'YXZ';

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xa0a0a0, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
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

    const floorTex = this.tex.clone(); floorTex.repeat.set(W, D); floorTex.needsUpdate = true;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL, D * CELL), new THREE.MeshLambertMaterial({ map: floorTex, color: 0xa6a6a6 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(W * CELL / 2, 0, D * CELL / 2); floor.receiveShadow = true;
    this.scene.add(floor);

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
    this.effects = [];
    this.shake = 0;

    // Weapon drawn in its own pass so it never clips into walls.
    this.vmScene = new THREE.Scene();
    this.vmScene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2.2));
    this.vmCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.vm = new THREE.Group();
    const vmMat = new THREE.MeshLambertMaterial({ color: 0x4d4d4d });
    const part = (w, h, d, x, y, z, m = vmMat) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); this.vm.add(b); return b; };
    part(0.06, 0.09, 0.42, 0, 0, 0); part(0.03, 0.035, 0.34, 0, 0.012, -0.34); part(0.05, 0.14, 0.06, 0, -0.1, -0.06); part(0.045, 0.1, 0.14, 0, -0.03, 0.26);
    this.flash = part(0.11, 0.11, 0.02, 0, 0.012, -0.53, new THREE.MeshBasicMaterial({ color: 0xffdf8a }));
    this.flash.visible = false;
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
    if (this.staticMesh) { this.scene.remove(this.staticMesh); this.staticMesh.geometry.dispose(); }
    this.staticMesh = new THREE.Mesh(mesh(game.grid, true), this.voxelMat);
    this.staticMesh.castShadow = this.staticMesh.receiveShadow = true;
    this.scene.add(this.staticMesh);
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
    const gun = add(0.08, 0.1, 0.65, 0.22, 1.25, -0.3, dark);
    this.scene.add(group);
    return { actor: a, group, legs, body, head, gun, downT: 0 };
  }

  clearEffects() { for (const e of this.effects) { this.fx.remove(e.obj); e.dispose?.(); } this.effects = []; }
  clearPieceViews() {
    if (this.pieceView) { this.scene.remove(this.pieceView.ghost, this.pieceView.solid); this.pieceView = null; }
  }

  // Ghost at the landing spot, beam to the sky, then the real block coming down.
  buildPieceView(p) {
    const ghost = new THREE.Group(), solid = new THREE.Group();
    const tint = SHAPE_TINT[p.shapeId];
    const ghostMat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.32, depthWrite: false });
    const beamMat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    const edgeGeo = new THREE.EdgesGeometry(this.cubeGeo);
    const solidMat = new THREE.MeshLambertMaterial({ color: SHAPE_TINT[p.shapeId], map: this.tex });
    const beamH = 90;
    const columns = new Set();
    for (const c of p.cells) {
      const x = (p.x + c.x + 0.5) * CELL, y = (p.y + c.y + 0.5) * CELL, z = (p.z + c.z + 0.5) * CELL;
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
      solid.add(s);
    }
    solid.visible = false;
    this.scene.add(ghost, solid);
    this.pieceView = { ghost, solid, ghostMat, source: p };
  }

  addEffect(obj, life, update) { this.fx.add(obj); this.effects.push({ obj, t: 0, life, update }); }

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
        if (e.actor === viewer) { this.vmKick = 1; this.flash.visible = true; this.flashT = 0.04; }
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
      this.dynamicMesh = new THREE.Mesh(mesh(game.grid, false), this.voxelMat);
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
    if (p && !this.pieceView) this.buildPieceView(p);
    if (this.pieceView) {
      const v = this.pieceView;
      v.ghostMat.opacity = 0.22 + 0.16 * Math.sin(p.t * 12);
      if (p.t >= PIECE.telegraph) { v.solid.visible = true; v.solid.position.y = p.drop; }
    }

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
      e.t += dt;
      const u = Math.min(1, e.t / e.life);
      e.update?.(e.obj, u);
      if (u >= 1) { this.fx.remove(e.obj); this.effects.splice(this.effects.indexOf(e), 1); }
    }

    this.shake *= Math.exp(-4 * dt);
    this.camera.position.set(view.x, view.y, view.z);
    this.camera.rotation.set(view.pitch + (Math.random() - 0.5) * this.shake * 0.06, view.yaw + (Math.random() - 0.5) * this.shake * 0.06, 0);
    if (view.mode === 'first') this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.4;

    this.vmKick *= Math.exp(-14 * dt);
    this.vm.position.z = -0.42 + this.vmKick * 0.05;
    this.vm.rotation.x = this.vmKick * 0.05;
    this.vm.position.y = -0.17 - (view.reloading ? 0.16 : 0);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }

    this.r.clear();
    this.r.render(this.scene, this.camera);
    if (view.mode === 'first' && view.actor?.alive) {
      this.r.clearDepth();
      this.r.render(this.vmScene, this.vmCam);
    }
  }
}

export { eyePos };
