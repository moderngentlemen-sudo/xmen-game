// Haptics: each player feels their own events on their own controller. Controllers rumble through the
// Gamepad API ('dual-rumble' on vibrationActuator, or the older hapticActuators pulse). On a phone, the
// first player's events buzz the phone through navigator.vibrate when their controller cannot rumble
// (Android browsers; iOS Safari has no vibration API, and pages embedded in another site may be
// blocked from vibrating). Keyboard and mouse have nothing to shake.
import { SETTINGS, MARKSMAN, NOVA, DASH_CHARGE, HUNTER, POUND } from './config.js';
import { rifleFocus } from './player.js';

// [strong motor 0-1, weak motor 0-1, milliseconds, priority]. Lower-priority effects never cut off a
// stronger one that is still playing.
const FX = {
  playerHit: ev => (ev.heavy ? [0.9, 0.7, 240, 3] : [0.55, 0.45, 150, 3]),
  downed: () => [1, 1, 420, 4],
  revived: () => [0.3, 0.6, 160, 3],
  parry: ev => (ev.perfect ? [0.25, 0.9, 110, 3] : [0.1, 0.55, 70, 3]),
  hit: ev => (ev.heavy ? [0.35, 0.6, 80, 1] : [0.08, 0.35, 40, 1]),
  kill: () => [0.2, 0.55, 70, 2],
  chargeLevel: ev => level(ev.level), burstLevel: ev => level(ev.level), dashLevel: ev => level(ev.level),
  rifleRaise: () => [0, 0.2, 30, 1], rifleFocus: () => [0.2, 0.55, 70, 2],
  shot: ev => (ev.level ? [Math.min(1, 0.2 + 0.2 * ev.level + (ev.perfect ? 0.25 : 0)), 0.4 + 0.1 * ev.level, 70 + 30 * ev.level, 3] : null),
  snipe: ev => [0.45 + 0.45 * ev.f, 0.55 + 0.2 * ev.f, 100 + 80 * ev.f, 3], crit: () => [0.2, 0.6, 50, 2],
  deflect: ev => (ev.perfect ? [0.3, 0.9, 100, 3] : [0.12, 0.6, 60, 2]),
  dashSlash: ev => [0.25 + 0.15 * ev.tier, 0.5, 80 + 20 * ev.tier, 2], crescent: () => [0.2, 0.5, 70, 2], pogo: () => [0.1, 0.5, 50, 2],
  poundStart: () => [0, 0.3, 40, 1], poundLevel: ev => level(ev.level), poundDrop: () => [0.1, 0.35, 60, 1],
  poundLand: ev => [Math.min(1, 0.5 + 0.17 * ev.level), Math.min(1, 0.6 + 0.12 * ev.level), 140 + 50 * ev.level, 3],
  beamStart: () => [0.7, 0.9, 220, 3], beamEnd: () => [0.1, 0.3, 80, 1],
  aegisOn: () => [0.15, 0.5, 90, 2], aegisHit: ev => [0.2 + Math.min(0.5, ev.dmg * 0.02), 0.5, 60, 2],
  aegisOff: ev => (ev.why === 'break' ? [0.7, 0.8, 220, 3] : ev.why === 'detonate' ? [0.85, 0.85, 240, 3] : [0, 0.2, 60, 1]),
  rocketJump: ev => { const k = ev.power || 0.5; return [Math.min(1, 0.6 + 0.4 * k), Math.min(1, 0.5 + 0.4 * k), 180 + 220 * k, 4]; },
  dash: ev => (ev.level ? [0.2 + 0.2 * ev.level, 0.45, 80 + 40 * ev.level, 2] : [0, 0.22, 35, 1]),
  walljump: () => [0, 0.25, 30, 1],
  wallSlide: ev => (ev.on ? [0, 0.18, 40, 1] : null),
  land: ev => (ev.vy < -16 ? (k => [0.3 + 0.4 * k, 0.2, 80 + 60 * k, 2])(Math.min(1, (-ev.vy - 16) / 12)) : null),
  blast: () => [0.35, 0.5, 110, 2],
  burst: ev => [0.2 + 0.12 * (ev.level || 0), 0.45, 60 + 20 * (ev.level || 0), 2],
  vbStart: ev => [0.2 + 0.15 * ev.tier, 0.5, 80, 2],
  intercept: () => [0, 0.35, 40, 1],
  thrustOn: () => [0, 0.2, 60, 1],
  lockOn: ev => (ev.why === 'auto' ? null : [0, 0.3, 35, 1]), lockSwitch: () => [0, 0.2, 25, 1], lockOff: () => [0, 0.12, 25, 1],
  challenge: () => [0.1, 0.4, 60, 2], vanish: () => [0.1, 0.4, 60, 2],
  // Version 9
  subSwitch: () => [0, 0.2, 30, 1], frag: ev => [0.3 + 0.1 * (ev.level || 0), 0.5, 90 + 20 * (ev.level || 0), 2],
  chain: ev => [0.15 + 0.1 * (ev.level || 0), 0.6, 70 + 20 * (ev.level || 0), 2], discThrow: () => [0, 0.3, 40, 1], discCatch: () => [0.1, 0.4, 50, 2],
  wellOpen: () => [0.2, 0.4, 90, 2], wellCollapse: ev => [0.4 + 0.1 * (ev.level || 1), 0.6, 140, 3],
  dodge: () => [0, 0.3, 40, 1], perfectDodge: () => [0.4, 0.9, 200, 3], riseBlast: () => [0.3, 0.6, 90, 2],
  ultReady: () => [0.2, 0.7, 150, 2], ultCut: () => [0.15, 0.5, 40, 2],
};
// Boss moments everyone feels, on every pad at once
const ALL = { bossSlam: ev => (ev.big ? [0.8, 0.6, 220, 3] : [0.5, 0.45, 140, 2]), bossPhase: () => [0.9, 0.8, 380, 4], bossCrash: () => [0.7, 0.5, 200, 3], bossDown: () => [1, 1, 700, 4], bossIntro: () => [0.4, 0.5, 300, 2],
  // Ultimates: everyone feels the call, the nova, the finishers
  ultCast: () => [0.5, 0.8, 300, 4], ultJoin: () => [0.5, 0.8, 250, 4], ultNova: () => [1, 1, 520, 4], ultFinisher: () => [0.9, 0.9, 420, 4], teamFinisher: () => [1, 1, 750, 4] };
