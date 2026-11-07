import { CELL, GRID_W as W, GRID_D as D, GRID_H as H, WEAPONS, TEAM } from './config.js';
import { STATIC, EMPTY } from './grid.js';
import { SHAPES, orient } from './pieces.js';
import { SITES } from './map.js';
import { wallsIn, wallsMoving } from './walls.js';
import { eyePos } from './actor.js';
import { SHAPE_TINT } from './render.js';

const $ = id => document.getElementById(id);
const hex = n => '#' + n.toString(16).padStart(6, '0');
const SLOT_KEYS = [['rifle', '1'], ['pistol', '2'], ['rocket', '3']];
const fmt = t => { const s = Math.max(0, Math.ceil(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class Hud {
  constructor() {
    this.mini = $('minimap').getContext('2d');
    this.preview = $('next').getContext('2d');
    this.feedItems = [];
    this.sightT = 0;
    this.spotted = new Set();
    this.lastNext = -1;
    this.goT = 0;
  }
  setGame(game) { this.game = game; this.goT = 0; this.lastNext = -1; this.feedItems = []; $('feed').innerHTML = ''; }

  event(e) {
    if (e.type === 'feed') this.addFeed(e.text);
    if (e.type === 'lines') this.addFeed(`LINE CLEAR  ${e.count} cubes`, true);
    if (e.type === 'roundEnd') this.banner(`${e.winner === TEAM.ATT ? 'Attackers' : 'Defenders'} win the round`, e.reason);
    if (e.type === 'match') this.banner(`${e.winner === TEAM.ATT ? 'Attackers' : 'Defenders'} win the match`, 'Press Esc for the menu');
    if (e.type === 'round') $('banner').hidden = true;
    if (e.type === 'pickup' && e.actor === this.game.human) this.addFeed({ health: 'Picked up health', ammo: 'Picked up ammo', launcher: 'Picked up the Rocket Launcher', rockets: 'Picked up rockets' }[e.what]);
    if (e.type === 'hurt' && e.actor === this.game.human) { const f = $('hurt'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
    if (e.type === 'hurt' && e.by === this.game.human) { const h = $('hitmark'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on'); }
  }
  banner(a, b) { $('banner').hidden = false; $('bannerA').textContent = a; $('bannerB').textContent = b; }
  addFeed(text, big) {
    const d = document.createElement('div');
    d.textContent = text;
    if (big) d.className = 'big';
    $('feed').prepend(d);
    while ($('feed').children.length > 6) $('feed').lastChild.remove();
    setTimeout(() => d.remove(), 6000);
  }

  update(dt, viewer, cam) {
    const g = this.game;
    const a = viewer;
    $('score').textContent = `${g.score.attackers} : ${g.score.defenders}`;
    $('round').textContent = `Round ${g.round}  ·  Lines ${g.linesCleared}`;
    const b = g.bomb;
    let timerText = fmt(g.timer);
    let timerState = '';
    if (g.state === 'freeze') { timerText = fmt(g.timer); timerState = 'freeze'; }
    if (b.state === 'planted') { timerText = fmt(b.fuse); timerState = 'bomb'; }
    $('timer').textContent = timerText;
    $('timer').className = timerState;
    if (a) {
      $('hp').textContent = Math.ceil(a.hp);
      $('hpbar').style.width = `${Math.max(0, a.hp)}%`;
      const w = WEAPONS[a.cur];
      $('weapon').textContent = w.name + (a.hasBomb ? '  +  Bomb' : '');
      $('ammo').textContent = a.reloadT > 0 ? 'Reloading' : `${a.weapons[a.cur]} / ${w.mag}`;
      // Weapon slots: the ones you carry, the held one lit, a launcher with no rockets greyed.
      const slots = SLOT_KEYS.filter(([id]) => a.weapons[id] !== undefined)
        .map(([id, key]) => `<i class="${id === a.cur ? 'cur' : ''} ${WEAPONS[id].noReload && !a.weapons[id] ? 'empty' : ''}">${key} ${WEAPONS[id].name.split(' ')[0]}</i>`).join('');
      if (slots !== this.slotsHtml) { this.slotsHtml = slots; $('slots').innerHTML = slots; }
      const spread = 6 + Math.hypot(a.vel.x, a.vel.z) * 1.6 + a.shotStreak * 1.4 + a.recoil * 140;
      document.documentElement.style.setProperty('--gap', `${Math.min(40, spread).toFixed(1)}px`);
    }
    const human = g.human;
    let prompt = '';
    if (human?.alive) {
      if (human.hasBomb && g.siteAt(human.pos)) prompt = 'Hold E to plant';
      else if (human.team === TEAM.DEF && b.state === 'planted' && Math.hypot(human.pos.x - b.pos.x, human.pos.y - b.pos.y, human.pos.z - b.pos.z) < 2.2) prompt = 'Hold E to defuse';
    } else if (human) prompt = 'Spectating. Space next player, F free camera';
    if (g.state === 'freeze' && human?.alive) prompt = human.hasBomb ? `You carry the bomb. Sites are marked on the map` : 'Round starts soon';
    $('prompt').textContent = prompt;

    const cd = $('countdown');
    if (g.state === 'freeze') { this.goT = 0.7; cd.hidden = false; cd.className = ''; cd.textContent = Math.max(1, Math.ceil(g.timer)); }
    else if (this.goT > 0) { this.goT -= dt; cd.hidden = false; cd.className = 'go'; cd.textContent = 'GO'; }
    else cd.hidden = true;

    const danger = g.dangerColumns();
    const under = human?.alive && danger && danger.has(Math.floor(human.pos.x / CELL) + Math.floor(human.pos.z / CELL) * W);
    $('warn').hidden = !under;

    const wl = $('walls'), live = g.state === 'live';
    const soon = wallsIn(g), closing = wallsMoving(g);
    wl.hidden = !live || (!closing && soon > 10);
    wl.className = closing ? 'moving' : '';
    wl.textContent = closing ? 'The walls are closing in' : `Walls close in ${Math.ceil(soon)}`;

    const prog = g.plantProgress || g.defuseProgress;
    const who = g.planter === human || g.defuser === human;
    $('progress').hidden = !(prog > 0 && who);
    $('progressbar').style.width = `${prog * 100}%`;

    if (this.lastNext !== g.nextShape) { this.lastNext = g.nextShape; this.drawNext(g.nextShape); }

    this.sightT -= dt;
    if (this.sightT <= 0 && human) {
      this.sightT = 0.2;
      this.spotted.clear();
      const eye = eyePos(human);
      for (const t of g.actors) {
        if (t.team === human.team || !t.alive) continue;
        if (g.grid.los(eye, { x: t.pos.x, y: t.pos.y + 1.4, z: t.pos.z })) this.spotted.add(t);
      }
    }
    this.drawMini(cam ?? a);
  }

  drawNext(id) {
    const c = this.preview, s = 16;
    c.clearRect(0, 0, 80, 64);
    const cells = orient(id, 0, 0);
    const mw = Math.max(...cells.map(k => k.x)) + 1, mh = Math.max(...cells.map(k => k.z)) + 1;
    const ox = (80 - mw * s) / 2, oy = (64 - mh * s) / 2;
    c.fillStyle = hex(SHAPE_TINT[id]);
    c.strokeStyle = 'rgba(0,0,0,.5)';
    for (const k of cells) { c.fillRect(ox + k.x * s, oy + k.z * s, s, s); c.strokeRect(ox + k.x * s + .5, oy + k.z * s + .5, s - 1, s - 1); }
    $('nextName').textContent = SHAPES[id].name;
  }

  drawMini(viewer) {
    const g = this.game, c = this.mini, s = 6;
    c.fillStyle = '#2b2d30'; c.fillRect(0, 0, W * s, D * s);
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      if (g.grid.get(x, 0, z) === STATIC) continue;
      let top = -1;
      for (let y = H - 1; y >= 0; y--) if (g.grid.get(x, y, z) !== EMPTY) { top = y; break; }
      c.fillStyle = top < 0 ? '#8c9096' : hex(SHAPE_TINT[g.grid.get(x, top, z) - 1]);
      c.fillRect(x * s, z * s, s, s);
    }
    c.font = '700 13px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const site of Object.values(SITES)) {
      c.fillStyle = 'rgba(160,30,25,.85)';
      c.fillText(site.name, (site.centre[0] + .5) * s, (site.centre[1] + .5) * s);
    }
    // Items still on the map: green cross for health, yellow square for ammo, red triangle for a launcher.
    const k = s / CELL;
    for (const p of g.pickups) {
      if (!p.up) continue;
      const x = p.x * k, z = p.z * k;
      if (p.kind === 'health') { c.fillStyle = '#5dff7d'; c.fillRect(x - 4, z - 1.5, 8, 3); c.fillRect(x - 1.5, z - 4, 3, 8); }
      else if (p.kind === 'ammo') { c.fillStyle = '#ffd76a'; c.fillRect(x - 3, z - 3, 6, 6); }
      else { c.fillStyle = '#ff4a3d'; c.beginPath(); c.moveTo(x, z - 5); c.lineTo(x + 5, z + 4); c.lineTo(x - 5, z + 4); c.closePath(); c.fill(); }
    }
    // Floor the walls have taken, shaded red.
    const o = g.grid.openBounds();
    if (o && g.grid.walls[0].inset > 1e-3) {
      const k = s / CELL, X = W * s, Z = D * s;
      c.fillStyle = 'rgba(255,74,61,.55)';
      c.fillRect(0, 0, o.x0 * k, Z); c.fillRect(o.x1 * k, 0, X - o.x1 * k, Z);
      c.fillRect(0, 0, X, o.z0 * k); c.fillRect(0, o.z1 * k, X, Z - o.z1 * k);
    }
    if (g.piece) {
      c.fillStyle = Math.sin(g.piece.t * 12) > 0 ? hex(SHAPE_TINT[g.piece.shapeId]) : '#ffffff';
      for (const k of g.piece.cells) c.fillRect((g.piece.x + k.x) * s, (g.piece.z + k.z) * s, s, s);
    }
    const m = s / CELL;
    if (g.bomb.pos && g.bomb.state !== 'carried') { c.fillStyle = '#fff'; c.fillRect(g.bomb.pos.x * m - 3, g.bomb.pos.z * m - 3, 6, 6); c.fillStyle = '#d00'; c.fillRect(g.bomb.pos.x * m - 1.5, g.bomb.pos.z * m - 1.5, 3, 3); }
    const human = g.human;
    for (const a of g.actors) {
      if (!a.alive) continue;
      const friend = !human || a.team === human.team || this.revealAll;
      if (!friend && !this.spotted.has(a)) continue;
      c.fillStyle = a.team === TEAM.ATT ? '#e8953f' : '#4f9be8';
      c.beginPath(); c.arc(a.pos.x * m, a.pos.z * m, 3, 0, 7); c.fill();
    }
    if (viewer?.alive) {
      const x = viewer.pos.x * m, z = viewer.pos.z * m, y = viewer.yaw;
      c.fillStyle = '#fff'; c.strokeStyle = '#000';
      c.beginPath();
      c.moveTo(x - Math.sin(y) * 7, z - Math.cos(y) * 7);
      c.lineTo(x - Math.sin(y + 2.5) * 5, z - Math.cos(y + 2.5) * 5);
      c.lineTo(x - Math.sin(y - 2.5) * 5, z - Math.cos(y - 2.5) * 5);
      c.closePath(); c.fill(); c.stroke();
    }
  }

  scoreboard(show) {
    const el = $('board');
    el.hidden = !show;
    if (!show) return;
    const row = a => `<tr class="${a.alive ? '' : 'dead'} ${a.isHuman ? 'me' : ''}"><td>${a.name}</td><td>${a.kills}</td><td>${a.deaths}</td></tr>`;
    const table = (t, title) => `<div><h3 class="${t}">${title}</h3><table><tr><th>Name</th><th>K</th><th>D</th></tr>${this.game.actors.filter(a => a.team === t).map(row).join('')}</table></div>`;
    el.innerHTML = table(TEAM.ATT, 'Attackers') + table(TEAM.DEF, 'Defenders');
  }
}
