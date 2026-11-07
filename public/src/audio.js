// Placeholder sound: everything is synthesised, nothing to license or load.
export class Audio {
  constructor() { this.ctx = null; }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const n = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, n, n);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    // iOS (Safari and Chrome) mutes Web Audio when the ringer switch is on silent.
    // Declaring a playback session, plus a looping silent <audio> element, routes it as media.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
    if (!this.keep) {
      try {
        const el = document.createElement('audio');
        el.src = 'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
        el.loop = true; el.setAttribute('playsinline', ''); el.preload = 'auto';
        this.keep = el;
      } catch {}
    }
    if (this.keep) this.keep.play().catch(() => {});
    this.ctx.resume();
    // Play one silent sample inside the gesture so iOS fully unlocks the context.
    const b = this.ctx.createBufferSource();
    b.buffer = this.ctx.createBuffer(1, 1, 22050); b.connect(this.ctx.destination); b.start(0);
    if (!this.hooked) {
      this.hooked = true;
      // iOS suspends or 'interrupts' the context on tab switch, calls and lock; re-wake on next input.
      const wake = () => { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); if (this.keep && this.keep.paused) this.keep.play().catch(() => {}); };
      for (const t of ['touchend', 'pointerup', 'click', 'keydown']) addEventListener(t, wake, true);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
    }
  }
  burst(vol, freq, len, type = 'lowpass') {
    if (!this.ctx || vol < 0.01) return;
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + len);
    s.connect(f).connect(g).connect(c.destination);
    s.start(0, Math.random() * 0.5, len + 0.05);
  }
  tone(vol, f0, f1, len, type = 'sine') {
    if (!this.ctx || vol < 0.01) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, c.currentTime); o.frequency.exponentialRampToValueAtTime(f1, c.currentTime + len);
    g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + len);
    o.connect(g).connect(c.destination);
    o.start(); o.stop(c.currentTime + len);
  }
  event(e, viewer) {
    const at = p => (viewer && p ? Math.max(0, 1 - Math.hypot(viewer.pos.x - p.x, viewer.pos.z - p.z) / 70) : 0.4);
    switch (e.type) {
      case 'shot': {
        const v = e.actor === viewer ? 1 : at(e.from) * 0.65;
        if (e.weapon === 'pistol') {
          // Hand cannon: a deep boom, a sharp crack, a chest thump and a room tail.
          this.burst(0.5 * v, 1500, 0.28);
          this.burst(0.3 * v, 4200, 0.05, 'highpass');
          this.tone(0.55 * v, 230, 42, 0.2);
          this.burst(0.12 * v, 480, 0.75);
        } else {
          // Rifle: a tight, bright crack with a light thud so a long burst stays readable.
          this.burst(0.3 * v, 3200, 0.07, 'highpass');
          this.burst(0.22 * v, 1900, 0.11);
          this.tone(0.3 * v, 160 + Math.random() * 20, 55, 0.08);
        }
        break;
      }
      case 'rocket': {
        // Launch: a hollow thump with a hiss of exhaust.
        const v = e.actor === viewer ? 1 : at(e.from) * 0.7;
        this.tone(0.5 * v, 150, 38, 0.3, 'sawtooth');
        this.burst(0.34 * v, 900, 0.36);
        this.burst(0.18 * v, 2600, 0.2, 'highpass');
        break;
      }
      case 'rocketExplode': {
        const v = Math.max(0.2, at(e.pos));
        this.burst(0.85 * v, 420, 1.1);
        this.tone(0.8 * v, 90, 22, 0.9);
        this.burst(0.3 * v, 3200, 0.12, 'highpass');
        break;
      }
      case 'pickup':
        if (e.actor !== viewer) break;
        if (e.what === 'health') { this.tone(0.16, 520, 780, 0.12); setTimeout(() => this.tone(0.16, 780, 1040, 0.16), 90); }
        else if (e.what === 'ammo') { this.burst(0.14, 4200, 0.05, 'highpass'); this.tone(0.14, 300, 220, 0.09, 'square'); setTimeout(() => this.tone(0.14, 300, 220, 0.09, 'square'), 80); }
        else { this.tone(0.2, 220, 440, 0.25, 'sawtooth'); this.tone(0.14, 330, 660, 0.3); }
        break;
      case 'blocksBroken': { const v = Math.max(0.2, at(e.pos)); this.burst(0.5 * v, 1400, 0.35); this.tone(0.25 * v, 220, 80, 0.3, 'square'); break; }
      case 'pickupSpawn': this.tone(0.05 * at(e.pickup), 900, 1300, 0.12); break;
      case 'ricochet': {
        const v = Math.max(at(e.pos), e.actor === viewer ? 0.5 : 0);
        this.tone(0.11 * v, 3000 + Math.random() * 900, 800, 0.24, 'sawtooth');
        this.burst(0.14 * v, 5200, 0.06, 'highpass');
        break;
      }
      case 'adjust': this.tone(e.by === 'ai' ? 0.03 : 0.08, 520, 700, 0.05, 'square'); break;
      case 'blocked': this.tone(0.06, 150, 110, 0.08, 'sawtooth'); break;
      case 'telegraph': this.tone(0.1, 700, 1100, 0.5, 'square'); break;
      case 'land': this.burst(Math.max(0.15, at(e.pos)) * 0.9, 240, 0.8); this.tone(at(e.pos) * 0.7, 90, 28, 0.6); break;
      case 'lines': this.tone(0.25, 300, 1400, 0.55, 'sawtooth'); this.burst(0.4, 900, 0.5); break;
      case 'hurt': if (e.by === viewer) this.tone(0.14, e.head ? 1700 : 1100, e.head ? 1500 : 900, 0.07); break;
      case 'planted': this.tone(0.2, 880, 880, 0.15, 'square'); break;
      case 'explode': this.burst(0.9, 500, 1.6); this.tone(0.8, 70, 20, 1.4); break;
      case 'reload': if (e.actor === viewer) this.burst(0.08, 3000, 0.08, 'highpass'); break;
    }
  }
}