function level(L) { return L >= 3 ? [0.35, 0.7, 80, 2] : L === 2 ? [0.15, 0.45, 55, 2] : [0, 0.3, 45, 2]; }

// How far along a player's current charge is (0-1), or -1 when nothing is charging
function chargeOf(p) {
  if (p.state === 'dashCharge') return p.dashChargeT >= DASH_CHARGE.tap ? Math.min(1, p.dashChargeT / DASH_CHARGE.charge[2]) : -1;
  if (p.state === 'pound' && p.pound && p.pound.phase === 'hold' && p.pound.held && p.pound.t > POUND.windup) return Math.min(1, p.pound.t / POUND.charge[2]);
  if (p.char === 'echo') return p.rifleT >= HUNTER.rifle.raise ? rifleFocus(p.rifleT) : -1;
  if (p.chargeT > 0) return Math.min(1, p.chargeT / (SETTINGS.novaKit === 'marksman' ? MARKSMAN.charge[2] : NOVA.charge2));
  if (p.burstT > 0) return Math.min(1, p.burstT / MARKSMAN.burst.charge[2]);
  return -1;
}

export class Haptics {
  constructor(input, env = globalThis) {
    this.input = input; this.env = env; this.until = {}; this.prio = {}; this.lastHit = {}; this.humT = {};
    this.log = null;   // tests can collect the effects played here
    const nav = env.navigator || {};
    // A phone or tablet: the vibration API and a touch screen as the main pointer (not a touchscreen laptop)
    const coarse = env.matchMedia ? env.matchMedia('(pointer: coarse)').matches : (nav.maxTouchPoints || 0) > 0;
    this.phone = typeof nav.vibrate === 'function' && (coarse || /Android|Mobile/i.test(nav.userAgent || ''));
  }
  now() { return (this.env.performance && this.env.performance.now) ? this.env.performance.now() : Date.now(); }

