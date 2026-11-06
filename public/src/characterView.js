import * as THREE from 'three';
import { TEAM, WEAPONS } from './config.js';
import { makeActor } from './actor.js';
import { makeRig } from './characters.js';
import { ROSTER, describeLook } from './looks.js';

// Dev viewer: every fighter in a lineup, driven through the same animation code the game uses.

const $ = id => document.getElementById(id);
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x232a55);
scene.fog = new THREE.Fog(0x232a55, 18, 60);
scene.add(new THREE.HemisphereLight(0xc8d4ff, 0x4a4f66, 1.25));
const sun = new THREE.DirectionalLight(0xffffff, 1.35);
sun.position.set(6, 14, 9); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
sun.shadow.bias = -0.0006;
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ color: 0x7d869a }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.GridHelper(80, 80, 0x000000, 0x000000);
grid.material.transparent = true; grid.material.opacity = 0.12; grid.position.y = 0.01; scene.add(grid);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);

// Lineup: attackers in the back row, defenders in front. "You" appears on both sides.
const rows = [
  { team: TEAM.ATT, names: ['Ash', 'Brick', 'Cole', 'Dune', 'Echo', 'Flint', 'You'], z: -1.6 },
  { team: TEAM.DEF, names: ['Grit', 'Hale', 'Ivo', 'Jett', 'Knox', 'Lark', 'You'], z: 1.6 },
];
const SPACING = 1.5;
const fighters = [];
let id = 0;
for (const row of rows) {
  row.names.forEach((name, i) => {
    const a = makeActor(id++, row.team, name, false);
    a.pos = { x: (i - (row.names.length - 1) / 2) * SPACING, y: 0, z: row.z };
    a.yaw = Math.PI;      // face the default camera
    a.weapons = { rifle: WEAPONS.rifle.mag, pistol: WEAPONS.pistol.mag };
    a.home = { ...a.pos };
    const rig = makeRig(a);
    scene.add(rig.group);
    const tag = document.createElement('div');
    tag.className = `tag ${row.team === TEAM.ATT ? 'att' : 'def'}`;
    tag.textContent = name;
    $('tags').append(tag);
    const f = { a, rig, tag, name, home: a.home };
    tag.onclick = () => select(f);
    fighters.push(f);
  });
}

// ---- animations: each sets what the game would set, per frame ----
const ANIMS = {
  idle: {},
  walk: { f: 1, speed: 3.2 },
  run: { f: 1, speed: 6.5 },
  backpedal: { f: -1, speed: 3.2 },
  'strafe left': { r: -1, speed: 6.5 },
  'strafe right': { r: 1, speed: 6.5 },
  'diagonal run': { f: 1, r: 1, speed: 6.5 },
  crouch: { crouch: true },
  'crouch walk': { crouch: true, f: 1, speed: 2.6 },
  jump: { jump: true, f: 1, speed: 6.5 },
  climb: { climb: true },
  fire: { fire: true },
  'run and fire': { fire: true, f: 1, speed: 6.5 },
  'crouch and fire': { fire: true, crouch: true },
  reload: { reload: true },
  die: { die: true },
};
for (const k of Object.keys(ANIMS)) $('anim').add(new Option(k, k));
let anim = 'idle';
$('anim').onchange = () => { anim = $('anim').value; for (const f of fighters) resetState(f); };

function resetState(f) {
  const a = f.a;
  a.alive = true; a.mantle = null; a.onGround = true; a.crouching = false; a.reloadT = 0; a.recoil = 0;
  a.vel = { x: 0, y: 0, z: 0 }; a.pos = { ...f.home };
  f.t = (fighters.indexOf(f) % 7) * 0.13;   // stagger so they do not move in lockstep
  f.fireT = 0;
}
fighters.forEach(resetState);

