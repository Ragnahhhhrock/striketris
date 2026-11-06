import { TICK, PIECE, CELL, GRID_W as W, GRID_D as D } from './config.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';
import { eyePos } from './actor.js';
import { TouchControls } from './touch.js?v=4';

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
let camFree = false;     // free-fly camera while spectating or dead
let simPaused = false;   // only honoured while spectating
let timeScale = 1;       // only honoured while spectating
let overT = 0;
let lastView = null;
const free = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
const keys = new Set();
const SENS = 0.0022;
let steerOpen = false;   // touch: show the block steer pad instead of the combat buttons
const SPEEDS = { Digit1: 0.25, Digit2: 0.5, Digit3: 1, Digit4: 2.5 };

const clamp1 = v => Math.max(-1, Math.min(1, v));
const touch = new TouchControls({
  key: (code, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true, cancelable: true })),
  look: (dx, dy) => look(dx, dy),
  pause: () => pause(),
  swap: () => { const h = game?.human; if (mode === 'play' && h?.alive) h.input.weapon = h.cur === 'rifle' ? 'pistol' : 'rifle'; },
  toggleSteer: () => { steerOpen = !steerOpen; },
});

function resetFree() { Object.assign(free, { x: W * CELL / 2, y: 78, z: D * CELL / 2 + 46, yaw: 0, pitch: -0.85 }); }
resetFree();

window.__renderer = renderer;
function load(g) { game = g; renderer.setGame(g); hud.setGame(g); window.__game = g; }

function menuGame() { load(new Game({ human: false, teamSize: 3, seed: Number(params.get('seed')) || undefined, skill: 'normal' })); }

function start(keep) {
  audio.unlock();
  const m = $('optMode').value;
  const interval = Number($('optPieces').value);
  load(new Game({
    human: m !== 'spectate',
    god: m === 'god',
    humanTeam: $('optSide').value,
    teamSize: Number($('optSize').value),
    skill: $('optSkill').value,
    pieceInterval: interval || PIECE.interval,
    pieces: interval > 0,
    seed: Number(params.get('seed')) || undefined,
  }));
  if (touch.enabled) goFullscreen();
  if (keep !== true) { camFree = m === 'spectate'; resetFree(); timeScale = 1; }
  simPaused = false; overT = 0;
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

function goFullscreen() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.({ navigationUI: 'hide' })?.catch(() => {});
    screen.orientation?.lock?.('landscape')?.catch(() => {});
  } catch { /* iOS Safari has no fullscreen on phones; the page still plays */ }
}

function requestLock() {
  if (touch.enabled) return;
  if (lockFailed) { $('lockNote').hidden = false; return; }
  try {
    const p = canvas.requestPointerLock();
    if (p?.catch) p.catch(() => { lockFailed = true; $('lockNote').hidden = false; });
  } catch { lockFailed = true; $('lockNote').hidden = false; }
}

// Anyone not playing a body (spectating, dead, or invulnerable) can steer the falling block.
const controllable = () => mode === 'play' && (!game.human || !game.human.alive || game.opts.god);
function snap(x, z) { return Math.abs(x) > Math.abs(z) ? [Math.sign(x), 0] : [0, Math.sign(z)]; }
function blockCmd(code) {
  const yaw = lastView ? lastView.yaw : 0;
  const [fx, fz] = snap(-Math.sin(yaw), -Math.cos(yaw));
  const [rx, rz] = [-fz, fx];
  switch (code) {
    case 'ArrowUp': return { dx: fx, dz: fz };
    case 'ArrowDown': return { dx: -fx, dz: -fz };
    case 'ArrowRight': return { dx: rx, dz: rz };
    case 'ArrowLeft': return { dx: -rx, dz: -rz };
    case 'KeyZ': return { rot: -1 };
    case 'KeyX': return { rot: 1 };
    case 'KeyV': return { mirror: true };
    case 'KeyB': return { tumble: 1 };
    case 'Enter': return { fast: true };
  }
  return null;
}

