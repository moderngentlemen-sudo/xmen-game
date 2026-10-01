// DOM overlays: start screen (the roster), HUD, markers, barks, banners, pause/settings, help, debug.
import { SETTINGS, saveSettings, PLAYER_COLORS, PLAYER_MARKS, CHARS, NOVA, ECHO, HUNTER, MARKSMAN, ATTACH_LOOK, DASH_CHARGE, AEGIS, SUB_LOOK, ULT,
  HEROES, kitOf, boostOf, attachLook, subLook, DRILL, BERSERK } from './config.js';

// Echo's scarf mode chip: every player can read which mode his scarf is in
function scarfChip(p) {
  if (p.scarfMode === 'veil') {
    const txt = p.veiled ? 'Veil · hidden' : p.veilBreakT > 0 ? `Veil · ${Math.ceil(p.veilBreakT / 60)}s` : 'Veil · fading';
    return `<span class="chip veil ${p.veiled ? 'on' : ''}">${txt}</span>`;
  }
  if (p.scarfMode === 'flare') return `<span class="chip flare">Flare${p.targetedBy ? ` · ${p.targetedBy} on you` : ''}</span>`;
  return '<span class="chip tether">Tether</span>';
}
const scarfCharges = p => `<span class="chip">Scarf ${'◆'.repeat(p.lashCharges)}${'◇'.repeat(ECHO.lashCharges - p.lashCharges)}</span>`;
import { vbTier, chargeStage, burstStage, rifleFocus } from './player.js';
import { BOSS } from './bosses.js';

// Nova, Marksman kit: loaded attachment and secondary weapon, charge stages (the Perfect Release window reads
// "Release!"), and Focus
const STAGE = { charging: 'charging', L1: 'Level 1', L2: 'Level 2', perfect: 'Release!', L3: 'Level 3', L4: 'Level 4 · Beam' };
function marksmanChips(p, world) {
  const A = ATTACH_LOOK[p.attachment], S = SUB_LOOK[p.sub] || SUB_LOOK.scatter, stage = chargeStage(p), bstage = burstStage(p), f = Math.floor(p.focus);
  const fuel = Math.round(p.fuel / MARKSMAN.boost.fuel * 100);
  const out = (p.sub === 'disc' || p.sub === 'well') && world.subOut(p, p.sub) ? (p.sub === 'disc' ? ' · out' : ' · open') : '';
  return `<span class="chip attach" style="color:${A.tint};box-shadow:inset 0 0 0 1px ${A.tint}">${A.name}</span>` +
    `<span class="chip attach" title="Secondary weapon (LB / T)" style="color:${S.tint};box-shadow:inset 0 0 0 1px ${S.tint}">${S.name}${out}</span>` +
    (p.state === 'beam' && p.beam ? `<span class="chip perfect">Beam ${(p.beam.t / 60).toFixed(1)}s</span>` : '') +
    (STAGE[stage] ? `<span class="chip ${stage === 'perfect' || stage === 'L4' ? 'perfect' : 'ready'}">${STAGE[stage]}</span>` : '') +
    (STAGE[bstage] ? `<span class="chip ${bstage === 'perfect' ? 'perfect' : 'ready'}">${S.name} ${STAGE[bstage]}</span>` : '') +
    `<span class="chip focus${f ? ' on' : ''}">Focus ${'◆'.repeat(f)}${'◇'.repeat(MARKSMAN.focus.max - f)}</span>` +
    `<span class="res fuel" title="Light boosters"><i style="width:${fuel}%"></i></span>` + aegisChips(p);
}
// The hard-light Aegis (Marksman kit's suit ability): its strength while up, else its cooldown; Overcharge
// from the damage it soaked, as a bar and a chip
function aegisChips(p) {
  const a = p.aegis;
  const shield = a ? `<span class="chip perfect">Aegis</span><span class="res aegis" title="Aegis strength"><i style="width:${Math.max(0, a.hp / a.max * 100).toFixed(0)}%"></i></span>`
    : `<span class="chip ${p.aegisCd === 0 ? 'ready' : ''}">Aegis ${p.aegisCd === 0 ? 'ready' : Math.ceil(p.aegisCd / 60) + 's'}</span>`;
  const over = p.overcharge > 0 ? `<span class="chip over">Overcharged</span><span class="res over" title="Overcharge"><i style="width:${Math.round(p.overcharge / AEGIS.over.max * 100)}%"></i></span>` : '';
  return shield + over;
}

// Chips every character can show: a charging dash, and the lock-on target
const ENEMY_NAMES = { swarmer: 'Prowler', shield: 'Sentinel Guard', sniper: 'Spotter', brute: 'Mk-I Sentinel', post: 'Training dummy', turret: 'Danger Room turret',
  drone: 'Sentinel drone', mortar: 'Mortar unit', charger: 'Ram unit', warden: 'Juggernaut', stormcaller: 'Magneto' };
function commonChips(p) {
  const C = DASH_CHARGE.charge, t = p.state === 'dashCharge' ? p.dashChargeT : 0, L = t >= C[2] ? 3 : t >= C[1] ? 2 : t >= C[0] ? 1 : 0;
  const pl = p.state === 'pound' && p.pound && p.pound.phase === 'hold' ? p.pound.level : 0;
  return (L ? `<span class="chip ${L === 3 ? 'perfect' : 'ready'}">Dash ${L}</span>` : '') +
    (pl ? `<span class="chip ${pl === 3 ? 'perfect' : 'ready'}">Pound ${pl}</span>` : '') +
    (p.lockT ? `<span class="chip lock">◎ ${ENEMY_NAMES[p.lockT.type] || (p.lockT.boss ? 'Boss' : 'Target')}</span>` : p.lockSuspend ? '<span class="chip">Lock paused</span>' : '');
}
// Echo's sniper rifle (Hunter kit): its focus while scoped (red at full), the bolt cycling after a shot, and a
// Riposte chip for the moment a perfect deflect opens one
function rifleChip(p) {
  const R = HUNTER.rifle, bolt = p.rifleCd > 0 ? `<span class="chip">Bolt ${(p.rifleCd / 60).toFixed(1)}s</span>` : '';
  const rip = p.riposteT > 0 ? '<span class="chip perfect">Riposte!</span>' : '';
  if (p.rifleT >= R.raise && p.rifleCd === 0) {
    const f = rifleFocus(p.rifleT);
    return (f >= 1 ? '<span class="chip red">Full focus</span>' : `<span class="chip ready">Scope ${Math.round(f * 100)}%</span>`) + rip;
  }
  return bolt + rip;
}

