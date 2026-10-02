// The HUD and menus, as comic captions: a plate per player (health, their hero's resource, what is ready),
// the shared X-Gauge, the Sentinels' adaptation, the mission and the kid, banners for the big beats, and the
// pages: the cover (start), controls, pause and settings, the debrief.
// The HUD lives in two bands above and below the game view (#hud-top, #hud-bottom), never over it: banners and
// the team ultimate's letterbox take over the bands. Only the pages, on a paused or finished game, cover the view.
// tools/layout.mjs checks that no HUD element reaches into the view.
import { HEROES, GAUGE, ADAPT, SQUAD, METER } from './sim/config.js';
import { STYLE_RANKS } from './sim/combo.js';
import { SECTIONS, MISSION_NAME } from './sim/mission.js';
import { PLAYER_COLORS, HERO_LOOKS } from './looks.js';
import { SETTINGS, saveSettings, bindKey, resetKeys, keyLabel } from './settings.js';

const ROLE = { cyclops: 'The tactician', wolverine: 'The berserker', jean: 'The mover' };
const BLURB = {
  cyclops: 'Optic blasts that bank off walls at true angles. Hold Power to open the visor wider: more damage, a beam that pierces, more banks. Signature: Tactical Call tags a target for the team.',
  wolverine: 'Claws up close; hold Power to coil the Drill Claw and lunge through everything in line. Rage heals him, or sends him berserk with Signature.',
  jean: 'Hold Power to grab what she aims at, a Sentinel, a crate, a shot, a teammate, and let go to throw it. Holding jump in the air, she levitates. Signature: the TK Shield.',
};
const COUNTER_TIP = { optic: 'Optic blasts glance off. Try claws, telekinesis or a team-up.', claws: 'Claws cannot bite. Try optic blasts, telekinesis or a team-up.', tk: 'Magnetic anchors: Jean cannot grip them. Try blasts, claws or a team-up.' };
const HINTS_KEY = 'xmen-team-edition-hints';
const loadHints = () => { try { return new Set(JSON.parse(localStorage.getItem(HINTS_KEY) || '[]')); } catch (e) { return new Set(); } };
const PAD_LABEL = { attack: 'X', power: 'RB', jump: 'A', evade: 'B', sig: 'Y', team: 'LB' };
const POWER_TIP = {
  cyclops: k => `Hold ${k('power')} to open the visor wider, let go to fire: blasts bank off walls`,
  wolverine: k => `Hold ${k('power')} to coil the Drill Claw, let go to lunge through everything in line`,
  jean: k => `Hold ${k('power')} to grab what you aim at, let go to throw it`,
};
const KEY_ROWS = [['left', 'Move left'], ['right', 'Move right'], ['up', 'Up (aim, launcher)'], ['down', 'Down (drop through)'], ['jump', 'Jump'],
  ['attack', 'Attack'], ['power', 'Power'], ['evade', 'Evade'], ['sig', 'Signature'], ['team', 'Team']];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const pct = (v, m) => `${Math.max(0, Math.min(100, (v / m) * 100)).toFixed(1)}%`;

export class UI {
  constructor(root, actions) {
    this.root = root; this.A = actions;
    const topBand = document.getElementById('hud-top'), bottomBand = document.getElementById('hud-bottom');
    this.hudTop = el('div', 'row'); topBand.appendChild(this.hudTop);
    this.hudBottom = el('div', 'row'); bottomBand.appendChild(this.hudBottom);
    // Three columns: the mission caption (or the Sentinels' alert in its place), the X-Gauge, the kid
    const left = el('div', 'left'); this.hudTop.appendChild(left);
    this.adapt = el('div', 'adapt'); this.adapt.hidden = true; left.appendChild(this.adapt);
    this.tipEl = el('div', 'tip'); this.tipEl.hidden = true; left.appendChild(this.tipEl);
    this.missionEl = el('div', 'mission'); left.appendChild(this.missionEl);
    this.top = el('div', 'topbar'); this.hudTop.appendChild(this.top);
    this.gauge = el('div', 'gauge', '<div class="lbl"><span>X-Gauge</span><span class="hint"></span></div><div class="meter"><i></i></div>'); this.top.appendChild(this.gauge);
    const right = el('div', 'right'); this.hudTop.appendChild(right);
    this.kid = el('div', 'kidplate', '<b>The kid</b><span></span><div class="meter hp"><i></i></div>'); right.appendChild(this.kid);
    this.plates = el('div', 'plates'); this.hudBottom.appendChild(this.plates);
    this.topBand = topBand;
    this.letterbox = [topBand, bottomBand].map(b => { const l = el('div', 'letterbox'); b.appendChild(l); return l; });
    this.bannerEl = null; this.bannerT = 0;
    this.plateEls = new Map();
    this.hudTop.hidden = this.hudBottom.hidden = true;
    this.screen = null; this.pageKind = ''; this.paused = false; this.helpOpen = false; this.capturing = null;
    this.hintsSeen = loadHints(); this.tipT = 0; this.devices = [];
    this.showStart();
  }

