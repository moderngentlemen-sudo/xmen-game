// Input: the six inputs (Attack, Power, Jump, Evade, Signature, Team) plus move and aim, from keyboard and
// mouse (one device) and up to four gamepads. Each simulation tick a device gives one command:
// { mx, my, ax, ay, aim, b }, b being the held buttons as bits. A press that comes and goes between two ticks
// still counts (it is reported held for one tick), so fast taps are never lost.
import { BTN } from './sim/config.js';
import { SETTINGS } from './settings.js';

const KEYMAP = {
  Space: 'jump', KeyJ: 'attack', KeyK: 'power', KeyL: 'evade', ShiftLeft: 'evade', ShiftRight: 'evade',
  KeyI: 'sig', KeyE: 'sig', KeyU: 'team', KeyQ: 'team',
};
// Mouse: left Attack, right Power, middle Signature, back Team, forward Evade
const MOUSE = { 0: 'attack', 2: 'power', 1: 'sig', 3: 'team', 4: 'evade' };
// Gamepad (standard mapping): A jump, X attack, B evade, Y signature, RB or RT power, LB or LT team
const PAD = { 0: 'jump', 2: 'attack', 1: 'evade', 3: 'sig', 5: 'power', 7: 'power', 4: 'team', 6: 'team' };

function deadzone(x, y, dz) {
  const m = Math.hypot(x, y);
  if (m < dz) return [0, 0];
  const s = Math.min(1, (m - dz) / (1 - dz)) / m;
  return [x * s, y * s];
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set(); this.kbTapped = new Set();
    this.mouse = { x: 0, y: 0, buttons: 0, moved: 0 }; this.mouseTapped = new Set();
    this.devices = {}; this.prevPads = {}; this.gamepadBlocked = false;
    this.menuEvents = []; this.anyKbm = false;
    window.addEventListener('keydown', e => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code); this.kbTapped.add(e.code); this.anyKbm = true;
      if (e.code === 'Escape' || e.code === 'KeyP') this.menuEvents.push({ dev: 'kbm', type: 'pause' });
      if (e.code === 'KeyH') this.menuEvents.push({ dev: 'kbm', type: 'help' });
      if (e.code === 'Enter') this.menuEvents.push({ dev: 'kbm', type: 'confirm' });
      if (e.code === 'ArrowUp') this.menuEvents.push({ dev: 'kbm', type: 'up' });
      if (e.code === 'ArrowDown') this.menuEvents.push({ dev: 'kbm', type: 'down' });
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.buttons = 0; });
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top; this.mouse.moved = performance.now();
    });
    canvas.addEventListener('mousedown', e => {
      if (e.button >= 3) e.preventDefault();
      this.mouse.buttons |= (1 << e.button); this.mouseTapped.add(e.button); this.anyKbm = true;
    });
    window.addEventListener('mouseup', e => { this.mouse.buttons &= ~(1 << e.button); });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  pads() {
    if (this.gamepadBlocked) return [];
    try { return Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter(Boolean); }
    catch (e) { this.gamepadBlocked = true; return []; }
  }

  // Devices that pressed something and are not yet playing
  pollJoins(assigned) {
    const out = [];
    if (this.anyKbm && !assigned.has('kbm')) out.push('kbm');
    this.anyKbm = false;
    for (const p of this.pads()) {
      const id = 'pad' + p.index;
      if (!assigned.has(id) && p.buttons.some((b, i) => b.pressed && i !== 9 && i !== 8)) out.push(id);
    }
    return out;
  }

  // Start, View and the D-pad drive the menus
  pollPadMenus() {
    for (const p of this.pads()) {
      const id = 'pad' + p.index, prev = this.prevPads[id] || [], now = p.buttons.map(b => b.pressed);
      const edge = i => now[i] && !prev[i];
      if (edge(9)) this.menuEvents.push({ dev: id, type: 'pause' });
      if (edge(8)) this.menuEvents.push({ dev: id, type: 'help' });
      if (edge(12)) this.menuEvents.push({ dev: id, type: 'up' });
      if (edge(13)) this.menuEvents.push({ dev: id, type: 'down' });
      if (edge(0)) this.menuEvents.push({ dev: id, type: 'confirm' });
      if (edge(1)) this.menuEvents.push({ dev: id, type: 'back' });
      this.prevPads[id] = now;
    }
  }
  takeMenuEvents() { const e = this.menuEvents; this.menuEvents = []; return e; }

  // One command for this tick. aimFromMouse(x, y) gives a unit vector from the player's hero to the pointer.
  sample(dev, aimFromMouse) {
    const st = this.devices[dev] || (this.devices[dev] = { toggled: 0, prevRaw: 0, grace: 0, lastAim: [1, 0], swallow: 0 });
    let raw = 0, mx = 0, my = 0, ax = 1, ay = 0, aim = false;
    const set = name => { raw |= BTN[name]; };
    if (dev === 'kbm') {
      const k = c => this.keys.has(c);
      mx = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
      my = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
      for (const [code, b] of Object.entries(KEYMAP)) if (k(code) || this.kbTapped.has(code)) set(b);
      for (const [i, b] of Object.entries(MOUSE)) if ((this.mouse.buttons & (1 << i)) || this.mouseTapped.has(+i)) set(b);
      this.kbTapped.clear(); this.mouseTapped.clear();
      // The mouse aims once it has moved over the game in the last few seconds
      if (aimFromMouse && performance.now() - this.mouse.moved < 4000) { const v = aimFromMouse(this.mouse.x, this.mouse.y); if (v) { aim = true; [ax, ay] = v; } }
    } else {
      const pad = this.pads().find(p => 'pad' + p.index === dev);
      if (pad) {
        const bt = i => !!pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.4);
        [mx, my] = deadzone(pad.axes[0] || 0, -(pad.axes[1] || 0), 0.22);
        if (bt(14)) mx = -1; if (bt(15)) mx = 1; if (bt(12)) my = 1; if (bt(13)) my = -1;
        for (const [i, b] of Object.entries(PAD)) if (bt(+i)) set(b);
        const [rx, ry] = deadzone(pad.axes[2] || 0, -(pad.axes[3] || 0), 0.3), rm = Math.hypot(rx, ry);
        if (rm > 0.35) { aim = true; ax = rx / rm; ay = ry / rm; st.grace = 18; st.lastAim = [ax, ay]; }
        else if (st.grace > 0) { st.grace--; aim = true; [ax, ay] = st.lastAim; }
      }
    }
    // Holds as toggles: a press of Power latches it until the next press
    if (SETTINGS.holdToggle) {
      const pressed = raw & ~st.prevRaw;
      if (pressed & BTN.power) st.toggled ^= BTN.power;
      st.prevRaw = raw;
      raw = (raw & ~BTN.power) | st.toggled;
    }
    // After a menu closes, whatever is still held from closing it does not act until released
    if (st.swallow) { st.swallow &= raw; raw &= ~st.swallow; }
    return { mx, my, ax, ay, aim, b: raw };
  }
  swallowAll() { for (const st of Object.values(this.devices)) st.swallow = 0x3f; this.kbTapped.clear(); this.mouseTapped.clear(); }
}
