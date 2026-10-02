// Bootstrap: the fixed 60 Hz simulation (game/js/sim, deterministic: a seed plus the inputs is the whole run),
// drop-in players, interpolated rendering, the comic layer, sound, rumble, menus.
import { loadSettings, SETTINGS } from './settings.js';
import { createWorld, step, addPlayer } from './sim/world.js';
import { DT, HERO_IDS } from './sim/config.js';
import { Input } from './input.js';
import { View } from './view.js';
import { Overlay } from './overlay.js';
import { UI } from './hud.js';
import { Sound } from './audio.js';
import { Music } from './music.js';
import { Haptics } from './haptics.js';

loadSettings();
const stage = document.getElementById('stage'), canvas = document.getElementById('game'), ink = document.getElementById('ink');
const input = new Input(canvas);
const view = new View(canvas);
const overlay = new Overlay(ink, view);
const sound = new Sound(), music = new Music(), haptics = new Haptics(input);
let S = createWorld({ seed: newSeed(), players: 0 });
let devices = [];   // device per player slot, once the mission is on
let picks = [];     // the hero each slot picked in the lobby (null: whoever is free)
let lobby = null;   // before the mission: [{ dev, hero }], everyone who has joined and the hero they picked
let started = false, paused = false, complete = false;
// Slow motion is a client time scale: fewer simulation ticks per real second, never a change to the simulation.
// Hitstop itself lives in the simulation (per hero and Sentinel), so one player's hit never freezes another's play.
let slow = { t: 0, scale: 1 };
function slowMotion(secs, scale) { if (secs > 0 && (slow.t <= 0 || scale <= slow.scale)) slow = { t: Math.max(slow.t, secs), scale }; }
function newSeed() { return ((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0) || 1; }

const ui = new UI(document.getElementById('ui'), {
  resume: () => setPaused(false),
  restart: () => restart(),
  complete: () => { complete = true; ui.showResults(S); },
  title: () => toTitle(),
  heroes: () => openLobby(devices.map((dev, i) => ({ dev, hero: picks[i] || (S.players[i] && S.players[i].hero) || HERO_IDS[0] }))),
  start: () => startMission(),
  pick: (i, dir) => pickHero(i, dir),
  leave: i => leaveLobby(i),
});

// The 3D view and the comic layer fill the stage, between the HUD bands
function resize() {
  const r = stage.getBoundingClientRect(), w = Math.max(1, Math.floor(r.width)), h = Math.max(1, Math.floor(r.height));
  view.resize(w, h); overlay.resize(w, h, Math.min(window.devicePixelRatio || 1, 2));
}
new ResizeObserver(resize).observe(stage);
resize();

function setPaused(on) { paused = on; ui.setPaused(on); if (!on) { canvas.focus(); input.swallowAll(); } }

// A new run of the mission with everyone who is playing, on the heroes they picked
function restart() {
  S = createWorld({ seed: newSeed(), players: 0 });
  view.reset();
  devices.forEach((d, slot) => addPlayer(S, slot, devices.length === 1, picks[slot]));
  started = true; complete = false; paused = false; ui.setPaused(false); ui.hideStart(); input.swallowAll(); canvas.focus();
}

// ---- The lobby: who plays, as whom -------------------------------------------------------------------------------
// The first press on the cover page opens it. Others join with a press of their own, everyone picks a hero
// (left and right), Back leaves, and anyone who has joined starts the mission. Alone, the pick leads the squad.
function openLobby(list) { lobby = list; complete = false; paused = false; ui.showLobby(lobby); input.swallowAll(); }
function freeHero() { return HERO_IDS.find(h => !lobby.some(l => l.hero === h)) || HERO_IDS[lobby.length % HERO_IDS.length]; }
function pickHero(i, dir) {
  const me = lobby[i]; if (!me) return;
  const taken = h => lobby.some((l, j) => j !== i && l.hero === h), free = HERO_IDS.some(h => !taken(h));
  let k = HERO_IDS.indexOf(me.hero);
  for (let n = 0; n < HERO_IDS.length; n++) { k = (k + dir + HERO_IDS.length) % HERO_IDS.length; if (!free || !taken(HERO_IDS[k])) break; }
  me.hero = HERO_IDS[k]; sound.play({ type: 'join' }); ui.showLobby(lobby);
}
function leaveLobby(i) {
  const [gone] = lobby.splice(i, 1); if (gone) input.blockJoin(gone.dev);
  if (!lobby.length) toTitle(); else ui.showLobby(lobby);
}
function startMission() {
  if (!lobby || !lobby.length) return;
  devices = lobby.map(l => l.dev); picks = lobby.map(l => l.hero); lobby = null;
  restart();
}
function toTitle() {
  devices = []; picks = []; lobby = null; started = false; complete = false; paused = false;
  S = createWorld({ seed: newSeed(), players: 0 }); view.reset();
  ui.toTitle(); input.swallowAll(); input.clearJoins();
}

function tryJoin() {
  if (paused || complete) return;
  if (lobby) {
    for (const dev of input.pollJoins(new Set(lobby.map(l => l.dev)))) if (lobby.length < 4) { lobby.push({ dev, hero: freeHero() }); sound.play({ type: 'join' }); ui.showLobby(lobby); }
    return;
  }
  if (!started) {   // the cover page: the first press opens the lobby
    const [dev] = input.pollJoins(new Set());
    if (dev && !ui.helpOpen && !ui.subPage()) { sound.play({ type: 'join' }); openLobby([{ dev, hero: HERO_IDS[0] }]); }
    return;
  }
  // Mid-mission: drop straight in, as the first hero nobody is playing
  for (const dev of input.pollJoins(new Set(devices))) {
    if (devices.length >= 4) break;
    const slot = devices.length;
    devices.push(dev); picks.push(null);
    addPlayer(S, slot, devices.length === 1);
    sound.play({ type: 'join' });
  }
}

function handleMenus() {
  for (const ev of input.takeMenuEvents()) {
    if (ui.capturing) continue;   // the settings page is waiting for a key to bind
    if (lobby && !ui.helpOpen && !ui.subPage()) {
      const i = lobby.findIndex(l => l.dev === ev.dev);
      if (i < 0) continue;   // not in yet: their press joins them (tryJoin)
      if (ev.type === 'left' || ev.type === 'right') pickHero(i, ev.type === 'left' ? -1 : 1);
      else if (ev.type === 'confirm') startMission();
      else if (ev.type === 'back' || ev.type === 'pause') leaveLobby(i);
      else if (ev.type === 'help') ui.toggleHelp(true);
      continue;
    }
    if ((ev.type === 'back' || ev.type === 'pause') && (ui.helpOpen || ui.subPage()) && ui.back()) continue;   // out of a sub-page, one step
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
    if (k) slowMotion(overlay.impact(ev.x !== undefined ? ev.x : S.cam.x, ev.y !== undefined ? ev.y : S.cam.y, k), 0.4);
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
    // An impact panel slows the world for a moment (slow motion, above)
    const scale = slow.t > 0 ? slow.scale : 1;
    if (slow.t > 0) slow.t -= dt;
    acc += dt * scale; let n = 0;
    while (acc >= DT && n < 5) { stepSim(); acc -= DT; n++; }
    if (n === 5) acc = 0;
  }
  music.update(dt, started ? S : null, halted && started);
  sound.update(started && !halted ? S : null);
  try {
    view.render(S, halted ? 1 : Math.min(1, acc / DT), dt);
    overlay.draw(started ? S : null, halted ? 0 : dt);
    if (started) ui.update(S, dt, devices);
  } catch (err) { console.error(err); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Test hooks for automated checks (harmless otherwise)
window.__X = {
  get S() { return S; }, get lobby() { return lobby; }, view, ui, input, sound, music, overlay, SETTINGS, manual: false, inject: null,
  // Joins straight into the mission (the lobby is for people; the tools skip it)
  join(dev = 'kbm') { lobby = null; devices.push(dev); picks.push(null); addPlayer(S, devices.length - 1, devices.length === 1); if (!started) { started = true; ui.hideStart(); } },
  step(n = 1) { for (let i = 0; i < n; i++) stepSim(); },
  stats() { return { fps, players: S.players.length, enemies: S.enemies.length, tick: S.tick, sec: S.mission.sec, phase: S.mission.phase }; },
};
