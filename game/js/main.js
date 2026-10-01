// Bootstrap: fixed 60 Hz simulation, interpolated rendering, drop-in joining, menus.
import { SETTINGS, loadSettings, DT, HEROES } from './config.js';
import { Input } from './input.js';
import { World } from './world.js';
import { View } from './render.js';
import { UI } from './ui.js';
import { Sound } from './audio.js';
import { Music } from './music.js';
import { Haptics } from './haptics.js';

loadSettings();
const app = document.getElementById('app');
const canvas = document.getElementById('game');
const input = new Input(canvas);
const world = new World();
const view = new View(canvas);
const sound = new Sound();
const music = new Music();
const haptics = new Haptics(input);
let started = false, paused = false;

const ui = new UI(document.getElementById('overlay'), {
  resume: () => setPaused(false),
  zone: id => { world.teleport(id); setPaused(false); },
  boss: id => { world.bossRush(id); setPaused(false); },
  pick: (p, c) => world.swapCharacter(p, c),
  remove: p => { sound.jet(p, false); world.removePlayer(p.slot); },
});

function resize() {
  const r = app.getBoundingClientRect();
  view.resize(Math.max(1, Math.floor(r.width)), Math.max(1, Math.floor(r.height)), world);
}
new ResizeObserver(resize).observe(app);
resize();

function setPaused(on) { paused = on; ui.setPaused(on, world); if (!on) { canvas.focus(); input.swallowAll(); } }

function tryJoin() {
  const devices = input.pollJoins(new Set(world.players.map(p => p.device)));
  for (const dev of devices) {
    if (world.players.length >= 4 || paused) break;
    // Each new player takes the first hero nobody is playing (Cyclops, Wolverine, Storm, Jean, Psylocke)
    const char = HEROES.find(c => !world.players.some(q => q.char === c)) || HEROES[world.players.length % HEROES.length];
    world.addPlayer(dev, char);
    if (!started) { started = true; ui.hideStart(); }
  }
  if (!started && input.gamepadBlocked) ui.gamepadNotice(true);
}

function handleMenuEvents() {
  for (const ev of input.takeMenuEvents()) {
    // The controls screen closes with any controller's B, A, Start or View (H or Esc on the keyboard); the
    // buttons that closed it don't also act in the game
    if (started && ui.helpOpen) {
      if (['back', 'confirm', 'pause', 'help'].includes(ev.type)) { ui.toggleHelp(false); input.swallowAll(); }
      else if (ev.type === 'up' || ev.type === 'down') ui.scrollHelp(ev.type === 'down' ? 1 : -1);   // the D-pad scrolls it
      continue;
    }
    const p = world.players.find(q => q.device === ev.dev);
    if (!started || (!p && ev.type !== 'help')) continue;
    if (ev.type === 'pause') setPaused(!paused);
    else if (ev.type === 'help') ui.toggleHelp();
    else if (ev.type === 'debug') ui.toggleDebug();
    else if (paused) ui.menuNav(ev);
    else if (ev.type === 'swap') { const i = HEROES.indexOf(p.char); world.swapCharacter(p, HEROES[(i + (ev.dir || 1) + HEROES.length) % HEROES.length]); }
    else if (ev.type === 'pick') world.swapCharacter(p, ev.char);
  }
}

function stepSim() {
  let cmds = {};
  for (const p of world.players) {
    cmds[p.slot] = input.sample(p.device, (mx, my) => view.aimFromMouse(mx, my, p), SETTINGS.p1Aim);
  }
  if (window.__NS.inject) cmds = window.__NS.inject(world.tick, cmds) || cmds;
  world.step(cmds);
  for (const ev of world.events) { view.onEvent(ev); sound.play(ev); ui.onEvent(ev, world); haptics.onEvent(ev); }
  world.events.length = 0;
}

// Browsers only allow audio after a click or key press; the score starts with the first one
const unlockAudio = () => { sound.unlock(); if (sound.ctx) music.start(sound.ctx); };
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

const IDLE = { players: [] };
let acc = 0, last = performance.now(), fps = 60, fpsT = 0, fpsN = 0;
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
  fpsT += dt; fpsN++; if (fpsT >= 0.5) { fps = fpsN / fpsT; fpsT = 0; fpsN = 0; }
  input.pollPadMenus();
  handleMenuEvents();
  tryJoin();
  const halted = paused || ui.helpOpen;   // the game waits while a menu or the controls screen is open
  if (started && !halted && !window.__NS.manual) {
    if (view.hitPause > 0) { view.hitPause -= dt; acc = 0; }   // an impact frame's hit-pause holds the world still
    else {
      acc += dt; let steps = 0;
      while (acc >= DT && steps < 5) { stepSim(); acc -= DT; steps++; }
      if (steps === 5) acc = 0;
    }
  }
  music.update(dt, started ? world : null, halted);
  sound.update(started && !halted ? world : IDLE);   // charge hums and wall-slide grind
  if (started && !halted) haptics.update(world);
  try {
    view.render(world, halted ? 1 : Math.min(1, acc / DT), dt);
    ui.update(dt, world, view, fps);
  } catch (err) {
    console.error(err);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Test hooks (used by automated checks; harmless otherwise)
window.__NS = {
  world, view, ui, input, music, sound, haptics, SETTINGS, manual: false, inject: null,
  start(char = 'cyclops') { if (!started) { world.addPlayer('kbm', char); started = true; ui.hideStart(); } },
  step(n = 1) { for (let i = 0; i < n; i++) stepSim(); },
  stats() { return { fps, players: world.players.length, enemies: world.enemies.length, tick: world.tick }; },
};
