// The team is the weapon. The Team button starts a team-up with the ally you are next to or aiming at:
//   Jean + Wolverine   Fastball Special: she holds him, aims, throws; he drills through everything in line
//   Cyclops + Jean     Psychic rapport: for a while her telekinesis bends his blasts round cover onto targets
//   Cyclops + Wolverine Optic edge: a blast into his claws; his next strikes throw optic shockwaves
//   Jean + an enemy    Lift and hold: she pins it in the air; everyone's hits on it land harder, never countered
// Team-ups and assists fill the shared X-Gauge; Team and Signature together spend a full gauge on the team
// ultimate. Alone, you run a squad of three: tap Team to tag the next hero in, hold it to call a benched hero,
// who comes in for their team-up with you (Jean lifts what you aim at if you hold up as well).
import { DT, HEROES, HERO_IDS, TEAM, GAUGE, SQUAD, ENEMIES, MERCY, GRAVITY } from './config.js';
import { moveBody, rayCast } from './level.js';
import { emit, newId, ent } from './world.js';
import { setHero, setState, isDown } from './player.js';
import { spawnHitbox, hitEnemy } from './combat.js';
import { bankPath } from './heroes/cyclops.js';

const gain = (S, n) => { S.gauge = Math.min(GAUGE.max, S.gauge + n); };
const pairKey = (a, b) => [a, b].sort().join('+');
export const TEAMUPS = { 'jean+wolverine': 'fastball', 'cyclops+jean': 'rapport', 'cyclops+wolverine': 'edge' };
export const TEAMUP_NAMES = { fastball: 'Fastball Special', rapport: 'Psychic Rapport', edge: 'Optic Edge', lift: 'Lift and Hold', ult: 'To Me, My X-Men' };

export function updateTeam(S, cmds) {
  if (S.rapportT > 0 && --S.rapportT === 0) emit(S, 'rapportEnd', {});
  if (S.called) { const c = ent(S, S.called.id); if (--S.called.t <= 0 || !c || c.dead) { S.called = null; emit(S, 'callEnd', {}); } }
  // A Fastball whose thrower was interrupted (the team ultimate, a hit, going down) lets Wolverine go
  for (const p of S.players) if (p.fastball && p.state !== 'teamup') endFastball(S, p);
  if (S.ult) { updateUlt(S); return; }
  for (const p of S.players) {
    if (p.state === 'thrown') fly(S, p);
    else if (p.state === 'teamup') holdFastball(S, p);
  }
  for (const p of S.players) if (!isDown(p) && p.state !== 'held' && p.state !== 'thrown' && p.state !== 'teamup') teamButton(S, p);
  updateAssists(S);
  for (const p of S.players) if (p.squad) squadTick(S, p);
}

