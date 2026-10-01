// The HUD and menus, as comic captions: a plate per player (health, their hero's resource, what is ready),
// the shared X-Gauge, the Sentinels' adaptation, the mission and the kid, banners for the big beats, and the
// pages: the cover (start), controls, pause and settings, the debrief.
import { HEROES, GAUGE, ADAPT, SQUAD } from './sim/config.js';
import { SECTIONS, MISSION_NAME } from './sim/mission.js';
import { PLAYER_COLORS, HERO_LOOKS } from './looks.js';
import { SETTINGS, saveSettings } from './settings.js';

const ROLE = { cyclops: 'The tactician', wolverine: 'The berserker', jean: 'The mover' };
const BLURB = {
  cyclops: 'Optic blasts that bank off walls at true angles. Hold Power to open the visor wider: more damage, a beam that pierces, more banks. Signature: Tactical Call tags a target for the team.',
  wolverine: 'Claws up close; hold Power to coil the Drill Claw and lunge through everything in line. Rage heals him, or sends him berserk with Signature.',
  jean: 'Hold Power to grab what she aims at, a Sentinel, a crate, a shot, a teammate, and let go to throw it. Holding jump in the air, she levitates. Signature: the TK Shield.',
};
const COUNTER_TIP = { optic: 'Optic blasts glance off. Try claws, telekinesis or a team-up.', claws: 'Claws cannot bite. Try optic blasts, telekinesis or a team-up.', tk: 'Magnetic anchors: Jean cannot grip them. Try blasts, claws or a team-up.' };
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const pct = (v, m) => `${Math.max(0, Math.min(100, (v / m) * 100)).toFixed(1)}%`;

export class UI {
  constructor(root, actions) {
    this.root = root; this.A = actions;
    this.hud = el('div', 'hud'); root.appendChild(this.hud);
    this.missionEl = el('div', 'mission'); this.hud.appendChild(this.missionEl);
    this.top = el('div', 'topbar'); this.hud.appendChild(this.top);
    this.gauge = el('div', 'gauge', '<div class="lbl"><span>X-Gauge</span><span class="hint"></span></div><div class="meter"><i></i></div>'); this.top.appendChild(this.gauge);
    this.adapt = el('div', 'adapt'); this.adapt.hidden = true; this.top.appendChild(this.adapt);
    this.kid = el('div', 'kidplate', '<b>The kid</b><span></span><div class="meter hp"><i></i></div>'); this.hud.appendChild(this.kid);
    this.plates = el('div', 'plates'); this.hud.appendChild(this.plates);
    this.letterbox = el('div', 'letterbox', '<i></i><i></i>'); this.hud.appendChild(this.letterbox);
    this.bannerEl = null; this.bannerT = 0;
    this.plateEls = new Map();
    this.hud.hidden = true;
    this.screen = null; this.paused = false; this.helpOpen = false;
    this.showStart();
  }

