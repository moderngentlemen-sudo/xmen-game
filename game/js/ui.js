// DOM overlays: start screen, HUD, markers, barks, banners, pause/settings, help, debug.
import { SETTINGS, saveSettings, PLAYER_COLORS, PLAYER_MARKS, CHARS, NOVA, ECHO, HUNTER, MARKSMAN, ATTACH_LOOK, DASH_CHARGE, AEGIS, SUB_LOOK, ULT } from './config.js';

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
const ENEMY_NAMES = { swarmer: 'Swarmer', shield: 'Shieldbearer', sniper: 'Sniper', brute: 'Brute', post: 'Sparring post', turret: 'Turret',
  drone: 'Drone', mortar: 'Mortar', charger: 'Charger' };
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

const $ = (sel, root = document) => root.querySelector(sel);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

const SETTING_DEFS = [
  { key: 'novaKit', label: "Nova's kit", opts: [['marksman', 'Marksman: attachments, secondary weapons, dodge, skates'], ['sentinel', 'Sentinel: Pass 1 kit']] },
  { key: 'echoHead', label: "Echo's head (look only)", opts: [['helmet', 'Full helmet, amber visor'], ['mask', 'Survival mask'], ['bare', 'Bare face']] },
  { key: 'echoKit', label: "Echo's kit", opts: [['hunter', 'Hunter: blades, glaive, snares, reel'], ['pursuit', 'Pursuit: Pass 1 kit']] },
  { key: 'echoRanged', label: "Echo's ranged option, Pursuit kit only (Q-A test)", opts: [['A', 'A: Tracer shot only'], ['B', 'B: Bolts + Tracer'], ['C', 'C: No ranged attack']] },
  { key: 'vbStop', label: 'Velocity Break stop', opts: [['hard', 'Hard stop'], ['keep30', 'Keep 30% momentum']] },
  { key: 'vbRefund', label: 'Velocity Break refunds air dash on hit', bool: true },
  { key: 'dashIframes', label: 'Dash invulnerability (A/B test)', bool: true },
  { key: 'impactFrames', label: 'Impact frames on big moments (Q-C test)', bool: true },
  { key: 'camera', label: 'Camera projection', opts: [['persp', 'Perspective'], ['ortho', 'Orthographic']] },
  { key: 'fov', label: 'Camera field of view', range: [24, 50, 1] },
  { key: 'aimAssist', label: 'Aim assist (gamepad 8-way aim)', bool: true },
  { key: 'lockOn', label: 'Lock-on (F / R3)', bool: true },
  { key: 'lockMode', label: 'Lock-on mode', opts: [['auto', 'Automatic: nearest enemy, R3 switches'], ['manual', 'Press R3 to lock']] },
  { key: 'dashCharge', label: 'Charged dash (hold dash while standing still)', bool: true },
  { key: 'haptics', label: 'Rumble and vibration', bool: true },
  { key: 'hapticStrength', label: 'Rumble strength', range: [0, 1, 0.05] },
  { key: 'p1Aim', label: 'Keyboard player aims with', opts: [['mouse', 'Mouse'], ['keys', 'Movement keys (8-way)']] },
  { key: 'difficulty', label: 'Difficulty', opts: [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']] },
  { key: 'barks', label: 'Character lines (CP-09 test)', bool: true },
  { key: 'shake', label: 'Screen shake', bool: true },
  { key: 'quality', label: 'Graphics quality', opts: [['high', 'High (bloom, shadows)'], ['low', 'Low']] },
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
    s.innerHTML = `
      <div class="card">
        <p class="eyebrow">Fresh-start track · Browser prototype · Pass 1</p>
        <h1>Nova Striker</h1>
        <p class="lede">Movement, combat and co-op feel test. Placeholder art and sound; nothing here is final.</p>
        <div class="join"><span class="pulse"></span>Click, press any key, or press a gamepad button to join</div>
        <div class="cols">
          <div><h3>Keyboard + mouse</h3><ul>
            <li><kbd>A</kbd><kbd>D</kbd> move · <kbd>S</kbd> crouch · <kbd>Space</kbd> jump · <kbd>Shift</kbd> dash</li>
            <li>Left click fire (hold to charge) · Right click melee</li>
            <li><kbd>Q</kbd> parry / dodge · <kbd>E</kbd> suit ability · <kbd>R</kbd> mode</li>
            <li><kbd>T</kbd> secondary weapon · <kbd>F</kbd> switch target · <kbd>V</kbd> ultimate</li></ul></div>
          <div><h3>Gamepad</h3><ul>
            <li>Left stick move · Right stick aim · R3 switch target</li>
            <li>A jump · B dash · X melee · Y suit ability · RB mode</li>
            <li>RT fire · LT parry / dodge · LB secondary weapon</li>
            <li>LT + RT ultimate · D-pad swap character · Start pause</li></ul></div>
        </div>
        <p class="fine">New in Version 9: Nova's five secondary weapons (LB / <kbd>T</kbd>, no recoil) and his dodge (LT / <kbd>Q</kbd>); automatic lock-on; a rising attack for everyone (up + melee); and ultimates. Fill the bar, then pull both triggers (<kbd>V</kbd>); teammates with a full bar can join in for a team ultimate.</p>
        <p class="fine">Up to four players: extra gamepads join by pressing any button. <kbd>H</kbd>/View shows every control; <kbd>Esc</kbd>/Start opens settings, zones and the boss fights.</p>
        <p class="fine notice" hidden></p>
        <p class="fine touchnote">This build needs a keyboard or a gamepad. Touch controls are designed separately and arrive with a mobile port.</p>
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
    card.appendChild(h('h2', '', 'Settings and test toggles'));
    const row = h('div', 'actions');
    const mk = (label, fn) => { const b = h('button', 'btn', label); b.addEventListener('click', fn); row.appendChild(b); return b; };
    mk('Resume', () => this.H.resume());
    mk('Movement Gym', () => this.H.zone('gym'));
    mk('Concourse Lock', () => this.H.zone('arena'));
    mk('Storm Spire Climb', () => this.H.zone('tower'));
    mk('Skyline Relay', () => this.H.zone('skyline'));
    mk('Boss: Lockwarden', () => this.H.boss('warden'));
    mk('Boss: Stormcaller', () => this.H.boss('stormcaller'));
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
    card.appendChild(h('p', 'fine', 'Character lines are placeholder writing for the CP-09 test, not canon. Settings are remembered in this browser only.'));
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
      for (const c of ['nova', 'echo']) {
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
      <tr><td>Jump · double jump · wall jump</td><td>A</td><td>Space</td></tr>
      <tr><td>Dash (8-way) · slide (down + dash)</td><td>B</td><td>Shift</td></tr>
      <tr><td>Charged dash: hold dash while standing still, aim, let go. Each level goes further; level 2 is briefly invulnerable, level 3 cuts through enemies (afterimages show the level)</td><td>Hold B</td><td>Hold Shift</td></tr>
      <tr><td>Wall slide and wall jump: hold toward a wall to slide down it. Jump while holding toward it (or neutral) to kick up it; hold away to leap off. You can shoot and strike while sliding</td><td>Toward the wall · A</td><td>A/D toward the wall · Space</td></tr>
      <tr><td>Lock-on (automatic by default): whenever you have no target, the nearest enemy in sight is locked. Tap to switch to the next target; hold to let go (it stays off until you tap again). Homing shots go to the target and melee steps in toward it; free aim (right stick, mouse) still aims where you point. Settings: Lock-on mode, to lock only when you press</td><td>R3 (click the right stick)</td><td>F, O, or mouse forward button</td></tr>
      <tr><td>Velocity Break (Echo's Hunter kit: the Dash Slash, a lunging cut that carries him through)</td><td colspan="2">Melee while dashing or sliding, or just after a dash</td></tr>
      <tr><td>Melee · charged melee (hold, then let go)</td><td>X · hold X</td><td>Right click or J · hold</td></tr>
      <tr><td>Ground pound: in the air, melee with down held (or aimed straight down). Hold it to charge through three levels while you hang in the air; the landing throws enemies outward</td><td>Down + X in the air · hold</td><td>S + melee in the air · hold</td></tr>
      <tr><td>Rising attack: every character has their own. Nova: the Solar Uppercut (his boots fire and a hard-light fist drives up, three hits, a flare at the top; once per jump in the air). Echo: the Rising Glaive (a spinning uppercut that carries him up)</td><td>Up + X</td><td>W + melee</td></tr>
      <tr><td>Echo, Hunter kit: blade and glaive chain · Spin Slash in the air · Wall Slash on a wall · charged glaive swing that looses a crescent wave</td><td>X · up + X in the air · X on a wall · hold X</td><td>Melee · W + melee in the air · melee on a wall · hold</td></tr>
      <tr><td>Echo deflects: his parry and his glaive swings knock enemy shots back at whoever fired them. A perfect deflect opens a Riposte: melee straight after</td><td>LT · X</td><td>Q or L · melee</td></tr>
      <tr><td>Fire · charge</td><td>RT · hold RT</td><td>Left click or K · hold</td></tr>
      <tr><td>Aim</td><td>Right stick (free) or left stick (8-way)</td><td>Mouse</td></tr>
      <tr><td>Parry, Echo and Nova's Sentinel kit (first 4 frames are perfect)</td><td>LT</td><td>Q or L</td></tr>
      <tr><td>Nova, Marksman kit: dodge. A quick hop the way you push the stick (a backstep with it centred), untouchable at the start; one in the air per jump. Dodge an attack at the last moment for a perfect dodge: enemies close by slow down, and you gain Overcharge and ultimate charge. You keep charging through it</td><td>LT</td><td>Q or L</td></tr>
      <tr><td>Suit ability: Nova (Marksman kit) raises the hard-light Aegis for 5 s: it blocks every attack, and the damage it takes Overcharges his weapons (faster charging, harder hits). Press again to detonate it. Nova (Sentinel kit): Bulwark Pulse. Echo: his scarf ability for the current mode</td><td>Y</td><td>E, I, or middle click</td></tr>
      <tr><td>Switch mode: Nova's bracer attachment (Lance, Volley, Arc, Prism) · Echo's scarf mode (Tether, Veil, Flare)</td><td>RB</td><td>R, U, or mouse back button</td></tr>
      <tr><td>Nova, Marksman kit: fire · hold to charge the loaded attachment through three levels · let go on the flash after level 3 for a Perfect Release · keep holding to the Level 4 flash and let go for a sustained beam (steer it with your aim; dash or parry cuts it short)</td><td>RT · hold RT</td><td>Left click or K · hold</td></tr>
      <tr><td>Nova, Marksman kit: close to an enemy, melee is his hard-light combo (backhand, elbow, blast punch; an axe kick in the air). Otherwise it fires his secondary weapon; none has any recoil. Tap to fire, hold to charge through three levels. <b>Scatter</b>: point-blank pellets. <b>Grenade</b>: bounces, and bursts on its fuse or on an enemy (level 3 scatters bomblets). <b>Chain</b>: lightning that leaps from enemy to enemy, round shields, and stuns. <b>Disc</b>: flies out and back cutting everything (from level 2 it hovers at the end); press again to call it back. <b>Gravity Well</b>: pulls enemies in and holds them, swallows their shots, then collapses; press again to open it early, and again to collapse it</td><td>X · hold X</td><td>Right click or J · hold</td></tr>
      <tr><td>Switch Nova's secondary weapon: Scatter, Grenade, Chain, Disc, Gravity Well</td><td>LB</td><td>T or Y</td></tr>
      <tr><td>Ultimate: the bar under your health fills as you fight (dealing and taking damage, kills, perfect parries, dodges and deflects). When it is full, pull both triggers together. Nova: <b>Supernova</b>, a colossal beam you steer, then a nova of light. Echo: <b>Thousand Cuts</b>, a storm of blinking cuts on every enemy close by. Enemies freeze while it plays out and you can't be hurt</td><td>LT + RT together</td><td>V or N (or Q + left click together)</td></tr>
      <tr><td>Team ultimate: while a teammate's ultimate is being called (its name on screen), pull both triggers with a full bar to join in. Everyone who joins unleashes theirs together, stronger, then a team finisher hits every enemy on screen (Echo + Nova: Eclipse Protocol; Nova + Nova: Binary Star; Echo + Echo: Twin Phantom)</td><td>LT + RT during the call</td><td>V during the call</td></tr>
      <tr><td>Nova: every shot bursts where it lands and splashes nearby enemies. A charged shot bursting on the ground or a wall close to you launches you: aim at your feet to rocket jump. The longer the charge, the higher you go (a gold line shows the height); a Perfect Release goes highest</td><td colspan="2">Aim down, charge, let go</td></tr>
      <tr><td>Nova: light boosters. After your double jump, press and hold jump to hover and climb (the gold bar under his health)</td><td>A (third press)</td><td>Space (third press)</td></tr>
      <tr><td>Nova's skates: you glide and keep your speed; reverse to carve to a stop; crouch at speed for a low glide</td><td colspan="2">Move as usual</td></tr>
      <tr><td>Nova's Focus: each charged shot that lands adds a level (a Perfect Release adds two) and more damage; getting hit clears it</td><td colspan="2">Shown under his health bar</td></tr>
      <tr><td>Echo, Hunter kit: tap to throw a snare (down + tap plants one) · hold to scope the sniper rifle. Focus builds while you hold: the laser narrows, flickers until it rests on a target, holds solid on one and turns red at full focus. Let go for an instant shot; upper-body hits are critical, and at full focus it pierces everything in line, breaks armor and tags</td><td>Tap RT · hold RT</td><td>Tap / hold left click or K</td></tr>
      <tr><td>Tether mode: tap pulls light enemies or zips you to heavy ones; hold reels a light enemy in or yanks a heavy one off balance</td><td>Y (tap / hold)</td><td>E (tap / hold)</td></tr>
      <tr><td>Veil mode: you fade out while you're not attacking and enemies lose track of you; your first strike from hiding is an ambush that staggers. Attacking or getting hit shows you again. Vanish hides you at once</td><td>Y: Vanish</td><td>E: Vanish</td></tr>
      <tr><td>Flare mode: nearby enemies go for you instead of your team; while they do, parries are easier and Resolve builds faster. Challenge pulls every enemy close by onto you</td><td>Y: Challenge</td><td>E: Challenge</td></tr>
      <tr><td>Swap character</td><td>D-pad left/right</td><td>1 / 2 / Tab</td></tr>
      <tr><td>Revive a downed ally</td><td colspan="2">Stand next to them</td></tr>
      </tbody></table>
      <p class="fine">New enemies: <b>Drones</b> fly above you and shoot (parry, or pull them down with Echo's Tether). <b>Mortars</b> lob shells at a magenta ring on the ground: you can't parry the burst, so move, or shoot the shell down with a charged shot. <b>Chargers</b> telegraph a heavy charge: perfect-parry it or jump over, and they daze themselves on walls.</p>
      <p class="fine">Controllers rumble with hits, charges and launches (Settings: Rumble). On Android phones the first player's phone can vibrate; iPhones do not support vibration from a web page, and a page embedded in another site may be blocked from it.</p>
      <p class="fine">Threats: a white glint means you can parry it. A double glint marks a heavy attack: a perfect parry negates it fully. A magenta jagged strip and a rising tone mean you cannot parry it; jump or move.</p>
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
    // Drill post teaching labels
    for (const e of world.enemies) {
      if (e.type !== 'post') continue;
      let l = this.enemyLabels.get(e);
      if (!l) { l = h('div', 'elabel'); this.labels.appendChild(l); this.enemyLabels.set(e, l); }
      const s = view.screenOf(e.x, e.y + e.h + 0.8);
      l.hidden = Math.abs(e.x - world.cam.x) > world.cam.halfW + 1;
      l.textContent = e.label || 'Sparring post: step close';
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
