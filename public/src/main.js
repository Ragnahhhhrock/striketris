import { TICK, MOVE, TEAM, PIECE, CELL, GRID_W as W, GRID_D as D } from './config.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';
import { eyePos } from './actor.js';

const $ = id => document.getElementById(id);
const canvas = $('view');
const params = new URLSearchParams(location.search);
const renderer = new Renderer(canvas);
const hud = new Hud();
const audio = new Audio();

let game;
let mode = 'menu'; // menu | play | pause
let lockFailed = false;
let dragging = false;
let specIndex = 0;
let accumulator = 0;
const keys = new Set();
const SENS = 0.0022;

function load(g) { game = g; renderer.setGame(g); hud.setGame(g); window.__game = g; }

function menuGame() { load(new Game({ human: false, teamSize: 3, seed: Number(params.get('seed')) || undefined, skill: 'normal' })); }

function start() {
  audio.unlock();
  const interval = Number($('optPieces').value);
  load(new Game({
    humanTeam: $('optSide').value,
    teamSize: Number($('optSize').value),
    skill: $('optSkill').value,
    pieceInterval: interval || PIECE.interval,
    pieces: interval > 0,
    seed: Number(params.get('seed')) || undefined,
  }));
  resume();
}

function resume() {
  mode = 'play';
  document.body.dataset.mode = 'play';
  $('menu').hidden = true;
  requestLock();
}

function pause() {
  if (mode !== 'play') return;
  mode = 'pause';
  showMenu(true);
}

function showMenu(paused) {
  document.body.dataset.mode = paused ? 'pause' : 'menu';
  $('menu').hidden = false;
  $('resume').hidden = !paused;
  $('startBtn').textContent = paused ? 'Restart match' : 'Play';
  keys.clear();
  if (document.pointerLockElement) document.exitPointerLock();
}

function requestLock() {
  if (lockFailed) { $('lockNote').hidden = false; return; }
  try {
    const p = canvas.requestPointerLock();
    if (p?.catch) p.catch(() => { lockFailed = true; $('lockNote').hidden = false; });
  } catch { lockFailed = true; $('lockNote').hidden = false; }
}

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && mode === 'play' && !lockFailed) pause();
});
document.addEventListener('pointerlockerror', () => { lockFailed = true; $('lockNote').hidden = false; });

document.addEventListener('mousemove', e => {
  if (mode !== 'play' || !game.human) return;
  if (!document.pointerLockElement && !(lockFailed && dragging)) return;
  const h = game.human;
  h.yaw -= e.movementX * SENS;
  h.pitch = Math.max(-1.5, Math.min(1.5, h.pitch - e.movementY * SENS));
});
canvas.addEventListener('mousedown', e => {
  if (mode !== 'play') return;
  if (e.button === 2 && lockFailed) { dragging = true; return; }
  if (!document.pointerLockElement && !lockFailed) { requestLock(); return; }
  keys.add('Mouse0');
  audio.unlock();
});
addEventListener('mouseup', e => { if (e.button === 2) dragging = false; keys.delete('Mouse0'); });
canvas.addEventListener('contextmenu', e => e.preventDefault());

addEventListener('keydown', e => {
  if (mode === 'play' && !['F5', 'F12'].includes(e.code)) e.preventDefault();
  if (e.code === 'Escape' && lockFailed) { if (mode === 'play') pause(); return; }
  if (mode !== 'play') return;
  keys.add(e.code);
  const h = game.human;
  if (e.repeat) return;
  if (e.code === 'Tab') hud.scoreboard(true);
  if (e.code === 'KeyG') game.spawnPiece();
  if (e.code === 'Backquote') $('debug').hidden = !$('debug').hidden;
  if (h?.alive) {
    if (e.code === 'Digit1') h.input.weapon = 'rifle';
    if (e.code === 'Digit2') h.input.weapon = 'pistol';
  } else if (e.code === 'Space') specIndex++;
  if (e.code === 'Enter' && game.matchOver) start();
});
addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'Tab') hud.scoreboard(false); });
addEventListener('blur', () => keys.clear());

$('startBtn').onclick = start;
$('resume').onclick = resume;

function humanInput() {
  const h = game.human;
  if (!h) return;
  const i = h.input;
  if (mode !== 'play') { i.f = i.r = 0; i.jump = i.fire = i.use = i.reload = i.crouch = i.walk = false; return; }
  i.f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  i.r = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  i.jump = keys.has('Space');
  i.crouch = keys.has('ControlLeft') || keys.has('KeyC');
  i.walk = keys.has('ShiftLeft');
  i.fire = keys.has('Mouse0');
  i.use = keys.has('KeyE');
  i.reload = keys.has('KeyR');
}

function chooseView(now) {
  const h = game.human;
  if (!h) {
    const t = now / 1000 * 0.12;
    const cx = W * CELL / 2, cz = D * CELL / 2;
    const x = cx + Math.sin(t) * 62, z = cz + Math.cos(t) * 62, y = 92;
    const yaw = Math.atan2(x - cx, z - cz);
    return { mode: 'orbit', x, y, z, yaw, pitch: -0.95, actor: null };
  }
  if (h.alive) {
    const e = eyePos(h);
    return { mode: 'first', x: e.x, y: e.y, z: e.z, yaw: h.yaw, pitch: h.pitch + h.recoil, actor: h, reloading: h.reloadT > 0 };
  }
  const mates = game.alive(h.team);
  const pool = mates.length ? mates : game.actors.filter(a => a.alive);
  if (pool.length) {
    const t = pool[specIndex % pool.length];
    const e = eyePos(t);
    return { mode: 'follow', x: e.x + Math.sin(t.yaw) * 3.2, y: e.y + 1.1, z: e.z + Math.cos(t.yaw) * 3.2, yaw: t.yaw, pitch: t.pitch - 0.22, actor: t };
  }
  const e = eyePos(h);
  return { mode: 'follow', x: e.x, y: e.y + 2, z: e.z, yaw: h.yaw, pitch: -0.5, actor: h };
}

let last = performance.now(), fpsT = 0, frames = 0, fps = 0;

function advance(dt) {
  accumulator = Math.min(accumulator + dt, 0.25);
  while (accumulator >= TICK) {
    humanInput();
    if (mode !== 'pause') game.step(TICK);
    accumulator -= TICK;
  }
  if (mode === 'menu' && game.matchOver) menuGame();
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  advance(dt);
  const view = chooseView(now);
  for (const e of game.drainEvents()) {
    renderer.handleEvent(e, view.actor);
    hud.event(e);
    if (mode === 'play') audio.event(e, view.actor);
  }
  renderer.update(dt, view);
  hud.update(dt, game.human?.alive ? game.human : view.actor);
  frames++; fpsT += dt;
  if (fpsT > 0.5) {
    fps = Math.round(frames / fpsT); frames = 0; fpsT = 0;
    if (!$('debug').hidden) $('debug').textContent = `fps ${fps}  draws ${renderer.r.info.render.calls}  pieces ${game.piecesLanded}  lines ${game.linesCleared}  state ${game.state}  site ${game.targetSite}  seed ${game.opts.seed}`;
  }
}

menuGame();
showMenu(false);
window.__start = start;
requestAnimationFrame(frame);