// ---- The button ---------------------------------------------------------------------------------------
function teamButton(S, p) {
  const both = p.holdT.team > 0 && p.holdT.sig > 0 && (p.buf.team === 0 || p.buf.sig === 0);
  if (both) { if (S.gauge >= GAUGE.max) startUlt(S, p); else emit(S, 'gaugeLow', { id: p.id, gauge: S.gauge }); p.buf.team = 99; return; }
  if (p.squad) {
    // Solo: tap to tag, hold to call an assist
    if (p.holdT.team === SQUAD.holdTicks) assist(S, p);
    else if ((p.held & 32) === 0 && p.teamPress > 0 && p.teamPress < SQUAD.holdTicks) tag(S, p);
    p.teamPress = (p.held & 32) ? p.holdT.team : 0;
    return;
  }
  if (p.buf.team !== 0) return;
  p.buf.team = 99;
  if (p.teamCd > 0) { emit(S, 'teamWait', { id: p.id, t: p.teamCd }); return; }
  const ally = partner(S, p);
  // Jean aiming at an enemy rather than at a teammate lifts it
  if (p.hero === 'jean' && S.players.length > 1 && (!ally || !aimedAt(p, ally, TEAM.aimRange))) { const e = liftTarget(S, p.x, p.y + p.h * 0.7, p.aimX, p.aimY); if (e) { lift(S, p, e); return; } }
  if (!ally) { emit(S, 'teamNone', { id: p.id }); return; }
  const kind = TEAMUPS[pairKey(p.hero, ally.hero)];
  if (!kind) { emit(S, 'teamNone', { id: p.id }); return; }
  if (kind === 'fastball') { const jean = p.hero === 'jean' ? p : ally, wolv = p.hero === 'jean' ? ally : p; startFastball(S, jean, wolv, null); }
  else if (kind === 'rapport') startRapport(S, p, ally);
  else startEdge(S, p.hero === 'cyclops' ? p : ally, p.hero === 'wolverine' ? p : ally);
  p.teamCd = ally.teamCd = TEAM.cd;
}
// The ally next to you, else the one your aim points at
function partner(S, p) {
  let near = null, nd = Infinity, aimed = null, ad = Infinity;
  for (const q of S.players) {
    if (q === p || isDown(q) || q.state === 'held' || q.state === 'thrown' || q.state === 'teamup') continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < TEAM.range && d < nd) { nd = d; near = q; }
    if (aimedAt(p, q, TEAM.aimRange) && d < ad) { ad = d; aimed = q; }
  }
  return near || aimed;
}
function aimedAt(p, q, range) {
  const dx = q.x - p.x, dy = q.y + q.h / 2 - (p.y + p.h / 2), d = Math.hypot(dx, dy);
  return d < range && d > 0.1 && (dx * p.aimX + dy * p.aimY) / d > TEAM.aimCone;
}
export function liftTarget(S, x, y, ax, ay) {
  let best = null, bd = Infinity;
  for (const e of S.enemies) {
    if (e.dead || ENEMIES[e.type].boss || e.liftT > 0) continue;
    const dx = e.x - x, dy = e.y + e.h / 2 - y, d = Math.hypot(dx, dy);
    if (d > TEAM.lift.range) continue;
    const dot = (dx * ax + dy * ay) / (d || 1), score = d * (2 - dot);
    if (dot > 0.55 && score < bd) { bd = score; best = e; }
  }
  return best;
}

