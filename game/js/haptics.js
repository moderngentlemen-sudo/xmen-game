// Rumble: each player feels their own events on their own controller (the Gamepad API's dual-rumble effect,
// or the older haptic pulse). Big moments everyone feels. Keyboard and mouse have nothing to shake.
import { SETTINGS } from './settings.js';

// [strong motor 0-1, weak motor 0-1, milliseconds, priority]; a weaker effect never cuts off a stronger one
const MINE = {
  playerHit: ev => (ev.heavy ? [0.9, 0.7, 240, 3] : [0.55, 0.45, 150, 3]),
  downed: () => [1, 1, 420, 4], revived: () => [0.3, 0.6, 160, 3],
  perfect: () => [0.3, 0.9, 120, 3],
  optic: ev => (ev.a > 0.2 ? [0.2 + 0.5 * ev.a, 0.5, 80 + 120 * ev.a, 2] : [0, 0.25, 35, 1]),
  drill: ev => [0.25 + 0.15 * ev.tier, 0.5, 90 + 30 * ev.tier, 2],
  tkGrab: () => [0, 0.35, 60, 1], tkThrow: () => [0.3, 0.6, 110, 2],
  berserk: () => [0.7, 0.7, 300, 3], tag: () => [0.15, 0.5, 80, 2], vault: () => [0.35, 0.4, 100, 2],
  teamup: () => [0.35, 0.8, 180, 3], fastballThrow: () => [0.5, 0.6, 140, 3],
  hit: ev => (ev.heavy ? [0.3, 0.6, 70, 1] : [0.05, 0.3, 35, 1]), kill: () => [0.2, 0.55, 70, 2],
};
const ALL = { bossLand: () => [0.8, 0.6, 300, 3], bossPhase: () => [0.9, 0.8, 380, 4], ultStrike: () => [1, 1, 600, 4], fastballSlam: () => [0.7, 0.7, 260, 3],
  missionComplete: () => [0.4, 0.8, 400, 2] };

export class Haptics {
  constructor(input) { this.input = input; this.until = {}; this.prio = {}; }
  pad(dev) { return dev && dev.startsWith('pad') ? this.input.pads().find(p => 'pad' + p.index === dev) : null; }
  play(dev, [strong, weak, ms, prio]) {
    const pad = this.pad(dev); if (!pad || !SETTINGS.rumble) return;
    const now = performance.now();
    if (this.until[dev] > now && this.prio[dev] > prio) return;
    this.until[dev] = now + ms; this.prio[dev] = prio;
    try {
      if (pad.vibrationActuator && pad.vibrationActuator.playEffect) pad.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak });
      else if (pad.hapticActuators && pad.hapticActuators[0]) pad.hapticActuators[0].pulse(Math.max(strong, weak), ms);
    } catch (e) { /* no rumble on this pad */ }
  }
  // deviceOf(playerId) gives the device a player is using
  onEvent(ev, deviceOf, devices) {
    if (ALL[ev.type]) { for (const d of devices) this.play(d, ALL[ev.type](ev)); return; }
    const f = MINE[ev.type]; if (!f) return;
    const fx = f(ev); if (!fx) return;
    const ids = ev.ids || (ev.type === 'hit' || ev.type === 'kill' ? [ev.by] : [ev.id]);
    for (const id of ids) this.play(deviceOf(id), fx);
  }
}
