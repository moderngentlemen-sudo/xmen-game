// Synthesized placeholder audio (no sound files). Timing cues matter more than fidelity: every threat
// category, perfect defence and each hero's power have a distinct, unmistakable sound. Holds hum while they
// build: Cyclops's visor, Wolverine's coiling Drill Claw, Jean's grip.
import { SETTINGS } from './settings.js';
import { HEROES } from './sim/config.js';

export class Sound {
  constructor() { this.ctx = null; this.last = {}; this.hums = new Map(); }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.comp = this.ctx.createDynamicsCompressor();
        this.comp.threshold.value = -12; this.comp.knee.value = 8; this.comp.ratio.value = 5; this.comp.attack.value = 0.003; this.comp.release.value = 0.2;
        this.master = this.ctx.createGain(); this.master.connect(this.comp); this.comp.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 0.5, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noiseBuf = buf;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { this.ctx = null; }
  }

  tone(f, f2, dur, type = 'sine', gain = 0.1, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * SETTINGS.volume), t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  noise(dur, freq, gain = 0.1, type = 'bandpass', f2 = 0, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t0 = c.currentTime + delay, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; fl.type = type; fl.frequency.setValueAtTime(freq, t0);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(Math.max(0.0002, gain * SETTINGS.volume), t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl); fl.connect(g); g.connect(this.master); s.start(t0); s.stop(t0 + dur + 0.02);
  }
  limit(key, gap) {
    const now = this.ctx ? this.ctx.currentTime : 0;
    if (this.last[key] && now - this.last[key] < gap) return false;
    this.last[key] = now; return true;
  }

  play(ev) {
    if (!this.ctx || SETTINGS.volume <= 0) return;
    switch (ev.type) {
      // ---- Heroes ----
      case 'optic': {
        const a = ev.a || 0;
        if (a < 0.2 && !this.limit('optic', 0.03)) break;
        this.tone(1500 - a * 500, 260, 0.11 + 0.12 * a, 'sawtooth', 0.045 + 0.05 * a); this.tone(2900, 800, 0.09, 'sine', 0.035);
        this.noise(0.08 + 0.12 * a, 2400, 0.05 + 0.08 * a, 'bandpass', 900); if (a > 0.6) this.tone(110, 40, 0.4, 'sine', 0.18);
        if (ev.rapport) this.tone(660, 1320, 0.2, 'sine', 0.04);
        break;
      }
      case 'apertureOpen': this.tone(500, 900, 0.08, 'sine', 0.03); break;
      case 'overheat': this.noise(0.4, 3000, 0.08, 'highpass', 800); this.tone(400, 150, 0.4, 'sawtooth', 0.04); break;
      case 'cooled': this.tone(700, 1100, 0.08, 'sine', 0.03); break;
      case 'vault': this.noise(0.2, 600, 0.14, 'lowpass'); this.tone(90, 40, 0.25, 'sine', 0.15); break;
      case 'called': this.tone(1320, 0, 0.08, 'square', 0.04); this.tone(1760, 0, 0.12, 'square', 0.035, 0.08); break;
      case 'swing': {
        if (!this.limit('swing', 0.04)) break;
        if (ev.hero === 'wolverine') {
          if (ev.move === 'g1' && this.limit('snikt' + ev.id, 1.2)) { this.tone(3300, 0, 0.05, 'square', 0.028); this.tone(4900, 0, 0.07, 'triangle', 0.024, 0.04); this.noise(0.05, 7000, 0.05, 'highpass', 0, 0.02); }
          this.noise(0.08, 4200, 0.08, 'bandpass', 8000); this.tone(1800, 900, 0.05, 'triangle', 0.02);
        } else if (ev.hero === 'jean') { this.tone(500, 900, 0.1, 'sine', 0.04); this.noise(0.08, 2400, 0.04, 'bandpass', 900); }
        else { this.noise(0.07, 1200, 0.08, 'bandpass', 3000); this.tone(260, 160, 0.06, 'triangle', 0.03); }
        break;
      }
      case 'charged': this.tone(520, 1040, 0.12, 'sine', 0.06); break;
      case 'drill': { const k = ev.tier || 0; this.noise(0.2 + k * 0.05, 1800, 0.14 + 0.04 * k, 'bandpass', 6500); this.tone(1100, 2400, 0.1, 'sine', 0.05); this.tone(140, 60, 0.14, 'sine', 0.06 + 0.03 * k); break; }
      case 'drillLevel': this.tone(600 + 300 * (ev.level || 2), 0, 0.1, 'square', 0.03); break;
      case 'berserk': this.tone(90, 60, 0.5, 'sawtooth', 0.12); this.tone(135, 80, 0.5, 'sawtooth', 0.07); this.noise(0.5, 600, 0.12, 'lowpass', 200); break;
      case 'berserkEnd': this.tone(300, 150, 0.25, 'sine', 0.04); break;
      case 'healing': this.tone(880, 1320, 0.22, 'sine', 0.025); break;
      case 'pounce': this.noise(0.12, 1400, 0.09); this.tone(300, 620, 0.1, 'triangle', 0.05); break;
      case 'tkGrab': this.tone(330, 660, 0.18, 'sine', 0.06); this.tone(495, 990, 0.2, 'triangle', 0.03, 0.03); break;
      case 'tkThrow': this.noise(0.25, 900, 0.14, 'bandpass', 3500); this.tone(660, 220, 0.2, 'sine', 0.06); break;
      case 'tkMiss': this.tone(300, 200, 0.08, 'sine', 0.03); break;
      case 'anchored': this.tone(200, 0, 0.12, 'square', 0.05); this.tone(150, 0, 0.12, 'square', 0.04, 0.08); break;
      case 'shield': this.tone(660, 1320, 0.2, 'sine', 0.06); this.tone(990, 1980, 0.24, 'triangle', 0.035, 0.03); this.noise(0.25, 5000, 0.05, 'highpass', 2000); break;
      case 'shieldBlock': if (this.limit('sblock', 0.05)) this.tone(1100, 0, 0.06, 'triangle', 0.06); break;
      case 'shieldDown': this.tone(990, 440, 0.2, 'sine', 0.03); break;
      // ---- Movement and defence ----
      case 'jump': if (this.limit('jump', 0.05)) this.tone(280, 460, 0.09, 'triangle', 0.05); break;
      case 'djump': this.tone(380, 640, 0.09, 'triangle', 0.05); break;
      case 'walljump': this.noise(0.08, 1400, 0.07); this.tone(300, 620, 0.1, 'triangle', 0.05); break;
      case 'land': if (ev.vy < -14 && this.limit('land', 0.08)) { this.noise(0.12, 400, 0.08 + Math.min(0.1, (-ev.vy - 14) * 0.01), 'lowpass'); } break;
      case 'evade': this.noise(0.16, 700, 0.1, 'bandpass', 2600); break;
      case 'perfect': this.tone(1760, 0, 0.22, 'sine', 0.08); this.tone(2637, 0, 0.18, 'sine', 0.06, 0.02); this.noise(0.1, 6000, 0.06, 'highpass'); break;
      // ---- Team ----
      case 'teamup': this.tone(523, 1047, 0.25, 'sawtooth', 0.05); this.tone(659, 1319, 0.28, 'triangle', 0.05, 0.05); this.tone(784, 1568, 0.3, 'triangle', 0.045, 0.1); break;
      case 'fastballThrow': this.noise(0.35, 600, 0.16, 'bandpass', 4000); this.tone(200, 900, 0.3, 'sawtooth', 0.05); break;
      case 'fastballSlam': this.noise(0.45, 260, 0.3, 'lowpass'); this.tone(80, 35, 0.45, 'sine', 0.25); this.noise(0.12, 4000, 0.1, 'highpass'); break;
      case 'edgeWave': if (this.limit('edge', 0.05)) { this.tone(1300, 300, 0.12, 'sawtooth', 0.04); } break;
      case 'tag': this.tone(523, 784, 0.12, 'triangle', 0.06); this.noise(0.1, 2600, 0.06, 'bandpass', 900); break;
      case 'assist': this.tone(659, 988, 0.16, 'triangle', 0.06); this.tone(988, 1319, 0.16, 'sine', 0.04, 0.06); break;
      case 'teamWait': case 'teamNone': case 'tagNone': case 'assistNone': case 'sigWait': case 'sigFail': case 'gaugeLow': if (this.limit('nope', 0.2)) this.tone(300, 0, 0.06, 'square', 0.02); break;
      case 'ultCast': this.tone(262, 523, 0.6, 'sawtooth', 0.07); this.tone(330, 659, 0.6, 'sawtooth', 0.06, 0.05); this.tone(392, 784, 0.6, 'sawtooth', 0.06, 0.1); this.noise(0.8, 300, 0.1, 'lowpass', 3000); break;
      case 'ultStrike': this.noise(0.15, 8000, 0.22, 'highpass'); this.tone(50, 22, 1.4, 'sine', 0.32); this.noise(1.4, 500, 0.28, 'lowpass', 40); break;
      // ---- Damage ----
      case 'hit': if (this.limit('hit', 0.03)) { if (ev.resisted) { this.tone(1450, 0, 0.05, 'square', 0.035); this.tone(1950, 0, 0.07, 'square', 0.03, 0.01); } else { this.noise(0.06 + (ev.heavy ? 0.06 : 0), ev.heavy ? 900 : 1800, ev.heavy ? 0.14 : 0.08, 'bandpass'); if (ev.heavy) this.tone(140, 60, 0.12, 'sine', 0.1); } } break;
      case 'armourBreak': this.noise(0.35, 1200, 0.22, 'lowpass'); this.tone(200, 55, 0.35, 'sawtooth', 0.1); break;
      case 'stagger': if (this.limit('stagger', 0.1)) this.tone(880, 440, 0.2, 'sine', 0.05); break;
      case 'wallBounce': this.noise(0.25, 700, 0.2, 'lowpass'); this.tone(180, 70, 0.22, 'sine', 0.14); break;
      case 'groundBounce': this.noise(0.3, 400, 0.22, 'lowpass'); this.tone(120, 50, 0.28, 'sine', 0.16); break;
      case 'react':
        if (ev.react === 'stun' && this.limit('stun', 0.2)) { this.tone(1320, 990, 0.3, 'triangle', 0.04); this.tone(1760, 1320, 0.3, 'triangle', 0.03, 0.08); }
        else if (ev.react === 'crumple') this.tone(330, 110, 0.4, 'sawtooth', 0.05);
        else if (ev.react === 'flipOut') this.noise(0.18, 3000, 0.07, 'bandpass', 900);
        else if (ev.react === 'down' && this.limit('down', 0.08)) this.noise(0.18, 300, 0.12, 'lowpass');
        break;
      case 'kill': this.noise(0.4, 400, 0.22, 'lowpass', 80); this.tone(160, 40, 0.35, 'sine', 0.16); this.noise(0.08, 3000, 0.08, 'highpass'); break;
      case 'playerHit': this.tone(230, 110, 0.14, 'sawtooth', 0.12); this.noise(0.1, 800, 0.1, 'lowpass'); break;
      case 'downed': this.tone(440, 220, 0.45, 'sine', 0.1); break;
      case 'revived': this.tone(784, 0, 0.18, 'sine', 0.08); this.tone(988, 0, 0.18, 'sine', 0.07, 0.08); this.tone(1175, 0, 0.25, 'sine', 0.06, 0.16); break;
      // ---- Sentinels ----
      case 'telegraph':
        if (ev.cat === 'standard') this.tone(1760, 0, 0.08, 'sine', 0.05);
        else if (ev.cat === 'heavy') { this.tone(660, 0, 0.12, 'square', 0.05); this.tone(440, 0, 0.16, 'square', 0.05, 0.1); }
        else { this.tone(220, 0, 0.18, 'sawtooth', 0.07); this.tone(220, 0, 0.18, 'sawtooth', 0.07, 0.22); }
        break;
      case 'enemyShot': if (this.limit('eshot', 0.04)) this.tone(620, 300, 0.08, 'square', 0.035); break;
      case 'slam': this.noise(0.45, 220, 0.28, 'lowpass'); this.tone(70, 40, 0.35, 'sine', 0.22); break;
      case 'markAim': this.tone(900, 1800, 1.5, 'sine', 0.025); break;
      case 'marked': this.tone(1800, 0, 0.1, 'square', 0.04); this.tone(1800, 0, 0.1, 'square', 0.04, 0.14); break;
      case 'enemyDrop': if (this.limit('drop', 0.1)) { this.noise(0.5, 2000, 0.06, 'bandpass', 300); } break;
      case 'bossLand': this.noise(0.7, 180, 0.35, 'lowpass'); this.tone(50, 25, 0.8, 'sine', 0.3); break;
      case 'bossBeam': this.tone(220, 880, 0.9, 'sawtooth', 0.06); this.noise(0.9, 3000, 0.08, 'bandpass', 800); break;
      case 'bossPhase': this.tone(110, 55, 0.9, 'sawtooth', 0.12); this.tone(165, 82, 0.9, 'sawtooth', 0.08); this.noise(0.8, 500, 0.15, 'lowpass'); break;
      case 'adapting': this.tone(400, 1600, 0.6, 'sine', 0.04); this.tone(410, 1620, 0.6, 'sine', 0.03, 0.02); break;
      case 'adapted': this.tone(1600, 400, 0.4, 'square', 0.04); this.noise(0.3, 5000, 0.05, 'highpass', 1200); break;
      case 'adaptReset': this.tone(500, 300, 0.3, 'sine', 0.03); break;
      // ---- The rescue ----
      case 'doorHit': if (this.limit('door', 0.05)) { this.tone(1500, 0, 0.05, 'square', 0.04); this.noise(0.08, 2500, 0.06); } break;
      case 'doorBroken': this.noise(0.5, 1500, 0.2, 'bandpass', 300); this.tone(300, 80, 0.4, 'sawtooth', 0.08); break;
      case 'kidReleased': case 'kidFreed': case 'kidUp': this.tone(784, 1047, 0.18, 'triangle', 0.06); this.tone(1047, 1319, 0.2, 'triangle', 0.05, 0.08); break;
      case 'kidGrabbed': this.tone(880, 440, 0.3, 'square', 0.05); this.tone(660, 330, 0.3, 'square', 0.05, 0.12); break;
      case 'kidHit': this.tone(700, 500, 0.1, 'triangle', 0.05); break;
      case 'kidDown': this.tone(523, 262, 0.5, 'triangle', 0.07); break;
      case 'crateBreak': this.noise(0.25, 900, 0.14, 'bandpass', 300); break;
      case 'gateOpen': this.tone(392, 784, 0.3, 'sawtooth', 0.04); this.noise(0.4, 1200, 0.06, 'bandpass', 4000); break;
      case 'sectionStart': this.tone(330, 0, 0.12, 'square', 0.04); this.tone(330, 0, 0.12, 'square', 0.04, 0.18); break;
      case 'sectionClear': case 'checkpoint': this.tone(660, 0, 0.14, 'triangle', 0.06); this.tone(880, 0, 0.2, 'triangle', 0.06, 0.12); break;
      case 'missionFail': this.tone(330, 165, 0.6, 'triangle', 0.08); this.tone(262, 131, 0.7, 'triangle', 0.07, 0.2); break;
      case 'missionComplete': for (const [f, d] of [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.4]]) this.tone(f, 0, 0.35, 'triangle', 0.07, d); break;
      case 'join': this.tone(520, 1040, 0.2, 'sine', 0.06); break;
    }
  }

  // Holds hum while they build: Cyclops's open visor, the coiling Drill Claw, Jean's grip
  update(S) {
    if (!this.ctx) return;
    const c = this.ctx, now = c.currentTime, vol = SETTINGS.volume, seen = new Set();
    for (const p of S ? S.players : []) {
      let k = -1, base = 110;
      if (p.hero === 'cyclops' && p.openT > 0) { k = Math.min(1, p.openT / HEROES.cyclops.optic.open); base = 180; }
      else if (p.hero === 'wolverine' && p.drillT > 0) { k = Math.min(1, p.drillT / HEROES.wolverine.drill.tiers[2]); base = 150; }
      else if (p.hero === 'jean' && p.tk) { k = 0.5 + 0.5 * (1 - p.conc / 100); base = 140; }
      if (p.state === 'downed') k = -1;
      seen.add(p.id);
      let h = this.hums.get(p.id);
      if (k >= 0 && vol > 0) {
        if (!h) {
          const o1 = c.createOscillator(), o2 = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain(), f = c.createBiquadFilter();
          o1.type = 'sine'; o2.type = 'triangle'; f.type = 'lowpass'; f.frequency.value = 2400;
          lfo.connect(lg); lg.connect(g.gain); o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
          g.gain.setValueAtTime(0.0001, now); o1.start(); o2.start(); lfo.start();
          h = { o1, o2, lfo, lg, g }; this.hums.set(p.id, h);
        }
        const f0 = base * (1 + 2 * k);
        h.o1.frequency.setTargetAtTime(f0, now, 0.03); h.o2.frequency.setTargetAtTime(f0 * 1.5, now, 0.03);
        h.lfo.frequency.setTargetAtTime(5 + 14 * k, now, 0.05);
        const gain = (0.01 + 0.025 * k) * vol;
        h.g.gain.setTargetAtTime(gain, now, 0.04); h.lg.gain.setTargetAtTime(gain * 0.3, now, 0.04);
      } else if (h) this.stopHum(p.id);
    }
    for (const id of [...this.hums.keys()]) if (!seen.has(id)) this.stopHum(id);
  }
  stopHum(id) {
    const h = this.hums.get(id); if (!h) return;
    const t = this.ctx.currentTime; h.g.gain.setTargetAtTime(0.0001, t, 0.03);
    for (const o of [h.o1, h.o2, h.lfo]) o.stop(t + 0.2);
    this.hums.delete(id);
  }
}