function drive(f, dt) {
  const a = f.a, p = ANIMS[anim], yaw = a.yaw;
  f.t += dt;
  const speed = p.speed ?? 0;
  const lf = p.f ?? 0, lr = p.r ?? 0;
  const len = Math.hypot(lf, lr) || 1;
  a.vel.x = (-Math.sin(yaw) * lf + Math.cos(yaw) * lr) / len * speed;
  a.vel.z = (-Math.cos(yaw) * lf - Math.sin(yaw) * lr) / len * speed;
  a.crouching = !!p.crouch;
  a.pitch = Number($('pitch').value);
  a.cur = $('gun').value;
  a.hasBomb = $('bomb').checked;
  a.recoil *= Math.exp(-5 * dt);
  a.fireCd = 0;
  // Walking loops in place; the lineup stays put.
  a.pos.x = f.home.x; a.pos.z = f.home.z;
  if (p.jump) { const u = (f.t % 1.3) / 0.8; a.onGround = u > 1; a.pos.y = u < 1 ? Math.sin(u * Math.PI) * 0.9 : 0; }
  else a.pos.y = 0;
  if (p.climb) { const u = (f.t % 1.4) / 0.9; a.mantle = u < 1 ? { t: u } : null; a.onGround = u >= 1; a.pos.y = u < 1 ? Math.min(1, u / 0.7) * 1.2 : 1.2 * (1 - Math.min(1, (u - 1) * 3)); }
  if (p.fire) {
    f.fireT -= dt;
    if (f.fireT <= 0) { const w = WEAPONS[a.cur]; f.fireT = w.interval * (a.cur === 'pistol' ? 2.5 : 1); a.recoil = Math.min(w.kickMax, a.recoil + w.kick); f.rig.shot(); }
  }
  if (p.reload) {
    const dur = WEAPONS[a.cur].reload;
    const u = f.t % (dur + 0.6);
    a.reloadT = u < dur ? dur - u : 0;
  }
  if (p.die) {
    const u = f.t % 4;
    a.alive = u < 1.2;
    if (u < 0.05) { f.rig.downT = 0; }
  }
}

// ---- camera orbit ----
const orbit = { yaw: 0, pitch: 0.28, dist: 17, target: new THREE.Vector3(0, 1.0, 0) };
const goal = { target: new THREE.Vector3(0, 1.0, 0), dist: 17 };
let dragging = false, lastX = 0, lastY = 0, selected = null;
canvas.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); $('spin').checked = false; });
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointermove', e => {
  if (!dragging) return;
  orbit.yaw -= (e.clientX - lastX) * 0.006;
  orbit.pitch = Math.max(-0.1, Math.min(1.3, orbit.pitch + (e.clientY - lastY) * 0.005));
  lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener('wheel', e => { e.preventDefault(); goal.dist = Math.max(2, Math.min(40, goal.dist * Math.exp(e.deltaY * 0.001))); }, { passive: false });

function select(f) {
  selected = f;
  const look = f.rig.look;
  $('info').innerHTML = `<b>${f.name}</b> (${f.a.team})<br>${describeLook(look)}`;
  goal.target.set(f.home.x, 1.0, f.home.z); goal.dist = 4.2;
  for (const g of fighters) g.tag.classList.toggle('sel', g === f);
}
function showAll() { selected = null; goal.target.set(0, 1.0, 0); goal.dist = 17; for (const g of fighters) g.tag.classList.remove('sel'); }
$('front').onclick = () => { orbit.yaw = 0; $('spin').checked = false; };
$('back').onclick = () => { orbit.yaw = Math.PI; $('spin').checked = false; };
$('all').onclick = showAll;
$('info').innerHTML = `Pick a name to see what makes that fighter stand out.`;

const params = new URLSearchParams(location.search);
if (params.get('anim') && ANIMS[params.get('anim')]) { anim = params.get('anim'); $('anim').value = anim; }
if (params.get('gun')) $('gun').value = params.get('gun');
if (params.get('yaw')) { orbit.yaw = Number(params.get('yaw')); $('spin').checked = false; }
if (params.get('pitch')) $('pitch').value = params.get('pitch');
if (params.get('bomb')) $('bomb').checked = true;
if (params.get('focus')) { const f = fighters.find(g => g.name === params.get('focus') && g.a.team === (params.get('team') === 'def' ? TEAM.DEF : TEAM.ATT)); if (f) { select(f); orbit.dist = goal.dist; orbit.target.copy(goal.target); } }
if (params.get('dist')) { goal.dist = orbit.dist = Number(params.get('dist')); }
if (params.get('fixed')) $('spin').checked = false;
const solo = !!params.get('solo');
window.__fighters = fighters;

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const v = new THREE.Vector3();
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if ($('spin').checked) orbit.yaw += dt * 0.25;
  orbit.dist += (goal.dist - orbit.dist) * (1 - Math.exp(-6 * dt));
  orbit.target.lerp(goal.target, 1 - Math.exp(-6 * dt));
  camera.position.set(
    orbit.target.x + Math.sin(orbit.yaw) * Math.cos(orbit.pitch) * orbit.dist,
    orbit.target.y + Math.sin(orbit.pitch) * orbit.dist,
    orbit.target.z + Math.cos(orbit.yaw) * Math.cos(orbit.pitch) * orbit.dist);
  camera.lookAt(orbit.target);
  for (const f of fighters) {
    f.rig.group.visible = !solo || f === selected;
    drive(f, dt);
    f.rig.update(dt);
    v.set(f.home.x, 2.15, f.home.z).project(camera);
    f.tag.style.display = v.z < 1 && f.rig.group.visible ? '' : 'none';
    f.tag.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`;
    f.tag.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
