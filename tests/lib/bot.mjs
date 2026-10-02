// A simple bot that plays the real mission with no cheats: it walks on, fights the nearest Sentinel (Power from
// range, Attack up close), evades tells about to land, breaks the cell door, chases a Collector carrying the kid,
// tags out of trouble in solo and calls team-ups in co-op. Used to check that the mission can always be finished
// (no softlocks) and to get a feel for its length. `onStep(S)`, if given, runs after every tick (the golden
// replays record from it). Any change to the bot changes its inputs, so the golden replays must be re-recorded.
import { createWorld, step } from '../../game/js/sim/world.js';
import { BTN, ENEMIES } from '../../game/js/sim/config.js';
import { SECTIONS } from '../../game/js/sim/mission.js';
import { CELL } from '../../game/js/sim/level.js';

export function playMission({ players = 1, seed = 1, maxMin = 25, onStep = null } = {}) {
  const S = createWorld({ seed, players });
  const mem = S.players.map(() => ({ hold: 0, holdBtn: 0, evadeCd: 0, press: 0 }));
  let rng = seed >>> 0; const r = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
  function brain(p, i) {
    const M = S.mission, m = mem[i];
    const cmd = { mx: 0, my: 0, ax: p.facing, ay: 0, aim: false, b: 0 };
    if (p.state === 'downed') return cmd;
    // Goals: the nearest living Sentinel, a Collector carrying the kid first
    let target = null, td = Infinity;
    for (const e of S.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y) - (e.carry ? 20 : 0);
      if (d < td) { td = d; target = e; }
    }
    const sec = SECTIONS[M.sec];
    // Evade a tell that is about to land on us
    for (const e of S.enemies) {
      if (e.dead || e.state !== 'windup' || !e.atk) continue;
      const near = Math.abs(e.x - p.x) < (e.type === 'mk2' ? 5 : 3);
      const left = (e.atk.wind || (ENEMIES[e.type][e.atk.kind] || {}).wind || 20) - e.st;
      if (near && left <= 4 && left >= 0 && m.evadeCd <= 0) { cmd.b |= BTN.evade; cmd.mx = Math.sign(p.x - e.x) || 1; m.evadeCd = 20; return cmd; }
    }
    if (m.evadeCd > 0) m.evadeCd--;
    // A held power in progress: keep holding, aim, release when ready
    if (m.hold > 0) {
      m.hold--;
      if (target) { const dx = target.x - p.x, dy = target.y + target.h * 0.6 - (p.y + p.h * 0.8), d = Math.hypot(dx, dy) || 1; cmd.ax = dx / d; cmd.ay = dy / d; cmd.aim = true; }
      if (m.hold > 0) cmd.b |= m.holdBtn;
      return cmd;
    }
    // The cell door
    if (sec.kid && S.gates.cell && !S.enemies.some(e => !e.dead && Math.abs(e.x - p.x) < 10)) {
      if (p.x < CELL.door.x0 - 1.1) { cmd.mx = 1; if (p.hitWall && p.onGround) cmd.b |= BTN.jump; return cmd; }
      cmd.mx = 0.3; if (++m.press % 6 < 3) cmd.b |= BTN.attack; return cmd;
    }
    if (!target) {
      // Nothing to fight: walk on (to the jet in the escape), jumping obstacles
      const k = S.kid, wantX = M.phase === 'escape' ? 250 : (sec.start || p.x) + 30;
      // The kid is down: go to her and stand by her, which revives her. Anywhere: up onto a ledge or a gantry if that
      // is where she fell, or down through one if she fell below it (the bot used to wait beside them for ever)
      if (k && k.state === 'downed') {
        if (Math.abs(k.x - p.x) > 0.8) cmd.mx = Math.sign(k.x - p.x);
        if (k.y > p.y + 1) climb(p, m, cmd);
        else if (k.y < p.y - 1 && p.onGround) { cmd.my = -1; m.jt = !m.jt; if (m.jt) cmd.b |= BTN.jump; }   // down through the walkway
        if (p.hitWall && p.onGround) cmd.b |= BTN.jump;
        return cmd;
      }
      // Wait for the kid if she lags behind
      if (k && k.state !== 'caged' && k.state !== 'boarded' && p.x - k.x > 9 && M.phase !== 'fight') return cmd;
      cmd.mx = p.x < wantX ? 1 : 0;
      if (p.hitWall && p.onGround) cmd.b |= BTN.jump;
      return cmd;
    }
    const dx = target.x - p.x, dist = Math.abs(dx);
    cmd.ax = Math.sign(dx) || 1;
    // Solo: tag out when hurt or overheated
    if (p.squad && (p.hp < p.maxHp * 0.3 || p.overheatT > 0) && p.tagCd === 0 && r() < 0.05) { cmd.b |= BTN.team; return cmd; }
    if (p.squad && p.hero === 'wolverine' && ENEMIES[target.type].flier && p.tagCd === 0 && r() < 0.1) { cmd.b |= BTN.team; return cmd; }
    if (target.y > p.y + 2.5 && !p.onGround && p.vy < 2 && p.jumpsLeft > 0 && r() < 0.2) { cmd.b |= BTN.jump; return cmd; }
    // Team-ups now and then when an ally is close
    if (!p.squad && p.teamCd === 0 && S.players.some(q => q !== p && Math.abs(q.x - p.x) < 3) && r() < 0.01) { cmd.b |= BTN.team; return cmd; }
    // Ranged: Cyclops blasts, Jean grips and throws, Wolverine drills in
    const ranged = p.hero === 'cyclops' ? dist > 2 && dist < 16 : p.hero === 'jean' ? dist > 2 && dist < 8.5 : dist > 3 && dist < 9;
    if (ranged && r() < 0.08 && !(p.hero === 'cyclops' && p.overheatT > 0)) { m.hold = p.hero === 'wolverine' ? 46 : p.hero === 'jean' ? 30 : 20 + Math.floor(r() * 25); m.holdBtn = BTN.power; cmd.b |= BTN.power; return cmd; }
    if (dist > 1.8) { cmd.mx = Math.sign(dx); if (p.hitWall && p.onGround) cmd.b |= BTN.jump; if (target.y > p.y + 2 && p.onGround && r() < 0.05) cmd.b |= BTN.jump; return cmd; }
    // Close below a Sentinel standing on something higher: go up to it
    if (target.y > p.y + 2 && !ENEMIES[target.type].flier) { climb(p, m, cmd); cmd.mx = Math.sign(dx) * 0.5; return cmd; }
    cmd.mx = Math.sign(dx) * 0.2;
    if (++m.press % 5 < 2) cmd.b |= BTN.attack;
    if (p.hero === 'wolverine' && p.rage >= 80 && r() < 0.05) cmd.b |= BTN.sig;
    if (p.hero === 'jean' && p.shieldCd === 0 && S.projectiles.some(q => q.team === 'e' && Math.abs(q.x - p.x) < 5) && r() < 0.1) cmd.b |= BTN.sig;
    return cmd;
  }

  // Up onto something higher: a fresh press on the ground, held while rising (a jump let go early is cut short), then
  // a fresh press for the air jump (Jean holds on to levitate)
  function climb(p, m, cmd) {
    m.jt = !m.jt;
    if (p.onGround) { if (m.jt) cmd.b |= BTN.jump; }
    else if (p.vy > 0.5 || p.hero === 'jean') cmd.b |= BTN.jump;
    else if (p.jumpsLeft > 0 && m.jt) cmd.b |= BTN.jump;
    if (p.hitWall && p.onGround) cmd.b |= BTN.jump;
  }

  const sections = [], fails = [];
  for (let t = 0; t < maxMin * 3600 && !S.mission.done; t++) {
    const cmds = {}; S.players.forEach((p, i) => { cmds[p.slot] = brain(p, i); });
    step(S, cmds);
    if (onStep) onStep(S);
    for (const ev of S.events) {
      if (ev.type === 'sectionClear') sections.push(ev.name);
      if (ev.type === 'missionFail') fails.push(ev.why);
    }
  }
  return { done: S.mission.done, minutes: S.tick / 3600, sections, fails, stats: S.mission.stats, left: S.enemies.filter(e => !e.dead).map(e => e.type) };
}