const freeActive = () => mode === 'play' && camFree && (!game.human || !game.human.alive);

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && mode === 'play' && !lockFailed) pause();
});
document.addEventListener('pointerlockerror', () => { lockFailed = true; $('lockNote').hidden = false; });

function look(dx, dy) {
  if (mode !== 'play') return;
  const h = game.human;
  const t = freeActive() ? free : h?.alive ? h : null;
  if (!t) return;
  t.yaw -= dx * SENS;
  t.pitch = Math.max(-1.5, Math.min(1.5, t.pitch - dy * SENS));
}
document.addEventListener('mousemove', e => {
  if (mode !== 'play') return;
  if (!document.pointerLockElement && !(lockFailed && dragging)) return;
  look(e.movementX, e.movementY);
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
  if (controllable()) {
    const c = blockCmd(e.code);
    if (c && (!e.repeat || c.dx || c.dz)) game.adjustPiece(c);
  }
  if (e.repeat) return;
  if (e.code === 'Tab') hud.scoreboard(true);
  if (e.code === 'KeyG' && game.opts.pieces && !game.piece) game.spawnPiece();
  if (e.code === 'Backquote') $('debug').hidden = !$('debug').hidden;
  if (h?.alive) {
    if (e.code === 'Digit1') h.input.weapon = 'rifle';
    if (e.code === 'Digit2') h.input.weapon = 'pistol';
  } else {
    if (e.code === 'KeyF') {
      if (!camFree && lastView) Object.assign(free, { x: lastView.x, y: lastView.y, z: lastView.z, yaw: lastView.yaw, pitch: lastView.pitch });
      camFree = !camFree;
    }
    if (e.code === 'KeyP') simPaused = !simPaused;
    if (SPEEDS[e.code]) timeScale = SPEEDS[e.code];
    if (!camFree) {
      if (e.code === 'Space' || e.code === 'KeyE') specIndex++;
      if (e.code === 'KeyQ') specIndex--;
    }
  }
  if (e.code === 'Enter' && game.matchOver) start();
});
addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'Tab') hud.scoreboard(false); });
addEventListener('blur', () => keys.clear());

$('startBtn').onclick = () => start();
$('resume').onclick = resume;