  // ---- Pages ------------------------------------------------------------------------------------------------
  page(html, cls = '') {
    this.closePage();
    const s = el('div', 'screen ' + cls, `<div class="page">${html}</div>`);
    this.root.appendChild(s); this.screen = s;
    s.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => this.act(b.dataset.act)));
    this.sel = 0; this.focusSel();
    return s;
  }
  closePage() { if (this.screen) { this.screen.remove(); this.screen = null; } }
  act(a) {
    if (a === 'resume') this.A.resume();
    else if (a === 'restart') this.A.restart();
    else if (a === 'help') this.toggleHelp(true);
    else if (a === 'settings') this.showSettings();
    else if (a === 'back') { this.helpOpen = false; if (this.paused) this.showPause(); else if (!this.started) this.showStart(); else this.closePage(); }
    else if (a === 'again') this.A.restart();
  }
  // Gamepad and arrow keys move between the buttons on a page; confirm presses the selected one
  menuNav(ev) {
    if (!this.screen) return false;
    const bs = [...this.screen.querySelectorAll('.btn')];
    if (!bs.length) return false;
    if (ev.type === 'up') this.sel = (this.sel - 1 + bs.length) % bs.length;
    else if (ev.type === 'down') this.sel = (this.sel + 1) % bs.length;
    else if (ev.type === 'confirm') { bs[this.sel].click(); return true; }
    else if (ev.type === 'back') { this.act('back'); return true; }
    this.focusSel(); return true;
  }
  focusSel() { if (!this.screen) return; const bs = [...this.screen.querySelectorAll('.btn')]; bs.forEach((b, i) => b.classList.toggle('sel', i === this.sel)); }

  showStart() {
    this.started = false;
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
  hideStart() { this.started = true; this.closePage(); this.hud.hidden = false; }

  helpHtml() {
    const hero = h => `<div class="hero" style="--hc:${HERO_LOOKS[h].energy}"><b>${HERO_LOOKS[h].name}</b><span>${ROLE[h]}</span><p>${BLURB[h]}</p></div>`;
    return `<h2>Controls</h2>
      <table><tr><th>Input</th><th>Keyboard and mouse</th><th>Gamepad</th><th>Does</th></tr>
      <tr><td>Move</td><td><kbd>A</kbd> <kbd>D</kbd>, <kbd>W</kbd> <kbd>S</kbd> to aim up or down</td><td>Left stick</td><td>Down and Jump drops through a walkway</td></tr>
      <tr><td>Aim</td><td>Mouse</td><td>Right stick</td><td>Without aim, you aim the way you move</td></tr>
      <tr><td>Attack</td><td><kbd>J</kbd> or left click</td><td>X</td><td>A close combo; hold for a heavy finisher</td></tr>
      <tr><td>Power</td><td><kbd>K</kbd> or right click</td><td>RB / RT</td><td>Your hero's core power: tap for a quick one, hold to build it</td></tr>
      <tr><td>Jump</td><td><kbd>Space</kbd></td><td>A</td><td>Jump; hold in the air for your hero's own movement</td></tr>
      <tr><td>Evade</td><td><kbd>L</kbd> or <kbd>Shift</kbd></td><td>B</td><td>Dash through danger; timed into a hit, a perfect defence that opens a counter</td></tr>
      <tr><td>Signature</td><td><kbd>I</kbd> or <kbd>E</kbd></td><td>Y</td><td>Your hero's special move</td></tr>
      <tr><td>Team</td><td><kbd>U</kbd> or <kbd>Q</kbd></td><td>LB / LT</td><td>Next to (or aiming at) an ally: your pair's team-up. Alone: tap to tag, hold for an assist</td></tr>
      <tr><td>Team ultimate</td><td>Team and Signature</td><td>LB and Y</td><td>With a full X-Gauge: To Me, My X-Men</td></tr>
      <tr><td>Pause, controls</td><td><kbd>Esc</kbd>, <kbd>H</kbd></td><td>Start, View</td><td></td></tr></table>
      <div class="roster" style="margin-top:14px">${hero('cyclops')}${hero('wolverine')}${hero('jean')}</div>
      <h3>Team-ups</h3>
      <table><tr><td><b>Fastball Special</b></td><td>Jean and Wolverine: she holds him over her head, aims, and throws him claws-first through everything in line</td></tr>
      <tr><td><b>Psychic Rapport</b></td><td>Cyclops and Jean: for a while her telekinesis bends his blasts round cover onto Sentinels he cannot see</td></tr>
      <tr><td><b>Optic Edge</b></td><td>Cyclops and Wolverine: a blast into his claws; his next strikes throw optic shockwaves</td></tr>
      <tr><td><b>Lift and Hold</b></td><td>Jean aiming at a Sentinel: she pins it in the air, and everyone's hits on it land harder</td></tr></table>
      <p class="fine">Team-ups, assists and Tactical Call hits are never countered by the Sentinels' adaptations, and they fill the shared X-Gauge. Every telegraph has a colour: white, parry or evade it; magenta, a heavy blow (a perfect Evade, or get clear); violet with "!!", unblockable (move).</p>
      <div class="btns"><button class="btn" data-act="back">Back</button></div>`;
  }
  toggleHelp(on = !this.helpOpen) {
    this.helpOpen = on;
    if (on) this.page(this.helpHtml(), 'help');
    else if (this.paused) this.showPause(); else if (!this.started) this.showStart(); else this.closePage();
  }
  showPause() {
    this.page(`<span class="caption">Paused</span><h2>Meanwhile, at the Sentinel Works...</h2>
      <div class="btns" style="flex-direction:column;align-items:flex-start"><button class="btn" data-act="resume">Resume</button><button class="btn" data-act="restart">Restart the mission</button>
      <button class="btn" data-act="help">Controls</button><button class="btn" data-act="settings">Settings</button></div>`, 'pause');
  }
  setPaused(on) { this.paused = on; if (on) this.showPause(); else { this.helpOpen = false; this.closePage(); } }
  showSettings() {
    const rows = [
      ['volume', 'Sound volume', 'range'], ['music', 'Music volume', 'range'], ['shake', 'Screen shake', 'check'], ['impactPanels', 'Impact panels', 'check'],
      ['sfxWords', 'Lettered sound effects', 'check'], ['rumble', 'Controller rumble', 'check'], ['holdToggle', 'Power hold as a toggle', 'check'], ['quality', 'Quality', 'select'],
    ];
    const html = rows.map(([k, label, kind]) => {
      if (kind === 'range') return `<label class="setting"><span>${label}</span><input type="range" min="0" max="1" step="0.05" value="${SETTINGS[k]}" data-k="${k}"></label>`;
      if (kind === 'check') return `<label class="setting"><span>${label}</span><input type="checkbox" ${SETTINGS[k] ? 'checked' : ''} data-k="${k}"></label>`;
      return `<label class="setting"><span>${label}</span><select data-k="${k}"><option value="high" ${SETTINGS.quality === 'high' ? 'selected' : ''}>High (shadows, halftone)</option><option value="low" ${SETTINGS.quality === 'low' ? 'selected' : ''}>Low</option></select></label>`;
    }).join('');
    const s = this.page(`<h2>Settings</h2><div class="settings">${html}</div><div class="btns"><button class="btn" data-act="back">Back</button></div>`, 'settings');
    s.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener('input', () => {
      const k = inp.dataset.k; SETTINGS[k] = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? +inp.value : inp.value;
      saveSettings();
    }));
  }
  showResults(S) {
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
      <div class="btns"><button class="btn" data-act="again">Play again</button></div>`, 'results');
  }

  banner(text, sub = '', bad = false, secs = 2.2) {
    if (this.bannerEl) this.bannerEl.remove();
    this.bannerEl = el('div', 'banner' + (bad ? ' bad' : ''), `<strong>${text}</strong>${sub ? `<span>${sub}</span>` : ''}`);
    this.hud.appendChild(this.bannerEl); this.bannerT = secs;
  }

  onEvent(ev, S) {
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

  update(S, dt, slotsToDevices) {
    if (!S) return;
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
    this.letterbox.classList.toggle('on', !!(S.ult && S.ult.phase !== 'end'));
    // Player plates
    const seen = new Set();
    for (const p of S.players) {
      seen.add(p.id);
      let P = this.plateEls.get(p.id);
      if (!P) {
        P = el('div', 'plate', `<div class="top"><span class="tag"></span><span class="name"></span><span class="role"></span></div><div class="meter hp"><i></i></div>
          <div class="meter res r1"><i></i><b></b></div><div class="meter res r2"><i></i><b></b></div><div class="chips"></div><div class="bench"></div>`);
        P.style.setProperty('--pc', PLAYER_COLORS[p.slot]); this.plates.appendChild(P); this.plateEls.set(p.id, P);
      }
      this.fillPlate(P, p, S);
    }
    for (const [id, P] of this.plateEls) if (!seen.has(id)) { P.remove(); this.plateEls.delete(id); }
  }

  fillPlate(P, p, S) {
    const H = HEROES[p.hero], q = s => P.querySelector(s);
    q('.tag').textContent = `P${p.slot + 1}`; q('.name').textContent = H.name; q('.role').textContent = ROLE[p.hero];
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
      const bh = p.squad.map(s => `<span class="${s.hero === p.hero ? 'cur' : ''} ${s.down ? 'down' : ''}">${HEROES[s.hero].name.split(' ')[0]}<i style="width:${pct(s.hero === p.hero ? p.hp : s.hp, HEROES[s.hero].hp)}"></i></span>`).join('');
      if (bench.innerHTML !== bh) bench.innerHTML = bh;
      bench.hidden = false;
    } else bench.hidden = true;
  }
}
