// Bootstrap: the fixed 60 Hz simulation (game/js/sim, deterministic: a seed plus the inputs is the whole run),
// drop-in players, interpolated rendering, the comic layer, sound, rumble, menus.
import { loadSettings, SETTINGS } from './settings.js';
import { createWorld, step, addPlayer } from './sim/world.js';
import { DT } from './sim/config.js';
import { Input } from './input.js';
import { View } from './view.js';
import { Overlay } from './overlay.js';
import { UI } from './hud.js';
import { Sound } from './audio.js';
import { Music } from './music.js';
import { Haptics } from './haptics.js';

loadSettings();
const app = document.getElementById('app'), canvas = document.getElementById('game'), ink = document.getElementById('ink');
const input = new Input(canvas);
const view = new View(canvas);
const overlay = new Overlay(ink, view);
const sound = new Sound(), music = new Music(), haptics = new Haptics(input);
let S = createWorld({ seed: newSeed(), players: 0 });
let devices = [];   // device per player slot
let started = false, paused = false, complete = false, hitPause = 0;
function newSeed() { return ((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0) || 1; }

const ui = new UI(document.getElementById('ui'), {
  resume: () => setPaused(false),
  restart: () => restart(),
  complete: () => { complete = true; ui.showResults(S); },
});

function resize() {
  const r = app.getBoundingClientRect(), w = Math.max(1, Math.floor(r.width)), h = Math.max(1, Math.floor(r.height));
  view.resize(w, h); overlay.resize(w, h, Math.min(window.devicePixelRatio || 1, 2));
}
new ResizeObserver(resize).observe(app);
resize();

function setPaused(on) { paused = on; ui.setPaused(on); if (!on) { canvas.focus(); input.swallowAll(); } }

// A new run of the mission with everyone who is playing
function restart() {
  S = createWorld({ seed: newSeed(), players: 0 });
  view.reset();
  devices.forEach((d, slot) => addPlayer(S, slot, devices.length === 1));
  complete = false; paused = false; ui.setPaused(false); ui.hideStart(); input.swallowAll();
}

function tryJoin() {
  if (paused || complete) return;
  for (const dev of input.pollJoins(new Set(devices))) {
    if (devices.length >= 4) break;
    const slot = devices.length;
    devices.push(dev);
    addPlayer(S, slot, devices.length === 1);
    sound.play({ type: 'join' });
    if (!started) { started = true; ui.hideStart(); input.swallowAll(); }
  }
}

function handleMenus() {
  for (const ev of input.takeMenuEvents()) {
    if (ui.helpOpen || (ui.screen && (paused || !started || complete))) {
      if (ev.type === 'pause' && paused && !ui.helpOpen) { setPaused(false); continue; }
      if (ev.type === 'help' || ev.type === 'back') { if (ui.helpOpen) ui.toggleHelp(false); else if (paused) setPaused(false); continue; }
      if (ui.menuNav(ev)) continue;
    }
    if (!started) { if (ev.type === 'help') ui.toggleHelp(); continue; }
    if (complete) continue;
    if (ev.type === 'pause') setPaused(!paused);
    else if (ev.type === 'help') { if (!paused) setPaused(true); ui.toggleHelp(true); }
  }
}

// Which events hold the moment in an impact panel, and how hard
function panelFor(ev) {
  switch (ev.type) {
    case 'perfect': return 0.6;
    case 'fastballSlam': return 1;
    case 'ultStrike': return 1.4;
    case 'bossPhase': return 1.2;
    case 'kill': return ev.unit === 'mk2' ? 1.5 : ev.unit === 'collector' ? 0.7 : 0;
    case 'doorBroken': return 0.8;
    case 'berserk': return 0.7;
    case 'optic': return ev.a > 0.9 && ev.hits && ev.hits.length >= 2 ? 0.6 : 0;
  }
  return 0;
}

const deviceOf = id => { const p = S.players.find(q => q.id === id); return p ? devices[p.slot] : null; };
function stepSim() {
  view.beforeStep(S);
  let cmds = {};
  for (const p of S.players) cmds[p.slot] = input.sample(devices[p.slot], (mx, my) => view.aimFromMouse(mx, my, p));
  if (window.__X.inject) cmds = window.__X.inject(S.tick, cmds) || cmds;
  step(S, cmds);
  for (const ev of S.events) {
    view.onEvent(ev, S); overlay.onEvent(ev); sound.play(ev); ui.onEvent(ev, S); haptics.onEvent(ev, deviceOf, devices);
    const k = panelFor(ev);
    if (k) hitPause = Math.max(hitPause, overlay.impact(ev.x !== undefined ? ev.x : S.cam.x, ev.y !== undefined ? ev.y : S.cam.y, k));
  }
}

// Browsers only allow audio after a click or a key; the score starts with the first one
const unlockAudio = () => { sound.unlock(); if (sound.ctx) music.start(sound.ctx); };
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

let acc = 0, last = performance.now(), fps = 60, fpsT = 0, fpsN = 0;
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
  fpsT += dt; fpsN++; if (fpsT >= 0.5) { fps = fpsN / fpsT; fpsT = 0; fpsN = 0; }
  input.pollPadMenus();
  handleMenus();
  tryJoin();
  const halted = paused || ui.helpOpen || complete || !started;
  if (!halted && !window.__X.manual) {
    if (hitPause > 0) { hitPause -= dt; acc = 0; }   // an impact panel holds the world still
    else {
      acc += dt; let n = 0;
      while (acc >= DT && n < 5) { stepSim(); acc -= DT; n++; }
      if (n === 5) acc = 0;
    }
  }
  music.update(dt, started ? S : null, halted && started);
  sound.update(started && !halted ? S : null);
  try {
    view.render(S, halted ? 1 : Math.min(1, acc / DT), dt);
    overlay.draw(started ? S : null, halted ? 0 : dt);
    if (started) ui.update(S, dt);
  } catch (err) { console.error(err); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Test hooks for automated checks (harmless otherwise)
window.__X = {
  get S() { return S; }, view, ui, input, sound, music, overlay, SETTINGS, manual: false, inject: null,
  join(dev = 'kbm') { devices.push(dev); addPlayer(S, devices.length - 1, devices.length === 1); if (!started) { started = true; ui.hideStart(); } },
  step(n = 1) { for (let i = 0; i < n; i++) stepSim(); },
  stats() { return { fps, players: S.players.length, enemies: S.enemies.length, tick: S.tick, sec: S.mission.sec, phase: S.mission.phase }; },
};