function humanInput() {
  const h = game.human;
  if (!h) return;
  const i = h.input;
  if (mode !== 'play') { i.f = i.r = 0; i.jump = i.fire = i.use = i.reload = i.crouch = i.walk = false; return; }
  i.f = clamp1((keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) + touch.move.f);
  i.r = clamp1((keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + touch.move.r);
  i.jump = keys.has('Space');
  i.crouch = keys.has('ControlLeft') || keys.has('KeyC');
  i.walk = keys.has('ShiftLeft');
  i.fire = keys.has('Mouse0');
  i.use = keys.has('KeyE');
  i.reload = keys.has('KeyR');
}

// Free camera ignores walls and the sim clock, so it keeps flying while time is paused or slowed.
function updateFree(dt) {
  const sp = 28 * (keys.has('ShiftLeft') ? 3 : 1) * dt;
  const cp = Math.cos(free.pitch);
  const fx = -Math.sin(free.yaw) * cp, fy = Math.sin(free.pitch), fz = -Math.cos(free.yaw) * cp;
  const rx = Math.cos(free.yaw), rz = -Math.sin(free.yaw);
  const f = clamp1((keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) + touch.move.f);
  const r = clamp1((keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + touch.move.r);
  const u = (keys.has('Space') ? 1 : 0) - (keys.has('KeyC') ? 1 : 0);
  free.x += (fx * f + rx * r) * sp;
  free.y += (fy * f + u) * sp;
  free.z += (fz * f + rz * r) * sp;
  free.y = Math.max(1, Math.min(220, free.y));
}

function chooseView(now) {
  const h = game.human;
  if (mode === 'menu') {
    const t = now / 1000 * 0.12;
    const cx = W * CELL / 2, cz = D * CELL / 2;
    const x = cx + Math.sin(t) * 62, z = cz + Math.cos(t) * 62, y = 92;
    return { mode: 'orbit', x, y, z, yaw: Math.atan2(x - cx, z - cz), pitch: -0.95, actor: null };
  }
  if (h?.alive) {
    const e = eyePos(h);
    return { mode: 'first', x: e.x, y: e.y, z: e.z, yaw: h.yaw + h.recoilYaw, pitch: h.pitch + h.recoil, actor: h, reloading: h.reloadT > 0 };
  }
  if (!camFree) {
    const mates = h ? game.alive(h.team) : [];
    const pool = mates.length ? mates : game.actors.filter(a => a.alive);
    if (pool.length) {
      const n = pool.length, t = pool[((specIndex % n) + n) % n];
      const e = eyePos(t);
      return { mode: 'follow', x: e.x + Math.sin(t.yaw) * 3.2, y: e.y + 1.1, z: e.z + Math.cos(t.yaw) * 3.2, yaw: t.yaw, pitch: t.pitch - 0.22, actor: t };
    }
  }
  return { mode: 'free', x: free.x, y: free.y, z: free.z, yaw: free.yaw, pitch: free.pitch, actor: null };
}

let last = performance.now(), fpsT = 0, frames = 0, fps = 0, specShown = '';

function advance(dt) {
  const spectating = mode === 'play' && !game.human?.alive;
  accumulator = Math.min(accumulator + dt * (spectating ? timeScale : 1), 0.5);
  while (accumulator >= TICK) {
    humanInput();
    if (mode !== 'pause' && !(spectating && simPaused)) game.step(TICK);
    accumulator -= TICK;
  }
  if (mode === 'menu' && game.matchOver) menuGame();
  // A spectate-only session rolls into a fresh match instead of stopping.
  if (mode === 'play' && !game.human && game.matchOver) { overT += dt; if (overT > 6) start(true); }
}

function specText(view) {
  const h = game.human;
  if (mode !== 'play') return ['', ''];
  if (h?.alive) return game.opts.god ? ['Invulnerable', 'Blocks and bullets cannot hurt you'] : ['', ''];
  const who = h ? 'Eliminated' : 'Spectating';
  const speed = simPaused ? 'Paused' : `${timeScale}x`;
  const cam = view.mode === 'free' ? 'Free camera' : `Following ${view.actor?.name ?? ''}`;
  const hint = touch.enabled
    ? (view.mode === 'free' ? 'Stick flies, drag to look, Up and Down change height' : 'Next and Prev switch player, Camera goes free')
    : view.mode === 'free'
    ? 'WASD fly, Space up, C down, Shift fast, F follow, 1-4 speed, P pause, G new block'
    : 'Space or E next, Q previous, F free camera, 1-4 speed, P pause';
  return [`${who}: ${cam}, ${speed}`, hint];
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  advance(dt);
  if (freeActive()) updateFree(dt);
  const view = chooseView(now);
  lastView = view;
  for (const e of game.drainEvents()) {
    renderer.handleEvent(e, view.actor);
    hud.event(e);
    if (mode === 'play') audio.event(e, view.actor ?? { pos: { x: view.x, z: view.z } });
  }
  renderer.update(dt, view);
  const h = game.human;
  hud.revealAll = !h || (!h.alive && camFree);
  const cam = view.mode === 'free' ? { alive: true, pos: { x: view.x, z: view.z }, yaw: view.yaw } : null;
  hud.update(dt, h?.alive ? h : view.actor, cam);
  document.body.dataset.view = view.mode;
  const steerable = !!(controllable() && game.piece && game.piece.drop >= 4.5);
  $('ctrlbar').hidden = !steerable || touch.enabled;
  if (touch.enabled) {
    if (!steerable) steerOpen = false;
    const b = document.body.dataset;
    b.ctl = mode !== 'play' ? '' : h?.alive ? 'play' : view.mode === 'free' ? 'free' : 'follow';
    b.steerable = steerable ? '1' : '';
    b.pad = steerable && steerOpen ? 'steer' : '';
  }
  const [a, b] = specText(view);
  if (a + b !== specShown) { specShown = a + b; $('specState').textContent = a; $('specHint').textContent = b; $('specbar').hidden = !a; }
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
