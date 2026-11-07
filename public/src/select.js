import * as THREE from 'three';
import { TEAM, CLASSES, CLASS_ORDER, GADGETS, weaponName } from './config.js';
import { makeActor, resetActor } from './actor.js';
import { makeRig } from './characters.js';
import { ROSTER, PLAYABLE, describeLook, displayName } from './looks.js';

// Character selection screen: a turntable preview with the roster, kits and side on offer.

const $ = id => document.getElementById(id);
const KEY = 'striketris.pick';
export const pick = { look: 'You', cls: 'assault', side: 'attackers' };
try { Object.assign(pick, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* storage can be blocked */ }
if (!ROSTER[pick.look]) pick.look = 'You';
if (!CLASSES[pick.cls]) pick.cls = 'assault';
if (pick.side !== 'attackers' && pick.side !== 'defenders') pick.side = 'attackers';

let onChange = () => {}, renderer, scene, camera, actor, rig, visible = false, raf = 0, last = 0, sidearm = false;

function save() { try { localStorage.setItem(KEY, JSON.stringify(pick)); } catch { /* ignore */ } }

function build() {
  renderer = new THREE.WebGLRenderer({ canvas: $('selView'), antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xc8d4ff, 0x4a4f66, 1.3));
  const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(3, 6, 5); scene.add(sun);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.08, 32), new THREE.MeshLambertMaterial({ color: 0x3a4157 }));
  pad.position.y = -0.04; scene.add(pad);
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.25, 4.6); camera.lookAt(0, 0.98, 0);
  $('selView').onclick = () => { sidearm = !sidearm; };
}

function dress() {
  if (rig) { scene.remove(rig.group); rig.group.traverse(o => o.geometry?.dispose()); }
  actor = makeActor(0, pick.side === 'attackers' ? TEAM.ATT : TEAM.DEF, 'You', false, pick.cls);
  resetActor(actor);
  actor.lookName = pick.look;
  rig = makeRig(actor);
  scene.add(rig.group);
}

function resize() {
  const c = $('selView'), w = c.clientWidth || 300, h = c.clientHeight || 380;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}

function frame(now) {
  if (!visible) return;
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  actor.yaw += dt * 0.7;
  actor.cur = sidearm ? actor.loadout[1] : actor.loadout[0];
  actor.pitch = 0.05;
  rig.update(dt);
  renderer.render(scene, camera);
}

function labels() {
  const k = CLASSES[pick.cls];
  $('selName').textContent = displayName(pick.look);
  $('selDesc').textContent = describeLook(ROSTER[pick.look]);
  $('selKit').textContent = `${k.name}: ${weaponName(pick.side, k.primary)} + ${weaponName(pick.side, k.secondary)}${k.gadget ? ' + ' + GADGETS[k.gadget].name : ''}`;
  for (const b of document.querySelectorAll('#selRoster button')) b.classList.toggle('on', b.dataset.look === pick.look);
  for (const b of document.querySelectorAll('#selClasses button')) b.classList.toggle('on', b.dataset.cls === pick.cls);
  for (const b of document.querySelectorAll('#selSide button')) b.classList.toggle('on', b.dataset.side === pick.side);
  for (const b of document.querySelectorAll('#selClasses button')) b.querySelector('small').textContent = `${weaponName(pick.side, CLASSES[b.dataset.cls].primary)}`;
}

function changed(rebuild) {
  save(); labels();
  if (rig) { if (rebuild) dress(); else { actor.nextCls = pick.cls; resetActor(actor); } }
  onChange(pick);
}

export function initSelect(cb) {
  onChange = cb;
  $('selRoster').innerHTML = PLAYABLE.map(n => `<button data-look="${n}">${displayName(n)}</button>`).join('');
  $('selClasses').innerHTML = CLASS_ORDER.map(c => `<button data-cls="${c}"><b>${CLASSES[c].name}</b><small></small></button>`).join('');
  $('selRoster').onclick = e => { const b = e.target.closest('button'); if (b) { pick.look = b.dataset.look; changed(true); } };
  $('selClasses').onclick = e => { const b = e.target.closest('button'); if (b) { pick.cls = b.dataset.cls; changed(false); } };
  $('selSide').onclick = e => { const b = e.target.closest('button'); if (b) { pick.side = b.dataset.side; changed(true); } };
  labels(); onChange(pick);
}

export function showSelect() {
  $('select').hidden = false;
  if (!renderer) { build(); }
  if (!rig) dress();
  resize(); labels(); visible = true; last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
}
export function hideSelect() { $('select').hidden = true; visible = false; cancelAnimationFrame(raf); }
addEventListener('resize', () => { if (visible) resize(); });
