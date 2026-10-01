// Haptics: game events reach the right player's controller with the right strength, stronger effects
// are not cut off by weaker ones, hit ticks are rate-limited, phones fall back to navigator.vibrate,
// Firefox-style pulse actuators work, and the setting turns it all off. Real simulation, mocked devices.
import { World } from '../game/js/world.js';
import { SETTINGS, MARKSMAN } from '../game/js/config.js';
import { Haptics } from '../game/js/haptics.js';
SETTINGS.novaKit = 'marksman'; SETTINGS.echoKit = 'hunter'; SETTINGS.haptics = true; SETTINGS.hapticStrength = 1;
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const BT = ['jump', 'dash', 'melee', 'fire', 'parry', 'sig', 'mode', 'lock'];
function mk(prev, o = {}) {
  const held = {}; for (const b of BT) held[b] = !!(o.held && o.held[b]);
  const pressed = {}, released = {};
  for (const b of BT) { pressed[b] = held[b] && !prev.held[b]; released[b] = !held[b] && !!prev.held[b]; }
  return { mx: o.mx || 0, my: o.my || 0, aimFree: !!o.aim, ax: o.aim ? o.aim[0] : 0, ay: o.aim ? o.aim[1] : 0, held, pressed, released };
}
// Fake devices: a Chrome-style pad (dual-rumble), a Firefox-style pad (pulse), a clock we control
function rig({ phone = false } = {}) {
  let t = 1000; const calls = [], vib = [];
  const pad0 = { index: 0, buttons: [], axes: [], vibrationActuator: { playEffect: (type, e) => { calls.push({ pad: 0, type, ...e }); return Promise.resolve('complete'); } } };
  const pad1 = { index: 1, buttons: [], axes: [], hapticActuators: [{ pulse: (v, ms) => { calls.push({ pad: 1, type: 'pulse', v, ms }); return Promise.resolve(true); } }] };
  const input = { pads: () => [pad0, pad1] };
  const env = { performance: { now: () => t }, navigator: phone ? { vibrate: ms => { vib.push(ms); return true; }, maxTouchPoints: 5, userAgent: 'Android' } : {} };
  const h = new Haptics(input, env);
  return { h, calls, vib, tick: ms => { t += ms; } };
}
function game(dev = 'pad0', char = 'nova') {
  const w = new World(); w.enemies = [];
  const p = w.addPlayer(dev, char); p.x = 99; p.y = 0;
  let prev = { held: {} }; const events = [];
  const run = (o = {}, n = 1) => { for (let i = 0; i < n; i++) { const c = mk(prev, o); prev = c; w.step({ [p.slot]: c }); events.push(...w.events); w.events.length = 0; } };
  run({}, 10); p.mercy = 0;
  return { w, p, run, events };
}

{ // A rocket jump rumbles hard on that player's controller; a charge level ticks lightly first
  const { h, calls } = rig(), g = game('pad0');
  g.run({ aim: [0, -1], held: { fire: true } }, MARKSMAN.charge[2] + 2); g.run({ aim: [0, -1] }, 2);
  for (const ev of g.events) h.onEvent(ev);
  const rocket = calls.find(c => c.strongMagnitude > 0.9 && c.duration >= 300);
  const levels = g.events.filter(e => e.type === 'chargeLevel').length;
  assert(rocket && rocket.type === 'dual-rumble' && calls.every(c => c.pad === 0) && levels === 3,
    `Rocket jump: dual-rumble ${rocket && rocket.strongMagnitude.toFixed(2)}/${rocket && rocket.weakMagnitude.toFixed(2)} for ${rocket && rocket.duration} ms, on player 1's pad only`);
}
{ // A strong effect is not cut off by a weaker one; equal or stronger replaces it; hit ticks are rate-limited
  const { h, calls, tick } = rig(), p = { kind: 'player', device: 'pad0', slot: 0 };
  h.onEvent({ type: 'playerHit', p, heavy: true });
  h.onEvent({ type: 'dash', p, level: 0 });          // weaker, during the hit rumble: skipped
  tick(100); h.onEvent({ type: 'downed', p });       // stronger: plays
  const n1 = calls.length;
  tick(1000);
  const e = { kind: 'enemy' };
  h.onEvent({ type: 'hit', owner: p, e }); tick(20); h.onEvent({ type: 'hit', owner: p, e }); tick(40); h.onEvent({ type: 'hit', owner: p, e });
  assert(n1 === 2 && calls[1].strongMagnitude === 1 && calls.length === 4, `Priorities: heavy hit, dash skipped, downed plays (${n1}); hit ticks 20 ms apart merge (${calls.length - n1} of 3 played)`);
}
{ // Firefox-style pulse actuator; strength setting scales; the setting turns it off
  const { h, calls } = rig(), p1 = { kind: 'player', device: 'pad1', slot: 1 };
  SETTINGS.hapticStrength = 0.5; h.onEvent({ type: 'parry', p: p1, perfect: true }); SETTINGS.hapticStrength = 1;
  const pulse = calls[0];
  SETTINGS.haptics = false; h.onEvent({ type: 'downed', p: p1 }); SETTINGS.haptics = true;
  assert(pulse && pulse.type === 'pulse' && Math.abs(pulse.v - 0.45) < 1e-9 && calls.length === 1, `Pulse actuator at half strength (${pulse && pulse.v}); nothing with rumble switched off`);
}
{ // Phones: player 1 on keyboard/mouse (or a pad that cannot rumble) buzzes the phone; other players do not
  const { h, vib } = rig({ phone: true });
  h.onEvent({ type: 'rocketJump', p: { kind: 'player', device: 'kbm', slot: 0 }, power: 1 });
  h.onEvent({ type: 'rocketJump', p: { kind: 'player', device: 'pad7', slot: 1 }, power: 1 });
  const none = rig();
  none.h.onEvent({ type: 'rocketJump', p: { kind: 'player', device: 'kbm', slot: 0 }, power: 1 });
  assert(vib.length === 1 && vib[0] === 400 && none.vib.length === 0, `Phone vibrates for player 1 (${vib[0]} ms); desktop keyboard players feel nothing`);
}
{ // While a charge builds, a faint rumble grows with it (at most every 110 ms)
  const { h, calls, tick } = rig(), g = game('pad0');
  const mags = [];
  for (let i = 0; i < 80; i++) { g.run({ aim: [1, 0], held: { fire: true } }, 1); h.update(g.w); tick(1000 / 60); }
  for (const c of calls) mags.push(c.weakMagnitude);
  assert(calls.length >= 5 && calls.length <= 13 && mags[mags.length - 1] > mags[0], `Charge hum: ${calls.length} pulses over 1.3 s, weak motor ${mags[0].toFixed(2)} rising to ${mags[mags.length - 1].toFixed(2)}`);
}