// ---- Fastball Special ------------------------------------------------------------------------------------------
// Jean (a player, or an assist) holds Wolverine (a player, or an assist) over her head while she aims, then
// throws him. `jeanActor`/`wolvActor`: an assist stands in when that hero is benched.
export function startFastball(S, jean, wolv, opts) {
  const F = TEAM.fastball;
  wolv.state = 'held'; wolv.st = 0; wolv.heldBy = jean.id; wolv.move = null; wolv.vx = wolv.vy = 0;
  if (jean.kind === 'player') { jean.state = 'teamup'; jean.st = 0; jean.move = null; jean.fastball = { wolv: wolv.id, t: 0, max: opts && opts.quick ? 24 : F.hold }; }
  else jean.fastball = { wolv: wolv.id, t: 0, max: 24, aimer: opts && opts.aimer };
  gain(S, GAUGE.teamup);
  emit(S, 'teamup', { kind: 'fastball', name: TEAMUP_NAMES.fastball, ids: [jean.id, wolv.id], x: jean.x, y: jean.y });
}
function holdFastball(S, j) {
  const F = TEAM.fastball, f = j.fastball;
  if (!f) { setState(j, 'normal'); return; }
  const w = ent(S, f.wolv);
  f.t++;
  j.vx = 0; j.vy = Math.max(j.vy - GRAVITY * DT, -12); moveBody(j, DT, S.gates);
  if (Math.abs(j.aimX) > 0.2) j.facing = j.aimX > 0 ? 1 : -1;
  if (!w || w.state !== 'held') { j.fastball = null; setState(j, 'normal'); return; }
  carryOverhead(S, j, w);
  // She throws on a second press (Team, Power or Attack), or when the hold runs out
  const again = f.t > 6 && ((j.buf.team === 0) || (j.buf.power === 0) || (j.buf.attack === 0));
  if (again || f.t >= f.max) { j.buf.team = j.buf.power = j.buf.attack = 99; throwWolverine(S, j, w, j.aimX, j.aimY); j.fastball = null; setState(j, 'normal'); j.teamCd = TEAM.cd; }
}
function endFastball(S, j) {
  const w = ent(S, j.fastball.wolv); j.fastball = null;
  if (!w || w.state !== 'held' || w.heldBy !== j.id) return;
  w.heldBy = 0;
  if (w.kind === 'assist') w.done = true;
  else { w.state = 'normal'; w.st = 0; w.vy = 4; w.onGround = false; w.mercy = Math.max(w.mercy, 20); }
}
function carryOverhead(S, j, w) {
  const tx = j.x - j.facing * 0.1, ty = j.y + j.h + 0.25;
  w.x += (tx - w.x) * 0.5; w.y += (ty - w.y) * 0.5; w.vx = w.vy = 0; w.facing = j.facing;
}
function throwWolverine(S, j, w, ax, ay) {
  const F = TEAM.fastball;
  if (Math.abs(ax) < 0.1 && Math.abs(ay) < 0.1) { ax = j.facing; ay = 0; }
  const m = Math.hypot(ax, ay); ax /= m; ay /= m;
  w.state = 'thrown'; w.st = 0; w.heldBy = 0; w.facing = ax >= 0 ? 1 : -1;
  w.thrown = { dx: ax, dy: ay, t: 0, inst: newId(S), by: j.id };
  emit(S, 'fastballThrow', { ids: [j.id, w.id], x: w.x, y: w.y, dx: ax, dy: ay });
}
// Wolverine in flight (a player or an assist): claws first along the throw, through everything, then a slam
function fly(S, w) {
  const F = TEAM.fastball, T = w.thrown;
  if (!T) { setState(w, 'normal'); return; }
  T.t++;
  w.vx = T.dx * F.speed; w.vy = T.dy * F.speed;
  moveBody(w, DT, S.gates);
  spawnHitbox(S, { owner: w.kind === 'player' ? w.id : T.by, team: 'p', inst: T.inst, power: 'team', x0: w.x - 1.1, x1: w.x + 1.1, y0: w.y - 0.2, y1: w.y + w.h + 0.2,
    dmg: F.dmg, poise: F.poise, kb: [T.dx * 12, 6], heavy: true, kind: 'fastball' });
  if (w.hitWall || w.hitCeil || (w.onGround && T.dy < -0.3) || T.t >= F.ticks) {
    spawnHitbox(S, { owner: w.kind === 'player' ? w.id : T.by, team: 'p', inst: newId(S), power: 'team', x0: w.x - F.slam.r, x1: w.x + F.slam.r, y0: w.y - 0.5, y1: w.y + 2.2,
      dmg: F.slam.dmg, poise: 120, kb: [0, 9], heavy: true, launch: true, kind: 'slam' });
    emit(S, 'fastballSlam', { id: w.id, x: w.x, y: w.y });
    w.thrown = null; w.vx *= 0.2; w.vy = Math.max(0, w.vy * 0.2);
    if (w.kind === 'player') { w.mercy = Math.max(w.mercy, 20); setState(w, 'normal'); }
    else w.done = true;
  }
}

