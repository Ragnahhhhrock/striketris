// Touch controls: floating move stick, drag-to-look, action buttons, block steer pad.
// Buttons feed the same key codes the keyboard uses, so main.js has one input path.
const $ = id => document.getElementById(id);
const capture = (el, id) => { try { el.setPointerCapture(id); } catch { /* pointer already gone */ } };

export const isTouch = () =>
  matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');

const STICK_R = 54;      // px of travel for full speed
const DEAD = 0.12;
const LOOK_SENS = 1.25;  // multiplier on the mouse sensitivity

// main.js sets <body data-ctl="play|follow|free"> and data-pad="steer", data-steerable="1"; CSS shows groups from those.
const BUTTONS = [
  // [id, label, code, group, hold]
  ['tFire', 'Fire', 'Mouse0', 'play', true],
  ['tJump', 'Jump', 'Space', 'play', true],
  ['tUse', 'Use', 'KeyE', 'play', true],
  ['tReload', 'Reload', 'KeyR', 'play', true],
  ['tCrouch', 'Crouch', 'KeyC', 'play', true],
  ['tSwap', 'Swap', '@swap', 'play', false],
  ['tScores', 'Scores', 'Tab', 'all', true],
  ['tSteer', 'Steer', '@steer', 'steerable', false],
  ['tUp', '▲', 'ArrowUp', 'steer', false],
  ['tDown', '▼', 'ArrowDown', 'steer', false],
  ['tLeft', '◀', 'ArrowLeft', 'steer', false],
  ['tRight', '▶', 'ArrowRight', 'steer', false],
  ['tRotL', '↺', 'KeyZ', 'steer', false],
  ['tRotR', '↻', 'KeyX', 'steer', false],
  ['tFlip', 'Flip', 'KeyV', 'steer', false],
  ['tTumble', 'Tumble', 'KeyB', 'steer', false],
  ['tDrop', 'Drop', 'Enter', 'steer', false],
  ['tNext', 'Next', 'KeyE', 'follow', false],
  ['tPrev', 'Prev', 'KeyQ', 'follow', false],
  ['tCam', 'Camera', 'KeyF', 'specall', false],
  ['tPause', 'Pause', 'KeyP', 'specall', false],
  ['tUpFly', 'Up', 'Space', 'free', true],
  ['tDownFly', 'Down', 'KeyC', 'free', true],
  ['tFast', 'Fast', 'ShiftLeft', 'free', true],
];

export class TouchControls {
  // api: { key(code, down), look(dx, dy), pause(), swap(), toggleSteer() }
  constructor(api) {
    this.api = api;
    this.move = { f: 0, r: 0 };
    this.enabled = isTouch();
    if (!this.enabled) return;
    document.body.classList.add('touch');
    this.build();
  }

  build() {
    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = `
      <div id="tLook"></div>
      <div id="tStickZone"><div id="tStick"><i></i></div></div>
      <button id="tMenu" aria-label="Menu">II</button>
      ${BUTTONS.map(([id, label, , group]) => `<button id="${id}" class="tb" data-g="${group}">${label}</button>`).join('')}`;
    document.body.appendChild(root);
    this.stick = $('tStick'); this.knob = this.stick.firstElementChild;

    this.bindLook($('tLook'));
    this.bindStick($('tStickZone'));
    $('tMenu').addEventListener('pointerdown', e => { e.preventDefault(); this.api.pause(); });
    for (const [id, , code, , hold] of BUTTONS) this.bindButton($(id), code, hold);
    // Fire doubles as a look surface so you can aim while shooting with one thumb.
    this.bindFireLook($('tFire'));
    // Stop pinch zoom, double-tap zoom and rubber-banding while playing.
    for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, e => e.preventDefault());
    document.addEventListener('touchmove', e => { if (document.body.dataset.mode === 'play') e.preventDefault(); }, { passive: false });
  }

  bindLook(el) {
    const last = new Map();
    el.addEventListener('pointerdown', e => { capture(el, e.pointerId); last.set(e.pointerId, [e.clientX, e.clientY]); });
    el.addEventListener('pointermove', e => {
      const p = last.get(e.pointerId); if (!p) return;
      this.api.look((e.clientX - p[0]) * LOOK_SENS, (e.clientY - p[1]) * LOOK_SENS);
      last.set(e.pointerId, [e.clientX, e.clientY]);
    });
    const end = e => last.delete(e.pointerId);
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }

  bindFireLook(el) {
    const last = new Map();
    el.addEventListener('pointerdown', e => last.set(e.pointerId, [e.clientX, e.clientY]));
    el.addEventListener('pointermove', e => {
      const p = last.get(e.pointerId); if (!p) return;
      this.api.look((e.clientX - p[0]) * LOOK_SENS, (e.clientY - p[1]) * LOOK_SENS);
      last.set(e.pointerId, [e.clientX, e.clientY]);
    });
    const end = e => last.delete(e.pointerId);
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }

  bindStick(zone) {
    let id = null, ox = 0, oy = 0;
    const set = (x, y) => {
      let dx = x - ox, dy = y - oy;
      const len = Math.hypot(dx, dy), k = len > STICK_R ? STICK_R / len : 1;
      dx *= k; dy *= k;
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / STICK_R, ny = dy / STICK_R, m = Math.hypot(nx, ny);
      if (m < DEAD) { this.move.f = this.move.r = 0; return; }
      const s = Math.min(1, (m - DEAD) / (1 - DEAD)) / m;
      this.move.r = nx * s; this.move.f = -ny * s;
    };
    zone.addEventListener('pointerdown', e => {
      if (id !== null) return;
      id = e.pointerId; capture(zone, id);
      const r = zone.getBoundingClientRect();
      ox = e.clientX; oy = e.clientY;
      this.stick.style.left = `${ox - r.left}px`; this.stick.style.top = `${oy - r.top}px`;
      zone.classList.add('on'); set(ox, oy);
    });
    zone.addEventListener('pointermove', e => { if (e.pointerId === id) set(e.clientX, e.clientY); });
    const end = e => {
      if (e.pointerId !== id) return;
      id = null; zone.classList.remove('on');
      this.move.f = this.move.r = 0; this.knob.style.transform = '';
    };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  }

  bindButton(el, code, hold) {
    const down = new Set();
    const press = e => {
      e.preventDefault(); capture(el, e.pointerId);
      down.add(e.pointerId); el.classList.add('on');
      if (code === '@swap') this.api.swap();
      else if (code === '@steer') this.api.toggleSteer();
      else this.api.key(code, true);
    };
    const release = e => {
      if (!down.delete(e.pointerId)) return;
      if (!down.size) el.classList.remove('on');
      if (code[0] !== '@') this.api.key(code, false);
    };
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release); el.addEventListener('pointercancel', release);
    el.addEventListener('contextmenu', e => e.preventDefault());
    void hold;
  }
}