// ---- The X-Men's HUD chips -------------------------------------------------------------------------
// Cyclops, Storm and Jean (Nova's frame): the loaded power mode and secondary power in the hero's own names,
// charge stages, Focus, the flight or levitation tank, and their Signature. Wolverine: the Drill Claw's level,
// Berserker Rage, the healing factor. Psylocke: the Hunter kit, her sash in place of a scarf.
const secs = t => Math.ceil(t / 60) + 's';
function heroChips(p, world) {
  const K = kitOf(p);
  if (p.arch === 'nova') {
    const A = attachLook(p, p.attachment), S = subLook(p, p.sub) || SUB_LOOK.scatter, stage = chargeStage(p), bstage = burstStage(p), f = Math.floor(p.focus);
    const B = boostOf(p), fuel = B ? `<span class="res fuel" title="${p.char === 'storm' ? 'Flight' : 'Levitation'}"><i style="width:${Math.round(p.fuel / B.fuel * 100)}%"></i></span>` : '';
    const out = (p.sub === 'disc' || p.sub === 'well') && world.subOut(p, p.sub) ? (p.sub === 'disc' ? ' · out' : ' · open') : '';
    let sig = '';
    if (K.sig === 'aegis') sig = aegisChips(p).replace(/Aegis/g, 'TK Shield');
    else {
      const name = K.sig === 'visor' ? 'Visor Overdrive' : 'Squall';
      sig = `<span class="chip ${p.sigCd === 0 ? 'ready' : ''}">${name} ${p.sigCd === 0 ? 'ready' : secs(p.sigCd)}</span>` +
        (p.overcharge > 0 ? `<span class="chip over">Overcharged</span><span class="res over" title="Overcharge"><i style="width:${Math.round(p.overcharge / AEGIS.over.max * 100)}%"></i></span>` : '');
    }
    return `<span class="chip attach" style="color:${A.tint};box-shadow:inset 0 0 0 1px ${A.tint}">${A.name}</span>` +
      `<span class="chip attach" title="Secondary power (LB / T)" style="color:${S.tint};box-shadow:inset 0 0 0 1px ${S.tint}">${S.name}${out}</span>` +
      (p.state === 'beam' && p.beam ? `<span class="chip perfect">Beam ${(p.beam.t / 60).toFixed(1)}s</span>` : '') +
      (STAGE[stage] ? `<span class="chip ${stage === 'perfect' || stage === 'L4' ? 'perfect' : 'ready'}">${STAGE[stage]}</span>` : '') +
      (STAGE[bstage] ? `<span class="chip ${bstage === 'perfect' ? 'perfect' : 'ready'}">${S.name} ${STAGE[bstage]}</span>` : '') +
      `<span class="chip focus${f ? ' on' : ''}">Focus ${'◆'.repeat(f)}${'◇'.repeat(MARKSMAN.focus.max - f)}</span>` + fuel + sig + (vbTier(p) ? `<span class="chip vb">VB ${vbTier(p)}</span>` : '') + commonChips(p);
  }
  if (K.fire === 'drill') {
    const D = DRILL.charge, L = p.drillT >= D[1] ? 3 : p.drillT >= D[0] ? 2 : p.drillT > 0 ? 1 : 0;
    const rage = p.berserkT > 0 ? `<span class="chip red">Berserk ${secs(p.berserkT)}</span>` : `<span class="chip ${p.sigCd === 0 ? 'ready' : ''}">Rage ${p.sigCd === 0 ? 'ready' : secs(p.sigCd)}</span>`;
    const healing = p.hurtT === 0 && p.hp < p.maxHp && p.state !== 'downed' ? '<span class="chip perfect">Healing</span>' : '';
    return `<span class="res"><i style="width:${p.resolve}%"></i></span>` + (L ? `<span class="chip ${L === 3 ? 'perfect' : 'ready'}">Drill Claw ${L}</span>` : '') + rage + healing +
      (vbTier(p) ? `<span class="chip vb">VB ${vbTier(p)}</span>` : '') + commonChips(p);
  }
  return `<span class="res"><i style="width:${p.resolve}%"></i></span>${scarfChip(p)}${scarfCharges(p).replace('Scarf', 'Sash')}` +
    `<span class="chip ${p.snares ? 'ready' : ''}">Psi snares ${'◆'.repeat(p.snares)}${'◇'.repeat(HUNTER.snareCharges - p.snares)}</span>` +
    rifleChip(p) + (p.leash ? '<span class="chip vb">Reeling</span>' : '') + (vbTier(p) ? `<span class="chip vb">VB ${vbTier(p)}</span>` : '') + commonChips(p);
}

const $ = (sel, root = document) => root.querySelector(sel);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