// ---- Psychic rapport, Optic edge, Lift and hold ------------------------------------------------------------------
function startRapport(S, a, b) {
  S.rapportT = TEAM.rapport.ticks;
  gain(S, GAUGE.teamup);
  emit(S, 'teamup', { kind: 'rapport', name: TEAMUP_NAMES.rapport, ids: [a.id, b.id], x: a.x, y: a.y });
}
function startEdge(S, cyc, wolv) {
  wolv.edge = { strikes: TEAM.edge.strikes, t: TEAM.edge.ticks, lastInst: 0 };
  gain(S, GAUGE.teamup);
  emit(S, 'teamup', { kind: 'edge', name: TEAMUP_NAMES.edge, ids: [cyc.id, wolv.id], x: wolv.x, y: wolv.y + 1, from: { x: cyc.x, y: cyc.y + cyc.h * 0.9 } });
}
export function lift(S, jean, e) {
  e.liftT = TEAM.lift.ticks; e.liftBy = jean.id; e.atk = null; e.state = 'lifted'; e.st = 0; e.onGround = false;
  if (e.carry) e.dropNow = true;
  gain(S, GAUGE.teamup);
  emit(S, 'teamup', { kind: 'lift', name: TEAMUP_NAMES.lift, ids: [jean.id], target: e.id, x: e.x, y: e.y + e.h / 2 });
}