  pad(device) {
    if (!device || !device.startsWith('pad')) return null;
    return this.input.pads().find(p => 'pad' + p.index === device) || null;
  }
  canRumble(pad) { return !!(pad && ((pad.vibrationActuator && pad.vibrationActuator.playEffect) || (pad.hapticActuators && pad.hapticActuators.length))); }

  // Play one effect on a player's device
  play(p, strong, weak, ms, prio = 1) {
    if (!SETTINGS.haptics || !p) return false;
    const k = SETTINGS.hapticStrength ?? 0.8;
    if (k <= 0) return false;
    const dev = p.device, t = this.now();
    if ((this.until[dev] || 0) > t && (this.prio[dev] || 0) > prio) return false;   // a stronger effect is still playing
    strong = Math.min(1, strong * k); weak = Math.min(1, weak * k); ms = Math.round(ms);
    const pad = this.pad(dev);
    let played = false;
    try {
      if (pad && pad.vibrationActuator && pad.vibrationActuator.playEffect) {
        const r = pad.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak });
        if (r && r.catch) r.catch(() => {});
        played = true;
      } else if (pad && pad.hapticActuators && pad.hapticActuators.length) {
        const r = pad.hapticActuators[0].pulse(Math.max(strong, weak), ms);
        if (r && r.catch) r.catch(() => {});
        played = true;
      } else if (this.phone && p.slot === 0) {
        // Phones have one motor and coarse timing: the stronger motor sets the length of the buzz
        played = !!this.env.navigator.vibrate(Math.max(8, Math.min(400, Math.round(ms * Math.max(strong, weak)))));
        if (!played) this.phone = false;   // blocked (e.g. inside an embedded page): stop asking
      }
    } catch (e) { played = false; }
    if (played) { this.until[dev] = t + ms; this.prio[dev] = prio; if (this.log) this.log.push({ dev, strong, weak, ms, prio }); }
    return played;
  }

  onEvent(ev) {
    if (ALL[ev.type] && this.world) { const e = ALL[ev.type](ev); for (const p of this.world.players) this.play(p, e[0], e[1], e[2], e[3]); return; }
    const make = FX[ev.type]; if (!make) return;
    const who = ev.type === 'hit' || ev.type === 'kill' || ev.type === 'intercept' ? ev.owner : ev.p;
    if (!who || who.kind !== 'player') return;
    if (ev.type === 'hit') {   // hit ticks: at most one every 50 ms per player
      const t = this.now(); if (t - (this.lastHit[who.device] || -1e9) < 50) return; this.lastHit[who.device] = t;
    }
    const e = make(ev); if (e) this.play(who, e[0], e[1], e[2], e[3]);
  }

  // While a charge builds, a faint rumble that grows with it (controllers only; phones stay quiet)
  update(world) {
    this.world = world;
    if (!SETTINGS.haptics) return;
    const t = this.now();
    for (const p of world.players) {
      if (p.state === 'downed' || p.state === 'dead' || !this.canRumble(this.pad(p.device))) continue;
      if (p.state === 'beam' && p.beam) {   // the beam shakes the pad the whole time it fires
        if (t - (this.humT[p.device] || 0) >= 110) { this.humT[p.device] = t; this.play(p, 0.35, 0.55, 130, 1); }
        continue;
      }
      if (p.state === 'ult' && p.ultRun && p.ultRun.segs) {   // and Supernova's far harder
        if (t - (this.humT[p.device] || 0) >= 110) { this.humT[p.device] = t; this.play(p, 0.65, 0.85, 130, 1); }
        continue;
      }
      const k = chargeOf(p);
      if (k < 0.3 || t - (this.humT[p.device] || 0) < 110) continue;
      this.humT[p.device] = t;
      this.play(p, k > 0.95 ? 0.08 : 0, 0.05 + 0.13 * k, 130, 0);
    }
  }
}
