// Adaptive score, synthesized live with Web Audio (no audio files), written for this fan prototype: an
// original heroic theme (no borrowed melody) in E minor at 132 BPM, drums, a galloping bass, an arpeggio, a
// reverb pad, brass-like stabs and a lead fanfare. Three intensity levels crossfade: 0 explore (pad, arp,
// half-time beat), 1 combat (driving drums and bass), 2 intense (adds the stabs and the lead). update() picks
// the level from what is happening on screen.
import { SETTINGS } from './settings.js';

const BPM = 132, STEP = 60 / BPM / 4, BAR = 16, LOOP = BAR * 8;
const hz = n => 440 * Math.pow(2, (n - 69) / 12);

// Em  C  G  D | Em  C  Am  B (the major V turns it back home)
const CHORDS = [[40, 'm'], [36, 'M'], [43, 'M'], [38, 'M'], [40, 'm'], [36, 'M'], [45, 'm'], [35, 'M']];
const triad = q => (q === 'm' ? [0, 3, 7] : [0, 4, 7]);
// Arpeggio walks these chord tones (root, third, fifth, then an octave up) in 16ths
const ARP = [0, 1, 2, 3, 2, 1, 4, 2, 0, 1, 2, 3, 5, 4, 3, 1];
// Lead fanfare: [step in the 8-bar loop, midi note, length in 16ths]
const LEAD = [
  [0, 71, 2], [2, 76, 2], [4, 79, 6], [10, 78, 2], [12, 76, 4],
  [16, 72, 4], [20, 76, 4], [24, 79, 4], [28, 81, 4],
  [32, 79, 6], [38, 74, 2], [40, 71, 4], [44, 74, 4],
  [48, 78, 6], [54, 76, 2], [56, 74, 4], [60, 69, 4],
  [64, 71, 2], [66, 76, 2], [68, 79, 4], [72, 83, 4], [76, 81, 4],
  [80, 79, 6], [86, 76, 2], [88, 72, 4], [92, 76, 4],
  [96, 72, 3], [99, 76, 3], [102, 81, 6], [108, 79, 4],
  [112, 78, 6], [118, 75, 2], [120, 78, 4], [124, 83, 4],
];
// Layer levels per intensity
const MIX = [
  { drums: 0.5, bass: 0.55, arp: 0.8, pad: 0.95, lead: 0, stab: 0 },
  { drums: 1, bass: 1, arp: 0.75, pad: 0.45, lead: 0, stab: 0.35 },
  { drums: 1.1, bass: 1.05, arp: 0.8, pad: 0.4, lead: 0.85, stab: 0.8 },
];

// How hot is the moment? Sentinels near the camera, a fight locked in, the Mk-II, the team ultimate.
export function musicIntensity(S) {
  if (S.ult) return 2;
  if (S.enemies.some(e => !e.dead && e.type === 'mk2')) return 2;
  const cam = S.cam; let near = 0;
  for (const e of S.enemies) if (!e.dead && Math.abs(e.x - cam.x) < cam.halfW + 8) near++;
  if (!near) return 0;
  return near >= 5 || (S.mission && S.mission.phase === 'fight' && near >= 3) || (S.adapt && S.adapt.active) ? 2 : 1;
}

export class Music {
  constructor() { this.ctx = null; this.level = 0; this.want = 0; this.wantT = 0; this.notes = 0; this.ducked = false; }

  start(ctx) {
    if (this.ctx || !ctx) return;
    this.ctx = ctx;
    const c = ctx;
    this.out = c.createGain(); this.out.gain.value = 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3.5; comp.attack.value = 0.01; comp.release.value = 0.2;
    this.out.connect(comp); comp.connect(c.destination);
    // Reverb (a generated impulse) and a tempo-synced delay, shared by the melodic layers
    this.verb = c.createConvolver(); this.verb.buffer = this.impulse(2.6);
    const verbOut = c.createGain(); verbOut.gain.value = 0.32; this.verb.connect(verbOut); verbOut.connect(this.out);
    this.delay = c.createDelay(1); this.delay.delayTime.value = STEP * 3;
    const fb = c.createGain(); fb.gain.value = 0.34; const damp = c.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 2600;
    this.delay.connect(damp); damp.connect(fb); fb.connect(this.delay);
    const delayOut = c.createGain(); delayOut.gain.value = 0.3; damp.connect(delayOut); delayOut.connect(this.out);
    // One bus per layer; bass and pad also duck under the kick
    this.bus = {};
    for (const k of ['drums', 'bass', 'arp', 'pad', 'lead', 'stab']) {
      const g = c.createGain(); g.gain.value = MIX[0][k]; g.connect(this.out); this.bus[k] = g;
    }
    this.duck = { bass: c.createGain(), pad: c.createGain() };
    this.duck.bass.connect(this.bus.bass); this.duck.pad.connect(this.bus.pad);
    const len = c.sampleRate, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.step = 0; this.next = c.currentTime + 0.12;
    this.timer = setInterval(() => this.pump(), 25);
  }