// ---- Solo: the squad -----------------------------------------------------------------------------------------
const squadEntry = (p, hero) => p.squad.find(s => s.hero === hero);
const RES = { cyclops: ['strain', 'overheatT', 'callCd'], wolverine: ['rage', 'berserkT'], jean: ['conc', 'phoenix', 'shieldCd'] };
function saveRes(p) { const e = squadEntry(p, p.hero); e.hp = p.hp; e.res = {}; for (const k of RES[p.hero]) e.res[k] = p[k]; }
function loadRes(p) { const e = squadEntry(p, p.hero); if (e.res) for (const k of RES[p.hero]) p[k] = e.res[k]; }
function nextHero(p, ok) {
  const i = HERO_IDS.indexOf(p.hero);
  for (let k = 1; k < HERO_IDS.length; k++) { const h = HERO_IDS[(i + k) % HERO_IDS.length], e = squadEntry(p, h); if (e && !e.down && ok(e)) return e; }
  return null;
}
function tag(S, p) {
  p.teamPress = 0;
  if (p.tagCd > 0 || (p.state !== 'normal' && p.state !== 'attack')) return;
  const next = nextHero(p, () => true);
  if (!next) { emit(S, 'tagNone', { id: p.id }); return; }
  const from = p.hero;
  saveRes(p);
  setHero(S, p, next.hero, next.hp); loadRes(p);
  p.tagCd = SQUAD.tagCd; p.mercy = Math.max(p.mercy, SQUAD.tagIn.iframes);
  // The tag-in strike
  spawnHitbox(S, { owner: p.id, team: 'p', inst: newId(S), power: HEROES[p.hero].power, x0: p.x - 1.4, x1: p.x + 1.4, y0: p.y, y1: p.y + p.h, dmg: SQUAD.tagIn.dmg, poise: SQUAD.tagIn.poise, kb: [p.facing * 8, 5], kind: 'tagin' });
  emit(S, 'tag', { id: p.id, from, to: p.hero, x: p.x, y: p.y });
}
// The squad keeps playing while you swap: benched heroes heal, a downed hero gets back up on the bench once
// healed enough, and if the hero on the field goes down the next one tags in
function squadTick(S, p) {
  for (const e of p.squad) {
    if (e.hero === p.hero) { e.hp = p.hp; continue; }
    if (e.assistCd > 0) e.assistCd--;
    e.hp = Math.min(HEROES[e.hero].hp, e.hp + SQUAD.benchHeal * 60 * DT);
    if (e.down && e.hp >= HEROES[e.hero].hp * 0.35) { e.down = false; emit(S, 'benchReady', { id: p.id, hero: e.hero }); }
  }
  if (p.state === 'downed' && p.downedT >= 40) {
    const next = nextHero(p, () => true);
    const cur = squadEntry(p, p.hero); cur.down = true; cur.hp = 0; cur.res = null;
    if (next) {
      const from = p.hero;
      setHero(S, p, next.hero, next.hp); loadRes(p);
      p.mercy = MERCY; p.state = 'normal'; p.st = 0;
      emit(S, 'tag', { id: p.id, from, to: p.hero, x: p.x, y: p.y, forced: true });
    }
  }
}
// Hold Team: the next benched hero who is ready comes in for their team-up with you
function assist(S, p) {
  p.teamPress = 0;
  if (p.state !== 'normal' && p.state !== 'attack') return;
  const e = nextHero(p, s => s.assistCd === 0 && s.hp > 10);
  if (!e) { emit(S, 'assistNone', { id: p.id }); return; }
  e.assistCd = SQUAD.assistCd;
  const a = { kind: 'assist', id: newId(S), hero: e.hero, x: p.x - p.facing * 1.4, y: p.y, vx: 0, vy: 0, w: HEROES[e.hero].w, h: HEROES[e.hero].h, facing: p.facing,
    t: 0, life: 70, act: '', onGround: false, state: 'assist', st: 0, target: 0, shieldT: 0 };
  S.assists.push(a);
  gain(S, GAUGE.assist);
  const kind = TEAMUPS[pairKey(p.hero, e.hero)];
  // Holding up with Jean on the bench: she lifts what you aim at instead
  if (e.hero === 'jean' && p.my > 0.5) {
    const t = liftTarget(S, p.x, p.y + p.h * 0.7, p.aimX, p.aimY) || nearestEnemy(S, p.x, p.y, TEAM.lift.range);
    if (t) { a.act = 'lift'; lift(S, a, t); a.life = 50; emit(S, 'assist', { id: a.id, hero: a.hero, act: a.act, x: a.x, y: a.y }); return; }
  }
  if (kind === 'fastball') {
    a.act = 'fastball';
    if (p.hero === 'wolverine') { startFastball(S, a, p, { quick: true, aimer: p.id }); a.life = 40; }
    else { a.x = p.x + p.facing * 0.4; startFastball(S, p, a, { quick: true }); a.life = 120; }
  } else if (kind === 'rapport') {
    a.act = 'rapport'; startRapport(S, p, a);
    if (a.hero === 'cyclops') { a.act = 'blast'; a.t = -10; }
  } else if (kind === 'edge') {
    if (a.hero === 'cyclops') { a.act = 'edge'; startEdge(S, a, p); }
    else { a.act = 'lunge'; a.target = (nearestEnemy(S, p.x, p.y, 14) || {}).id || 0; a.edge = true; }
  }
  emit(S, 'assist', { id: a.id, hero: a.hero, act: a.act, x: a.x, y: a.y });
}
function nearestEnemy(S, x, y, range) {
  let best = null, bd = range;
  for (const e of S.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = e; } }
  return best;
}
function updateAssists(S) {
  for (const a of S.assists) {
    a.t++;
    if (a.state === 'thrown') { fly(S, a); }
    else if (a.state === 'held') { const j = ent(S, a.heldBy); if (!j || j.state !== 'teamup') a.done = true; }
    else {
      a.vy -= GRAVITY * DT; moveBody(a, DT, S.gates);
      // Jean the assist holding the player overhead: she throws along the player's aim
      if (a.fastball) {
        const w = ent(S, a.fastball.wolv); a.fastball.t++;
        if (!w || w.state !== 'held') a.fastball = null;
        else {
          carryOverhead(S, a, w);
          if (a.fastball.t >= a.fastball.max) { const aimer = ent(S, a.fastball.aimer) || w; throwWolverine(S, a, w, aimer.aimX, aimer.aimY); a.fastball = null; }
        }
      }
      if (a.act === 'blast' && a.t === 6) {
        // Cyclops on the rapport: a bent blast at the nearest enemy
        const t = nearestEnemy(S, a.x, a.y, 30);
        const dx = t ? t.x - a.x : a.facing, dy = t ? t.y + t.h * 0.6 - (a.y + 1.6) : 0, m = Math.hypot(dx, dy) || 1;
        const pts = bankPath(S, a.x, a.y + 1.6, dx / m, dy / m, 30, 1), inst = newId(S);
        for (const e of S.enemies) if (!e.dead && segHit(pts, e)) hitEnemy(S, e, { owner: a.id, team: 'p', inst, power: 'team', dmg: 10, poise: 70, kb: [Math.sign(dx) * 8, 4], heavy: true, kind: 'optic' });
        emit(S, 'optic', { id: a.id, pts, a: 1, width: 0.5, hits: [], rapport: true, x: a.x, y: a.y + 1.6 });
      }
      if (a.act === 'lunge' && a.t >= 8 && a.t < 22) {
        const t = ent(S, a.target);
        if (a.t === 8) { const dx = t ? t.x - a.x : a.facing, dy = t ? t.y + 0.8 - a.y : 0, m = Math.hypot(dx, dy) || 1; a.ldx = dx / m; a.ldy = dy / m; a.inst = newId(S); a.facing = a.ldx >= 0 ? 1 : -1; }
        a.vx = a.ldx * 26; a.vy = a.ldy * 26;
        spawnHitbox(S, { owner: a.id, team: 'p', inst: a.inst, power: 'team', x0: a.x - 1.1, x1: a.x + 1.1, y0: a.y, y1: a.y + a.h, dmg: 9, poise: 90, kb: [a.ldx * 10, 5], heavy: true, kind: 'drill' });
      }
    }
    if (a.t >= a.life && a.state !== 'thrown' && !a.fastball) a.done = true;
  }
  S.assists = S.assists.filter(a => !a.done);
}
function segHit(pts, e) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    for (let k = 0; k <= 10; k++) { const x = ax + (bx - ax) * k / 10, y = ay + (by - ay) * k / 10; if (Math.abs(x - e.x) < e.w / 2 + 0.3 && y > e.y - 0.3 && y < e.y + e.h + 0.3) return true; }
  }
  return false;
}

