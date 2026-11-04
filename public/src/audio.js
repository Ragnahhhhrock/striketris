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
    this.ctx.resume();
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
      case 'shot': { const v = e.actor === viewer ? 0.32 : at(e.from) * 0.22; this.burst(v, e.weapon === 'rifle' ? 2400 : 3400, 0.13); break; }
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