const SETTING_DEFS = [
  { key: 'difficulty', label: 'Difficulty', opts: [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']] },
  { key: 'p1Aim', label: 'Keyboard player aims with', opts: [['mouse', 'Mouse'], ['keys', 'Movement keys (8-way)']] },
  { key: 'aimAssist', label: 'Aim assist (gamepad 8-way aim)', bool: true },
  { key: 'lockOn', label: 'Lock-on (F / R3)', bool: true },
  { key: 'lockMode', label: 'Lock-on mode', opts: [['auto', 'Automatic: nearest enemy, R3 switches'], ['manual', 'Press R3 to lock']] },
  { key: 'dashCharge', label: 'Charged dash (hold dash while standing still)', bool: true },
  { key: 'dashIframes', label: 'Dash invulnerability (easier)', bool: true },
  { key: 'vbStop', label: 'Velocity Break stop', opts: [['hard', 'Hard stop'], ['keep30', 'Keep 30% momentum']] },
  { key: 'vbRefund', label: 'Velocity Break refunds the air dash on a hit', bool: true },
  { key: 'impactFrames', label: 'Impact frames on big moments', bool: true },
  { key: 'shake', label: 'Screen shake', bool: true },
  { key: 'camera', label: 'Camera projection', opts: [['persp', 'Perspective'], ['ortho', 'Orthographic']] },
  { key: 'fov', label: 'Camera field of view', range: [24, 50, 1] },
  { key: 'quality', label: 'Graphics quality', opts: [['high', 'High (bloom, shadows)'], ['low', 'Low']] },
  { key: 'barks', label: 'Character lines', bool: true },
  { key: 'haptics', label: 'Rumble and vibration', bool: true },
  { key: 'hapticStrength', label: 'Rumble strength', range: [0, 1, 0.05] },
  { key: 'volume', label: 'Sound effects volume', range: [0, 1, 0.05] },
  { key: 'music', label: 'Music volume', range: [0, 1, 0.05] },
];

export class UI {
  constructor(root, handlers) {
    this.root = root; this.H = handlers;
    // Ultimate presentation (letterbox, the ultimate's name, join prompts); under the HUD panels
    this.ultEl = h('div', 'ultcast', '<i class="lb top"></i><i class="lb bot"></i><div class="uname"><small></small><strong></strong></div><div class="ujoin"></div>');
    root.appendChild(this.ultEl); this.ultKey = '';
    this.hud = h('div', 'hud'); root.appendChild(this.hud);
    this.labels = h('div', 'labels'); root.appendChild(this.labels);
    this.banner = h('div', 'banner'); this.banner.hidden = true; root.appendChild(this.banner);
    this.toastEl = h('div', 'toast'); this.toastEl.hidden = true; root.appendChild(this.toastEl);
    // Boss health: name, the bar (with a notch at half, where its second phase starts) and its armor plates
    this.bossBar = h('div', 'bossbar', '<div class="bname"><b></b><span></span></div><div class="bhp"><i class="bfill"></i><i class="bnotch"></i></div><div class="barmor"></div>');
    this.bossBar.hidden = true; root.appendChild(this.bossBar); this.bossKey = '';
    this.debug = h('pre', 'debug'); this.debug.hidden = true; root.appendChild(this.debug);
    this.panels = new Map(); this.markers = new Map(); this.barks = []; this.enemyLabels = new Map();
    this.bannerT = 0; this.toastT = 0; this.paused = false; this.helpOpen = false;
    this.buildStart(); this.buildPause(); this.buildHelp();
  }

  // ---- Start ----
  buildStart() {
    const s = h('div', 'overlay start');
    const card = (id, key, line) => `<div class="hero" style="--hc:${CHARS[id].energy}"><kbd>${key}</kbd><b>${CHARS[id].name}</b><span>${CHARS[id].role}</span><p>${line}</p></div>`;
    s.innerHTML = `
      <div class="card wide">
        <p class="eyebrow">Unofficial fan prototype · Built on Nova Striker Version 9</p>
        <h1>X-Men: Sentinel Strike</h1>
        <p class="lede">The Sentinels have come for every mutant in the city. Train in the Danger Room, break the Sentinel Works and Juggernaut, climb Trask Tower, then take the Sentinel beacon back from Magneto. One to four players.</p>
        <div class="join"><span class="pulse"></span>Click, press any key, or press a gamepad button to join</div>
        <div class="roster">
          ${card('cyclops', 1, 'Optic blasts from the visor: bank them, charge them, hold them as a beam.')}
          ${card('wolverine', 2, 'Adamantium claws, the Drill Claw and a healing factor. Berserk when it counts.')}
          ${card('storm', 3, 'Lightning, wind and real flight. Calls the storm down on everything in sight.')}
          ${card('jean', 4, 'Telekinesis: throw, grip and shield. The Phoenix Force when it is full.')}
          ${card('psylocke', 5, 'Psychic blades and snares. Vanishes, marks and strikes from the shadows.')}
        </div>
        <div class="cols">
          <div><h3>Keyboard + mouse</h3><ul>
            <li><kbd>A</kbd><kbd>D</kbd> move · <kbd>S</kbd> crouch · <kbd>Space</kbd> jump · <kbd>Shift</kbd> dash</li>
            <li>Left click power (hold to charge) · Right click strike</li>
            <li><kbd>Q</kbd> dodge / parry · <kbd>E</kbd> signature · <kbd>R</kbd> power mode · <kbd>T</kbd> secondary</li>
            <li><kbd>V</kbd> ultimate · <kbd>1</kbd>–<kbd>5</kbd> or <kbd>Tab</kbd> change hero</li></ul></div>
          <div><h3>Gamepad</h3><ul>
            <li>Left stick move · Right stick aim · R3 switch target</li>
            <li>A jump · B dash · X strike · Y signature · RB power mode</li>
            <li>RT power · LT dodge / parry · LB secondary</li>
            <li>LT + RT ultimate · D-pad change hero · Start pause</li></ul></div>
        </div>
        <p class="fine">Up to four players: extra gamepads join by pressing any button. Fill the bar under your health and pull both triggers (<kbd>V</kbd>) for an ultimate; teammates with a full bar can join it for a team-up. <kbd>H</kbd>/View shows every control; <kbd>Esc</kbd>/Start opens settings, zones and the boss fights.</p>
        <p class="fine notice" hidden></p>
        <p class="fine touchnote">This build needs a keyboard or a gamepad.</p>
        <p class="fine legal">Unofficial, non-commercial fan prototype. The X-Men and their names belong to Marvel; this project is not affiliated with or endorsed by Marvel or Disney. Every model, effect, sound and piece of music here is an original placeholder.</p>
      </div>`;
    this.root.appendChild(s); this.start = s;
  }
  hideStart() { this.start.hidden = true; }
  gamepadNotice(show) {
    const n = $('.notice', this.start);
    n.hidden = !show;
    n.textContent = 'Gamepads are blocked in this viewer. Keyboard and mouse work here; open the page in a browser tab to use controllers.';
  }

  // ---- Pause / settings ----
  buildPause() {
    const p = h('div', 'overlay pause'); p.hidden = true;
    const card = h('div', 'card wide'); p.appendChild(card);
    card.appendChild(h('p', 'eyebrow', 'Paused'));
    card.appendChild(h('h2', '', 'Settings'));
    const row = h('div', 'actions');
    const mk = (label, fn) => { const b = h('button', 'btn', label); b.addEventListener('click', fn); row.appendChild(b); return b; };
    mk('Resume', () => this.H.resume());
    mk('Danger Room', () => this.H.zone('gym'));
    mk('Sentinel Works', () => this.H.zone('arena'));
    mk('Trask Tower', () => this.H.zone('tower'));
    mk('Rooftop Relay', () => this.H.zone('skyline'));
    mk('Boss: Juggernaut', () => this.H.boss('warden'));
    mk('Boss: Magneto', () => this.H.boss('stormcaller'));
    mk('Controls', () => this.toggleHelp(true));
    card.appendChild(row);
    this.playerList = h('div', 'players'); card.appendChild(this.playerList);
    const grid = h('div', 'settings'); card.appendChild(grid);
    for (const d of SETTING_DEFS) {
      const id = 'set-' + d.key, lab = h('label', 'setting');
      lab.setAttribute('for', id); lab.appendChild(h('span', '', d.label));
      let input;
      if (d.bool) { input = h('input'); input.type = 'checkbox'; input.checked = !!SETTINGS[d.key]; input.addEventListener('change', () => { SETTINGS[d.key] = input.checked; saveSettings(); }); }
      else if (d.range) {
        input = h('input'); input.type = 'range'; [input.min, input.max, input.step] = d.range.map(String); input.value = String(SETTINGS[d.key]);
        input.addEventListener('input', () => { SETTINGS[d.key] = Number(input.value); saveSettings(); });
      } else {
        input = h('select'); for (const [v, t] of d.opts) { const o = h('option', '', t); o.value = v; input.appendChild(o); }
        input.value = SETTINGS[d.key]; input.addEventListener('change', () => { SETTINGS[d.key] = input.value; saveSettings(); });
      }
      input.id = id; lab.appendChild(input); grid.appendChild(lab);
    }
    card.appendChild(h('p', 'fine', 'Character lines are original writing for this fan prototype, not lines from the comics or films. Settings are remembered in this browser only.'));
    this.root.appendChild(p); this.pause = p;
  }
  setPaused(on, world) {
    this.paused = on; this.pause.hidden = !on;
    if (on) { this.renderPlayerList(world); this.focusables = [...this.pause.querySelectorAll('button, select, input')]; this.focusIdx = 0; this.focusables[0].focus(); }
  }
  renderPlayerList(world) {
    this.playerList.innerHTML = '';
    for (const p of world.players) {
      const row = h('div', 'prow');
      row.appendChild(h('span', 'pmark', `<b style="color:${PLAYER_COLORS[p.slot]}">${PLAYER_MARKS[p.slot]} P${p.slot + 1}</b> ${p.device === 'kbm' ? 'Keyboard + mouse' : 'Gamepad ' + (Number(p.device.slice(3)) + 1)}`));
      for (const c of HEROES) {
        const b = h('button', 'btn small' + (p.char === c ? ' on' : ''), CHARS[c].name);
        b.addEventListener('click', () => { this.H.pick(p, c); this.renderPlayerList(world); }); row.appendChild(b);
      }
      if (p.slot !== 0) { const r = h('button', 'btn small ghost', 'Remove'); r.addEventListener('click', () => { this.H.remove(p); this.renderPlayerList(world); }); row.appendChild(r); }
      this.playerList.appendChild(row);
    }
  }
  menuNav(ev) {
    if (!this.paused || !this.focusables) return;
    const f = this.focusables;
    if (ev.type === 'up' || ev.type === 'down') {
      this.focusIdx = (this.focusIdx + (ev.type === 'down' ? 1 : -1) + f.length) % f.length; f[this.focusIdx].focus();
    } else if (ev.type === 'confirm') {
      const el = f[this.focusIdx];
      if (el.tagName === 'BUTTON') el.click();
      else if (el.tagName === 'SELECT') { el.selectedIndex = (el.selectedIndex + 1) % el.options.length; el.dispatchEvent(new Event('change')); }
      else if (el.type === 'checkbox') { el.checked = !el.checked; el.dispatchEvent(new Event('change')); }
      else if (el.type === 'range') { const v = Number(el.value) + Number(el.step) * 2; el.value = String(v > Number(el.max) ? el.min : v); el.dispatchEvent(new Event('input')); }
    } else if (ev.type === 'back') this.H.resume();
  }

  // ---- Help ----
  buildHelp() {
    const x = h('div', 'overlay help'); x.hidden = true;
    x.innerHTML = `<div class="card wide"><div class="helphead"><div><p class="eyebrow">Controls</p><h2>What each button does</h2></div>
      <p class="closebadge"><b>B</b> or <b>View</b> to close <span>H or Esc on the keyboard · D-pad scrolls</span></p></div>
      <table><thead><tr><th>Action</th><th>Gamepad</th><th>Keyboard + mouse</th></tr></thead><tbody>
      <tr><td>Move · crouch</td><td>Left stick</td><td>A/D · S</td></tr>
      <tr><td>Jump · double jump · wall jump (hold toward a wall to slide down it). Storm flies and Jean levitates: press jump a third time and hold</td><td>A</td><td>Space</td></tr>
      <tr><td>Dash (8-way) · slide (down + dash) · charged dash (hold while standing still, aim, let go)</td><td>B</td><td>Shift</td></tr>
      <tr><td>Strike · hold to charge · up + strike: rising attack · down + strike in the air: ground pound</td><td>X</td><td>Right click or J</td></tr>
      <tr><td>Power (each hero's ranged attack) · hold to charge</td><td>RT</td><td>Left click or K</td></tr>
      <tr><td>Aim</td><td>Right stick (free) or left stick (8-way)</td><td>Mouse</td></tr>
      <tr><td>Dodge (Cyclops, Storm, Jean) or parry and deflect (Wolverine, Psylocke). A last-moment dodge slows enemies close by; a perfect parry negates a heavy attack</td><td>LT</td><td>Q or L</td></tr>
      <tr><td>Signature move</td><td>Y</td><td>E</td></tr>
      <tr><td>Switch power mode (Cyclops, Storm, Jean) · switch sash mode (Psylocke)</td><td>RB</td><td>R</td></tr>
      <tr><td>Switch secondary power (Cyclops, Storm, Jean; fired by Strike when nobody is close)</td><td>LB</td><td>T</td></tr>
      <tr><td>Switch target (the nearest enemy is locked automatically; hold to let go)</td><td>R3</td><td>F</td></tr>
      <tr><td>Ultimate, when the bar under your health is full. Teammates with a full bar join while its name is on screen, for a team-up</td><td>LT + RT</td><td>V</td></tr>
      <tr><td>Change hero</td><td>D-pad left/right</td><td>1 to 5, or Tab</td></tr>
      <tr><td>Revive a downed ally</td><td colspan="2">Stand next to them</td></tr>
      <tr><td>Pause: settings, zones and the boss fights</td><td>Start</td><td>Esc</td></tr>
      </tbody></table>
      <div class="herohelp">
        <div style="--hc:${CHARS.cyclops.energy}"><h3>Cyclops · Field Leader</h3><p><b>Power:</b> optic blasts from his visor. Hold to charge through three levels; let go on the flash after level 3 for a perfect blast, or keep holding to the next flash for an optic beam you steer. A charged blast at the ground launches him: aim at your feet. <b>Modes:</b> Piercing Blast (through a line of enemies), Ricochet Blast (splits into shards that rebound off walls), Spread Blast (homing darts). <b>Strike:</b> his combo up close; otherwise Optic Spray or Optic Mine. <b>Signature:</b> Visor Overdrive, an instant overcharge and a concussive flare. <b>Ultimate:</b> Optic Overload.</p></div>
        <div style="--hc:${CHARS.wolverine.energy}"><h3>Wolverine · Berserker</h3><p><b>Strike:</b> the claw combo, a spin in the air, a slash off walls, a charged swing. <b>Power:</b> the Drill Claw, a corkscrew lunge aimed eight ways; hold for range (once per jump in the air). <b>Parry:</b> deflects shots back. <b>Signature:</b> Berserker Rage: faster, harder hits that heal him, no stagger, less damage taken. <b>Healing factor:</b> unhurt for a moment, he heals. <b>Ultimate:</b> Berserker Barrage X.</p></div>
        <div style="--hc:${CHARS.storm.energy}"><h3>Storm · Weather Witch</h3><p><b>Power:</b> Lightning Bolt, Thunderhead (a burst that reaches round shields) or Hailstones (homing hail). <b>Secondary:</b> Chain Lightning, Cyclone (pulls enemies in and holds them), Hailstorm. <b>Flight:</b> the third jump press, held, rides the wind (the bar under her health). <b>Signature:</b> Squall, a gust that hurls enemies away and lifts her. <b>Ultimate:</b> Eye of the Storm, lightning on every enemy in sight.</p></div>
        <div style="--hc:${CHARS.jean.energy}"><h3>Jean Grey · Telekinetic</h3><p><b>Power:</b> Mind Darts (homing), TK Debris (a burst that reaches round shields) or Psi Spear (pierces). <b>Secondary:</b> TK Throw (flies out and back; press again to recall it), TK Grip (holds enemies and swallows their shots), Psychic Push. <b>Levitation:</b> the third jump press, held. <b>Signature:</b> the TK Shield blocks everything for five seconds and the damage it soaks overcharges her; press again to detonate it. <b>Ultimate:</b> Phoenix Force.</p></div>
        <div style="--hc:${CHARS.psylocke.energy}"><h3>Psylocke · Psi-Ninja</h3><p><b>Strike:</b> psychic blades and the psi-glaive. <b>Power:</b> tap to throw a psychic snare (down + tap plants one); hold to focus a psi-bolt: let go for an instant shot, at full focus it pierces everything and breaks armour. <b>Parry:</b> deflects shots back; a perfect one opens a riposte. <b>Sash modes:</b> Tether (pulls light enemies, zips her to heavy ones), Veil (she fades from sight; the first strike from hiding staggers), Flare (draws enemies onto her). <b>Signature:</b> the sash's move for the current mode. <b>Ultimate:</b> Thousand Butterflies.</p></div>
      </div>
      <p class="fine">Threats: a white glint means you can parry it. A double glint marks a heavy attack: a perfect parry negates it fully. A magenta jagged strip and a rising tone mean you cannot parry it: jump or move. Juggernaut can't be stopped head-on: let him charge into a wall. Magneto crashes onto the pad when his dive misses.</p>
      <p class="fine">Controllers rumble with hits, charges and launches (Settings: Rumble).</p>
      <p class="fine closehint"><b>Close:</b> B, A, Start or View on a controller (the D-pad scrolls) · <kbd>H</kbd>, <kbd>Esc</kbd> or a click on the keyboard. The game waits while this is open.</p></div>`;
    x.addEventListener('click', () => this.toggleHelp(false));
    this.root.appendChild(x); this.help = x;
  }
  toggleHelp(on) { this.helpOpen = on === undefined ? !this.helpOpen : on; this.help.hidden = !this.helpOpen; if (this.helpOpen) $('.card', this.help).scrollTop = 0; }
  scrollHelp(dir) { const c = $('.card', this.help); c.scrollTop = Math.max(0, c.scrollTop + dir * 180); }

  // ---- In-game messages ----
  showBanner(text, sub) { this.banner.innerHTML = `<strong>${text}</strong>${sub ? `<span>${sub}</span>` : ''}`; this.banner.hidden = false; this.bannerT = 2.8; }
  toast(text) { this.toastEl.textContent = text; this.toastEl.hidden = false; this.toastT = 2.2; }
  bark(p, text) {
    const el = h('div', 'bark', `<b>${CHARS[p.char].name}</b> ${text}`);
    el.style.setProperty('--pc', PLAYER_COLORS[p.slot]);
    this.labels.appendChild(el); this.barks.push({ el, p, t: 2.6 });
  }

  onEvent(ev, world) {
    switch (ev.type) {
      case 'banner': this.showBanner(ev.text, ev.sub); break;
      case 'checkpoint': this.toast('Checkpoint reached'); break;
      case 'join': this.toast(`Player ${ev.p.slot + 1} joined as ${CHARS[ev.p.char].name}`); break;
      case 'leave': this.toast(`Player ${ev.slot + 1} left`); break;
      case 'downed': this.toast(ev.secondWind ? 'Second Wind: getting back up' : `Player ${ev.p.slot + 1} is down. Stand next to them to revive`); break;
      case 'wipe': this.showBanner('Team down', 'Returning to the last checkpoint'); break;
      case 'bark': this.bark(ev.p, ev.text); break;
      case 'swap': this.toast(`Player ${ev.p.slot + 1} is now ${CHARS[ev.p.char].name}`); break;
      case 'ultReady': this.toast(`P${ev.p.slot + 1} ultimate ready: ${ev.p.device === 'kbm' ? 'press V' : 'pull both triggers'}`); break;
    }
  }

  // The ultimate: letterbox bars slide in; during the call its name fills the screen and every teammate who
  // could join is told how; while it plays out the name sits small at the top
  updateUlt(world) {
    const U = world.ultCast, el = this.ultEl;
    if (!U) { if (this.ultKey) { this.ultKey = ''; el.className = 'ultcast'; } return; }
    const joiners = U.phase === 'cast' ? world.players.filter(q => !U.members.includes(q) && q.ult >= ULT.max && q.state !== 'dead' && q.state !== 'downed') : [];
    const key = `${U.phase}|${U.name}|${U.members.map(m => m.slot).join()}|${joiners.map(q => q.slot).join()}`;
    if (key === this.ultKey) return;
    this.ultKey = key;
    if (U.phase === 'cast') { this.bannerT = 0; this.banner.hidden = true; }   // the ultimate takes the stage
    el.className = `ultcast on ${U.phase}${U.team ? ' team' : ''}`;
    $('.uname small', el).textContent = U.members.map(m => `P${m.slot + 1} ${CHARS[m.char].name}`).join(' + ');
    $('.uname strong', el).textContent = U.name;
    $('.ujoin', el).innerHTML = joiners.map(q => `<span style="--pc:${PLAYER_COLORS[q.slot]}">P${q.slot + 1}: ${q.device === 'kbm' ? 'press V' : 'pull both triggers'} to join</span>`).join('');
  }

  update(dt, world, view, fps) {
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.banner.hidden = true; }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.hidden = true; }
    this.updatePanels(world);
    this.updateMarkers(world, view);
    this.updateBossBar(world);
    this.updateUlt(world);
    for (const b of this.barks) {
      b.t -= dt;
      const s = view.screenOf(b.p.x, b.p.y + b.p.h + 1.1);
      b.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      b.el.style.opacity = String(Math.min(1, b.t * 2));
      if (b.t <= 0) b.el.remove();
    }
    this.barks = this.barks.filter(b => b.t > 0);
    if (!this.debug.hidden) this.updateDebug(world, fps);
  }

  updateBossBar(world) {
    const e = world.enemies.find(q => q.boss && !q.dead && Math.abs(q.x - world.cam.x) < world.cam.halfW + 14);
    if (!e) { if (!this.bossBar.hidden) this.bossBar.hidden = true; return; }
    const B = BOSS[e.type], key = `${e.type}|${e.phase}|${e.armor}|${e.armorMax}|${e.state === 'roar' || e.state === 'intro'}`;
    this.bossBar.hidden = false;
    $('.bfill', this.bossBar).style.width = `${Math.max(0, e.hp / e.maxHp * 100).toFixed(1)}%`;
    if (key !== this.bossKey) {
      this.bossKey = key;
      $('.bname b', this.bossBar).textContent = B.name; $('.bname span', this.bossBar).textContent = e.phase === 2 ? 'Phase two' : B.title;
      $('.barmor', this.bossBar).innerHTML = e.armorMax ? `<span>Armor</span>${'<i class="on"></i>'.repeat(e.armor)}${'<i></i>'.repeat(Math.max(0, e.armorMax - e.armor))}` : '';
      this.bossBar.classList.toggle('shielded', e.state === 'roar' || e.state === 'intro');
      this.bossBar.classList.toggle('p2', e.phase === 2);
    }
  }

  updatePanels(world) {
    const seen = new Set();
    for (const p of world.players) {
      seen.add(p.slot);
      let P = this.panels.get(p.slot);
      if (!P) {
        const el = h('div', `panel p${p.slot}`);
        el.style.setProperty('--pc', PLAYER_COLORS[p.slot]);
        el.innerHTML = `<div class="ptop"><span class="mark"></span><span class="name"></span><span class="role"></span></div>
          <div class="bar hp"><i class="strain"></i><i class="fill"></i></div><div class="ultbar" title="Ultimate"><i></i><b></b></div><div class="sub"></div>`;
        this.hud.appendChild(el);
        P = { el, name: $('.name', el), role: $('.role', el), mark: $('.mark', el), fill: $('.hp .fill', el), strain: $('.hp .strain', el), sub: $('.sub', el), key: '',
          ult: $('.ultbar i', el), ultTxt: $('.ultbar b', el), ultReady: null };
        this.panels.set(p.slot, P);
      }
      P.mark.textContent = `${PLAYER_MARKS[p.slot]} P${p.slot + 1}`;
      P.name.textContent = CHARS[p.char].name; P.role.textContent = CHARS[p.char].role;
      P.fill.style.width = `${Math.max(0, p.hp / p.maxHp) * 100}%`;
      P.strain.style.width = `${Math.max(0, (p.hp + p.strain) / p.maxHp) * 100}%`;
      // The ultimate bar: it glows when full and says how to use it
      const ready = p.ult >= ULT.max && p.state !== 'ult';
      P.ult.style.width = `${Math.min(100, p.ult / ULT.max * 100).toFixed(1)}%`;
      if (ready !== P.ultReady) { P.ultReady = ready; P.el.classList.toggle('ultready', ready); P.ultTxt.textContent = ready ? `Ultimate · ${p.device === 'kbm' ? 'V' : 'LT + RT'}` : ''; }
      let sub;
      if (p.state === 'downed') sub = p.autoRevive > 0 ? 'Second Wind…' : `Down · revive ${Math.floor(p.revive / 1.2)}% · ${Math.ceil(p.downedT / 60)}s`;
      else if (p.state === 'dead') sub = `Respawning in ${Math.ceil(p.respawnT / 60)}s`;
      else if (HEROES.includes(p.char)) sub = heroChips(p, world);
      else if (p.char === 'nova') {
        const bulwark = `<span class="chip ${p.bulwarkCd === 0 ? 'ready' : ''}">Bulwark ${p.bulwarkCd === 0 ? 'ready' : Math.ceil(p.bulwarkCd / 60) + 's'}</span>`;
        const vb = vbTier(p) ? `<span class="chip vb">VB ${vbTier(p)}</span>` : '';
        if (SETTINGS.novaKit === 'marksman') sub = marksmanChips(p, world) + vb + commonChips(p);
        else {
          const ch = p.chargeT >= NOVA.charge2 ? 'RAIL' : p.chargeT >= NOVA.charge1 ? 'LANCE' : p.chargeT > 0 ? 'charging' : '';
          sub = bulwark + (ch ? `<span class="chip ready">${ch}</span>` : '') + vb + commonChips(p);
        }
      } else if (SETTINGS.echoKit === 'hunter') {
        sub = `<span class="res"><i style="width:${p.resolve}%"></i></span>${scarfChip(p)}${scarfCharges(p)}` +
          `<span class="chip ${p.snares ? 'ready' : ''}">Snares ${'◆'.repeat(p.snares)}${'◇'.repeat(HUNTER.snareCharges - p.snares)}</span>` +
          rifleChip(p) + (p.leash ? '<span class="chip vb">Reeling</span>' : '') + (vbTier(p) ? `<span class="chip vb">VB ${vbTier(p)}</span>` : '') + commonChips(p);
      } else {
        const mode = SETTINGS.echoRanged;
        const ranged = mode === 'B' ? `<span class="chip">Bolts ${'●'.repeat(p.cells)}${'○'.repeat(ECHO.cellsMax - p.cells)}</span>`
          : mode === 'A' ? `<span class="chip ${p.tracerCd === 0 ? 'ready' : ''}">Tracer ${p.tracerCd === 0 ? 'ready' : ''}</span>` : '';
        sub = `<span class="res"><i style="width:${p.resolve}%"></i></span>${scarfChip(p)}${scarfCharges(p)}${ranged}` +
          (vbTier(p) ? `<span class="chip vb">VB ${vbTier(p)}</span>` : '') + commonChips(p);
      }
      if (sub !== P.key) { P.sub.innerHTML = sub; P.key = sub; }
    }
    for (const [slot, P] of this.panels) if (!seen.has(slot)) { P.el.remove(); this.panels.delete(slot); }
  }

  updateMarkers(world, view) {
    const seen = new Set();
    for (const p of world.players) {
      seen.add(p.slot);
      let m = this.markers.get(p.slot);
      if (!m) { m = h('div', 'pmarker'); m.style.setProperty('--pc', PLAYER_COLORS[p.slot]); this.labels.appendChild(m); this.markers.set(p.slot, m); }
      const s = view.screenOf(p.x, p.y + p.h + 0.45);
      const r = view.canvas.getBoundingClientRect();
      const x = Math.max(16, Math.min(r.width - 16, s.x)), y = Math.max(16, Math.min(r.height - 16, s.y));
      m.textContent = `${PLAYER_MARKS[p.slot]} P${p.slot + 1}` + (p.state === 'downed' ? ' · DOWN' : p.veiled ? ' · hidden' : '');
      m.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      m.hidden = p.state === 'dead';
    }
    for (const [slot, m] of this.markers) if (!seen.has(slot)) { m.remove(); this.markers.delete(slot); }
    // Lock-on reticles, one per locking player; several on one target nest inside each other
    this.reticles = this.reticles || new Map();
    const onTarget = new Map();
    for (const p of world.players) {
      let r = this.reticles.get(p.slot);
      const t = p.lockT && p.state !== 'dead' && p.state !== 'downed' ? p.lockT : null;
      if (!t) { if (r) r.el.hidden = true; continue; }
      if (!r) {
        const el = h('div', 'reticle', '<div class="spin"><i></i><i></i><i></i><i></i></div><b></b>');
        el.style.setProperty('--pc', PLAYER_COLORS[p.slot]); this.labels.appendChild(el);
        r = { el, target: null, tag: $('b', el) }; this.reticles.set(p.slot, r);
      }
      const n = onTarget.get(t) || 0; onTarget.set(t, n + 1);
      if (r.target !== t) { r.target = t; r.el.classList.remove('pop'); void r.el.offsetWidth; r.el.classList.add('pop'); }
      const s = view.screenOf(t.x, t.y + t.h * 0.55), size = 46 + Math.min(90, t.h * 18) + n * 14;
      r.el.style.setProperty('--rs', `${size}px`);
      r.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
      r.tag.textContent = n === 0 ? `${PLAYER_MARKS[p.slot]} P${p.slot + 1}` : '';
      r.el.hidden = !s.vis;
    }
    for (const [slot, r] of this.reticles) if (!seen.has(slot)) { r.el.remove(); this.reticles.delete(slot); }
    // Rocket jump height readout beside the apex marker while Nova lines one up
    this.apexLabels = this.apexLabels || new Map();
    for (const p of world.players) {
      let l = this.apexLabels.get(p.slot);
      const pv = p.char === 'nova' && p.chargeT > 0 ? world.rocketPreview(p) : null;
      if (!pv) { if (l) l.hidden = true; continue; }
      if (!l) { l = h('div', 'apexlabel'); this.labels.appendChild(l); this.apexLabels.set(p.slot, l); }
      const s = view.screenOf(pv.x, pv.apex);
      l.textContent = `▲ ${(pv.apex - p.y).toFixed(1)} m${pv.perfect ? ' · Perfect' : ''}`;
      l.classList.toggle('perfect', pv.perfect);
      l.style.transform = `translate(${s.x + 34}px, ${s.y}px) translate(0, -50%)`;
      l.hidden = !s.vis;
    }
    for (const [slot, l] of this.apexLabels) if (!seen.has(slot)) { l.remove(); this.apexLabels.delete(slot); }
    // Danger Room post teaching labels
    for (const e of world.enemies) {
      if (e.type !== 'post') continue;
      let l = this.enemyLabels.get(e);
      if (!l) { l = h('div', 'elabel'); this.labels.appendChild(l); this.enemyLabels.set(e, l); }
      const s = view.screenOf(e.x, e.y + e.h + 0.8);
      l.hidden = Math.abs(e.x - world.cam.x) > world.cam.halfW + 1;
      l.textContent = e.label || 'Training post: step close';
      l.dataset.cat = e.state === 'windup' && e.atk ? e.atk.cat : '';
      l.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
    }
  }

  updateDebug(world, fps) {
    const d = world.director.usage();
    const lines = [`fps ${fps.toFixed(0)} · tick ${world.tick} · tokens melee ${d.melee}/${d.meleeCap} ranged ${d.ranged}/${d.rangedCap} · cam dist ${world.cam.dist.toFixed(1)}` +
      (world.ultCast ? ` · ultimate ${world.ultCast.phase} ${world.ultCast.t} ${world.ultCast.name}` : '') + (world.wells.length ? ` · wells ${world.wells.length}` : '')];
    for (const p of world.players) {
      lines.push(`P${p.slot + 1} ${p.char} ${p.state}:${p.st} pos ${p.x.toFixed(2)},${p.y.toFixed(2)} v ${p.vx.toFixed(1)},${p.vy.toFixed(1)} ground ${p.onGround ? 1 : 0} wall ${p.wallDir}${p.wallSliding ? ' slide' : ''} vb ${vbTier(p)} air-dash ${p.airDashes} buf j${p.buf.jump} d${p.buf.dash} m${p.buf.melee} p${p.buf.parry}` +
        ` · dashC ${p.dashChargeT} rifle ${p.rifleT}/${p.rifleCd} rocket ${p.rocketT} lock ${p.lockT ? p.lockT.type : '-'}` +
        ` · beam ${p.beam ? p.beam.t : '-'} aegis ${p.aegis ? p.aegis.hp.toFixed(0) : p.aegisCd} over ${p.overcharge.toFixed(0)} pound ${p.pound ? p.pound.phase + p.pound.level : '-'}` +
        ` · sub ${p.sub} ${p.burstT ? Math.round(p.burstT) : ''} dodge ${p.dodge ? p.dodge.t : p.dodgeCd} ult ${p.ult.toFixed(0)}${p.ultRun ? ' ' + p.ultRun.kind + p.ultRun.t : ''}`);
    }
    this.debug.textContent = lines.join('\n');
  }
  toggleDebug() { this.debug.hidden = !this.debug.hidden; }
}