// ---- The team ultimate: To Me, My X-Men ------------------------------------------------------------------------
function startUlt(S, p) {
  S.gauge = 0;
  const members = S.players.filter(q => !isDown(q)).map(q => q.id);
  const bench = p.squad ? p.squad.filter(e => e.hero !== p.hero && !e.down).map(e => e.hero) : [];
  S.ult = { phase: 'cast', t: 0, by: p.id, members, bench, x: S.cam.x, y: S.cam.y };
  for (const q of S.players) if (members.includes(q.id)) { q.state = 'ult'; q.st = 0; q.move = null; q.vx = 0; }
  emit(S, 'ultCast', { id: p.id, name: TEAMUP_NAMES.ult, members, bench, x: p.x, y: p.y });
}
function updateUlt(S) {
  const U = S.ult, T = TEAM.ult;
  U.t++;
  if (U.phase === 'cast' && U.t >= T.cast) { U.phase = 'strike'; U.t = 0; emit(S, 'ultStrike', { x: S.cam.x, y: S.cam.y }); }
  if (U.phase === 'strike') {
    if (U.t === 1 || U.t === 12 || U.t === 24) {
      const inst = newId(S);
      for (const e of S.enemies) if (!e.dead && Math.abs(e.x - U.x) < T.r) hitEnemy(S, e, { owner: U.by, team: 'p', inst, power: 'team', dmg: T.dmg / 3, poise: T.poise / 3, kb: [0, 8], heavy: true, kind: 'ult' });
    }
    if (U.t >= 40) { U.phase = 'end'; U.t = 0; }
  }
  if (U.phase === 'end' && U.t >= 10) {
    for (const q of S.players) if (q.state === 'ult') { q.state = 'normal'; q.st = 0; q.mercy = MERCY; }
    S.ult = null; emit(S, 'ultEnd', {});
  }
}
export { rayCast };
