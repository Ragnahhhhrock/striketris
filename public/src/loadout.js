import * as THREE from 'three';
import { TEAM, WEAPONS, PRIMARIES, SECONDARIES, TEAM_PIECES, cleanLoadout, teamLabel, pieceHex } from './config.js';
import { makeActor, resetActor } from './actor.js';
import { makeRig } from './characters.js';

// Loadout screen, shown when the game starts. Pick a team (one per Tetris shape), a primary weapon and a pistol.
// Every loadout also carries the block knife. There are no classes and no character choice: everyone is the same
// blocky figure in their team's colour.

const $ = id => document.getElementById(id);
const KEY = 'striketris.loadout';
export const pick = { piece: 'Z', primary: 'rifle', secondary: 'pistol', side: 'attackers' };
try { Object.assign(pick, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* storage can be blocked */ }
Object.assign(pick, cleanLoadout(pick));
if (!TEAM_PIECES.includes(pick.piece)) pick.piece = 'Z';
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
  $('selView').onclick = () => { sidearm = !sidearm; labels(); };
}

function dress() {
  if (rig) { scene.remove(rig.group); rig.group.traverse(o => o.geometry?.dispose()); }
  actor = makeActor(0, pick.side === 'attackers' ? TEAM.ATT : TEAM.DEF, 'You', false, pick.piece, pick);
  resetActor(actor);
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

const stats = w => `Damage ${w.damage} · ${(1 / w.interval).toFixed(1)} shots/s · ${w.mag} rounds · ${w.range} m`;

function labels() {
  $('selName').textContent = `${teamLabel(pick.piece)} team`;
  $('selName').style.color = pieceHex(pick.piece);
  $('selKit').textContent = `${WEAPONS[pick.primary].name} + ${WEAPONS[pick.secondary].name} + Block Knife`;
  $('selHint').textContent = `Click the fighter to show the ${sidearm ? 'primary' : 'pistol'}`;
  for (const b of document.querySelectorAll('#selTeams button')) b.classList.toggle('on', b.dataset.piece === pick.piece);
  for (const b of document.querySelectorAll('#selPrimary button')) b.classList.toggle('on', b.dataset.weapon === pick.primary);
  for (const b of document.querySelectorAll('#selSecondary button')) b.classList.toggle('on', b.dataset.weapon === pick.secondary);
  for (const b of document.querySelectorAll('#selSide button')) b.classList.toggle('on', b.dataset.side === pick.side);
}

function changed(rebuild) {
  save(); labels();
  if (rig) {
    if (rebuild) dress(); else { actor.nextLoadout = cleanLoadout(pick); resetActor(actor); }
  }
  onChange(pick);
}

const card = id => `<button data-weapon="${id}"><b>${WEAPONS[id].name}</b><small>${WEAPONS[id].blurb}</small><small>${stats(WEAPONS[id])}</small></button>`;

export function initLoadout(cb) {
  onChange = cb;
  $('selTeams').innerHTML = TEAM_PIECES.map(p => `<button data-piece="${p}" style="--team:${pieceHex(p)}"><i></i>${p}<small>${teamLabel(p).split(' ')[0]}</small></button>`).join('');
  $('selPrimary').innerHTML = PRIMARIES.map(card).join('');
  $('selSecondary').innerHTML = SECONDARIES.map(card).join('');
  $('selTeams').onclick = e => { const b = e.target.closest('button'); if (b) { pick.piece = b.dataset.piece; changed(true); } };
  $('selPrimary').onclick = e => { const b = e.target.closest('button'); if (b) { pick.primary = b.dataset.weapon; sidearm = false; changed(false); } };
  $('selSecondary').onclick = e => { const b = e.target.closest('button'); if (b) { pick.secondary = b.dataset.weapon; sidearm = true; changed(false); } };
  $('selSide').onclick = e => { const b = e.target.closest('button'); if (b) { pick.side = b.dataset.side; changed(true); } };
  labels(); onChange(pick);
}

export function showLoadout() {
  $('select').hidden = false;
  if (!renderer) build();
  if (!rig) dress();
  resize(); labels(); visible = true; last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
}
export function hideLoadout() { $('select').hidden = true; visible = false; cancelAnimationFrame(raf); }
addEventListener('resize', () => { if (visible) resize(); });