  impulse(sec) {
    const c = this.ctx, len = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
    }
    return b;
  }

  // Schedule everything that starts in the next 150 ms. After a stall (a hidden tab), skip ahead
  // instead of playing the backlog all at once.
  pump() {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    if (this.next < c.currentTime - 0.05) this.next = c.currentTime + 0.05;
    while (this.next < c.currentTime + 0.15) {
      this.play(this.step, this.next);
      this.next += STEP; this.step = (this.step + 1) % LOOP;
    }
  }

  update(dt, world, paused) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Volume and pause duck
    const vol = SETTINGS.music * 0.55 * (paused ? 0.35 : 1);
    if (vol !== this.vol) { this.vol = vol; this.out.gain.setTargetAtTime(vol, t, 0.25); }
    // Intensity: rises quickly, settles slowly, so the music doesn't flap between states
    const want = world && world.players.length ? musicIntensity(world) : 0;
    if (want !== this.want) { this.want = want; this.wantT = 0; } else this.wantT += dt;
    if (want !== this.level && this.wantT > (want > this.level ? 0.4 : 4)) {
      this.level = want;
      for (const k in this.bus) this.bus[k].gain.setTargetAtTime(MIX[want][k], t, 0.7);
    }
  }

  stats() { return { started: !!this.ctx, level: this.level, notes: this.notes, step: this.step }; }

  // ---- The arrangement ------------------------------------------------------------------
  play(step, t) {
    const L = this.level, s = step % BAR, bar = Math.floor(step / BAR), [root, q] = CHORDS[bar];
    const tones = triad(q);
    const fill = bar === 7 && s >= 12;
    // Drums
    if (L === 0) {
      if (s === 0 || s === 10) this.kick(t, 0.55);
      if (s % 4 === 2) this.hat(t, 0.1, false);
      if (s === 12) this.rim(t, 0.12);
    } else {
      if (s % 4 === 0 || (L === 2 && s === 10)) this.kick(t, 0.9);
      if ((s === 4 || s === 12) && !fill) this.snare(t, 0.55);
      if (fill) this.snare(t, 0.25 + (s - 12) * 0.1);
      this.hat(t, s % 4 === 2 ? 0.16 : 0.07, s === 14 && bar % 2 === 1);
      if (step === 0 && L === 2) this.crash(t);
    }
    // Bass
    if (L === 0) {
      if (s === 0) this.bass(t, root, STEP * 14, 0.28, 500);
    } else if ([0, 3, 4, 6, 8, 11, 12, 14].includes(s)) {
      // A gallop: the long-short-short drive of a charge
      const oct = s === 6 || s === 14 ? 12 : 0, fifth = s === 11 && bar % 2 ? 7 : 0;
      this.bass(t, root + oct + fifth, STEP * (s % 4 === 0 ? 2.2 : 0.9), 0.32, L === 2 ? 1500 : 1100);
    }
    // Brass-like stabs on the downbeats and a push into the next bar (heard from intensity 1)
    if (L > 0 && (s === 0 || s === 6 || (s === 14 && bar % 2 === 1))) this.stab(t, [root + 24, root + 24 + tones[1], root + 24 + tones[2]], s === 0 ? 0.2 : 0.13);
    // Arpeggio: chord tones placed around D4
    const base = root + 12 * Math.round((62 - root) / 12);
    const ladder = [0, tones[1], tones[2], 12, 12 + tones[1], 12 + tones[2]];
    if (L > 0 || s % 2 === 0) this.arp(t, base + ladder[ARP[s]], L === 0 ? 0.22 : 0.26);
    // Pad: the chord, held for the bar
    if (s === 0) this.pad(t, [root + 12, root + 12 + tones[1], root + 12 + tones[2], root + 24], STEP * BAR);
    // Lead (heard only at intensity 2, but always scheduled so it enters mid-phrase)
    for (const [st, n, len] of LEAD) if (st === step) this.lead(t, n, STEP * len);
  }

  // ---- Instruments ----------------------------------------------------------------------
  env(g, t, a, peak, dur, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(0.0001, t + a + dur, rel);
  }
  noiseSrc(t, dur) { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.start(t); s.stop(t + dur); return s; }

  kick(t, v) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    o.connect(g); g.connect(this.bus.drums); o.start(t); o.stop(t + 0.4);
    // Sidechain: bass and pad dip under the kick, the glue of the genre
    for (const d of [this.duck.bass, this.duck.pad]) {
      d.gain.cancelScheduledValues(t); d.gain.setValueAtTime(0.35, t); d.gain.setTargetAtTime(1, t + 0.02, 0.09);
    }
    this.notes++;
  }
  snare(t, v) {
    const c = this.ctx, n = this.noiseSrc(t, 0.25), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    n.connect(f); f.connect(g); g.connect(this.bus.drums);
    const o = c.createOscillator(), og = c.createGain(); o.type = 'triangle';
    o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    og.gain.setValueAtTime(v * 0.6, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(og); og.connect(this.bus.drums); o.start(t); o.stop(t + 0.12);
    const send = c.createGain(); send.gain.value = 0.25; g.connect(send); send.connect(this.verb);
    this.notes++;
  }
  hat(t, v, open) {
    const c = this.ctx, dur = open ? 0.24 : 0.045, n = this.noiseSrc(t, dur + 0.02), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'highpass'; f.frequency.value = 7200;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(f); f.connect(g); g.connect(this.bus.drums);
    this.notes++;
  }
  rim(t, v) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = 820;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    o.connect(g); g.connect(this.bus.drums); o.start(t); o.stop(t + 0.05);
    this.notes++;
  }
  crash(t) {
    const c = this.ctx, n = this.noiseSrc(t, 1.6), f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'highpass'; f.frequency.value = 4500;
    g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    n.connect(f); f.connect(g); g.connect(this.bus.drums);
    const send = c.createGain(); send.gain.value = 0.4; g.connect(send); send.connect(this.verb);
    this.notes++;
  }
  bass(t, note, dur, v, cutoff) {
    const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(cutoff * 1.8, t); f.frequency.setTargetAtTime(cutoff * 0.35, t + 0.01, 0.07);
    for (const [type, n, lvl] of [['sawtooth', note, 1], ['square', note - 12, 0.55]]) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = hz(n);
      const og = c.createGain(); og.gain.value = lvl; o.connect(og); og.connect(f); o.start(t); o.stop(t + dur + 0.3);
    }
    this.env(g, t, 0.008, v, dur, 0.05);
    f.connect(g); g.connect(this.duck.bass);
    this.notes++;
  }
  arp(t, note, v) {
    const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'square'; o.frequency.value = hz(note);
    f.type = 'lowpass'; f.frequency.setValueAtTime(4200, t); f.frequency.setTargetAtTime(900, t + 0.01, 0.06);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.004); g.gain.setTargetAtTime(0.0001, t + 0.03, 0.05);
    o.connect(f); f.connect(g); g.connect(this.bus.arp); o.start(t); o.stop(t + 0.4);
    const send = c.createGain(); send.gain.value = 0.55; g.connect(send); send.connect(this.delay);
    this.notes++;
  }
  pad(t, notes, dur) {
    const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(1500, t + dur * 0.6);
    for (const n of notes) for (const det of [-9, 9]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 1.2);
    }
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.13, t + 0.5); g.gain.setTargetAtTime(0.0001, t + dur - 0.1, 0.45);
    f.connect(g); g.connect(this.duck.pad);
    const send = c.createGain(); send.gain.value = 0.7; g.connect(send); send.connect(this.verb);
    this.notes++;
  }
  stab(t, notes, v) {
    const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(3400, t + 0.03); f.frequency.setTargetAtTime(900, t + 0.05, 0.08);
    for (const n of notes) for (const det of [-7, 7]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = det; o.connect(f); o.start(t); o.stop(t + 0.5);
    }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.setTargetAtTime(0.0001, t + 0.09, 0.07);
    f.connect(g); g.connect(this.bus.stab);
    const send = c.createGain(); send.gain.value = 0.4; g.connect(send); send.connect(this.verb);
    this.notes++;
  }
  lead(t, note, dur) {
    const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), depth = c.createGain();
    f.type = 'lowpass'; f.Q.value = 2; f.frequency.setValueAtTime(1200, t); f.frequency.exponentialRampToValueAtTime(3600, t + 0.06); f.frequency.setTargetAtTime(2400, t + 0.1, 0.2);   // brassy: it opens as each note speaks
    lfo.frequency.value = 5.6; depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(9, t + 0.25); lfo.connect(depth);
    for (const [type, det, lvl] of [['sawtooth', -6, 0.6], ['square', 6, 0.4]]) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = hz(note); o.detune.value = det;
      depth.connect(o.detune);
      const og = c.createGain(); og.gain.value = lvl; o.connect(og); og.connect(f); o.start(t); o.stop(t + dur + 0.4);
    }
    lfo.start(t); lfo.stop(t + dur + 0.4);
    this.env(g, t, 0.02, 0.4, dur * 0.85, 0.08);
    f.connect(g); g.connect(this.bus.lead);
    const send = c.createGain(); send.gain.value = 0.45; g.connect(send); send.connect(this.delay);
    const vs = c.createGain(); vs.gain.value = 0.35; g.connect(vs); vs.connect(this.verb);
    this.notes++;
  }
}
