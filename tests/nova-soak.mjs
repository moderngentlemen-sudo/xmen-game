// Soak: two Marksman Novas and two Echos fight on random inputs for 8000 ticks, in the arena and in
// the Skyline Relay. Checks for exceptions, NaN positions and projectile, well or enemy build-up. Since
// Version 9 the random inputs also switch secondary weapons and call ultimates (bars are topped up now
// and then), and lock-on is automatic.
import { World } from '../game/js/world.js';
import { SETTINGS } from '../game/js/config.js';
SETTINGS.novaKit = 'marksman'; SETTINGS.echoKit = 'hunter'; SETTINGS.lockMode = 'auto';
const BT = ['jump', 'dash', 'melee', 'fire', 'parry', 'sig', 'mode', 'lock', 'sub', 'ult'];
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
function soak(zone) {
  const w = new World(); w.teleport(zone);
  const ps = ['nova', 'echo', 'nova', 'echo'].map((c, i) => w.addPlayer('t' + i, c));
  const prev = ps.map(() => ({ held: {} }));
  const plans = ps.map(() => ({ t: 0, o: {} }));
  let maxProj = 0, maxEnemies = 0, maxWells = 0, errs = 0, nan = 0; const ev = {};
  for (let tick = 0; tick < 8000; tick++) {
    const cmds = {};
    ps.forEach((p, i) => {
      const pl = plans[i];
      if (--pl.t <= 0) {
        pl.t = 5 + Math.floor(rnd() * 40);
        const held = {}; for (const b of BT) held[b] = rnd() < (b === 'fire' ? 0.5 : b === 'mode' || b === 'sub' ? 0.08 : b === 'lock' ? 0.06 : b === 'ult' ? 0.03 : b === 'jump' ? 0.3 : 0.15);
        const a = rnd() * Math.PI * 2;
        pl.o = { mx: rnd() < 0.7 ? (rnd() < 0.65 ? 1 : -1) : 0, my: rnd() < 0.15 ? -1 : rnd() < 0.1 ? 1 : 0, aim: [Math.cos(a), Math.sin(a) * 0.8], held };
      }
      const o = pl.o, held = {}; for (const b of BT) held[b] = !!o.held[b];
      const pressed = {}, released = {}; for (const b of BT) { pressed[b] = held[b] && !prev[i].held[b]; released[b] = !held[b] && !!prev[i].held[b]; }
      const c = { mx: o.mx, my: o.my, aimFree: true, ax: o.aim[0], ay: o.aim[1], held, pressed, released };
      prev[i] = c; cmds[p.slot] = c;
    });
    try { w.step(cmds); } catch (e) { errs++; if (errs < 3) console.log('ERR', e.stack.split('\n').slice(0, 3).join(' | ')); }
    for (const e of w.events) ev[e.type] = (ev[e.type] || 0) + 1;
    w.events.length = 0;
    maxProj = Math.max(maxProj, w.projectiles.length); maxEnemies = Math.max(maxEnemies, w.enemies.length); maxWells = Math.max(maxWells, w.wells.length);
    if (tick % 900 === 450) for (const p of ps) p.ult = 100;   // ultimates now and then
    for (const q of w.wells) if (!Number.isFinite(q.x + q.y)) nan++;
    for (const pr of w.projectiles) if (!Number.isFinite(pr.x + pr.y)) nan++;
    for (const e of w.enemies) if (!Number.isFinite(e.x + e.y)) nan++;
    for (const p of ps) if (!Number.isFinite(p.x + p.y + p.vx + p.vy)) nan++;
    if (w.arena.state === 'cleared') w.resetArena();
    // keep the soak inside the Skyline: if the team clears everything, start the encounters again
    if (zone === 'skyline' && w.encounters.every(S => S.state === 'cleared')) for (const S of w.encounters) S.state = 'idle';
  }
  const pick = ['shot', 'attach', 'perfectRelease', 'blast', 'splash', 'split', 'ricochet', 'burst', 'burstLevel', 'rocketJump', 'thrustOn', 'carve', 'focusUp',
    'enemyShot', 'mortarShot', 'enemyBlast', 'chargeStart', 'chargeCrash', 'hit', 'kill', 'intercept', 'wipe',
    'walljump', 'wallSlide', 'dashLevel', 'rifleShot', 'lockOn', 'lockSwitch', 'lockOff',
    'subSwitch', 'frag', 'chain', 'discThrow', 'discCatch', 'wellOpen', 'wellCollapse', 'dodge', 'perfectDodge', 'riseBlast', 'ultCast', 'ultJoin', 'ultNova', 'ultFinisher', 'teamFinisher'];
  console.log(zone, JSON.stringify({ errs, nan, maxProj, maxEnemies, maxWells, stuck: !!w.ultCast && w.ultCast.t > 400, events: Object.fromEntries(pick.map(k => [k, ev[k] || 0])) }));
  return errs === 0 && nan === 0 && maxProj < 250 && maxEnemies < 40 && maxWells <= 4 && !(w.ultCast && w.ultCast.t > 400);
}
const ok = [soak('arena'), soak('skyline')].every(Boolean);
console.log((ok ? 'PASS' : 'FAIL') + ' soak: no exceptions, no NaN, projectile and enemy counts bounded');