  // ---- Pages ------------------------------------------------------------------------------------------------
  page(html, cls = '') {
    this.closePage();
    const s = el('div', 'screen ' + cls, `<div class="page">${html}</div>`);
    this.root.appendChild(s); this.screen = s; this.pageKind = cls;
    s.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => this.act(b.dataset.act, b.dataset)));
    this.sel = 0; this.focusSel();
    return s;
  }
  closePage() { if (this.screen) { this.screen.remove(); this.screen = null; this.pageKind = ''; } this.capturing = null; }
  act(a, d = {}) {
    if (a === 'resume') this.A.resume();
    else if (a === 'restart') this.A.restart();
    else if (a === 'help') this.toggleHelp(true);
    else if (a === 'settings') this.showSettings();
    else if (a === 'back') this.back();
    else if (a === 'again') this.A.restart();
    else if (a === 'title') this.A.title();
    else if (a === 'heroes') this.A.heroes();
    else if (a === 'start') this.A.start();
    else if (a === 'pick') this.A.pick(+d.i, +d.dir);
    else if (a === 'leave') this.A.leave(+d.i);
    else if (a === 'ask-restart') this.confirm('Restart the mission?', 'Everyone goes back to the rooftop, and this run is lost.', 'restart');
    else if (a === 'ask-title') this.confirm('Quit to the title page?', 'This run is lost. Everyone joins again from the cover.', 'title');
    else if (a === 'bind') this.captureKey(d.k);
    else if (a === 'reset-keys') { resetKeys(); this.showSettings(); }
    else if (a === 'hints-again') { this.hintsSeen.clear(); this.saveHints(); this.showSettings(); }
  }
  // Out of a sub-page (controls, settings, a confirmation) to the page it came from. False when not on one.
  back() {
    if (this.capturing) return true;
    if (this.helpOpen) { this.toggleHelp(false); return true; }
    if (!this.subPage()) return false;
    this.parentPage();
    return true;
  }
  subPage() { return this.pageKind === 'settings' || this.pageKind === 'confirm'; }
  parentPage() {
    if (this.paused) this.showPause();
    else if (this.results) this.showResults(this.results);
    else if (this.lobby) this.showLobby(this.lobby);
    else if (!this.started) this.showStart();
    else this.closePage();
  }
  // Gamepad and arrow keys move between the buttons on a page; confirm presses the selected one
  menuNav(ev) {
    if (!this.screen) return false;
    const bs = [...this.screen.querySelectorAll('.btn')];
    if (!bs.length) return false;
    if (ev.type === 'up' || ev.type === 'left') this.sel = (this.sel - 1 + bs.length) % bs.length;
    else if (ev.type === 'down' || ev.type === 'right') this.sel = (this.sel + 1) % bs.length;
    else if (ev.type === 'confirm') { bs[this.sel].click(); return true; }
    else if (ev.type === 'back') { this.back(); return true; }
    this.focusSel(); return true;
  }
  focusSel() { if (!this.screen) return; const bs = [...this.screen.querySelectorAll('.btn')]; bs.forEach((b, i) => b.classList.toggle('sel', i === this.sel)); }

  showStart() {
    this.started = false; this.lobby = null; this.results = null;
    const cards = ['cyclops', 'wolverine', 'jean'].map(h => `<div class="hero" style="--hc:${HERO_LOOKS[h].base === '#f5c518' ? '#e0a800' : HERO_LOOKS[h].base}"><b>${HERO_LOOKS[h].name}</b><span>${ROLE[h]}</span><p>${BLURB[h]}</p></div>`).join('');
    this.page(`
      <span class="caption">Unofficial fan prototype · issue #1</span>
      <h1>X-Men: Sentinel Strike<small>Team Edition</small></h1>
      <p class="lede">A Sentinel factory has a young mutant in its cells. Get in, break her out, and get her to the X-Jet. The Sentinels study how you fight and field counter-tech against the power you lean on, so rotate, and fight as a team: every pair has a team-up.</p>
      <div class="join">Click, press a key or a gamepad button to join</div>
      <p class="lede touchnote">This game needs a keyboard and mouse or a gamepad; touch controls are not supported.</p>
      <div class="roster">${cards}</div>
      <p class="lede"><b>Alone</b>, you run all three as a squad: tap <kbd>Team</kbd> to tag the next hero in, hold it to call a benched hero's assist. <b>With friends</b> (up to four, each on a gamepad or the keyboard), stand together and press <kbd>Team</kbd> for that pair's team-up.</p>
      <div class="btns"><button class="btn" data-act="help">Controls</button><button class="btn" data-act="settings">Settings</button></div>
      <p class="fine">An unofficial, non-commercial fan prototype made with placeholder art and synthesized sound. Not affiliated with, endorsed or sponsored by Marvel. X-Men, Cyclops, Wolverine, Jean Grey and the Sentinels are trademarks of Marvel Characters, Inc.</p>`, 'start');
  }
  hideStart() { this.started = true; this.lobby = null; this.results = null; this.closePage(); this.hudTop.hidden = this.hudBottom.hidden = false; }
  // Back to the cover: the HUD empties until the next mission
  toTitle() {
    this.paused = false; this.helpOpen = false;
    for (const P of this.plateEls.values()) P.remove();
    this.plateEls.clear();
    if (this.bannerEl) { this.bannerEl.remove(); this.bannerEl = null; }
    this.hudTop.hidden = this.hudBottom.hidden = true;
    this.showStart();
  }

  // The lobby: each player who has joined, their device and the hero they pick
  showLobby(lobby) {
    this.lobby = lobby; this.results = null; this.started = false;
    const dev = d => (d === 'kbm' ? 'Keyboard and mouse' : `Gamepad ${+d.slice(3) + 1}`);
    const keys = d => (d === 'kbm' ? `<kbd>${keyLabel(SETTINGS.keys.left[0])}</kbd> <kbd>${keyLabel(SETTINGS.keys.right[0])}</kbd> or <kbd>←</kbd> <kbd>→</kbd> to change, <kbd>Esc</kbd> to leave` : 'D-pad ← → to change, B to leave');
    const cards = lobby.map((l, i) => `<div class="slot" style="--pc:${PLAYER_COLORS[i]};--hc:${HERO_LOOKS[l.hero].energy}">
        <div class="who"><b>P${i + 1}</b><span>${dev(l.dev)}</span></div>
        <div class="pick"><button class="btn arrow" data-act="pick" data-i="${i}" data-dir="-1" aria-label="Previous hero">◀</button>
          <div class="hn"><b>${HERO_LOOKS[l.hero].name}</b><span>${ROLE[l.hero]}</span></div>
          <button class="btn arrow" data-act="pick" data-i="${i}" data-dir="1" aria-label="Next hero">▶</button></div>
        <p class="keys">${keys(l.dev)}</p>
        <button class="btn small" data-act="leave" data-i="${i}">Leave</button></div>`).join('');
    const open = Array.from({ length: 4 - lobby.length }, (_, i) => `<div class="slot open"><b>P${lobby.length + i + 1}</b><span>Press a button on a gamepad, or a key, to join</span></div>`).join('');
    const solo = lobby.length === 1 ? `<p class="lede">Alone, your pick leads the squad; tap <kbd>Team</kbd> in the mission to tag the others in.</p>` : `<p class="lede">Each player is one hero. Stand together and press <kbd>Team</kbd> for that pair's team-up.</p>`;
    this.page(`<span class="caption">Ready room</span><h2>Who's going in?</h2>
      <div class="slots">${cards}${open}</div>${solo}
      <div class="btns"><button class="btn" data-act="start">Start the mission</button><button class="btn" data-act="help">Controls</button><button class="btn" data-act="title">Back</button></div>
      <p class="fine">Anyone who has joined can start: <kbd>Enter</kbd> or A.</p>`, 'lobby');
  }

  confirm(title, text, yes) {
    this.page(`<span class="caption">Are you sure?</span><h2>${title}</h2><p class="lede">${text}</p>
      <div class="btns"><button class="btn" data-act="back">No, go back</button><button class="btn" data-act="${yes}">Yes</button></div>`, 'confirm');
  }

  helpHtml() {
    const K = SETTINGS.keys, kb = a => K[a].length ? K[a].map(c => `<kbd>${keyLabel(c)}</kbd>`).join(' or ') : '<em>unbound</em>';
    const hero = h => `<div class="hero" style="--hc:${HERO_LOOKS[h].energy}"><b>${HERO_LOOKS[h].name}</b><span>${ROLE[h]}</span><p>${BLURB[h]}</p></div>`;
    return `<h2>Controls</h2>
      <table><tr><th>Input</th><th>Keyboard and mouse</th><th>Gamepad</th><th>Does</th></tr>
      <tr><td>Move</td><td>${kb('left')} ${kb('right')}, ${kb('up')} ${kb('down')} to aim up or down (or the arrows)</td><td>Left stick</td><td>Down and Jump drops through a walkway</td></tr>
      <tr><td>Aim</td><td>Mouse</td><td>Right stick</td><td>Without aim, you aim the way you move</td></tr>
      <tr><td>Attack</td><td>${kb('attack')} or left click</td><td>X</td><td>A string of quick strikes (pause before the last for a different finisher); hold it through the first for a charged heavy. Forward, up or down and Attack: a lunge, a launcher (jump straight after a hit to follow it up), a sweep. Attack while running: a dash strike. In the air, two strikes, or down and Attack to dive. Right after a perfect Evade, a heavy counter</td></tr>
      <tr><td>Power</td><td>${kb('power')} or right click</td><td>RB / RT</td><td>Your hero's core power: tap for a quick one, hold to build it. A tap with forward or up held is a special move. Right after a perfect Evade, a power counter</td></tr>
      <tr><td>Throw</td><td>Attack and Power together</td><td>X and RB</td><td>Beside a Sentinel: a throw (hold back or up to throw that way). By a stunned Sentinel: an execution</td></tr>
      <tr><td>Jump</td><td>${kb('jump')}</td><td>A</td><td>Jump; hold in the air for your hero's own movement</td></tr>
      <tr><td>Evade</td><td>${kb('evade')}</td><td>B</td><td>Dash through danger; timed into a hit, a perfect defence that opens a counter</td></tr>
      <tr><td>Signature</td><td>${kb('sig')}</td><td>Y</td><td>Your hero's own move. With forward held, your super (one bar of your meter); with up held, your ultimate (two bars)</td></tr>
      <tr><td>Team</td><td>${kb('team')}</td><td>LB / LT</td><td>Next to (or aiming at) an ally: your pair's team-up. Alone: tap to tag, hold for an assist</td></tr>
      <tr><td>Team ultimate</td><td>Team and Signature</td><td>LB and Y</td><td>With a full X-Gauge: To Me, My X-Men</td></tr>
      <tr><td>Pause, controls</td><td><kbd>Esc</kbd>, <kbd>H</kbd></td><td>Start, View</td><td>Keys can be changed in Settings</td></tr></table>
      <div class="roster" style="margin-top:14px">${hero('cyclops')}${hero('wolverine')}${hero('jean')}</div>
      <h3>Team-ups</h3>
      <table><tr><td><b>Fastball Special</b></td><td>Jean and Wolverine: she holds him over her head, aims, and throws him claws-first through everything in line</td></tr>
      <tr><td><b>Psychic Rapport</b></td><td>Cyclops and Jean: for a while her telekinesis bends his blasts round cover onto Sentinels he cannot see</td></tr>
      <tr><td><b>Optic Edge</b></td><td>Cyclops and Wolverine: a blast into his claws; his next strikes throw optic shockwaves</td></tr>
      <tr><td><b>Lift and Hold</b></td><td>Jean aiming at a Sentinel: she pins it in the air, and everyone's hits on it land harder</td></tr></table>
      <h3>Combos</h3>
      <p class="fine">Every hit freezes you and the Sentinel for a moment. Strings stagger and knock down; launchers send Sentinels up for air strikes, and the more hits they take in the air the faster they fall, until they flip out. One hit on a Sentinel lying down picks it back up. Damage tapers after the third hit of a combo, and faster for a move you repeat: mix your moves to climb the style rank from D to X, which fills the three-bar meter on your plate. Enough battering stuns a Sentinel.</p>
      <p class="fine">Team-ups, assists and Tactical Call hits are never countered by the Sentinels' adaptations, and they fill the shared X-Gauge. Every telegraph has a colour: white, parry or evade it; magenta, a heavy blow (a perfect Evade, or get clear); violet with "!!", unblockable (move).</p>
      <div class="btns"><button class="btn" data-act="back">Back</button></div>`;
  }
  toggleHelp(on = !this.helpOpen) {
    this.helpOpen = on;
    if (on) this.page(this.helpHtml(), 'help');
    else this.parentPage();
  }
  showPause() {
    this.page(`<span class="caption">Paused</span><h2>Meanwhile, at the Sentinel Works...</h2>
      <div class="btns" style="flex-direction:column;align-items:flex-start"><button class="btn" data-act="resume">Resume</button>
      <button class="btn" data-act="help">Controls</button><button class="btn" data-act="settings">Settings</button>
      <button class="btn" data-act="ask-restart">Restart the mission</button><button class="btn" data-act="ask-title">Quit to the title page</button></div>`, 'pause');
  }
  setPaused(on) { this.paused = on; if (on) this.showPause(); else { this.helpOpen = false; this.closePage(); } }
  showSettings() {
    const rows = [
      ['volume', 'Sound volume', 'range'], ['music', 'Music volume', 'range'], ['shake', 'Screen shake', 'check'], ['impactPanels', 'Impact panels', 'check'],
      ['sfxWords', 'Lettered sound effects', 'check'], ['rumble', 'Controller rumble', 'check'], ['holdToggle', 'Power hold as a toggle', 'check'], ['hints', 'First-time hints', 'check'], ['clarity', 'Clarity (fewer particles)', 'check'], ['reduceFlashing', 'Reduce flashing', 'check'], ['quality', 'Quality', 'select'],
    ];
    const html = rows.map(([k, label, kind]) => {
      if (kind === 'range') return `<label class="setting"><span>${label}</span><input type="range" min="0" max="1" step="0.05" value="${SETTINGS[k]}" data-k="${k}"></label>`;
      if (kind === 'check') return `<label class="setting"><span>${label}</span><input type="checkbox" ${SETTINGS[k] ? 'checked' : ''} data-k="${k}"></label>`;
      return `<label class="setting"><span>${label}</span><select data-k="${k}"><option value="high" ${SETTINGS.quality === 'high' ? 'selected' : ''}>High (shadows, halftone)</option><option value="low" ${SETTINGS.quality === 'low' ? 'selected' : ''}>Low</option></select></label>`;
    }).join('');
    const keys = KEY_ROWS.map(([a, label]) => `<div class="setting"><span>${label}</span><button class="btn small key${SETTINGS.keys[a].length ? '' : ' unbound'}" data-act="bind" data-k="${a}">${SETTINGS.keys[a].map(keyLabel).join(' / ') || 'unbound'}</button></div>`).join('');
    const s = this.page(`<h2>Settings</h2><div class="settings">${html}</div>
      <h3>Keyboard</h3><p class="fine" style="margin-top:0">Click an action, then press its new key (<kbd>Esc</kbd> cancels). A key taken from another action leaves it. Esc, P, H and Enter stay the menu keys; the arrows always move.</p>
      <div class="settings">${keys}</div>
      <div class="btns"><button class="btn" data-act="back">Back</button><button class="btn small" data-act="reset-keys">Default keys</button><button class="btn small" data-act="hints-again">Show the hints again</button></div>`, 'settings');
    s.querySelectorAll('[data-k]:not(button)').forEach(inp => inp.addEventListener('input', () => {
      const k = inp.dataset.k; SETTINGS[k] = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? +inp.value : inp.value;
      saveSettings();
    }));
  }
  // Wait for the next key and bind it to the action; Esc cancels
  captureKey(action) {
    const btn = this.screen && this.screen.querySelector(`button[data-k="${action}"]`);
    if (!btn) return;
    this.capturing = action; btn.textContent = 'Press a key…'; btn.classList.add('listening');
    const onKey = e => {
      e.preventDefault(); e.stopImmediatePropagation();
      window.removeEventListener('keydown', onKey, true);
      const was = this.capturing; this.capturing = null;
      if (e.code !== 'Escape' && was) bindKey(was, e.code);
      if (this.pageKind === 'settings') this.showSettings();
    };
    window.addEventListener('keydown', onKey, true);
  }
  showResults(S) {
    this.results = S;
    const T = S.mission.stats, d = T.dmg, total = Object.values(d).reduce((a, b) => a + b, 0) || 1;
    const secs = Math.round(S.mission.t / 60), mm = Math.floor(secs / 60), ss = String(secs % 60).padStart(2, '0');
    const share = k => `${Math.round((d[k] / total) * 100)}%`;
    this.page(`<span class="caption">The end... for now</span><h1>Mission complete!<small>${MISSION_NAME}</small></h1>
      <p class="lede">She is aboard the X-Jet. The Sentinels will remember how you fought.</p>
      <div class="cols"><table><tr><th>The debrief</th><th></th></tr>
        <tr><td>Time</td><td>${mm}:${ss}</td></tr><tr><td>Sentinels down</td><td>${T.kills}</td></tr><tr><td>Team-ups</td><td>${T.teamups}</td></tr>
        <tr><td>Assists</td><td>${T.assists}</td></tr><tr><td>Perfect defences</td><td>${T.perfects}</td></tr><tr><td>Heroes down</td><td>${T.downs}</td></tr><tr><td>Sections restarted</td><td>${T.fails}</td></tr></table>
      <table><tr><th>Damage by</th><th></th></tr><tr><td>Team play</td><td>${share('team')}</td></tr><tr><td>Optic blasts</td><td>${share('optic')}</td></tr>
        <tr><td>Claws</td><td>${share('claws')}</td></tr><tr><td>Telekinesis</td><td>${share('tk')}</td></tr><tr><td>Everything else</td><td>${share('plain')}</td></tr></table></div>
      <div class="btns"><button class="btn" data-act="again">Play again</button><button class="btn" data-act="heroes">Change heroes</button><button class="btn" data-act="title">Title page</button></div>`, 'results');
  }

  banner(text, sub = '', bad = false, secs = 2.2) {
    if (this.bannerEl) this.bannerEl.remove();
    this.bannerEl = el('div', 'banner' + (bad ? ' bad' : ''), `<strong>${text}</strong>${sub ? `<span>${sub}</span>` : ''}`);
    this.topBand.appendChild(this.bannerEl); this.bannerT = secs;
  }

  onEvent(ev, S) {
    // A standard tell close to a hero: how to answer it
    if (ev.type === 'telegraph' && ev.cat === 'standard' && S) {
      const p = S.players.find(q => Math.abs(q.x - ev.x) < 5 && Math.abs(q.y - ev.y) < 4);
      if (p) this.hint('evade', p, k => `A white glint: ${k('evade')} just as it lands, then ${k('attack')} to counter`);
    }
    switch (ev.type) {
      case 'sectionStart': this.banner(ev.name, ev.sec === 1 ? 'Break the cell door' : ev.sec === 3 ? 'The Mk-II guards the X-Jet' : 'Sentinels incoming'); break;
      case 'sectionClear': this.banner('Clear!', ev.sec === 1 ? 'Keep her close: Collectors come for her' : 'The way ahead is open'); break;
      case 'missionFail': this.banner('Mission failed', ev.why === 'kid' ? 'They took the kid' : 'The team is down', true, 2.4); break;
      case 'checkpoint': this.banner('Again!', ev.name, false, 1.6); break;
      case 'kidReleased': this.banner('She is free!', 'Get her to the X-Jet', false, 1.8); break;
      case 'escape': this.banner('The Mk-II is down!', 'Run for the X-Jet', false, 2); break;
      case 'missionComplete': this.A.complete(); break;
    }
  }

  update(S, dt, devices = []) {
    if (!S) return;
    this.devices = devices;
    if (this.tipT > 0 && (this.tipT -= dt) <= 0) this.tipEl.hidden = true;
    this.hints(S);
    if (this.bannerEl && (this.bannerT -= dt) <= 0) { this.bannerEl.remove(); this.bannerEl = null; }
    const M = S.mission;
    this.missionEl.textContent = `${MISSION_NAME} · ${SECTIONS[M.sec] ? SECTIONS[M.sec].name : ''}`;
    // The X-Gauge
    const full = S.gauge >= GAUGE.max;
    this.gauge.querySelector('i').style.width = pct(S.gauge, GAUGE.max);
    this.gauge.querySelector('.hint').textContent = full ? 'Team + Signature!' : '';
    this.gauge.classList.toggle('full', full);
    // The Sentinels' adaptation
    const A = S.adapt;
    if (A.warn) { this.adapt.hidden = false; this.adapt.innerHTML = `Sentinels adapting: ${A.warn}<small>Counter-tech incoming. Switch powers or use a team-up.</small>`; }
    else if (A.active) { this.adapt.hidden = false; this.adapt.innerHTML = `Adapted: ${ADAPT.counters[A.active].name}<small>${COUNTER_TIP[A.active]}</small>`; }
    else this.adapt.hidden = true;
    // The kid
    const k = S.kid;
    if (k) {
      const status = { caged: 'In her cell', follow: 'With you', cower: 'Scared', carried: 'Taken!', held: 'Safe in the grip', downed: 'Down!', run: 'Running!', boarded: 'Aboard' }[k.state] || '';
      this.kid.querySelector('span').textContent = status;
      this.kid.querySelector('i').style.width = pct(k.hp, k.maxHp);
      this.kid.classList.toggle('alarm', k.state === 'carried' || k.state === 'downed');
    }
    // Ultimate letterbox
    for (const l of this.letterbox) l.classList.toggle('on', !!(S.ult && S.ult.phase !== 'end'));
    // Player plates
    const seen = new Set();
    for (const p of S.players) {
      seen.add(p.id);
      let P = this.plateEls.get(p.id);
      if (!P) {
        P = el('div', 'plate', `<div class="top"><span class="tag"></span><span class="name"></span><span class="role"></span><span class="combo" hidden></span><span class="pips" title="Meter"><i></i><i></i><i></i></span></div><div class="meter hp"><i></i></div>
          <div class="meter res r1"><i></i><b></b></div><div class="meter res r2"><i></i><b></b></div><div class="foot"><div class="chips"></div><div class="bench"></div></div>`);
        P.style.setProperty('--pc', PLAYER_COLORS[p.slot]); this.plates.appendChild(P); this.plateEls.set(p.id, P);
      }
      this.fillPlate(P, p, S);
    }
    for (const [id, P] of this.plateEls) if (!seen.has(id)) { P.remove(); this.plateEls.delete(id); }
  }

  // ---- First-time hints --------------------------------------------------------------------------------------
  // One line in the top band, in the mission caption's place, each shown once (remembered in this browser) and
  // never over the game view. Keys are named for the player's own device and bindings.
  hints(S) {
    if (!SETTINGS.hints || this.tipT > 0) return;
    for (const p of S.players) {
      if (p.state === 'downed') continue;
      if (S.enemies.some(e => !e.dead && Math.abs(e.x - p.x) < 9 && Math.abs(e.y - p.y) < 5)) this.hint('power-' + p.hero, p, POWER_TIP[p.hero]);
      if (p.squad && p.hp < p.maxHp * 0.5 && p.tagCd === 0) this.hint('tag', p, k => `Hurt? Tap ${k('team')} to tag in a fresh hero; hold it to call an assist`);
      if (p.meter >= 100) this.hint('super', p, k => `A bar of meter: ${k('sig')} with forward held is your super; two bars and up, your ultimate`);
      if (S.enemies.some(e => !e.dead && e.state === 'stun' && Math.abs(e.x - p.x) < 4)) this.hint('exec', p, k => `Stunned! ${k('attack')} and ${k('power')} together beside it: an execution`);
      if (!p.squad && p.teamCd === 0 && S.players.some(q => q !== p && q.state !== 'downed' && Math.hypot(q.x - p.x, q.y - p.y) < 3.6)) this.hint('teamup', p, k => `Side by side: press ${k('team')} for your pair's team-up`);
      if (this.tipT > 0) return;
    }
    if (S.gauge >= GAUGE.max && S.players[0]) this.hint('ult', S.players[0], k => `X-Gauge full: ${k('team')} and ${k('sig')} together call the team ultimate`);
  }
  hint(id, p, text) {
    if (!SETTINGS.hints || this.tipT > 0 || this.hintsSeen.has(id)) return;
    const dev = this.devices[p.slot] || 'kbm';
    const k = a => `<kbd>${dev === 'kbm' ? keyLabel(SETTINGS.keys[a][0]) : PAD_LABEL[a]}</kbd>`;
    this.hintsSeen.add(id); this.saveHints();
    this.tipEl.innerHTML = `<b>P${p.slot + 1}</b> ${text(k)}`; this.tipEl.hidden = false; this.tipT = 5;
  }
  saveHints() { try { localStorage.setItem(HINTS_KEY, JSON.stringify([...this.hintsSeen])); } catch (e) { /* not remembered */ } }

  fillPlate(P, p, S) {
    const H = HEROES[p.hero], q = s => P.querySelector(s);
    q('.tag').textContent = `P${p.slot + 1}`; q('.name').textContent = H.name; q('.role').textContent = ROLE[p.hero];
    // The combo (its hits and style rank) takes the role's place while it lasts; the meter is three pips
    const K = p.streak, live = K && K.n >= 2, combo = q('.combo');
    q('.role').hidden = live; combo.hidden = !live;
    if (live) { const html = `${K.n} hits <em class="rank${K.rank}">${STYLE_RANKS[K.rank]}</em>`; if (combo.innerHTML !== html) combo.innerHTML = html; }
    q('.pips').querySelectorAll('i').forEach((pip, i) => { const f = Math.max(0, Math.min(1, ((p.meter || 0) - i * METER.bar) / METER.bar)); pip.style.setProperty('--f', f); pip.classList.toggle('full', f >= 1); });
    const hp = q('.meter.hp'); hp.querySelector('i').style.width = pct(p.hp, p.maxHp); hp.classList.toggle('low', p.hp < p.maxHp * 0.3);
    const r1 = q('.r1'), r2 = q('.r2'), chips = [];
    const res = (m, v, max, color, label) => { m.hidden = false; m.style.setProperty('--rc', color); m.querySelector('i').style.width = pct(v, max); m.querySelector('b').textContent = label; };
    r2.hidden = true;
    if (p.hero === 'cyclops') {
      res(r1, p.strain, H.optic.strainMax, p.overheatT > 0 ? '#9a8f98' : '#ff3a24', p.overheatT > 0 ? 'Breather' : 'Strain');
      chips.push(['Call', p.callCd === 0 ? 'on' : 'off']);
      if (p.openT > 0) chips.push([`Visor ${Math.round(Math.min(1, p.openT / H.optic.open) * 100)}%`, 'hot']);
    } else if (p.hero === 'wolverine') {
      res(r1, p.rage, H.rage.max, '#ff8a1f', 'Rage');
      if (p.berserkT > 0) chips.push(['Berserk!', 'hot']); else chips.push(['Berserk', p.rage >= H.rage.ready ? 'on' : 'off']);
      if (p.healing) chips.push(['Healing', 'on']);
    } else if (p.hero === 'jean') {
      res(r1, p.conc, H.tk.max, '#4fb3ff', 'Focus'); res(r2, p.phoenix, 100, p.burning ? '#ff3a24' : '#ffb02e', p.burning ? 'Phoenix: burning' : 'Phoenix');
      chips.push(['Shield', p.shieldT > 0 ? 'hot' : p.shieldCd === 0 ? 'on' : 'off']);
    }
    if (p.squad) chips.push(['Tag', p.tagCd === 0 ? 'on' : 'off']);
    else chips.push(['Team', p.teamCd === 0 ? 'on' : 'off']);
    if (p.markedBy) chips.push(['Marked', 'hot']);
    if (p.edge) chips.push(['Optic edge', 'hot']);
    if (S.rapportT > 0 && (p.hero === 'cyclops' || p.hero === 'jean')) chips.push(['Rapport', 'hot']);
    const ch = q('.chips'), html = chips.map(([t, c]) => `<span class="chip ${c}">${t}</span>`).join('');
    if (ch.innerHTML !== html) ch.innerHTML = html;
    const bench = q('.bench');
    if (p.squad) {
      const bh = p.squad.map(s => `<span class="${s.hero === p.hero ? 'cur' : ''} ${s.down ? 'down' : ''}" title="${HEROES[s.hero].name}">${HEROES[s.hero].name.split(' ')[0].slice(0, 3)}<i style="width:${pct(s.hero === p.hero ? p.hp : s.hp, HEROES[s.hero].hp)}"></i></span>`).join('');
      if (bench.innerHTML !== bh) bench.innerHTML = bh;
      bench.hidden = false;
    } else bench.hidden = true;
  }
}
