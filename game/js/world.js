// World: owns every entity, runs the fixed-tick simulation, and emits events for
// rendering, audio and UI. Nothing in here touches the DOM or Three.js.
import { SETTINGS, DIFFICULTY, NOVA, MARKSMAN, ECHO, HUNTER, SCARF, CHARS, GRAVITY, DT, LOCK, AEGIS, DEFLECT, SUB, DODGE, ULT, VISOR, SQUALL, BERSERK, kitOf, boostOf, ultName } from './config.js';
import { BOXES, GATES, CHECKPOINTS, ZONES, KILL_Y, ARENA_TRIGGER_X, TOWER_TRIGGER_X, ENCOUNTERS, ROUTE_END_X, hasHeadroom, groundBelow, segmentBlocked, rayCast, rayBoxT, pointInSolid } from './level.js';
import { createPlayer, updatePlayer, setCharacter, chest, muzzle, addResolve, focusMult, marksman, rocketHeight, chargeStage, spendOvercharge, parryWindows, gainUlt, trackChord, chordReady, lockChosen } from './player.js';
import { createEnemy, updateEnemy, ENEMY_TYPES } from './enemies.js';
import { spawnBoss, BOSS } from './bosses.js';
import { resolveHitboxes, updateProjectiles, updateShockwaves, crossesBarrier, hitEnemy, hitPlayer, awardFocus, hurtbox } from './combat.js';
import { EMPTY_CMD } from './input.js';

const sign = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
// Height gained by a body launched upward at v with no rise cut, as the fixed-tick integration plays it out
const apexGain = v => Math.max(0, v * v / (2 * GRAVITY) - v * DT / 2);

// Short lines the heroes call out (Settings: Character barks). Nova's and Echo's are the CP-09 placeholders.
const BARKS = {
  nova: {
    intercept_save: ['Got that one.', 'Covered.'], saved_reply: ['Thanks. Eyes up.'],
    perfect: ['Denied.', 'Not today.'], revive: ['Up. I have you.', 'On your feet.'],
    revived: ['Thanks.', 'Noted.'], lash_reply: ['Show-off.', 'I had him.'],
    lash_save: ['Over here.'], lock_broken: ["Lock's open. Move."],
    challenge_reply: ["Don't make a habit of that.", 'I see them. Covering you.'],
    perfect_shot: ['Textbook.', 'Right on the mark.', 'Clean.'],
  },
  echo: {
    intercept_save: ['Got it!'], saved_reply: ['I had it.', "Didn't need that."],
    perfect: ['Too slow.', 'Again!'], revive: ['Come on, get up.', 'Not like this. Up.'],
    revived: ['I was fine.', 'Thanks.'], lash_reply: ['Nice pull.'],
    lash_save: ['Mine now!', 'Over here!'], lock_broken: ["That's how it's done."],
    challenge: ['Eyes on me!', 'Come on, all of you!'], ambush: ['Missed me?', 'Right behind you.'],
  },
  // The X-Men: lines written for this prototype in each hero's voice
  cyclops: {
    intercept_save: ['Covered.', 'I have your back.'], saved_reply: ['Good eye.', 'Thanks. Stay sharp.'],
    perfect: ['Saw it coming.', 'Too predictable.'], revive: ['On your feet, X-Man.', 'Stay with me. Up.'],
    revived: ['Thanks. Regroup.', 'I owe you one.'], lash_reply: ['Good teamwork.'], lash_save: ['Over here!'],
    lock_broken: ['Area secure. Move out.', 'X-Men, regroup. Next objective.'],
    challenge_reply: ["Don't get reckless.", 'I see them. Covering you.'],
    perfect_shot: ['Right on target.', 'Bank shot.', 'Textbook.'], visor: ['Full power!', 'Visor wide open!'],
  },
  wolverine: {
    intercept_save: ['Got it, bub.'], saved_reply: ['Had it handled.', "Didn't need that."],
    perfect: ['That all you got?', 'Too slow, tin can.'], revive: ['Get up, kid.', "C'mon. You're tougher than this."],
    revived: ['I heal fast.', 'Appreciate it.'], lash_reply: ['Show-off.'], lash_save: ['Over here!'],
    lock_broken: ['Next.', "That's how it's done."], challenge_reply: ["Now we're talkin'.", 'Save some for me.'],
    berserk: ['RRRAAGH!', 'Now you made me mad.'],
  },
  storm: {
    intercept_save: ['I have it.'], saved_reply: ['My thanks.'],
    perfect: ['The wind warned me.', 'Too slow.'], revive: ['Rise, my friend.', 'Come. I have you.'],
    revived: ['Thank you, friend.'], lash_reply: ['Well done.'], lash_save: ['Over here!'],
    lock_broken: ['The storm has passed.', 'Onward, X-Men.'], challenge_reply: ['Have a care!', 'I will cover you from above.'],
    perfect_shot: ['Strike true.', 'The sky answers.'], squall: ['Winds, rise!', 'Away with you!'],
  },
  jean: {
    intercept_save: ['Got it!'], saved_reply: ['Thanks!'],
    perfect: ['I felt that coming.', 'Not even close.'], revive: ["I've got you.", 'Stay with me.'],
    revived: ['Thanks. I owe you.'], lash_reply: ['Nice one.'], lash_save: ['Over here!'],
    lock_broken: ["It's over. Let's go.", 'Clear. Keep moving.'], challenge_reply: ['Careful!', "I'll shield you."],
    perfect_shot: ['Mind over matter.', 'Right where I wanted it.'],
  },
  psylocke: {
    intercept_save: ['Got it.'], saved_reply: ['I had it.', 'Unnecessary.'],
    perfect: ['Predictable.', 'Too slow.'], revive: ['Up. Now.', 'On your feet.'],
    revived: ['I am in your debt.'], lash_reply: ['Elegant.'], lash_save: ['Mine.', 'Come here.'],
    lock_broken: ['Done.', 'Next.'], challenge_reply: ['Show-off.'],
    challenge: ['Face me!', 'Come, all of you!'], ambush: ['Behind you.', 'You never saw me.'],
  },
};

export class World {
  constructor() {
    this.players = []; this.enemies = []; this.projectiles = []; this.hitboxes = [];
    this.barriers = []; this.shockwaves = []; this.events = []; this.scheduled = []; this.snares = []; this.wells = []; this.ultCast = null;
    this.hitSets = new Map(); this.tick = 0; this.instanceSeq = 1;
    this.checkpoint = 0; this.wipeT = 0; this.globalBarkCd = 0;
    this.arena = { state: 'idle' }; this.towerSpawned = false;
    this.encounters = ENCOUNTERS.map(def => ({ def, state: 'idle', wave: 0 })); this.routeDone = false;
    this.aspect = 16 / 9;
    this.cam = { x: 0, y: 3, dist: 16, halfW: 10, halfH: 5 };
    this.director = makeDirector(this);
    this.spawnGym();
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }
  newInstance() { return this.instanceSeq++; }
  schedule(ticks, fn) { this.scheduled.push({ t: this.tick + ticks, fn }); }
  activePlayers() { return this.players.filter(p => p.state !== 'dead' && p.state !== 'downed'); }

  // ---- Spawning helpers used by players, enemies and combat ----
  spawnHitbox(hb) { this.hitboxes.push(hb); }
  spawnProjectile(pr) {
    this.projectiles.push({ ttl: 60, r: 0.15, dmg: 1, poise: 6, hitSet: new Set(), dead: false, ...pr, px: pr.x, py: pr.y });
  }
  spawnShockwave(e, dir, dmg, scale = 1) {
    this.shockwaves.push({ owner: e, x: e.x + dir * (e.w / 2), y: e.y, dir, speed: 11, ttl: Math.round(60 * scale), dmg, h: 0.9, instance: this.newInstance() });
  }
  telegraph(e, cat, ticks) { this.emit('telegraph', { e, cat, ticks }); }

  fireShot(p, level) {
    const c = muzzle(p), ax = p.aimX, ay = p.aimY, far = marksman(p);
    const spec = level === 0 ? { speed: NOVA.shotSpeed, dmg: NOVA.shotDmg, poise: 6, r: 0.16, kb: 1.5, kind: 'shot' }
      : level === 1 ? { speed: NOVA.lance.speed, dmg: NOVA.lance.dmg, poise: NOVA.lance.poise, r: 0.24, pierce: true, kb: 5, kind: 'lance' }
        : { speed: NOVA.rail.speed, dmg: NOVA.rail.dmg, poise: NOVA.rail.poise, r: 0.3, pierce: true, rail: true, armorBreak: true, kb: 9, kind: 'rail' };
    spec.dmg *= focusMult(p);
    // Marksman kit: rounds fly the whole level and splash where they land
    if (far) { spec.splash = MARKSMAN.round.splash; spec.ttl = MARKSMAN.life; }
    this.spawnProjectile({ team: 'p', owner: p, x: c.x + ax * 0.7, y: c.y + ay * 0.7, vx: ax * spec.speed, vy: ay * spec.speed,
      ttl: Math.round(NOVA.shotRange / spec.speed * 60), intercept: true, homing: level > 0, level, ...spec });
    if (level === 2 && !p.onGround) p.vy = Math.max(p.vy, 1.5);   // a mid-air shot briefly holds him up (no push-back)
    else if (level === 1 && !p.onGround) p.vy = Math.max(p.vy, 0.5);
    this.emit('shot', { p, level, x: c.x + ax * 0.7, y: c.y + ay * 0.7 });
  }

  // Marksman kit: a charged release fires the loaded attachment. Every projectile from one release
  // shares a family, so the shot as a whole earns Focus once and rocket-jumps Nova at most once. The
  // family also carries how long the shot was charged (chargeT), which sets the rocket jump height.
  fireAttachment(p, kind, level, perfect, chargeT = MARKSMAN.charge[level - 1]) {
    const M = MARKSMAN, c = muzzle(p), ax = p.aimX, ay = p.aimY;
    const over = spendOvercharge(p);   // Aegis Overcharge: a stronger release
    const x = c.x + ax * 0.7, y = c.y + ay * 0.7, fm = focusMult(p) * over;
    const mult = fm * (perfect ? M.perfectMult : 1);
    const family = { focused: false, rocketed: false, perfect, chargeT, attach: kind, level };
    const base = { team: 'p', owner: p, x, y, level, perfect, family, intercept: true, ttl: M.life };
    const splash = S => ({ ...S, dmg: S.dmg * mult, poise: S.poise * mult, r: S.r * (perfect ? 1.2 : 1) });
    if (kind === 'lance') {
      const L = M.lance[level];
      this.spawnProjectile({ ...base, vx: ax * L.speed, vy: ay * L.speed,
        r: L.r * (perfect ? 1.2 : 1), dmg: L.dmg * mult, poise: L.poise * mult, kb: L.kb, pierce: true, homing: true,
        armorBreak: !!L.armorBreak || perfect, rail: !!L.rail || perfect, interceptHeavy: true, kind: level === 3 ? 'rail' : 'lance',
        splash: splash(L.splash) });
      if (!p.onGround) p.vy = Math.max(p.vy, level === 3 ? 1.5 : 0.5);
    } else if (kind === 'volley') {
      const V = M.volley, key = perfect ? 'perfect' : level, n = V.darts[key], fan = V.fan[key], a0 = Math.atan2(ay, ax);
      // Darts are spread over the enemies in front: the lower darts take the lower targets. Locked onto a
      // target he chose, every dart goes for it.
      const targets = p.lockT && !p.lockT.dead && lockChosen(p) ? [p.lockT] : this.enemiesInCone(c.x, c.y, ax, ay, V.seekRange, V.seekCone);
      const S = { ...V.splash, dmg: V.splash.dmg * fm, poise: V.splash.poise * fm, rocket: V.rocket };
      for (let i = 0; i < n; i++) {
        const a = a0 + fan * (i / (n - 1) - 0.5), sp = V.speed * (1 + (i % 2) * 0.08);
        const target = targets.length ? targets[Math.min(targets.length - 1, Math.floor(i * targets.length / n))] : null;
        this.spawnProjectile({ ...base, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: V.r,
          dmg: V.dmg * fm, poise: V.poise * fm, kb: 2, interceptHeavy: false, kind: 'dart', splash: S,
          seek: { target, delay: V.seekDelay, until: V.seekFor, turn: V.turn, age: 0 } });
      }
    } else if (kind === 'arc') {
      const A = M.arc, S = A[level], dx = ax, dy = ay + A.lift, m = Math.hypot(dx, dy) || 1;
      this.spawnProjectile({ ...base, intercept: false, vx: dx / m * A.speed, vy: dy / m * A.speed, gravity: A.gravity,
        r: 0.2, dmg: 0, poise: 0, kind: 'shell',
        blast: { r: S.r * (perfect ? A.perfectRadius : 1), dmg: S.dmg * mult, poise: S.poise * mult, armorBreak: !!S.armorBreak || perfect, rocket: S.rocket } });
    } else {
      const P = M.prism, S = P[level];
      this.spawnProjectile({ ...base, vx: ax * P.speed, vy: ay * P.speed, r: P.r * (perfect ? 1.2 : 1),
        dmg: S.dmg * mult, poise: S.poise * mult, kb: 3, homing: true, interceptHeavy: true, kind: 'prism', splash: splash(S.splash),
        prism: { shards: S.shards, bounces: S.bounces + (perfect ? P.perfectBounces : 0), mult } });
    }
    this.emit('shot', { p, level, attach: kind, perfect, x, y, ax, ay, over: over > 1 });
    if (perfect) { this.emit('perfectRelease', { p, x, y, attach: kind }); this.bark(p, 'perfect_shot', 0.25); }
  }

  // Explosions: splash from Nova's shots, Arc shells, the level 3 burst, and enemy mortar shells.
  // A player blast hits every enemy in the radius (over the top of shields) except `skip`, the one a
  // shot already hit directly; with `rocket` set it can also launch Nova. An enemy blast hits players
  // and cannot be parried.
  explode({ owner, team = 'p', x, y, spec, level = 0, perfect = false, family = null, skip = null, rocket = false, kind = 'splash' }) {
    const reach = (ent, r) => {
      const nx = Math.max(ent.x - ent.w / 2, Math.min(x, ent.x + ent.w / 2)), ny = Math.max(ent.y, Math.min(y, ent.y + ent.h));
      return Math.hypot(x - nx, y - ny) <= r;
    };
    if (team === 'e') {
      const id = this.newInstance();
      for (const q of this.players) {
        if (q.state === 'dead' || q.state === 'downed' || !reach(q, spec.r)) continue;
        hitPlayer(this, q, { owner, dmg: spec.dmg, unblockable: true, cat: 'unblockable', heavy: true, kb: [(sign(q.x - x) || 1) * 7, 6], instance: id, at: { x, y } });
      }
      this.emit('enemyBlast', { x, y, r: spec.r });
      return;
    }
    for (const e of this.enemies) {
      if (e.dead || e === skip || !reach(e, spec.r)) continue;
      const res = hitEnemy(this, e, { owner, dmg: spec.dmg, poise: spec.poise, armorBreak: !!spec.armorBreak, kb: [(sign(e.x - x) || 1) * 7, 5], blast: true }, 'blast');
      if (family && (res === 'hit' || res === 'kill')) awardFocus(this, { owner, family });
    }
    if (rocket && spec.rocket && owner && marksman(owner)) this.rocketPush(owner, x, y, spec, family, perfect);
    this.emit(kind, { p: owner, x, y, r: spec.r, level, perfect });
  }

  // Rocket jump: a charged shot bursting on terrain close to Nova launches him away from the burst.
  // The launch speed is the one that reaches the height the charge earned (rocketHeight), weaker for a
  // burst further away and for each extra rocket jump in the same airtime. It sets his climb speed rather
  // than adding to it, so the height the charge earned is a real ceiling. A short impact pause (freeze)
  // sells the blast before he leaves the ground.
  rocketPush(p, x, y, spec, family, perfect) {
    const R = MARKSMAN.rocket;
    if (family && family.rocketed) return;
    const reach = spec.r + R.reach;
    if (Math.hypot(p.x - x, p.y + p.h * 0.5 - y) > reach || p.state === 'downed' || p.state === 'dead') return;
    // A burst anywhere under his boots counts as right under him: the first `slack` m sideways are
    // ignored for both the direction and the strength
    const ox = p.x - x, sx = Math.sign(ox) * Math.max(0, Math.abs(ox) - R.slack);
    let dx = sx, dy = p.y + p.h * 0.5 - y;
    const dEff = Math.hypot(dx, dy);
    if (dEff < 0.05) { dx = 0; dy = 1; } else { dx /= dEff; dy /= dEff; }
    if (family) family.rocketed = true;
    const H = rocketHeight(family ? family.chargeT : MARKSMAN.charge[2], family ? family.attach : 'arc', perfect);
    const near = Math.max(0, dEff - R.close) / Math.max(0.01, reach - R.close);   // 0 for a burst at his feet
    const air = p.onGround ? 1 : R.air[Math.min(p.rockets, R.air.length - 1)];
    const k = Math.sqrt(2 * GRAVITY * H) * (1 - R.falloff * Math.min(1, near)) * air;
    if (!p.onGround) p.rockets++;
    let vx = p.vx + dx * k * R.side;
    if (Math.abs(vx) > R.sideMax && Math.abs(vx) > Math.abs(p.vx)) vx = sign(vx) * Math.max(R.sideMax, Math.abs(p.vx));
    p.vx = vx;
    if (dy > 0) p.vy = Math.max(p.vy, dy * k); else p.vy += dy * k * 0.5;
    if (dy > 0.2) { p.onGround = false; p.coyote = 0; }   // launched: no late ground jump to cut the climb
    p.dashCarry = true; p.fastFall = false;   // keeps the launch: no rise cut, momentum carries
    const power = Math.min(1, k / Math.sqrt(2 * GRAVITY * R.perfect));
    const h = dy > 0 ? apexGain(dy * k) : 0;
    p.rocketT = 50; p.rocketPow = power;
    p.hitstop = Math.max(p.hitstop, R.freeze[power < 0.45 ? 0 : power < 0.8 ? 1 : 2]);
    this.emit('rocketJump', { p, x, y, k, h, power, perfect, level: family ? family.level : 3, dx, dy });
  }

  // What a rocket jump would do right now: while Nova charges with his aim pointing down and a surface
  // close enough below, the height his feet would reach if he let go now. Presentation only (the apex
  // marker); the real launch is worked out when the shot bursts.
  rocketPreview(p) {
    const M = MARKSMAN, R = M.rocket;
    // (A Level 4 charge fires the beam instead, so it has no rocket jump to preview)
    if (!marksman(p) || p.chargeT < M.charge[0] || p.chargeT >= M.beam.at || p.aimY > -0.6 || !['normal', 'slide'].includes(p.state)) return null;
    const gy = groundBelow(p.x, p.y + 0.1);
    if (gy === -Infinity) return null;
    const stage = chargeStage(p), perfect = stage === 'perfect', level = p.chargeT >= M.charge[2] ? 3 : p.chargeT >= M.charge[1] ? 2 : 1;
    const A = p.attachment;
    let r = A === 'lance' ? M.lance[level].splash.r * (perfect ? 1.2 : 1) : A === 'volley' ? M.volley.splash.r
      : A === 'arc' ? M.arc[level].r * (perfect ? M.arc.perfectRadius : 1) : M.prism[level].splash.r * (perfect ? 1.2 : 1);
    const d = p.y + p.h * 0.5 - (gy + 0.15), reach = r + R.reach;
    if (d > reach) return null;
    const H = rocketHeight(p.chargeT, A, perfect), near = Math.max(0, d - R.close) / Math.max(0.01, reach - R.close);
    const air = p.onGround ? 1 : R.air[Math.min(p.rockets, R.air.length - 1)];
    const k = Math.sqrt(2 * GRAVITY * H) * (1 - R.falloff * Math.min(1, near)) * air;
    const up = Math.max(p.vy, k);
    return { x: p.x, y: p.y, apex: p.y + apexGain(up), level, perfect, h: H };
  }

  // ---- Nova: the Level 4 beam ----
  // Every tick: trace the beam to the first wall (a Prism beam bounces once), erase enemy shots it touches,
  // and every `pulse` ticks hit every enemy in it. Attachments add their flavour.
  beamTick(p) {
    const B = MARKSMAN.beam, b = p.beam, c = muzzle(p);
    const segs = []; let sx = c.x + b.dx * 0.6, sy = c.y + b.dy * 0.6, dx = b.dx, dy = b.dy;
    const bounces = b.attach === 'prism' ? B.prism.bounces : 0;
    for (let i = 0; i <= bounces; i++) {
      const h = rayCast(sx, sy, dx, dy, B.range);
      segs.push({ x0: sx, y0: sy, x1: h.x, y1: h.y, wall: h.wall, nx: h.nx, ny: h.ny });
      if (!h.wall || i === bounces) break;
      const dot = dx * h.nx + dy * h.ny; dx -= 2 * dot * h.nx; dy -= 2 * dot * h.ny;
      sx = h.x + h.nx * 0.05; sy = h.y + h.ny * 0.05;
    }
    b.segs = segs; b.pulse++;
    const near = (x, y, r) => segs.some(g => distToSeg(x, y, g) < r);
    for (const pr of this.projectiles) if (pr.team === 'e' && !pr.dead && near(pr.x, pr.y, B.width + pr.r)) { pr.dead = true; this.emit('erase', { x: pr.x, y: pr.y }); }
    if (b.pulse % B.pulse === 1) {
      for (const e of this.enemies) {
        if (e.dead) continue;
        const hb = hurtbox(e);
        if (!segs.some(g => segHitsBox(g, hb, B.width))) continue;
        const last = b.armor.get(e.id), ab = last === undefined || b.pulse - last >= B.armorEvery;
        if (ab) b.armor.set(e.id, b.pulse);
        const res = hitEnemy(this, e, { owner: p, dmg: B.dmg * b.mult, poise: B.poise * b.mult, kb: [sign(b.dx) * 3, 1], vx: b.dx, armorBreak: ab, rail: true, beam: true }, 'proj');
        if (res === 'hit' || res === 'kill') awardFocus(this, { owner: p, family: b.family });
      }
    }
    const end = segs[segs.length - 1];
    if (b.attach === 'arc' && b.pulse % B.arc.every === 0) {
      this.explode({ owner: p, x: end.x1, y: end.y1, spec: { ...B.arc.blast, dmg: B.arc.blast.dmg * b.mult, poise: B.arc.blast.poise * b.mult, armorBreak: true }, level: 2, kind: 'blast' });
    }
    if (b.attach === 'volley' && b.pulse % B.volley.every === 0) {
      const V = MARKSMAN.volley, a = Math.atan2(b.dy, b.dx) + (Math.random() - 0.5) * 0.9, sx0 = c.x + b.dx * 0.7, sy0 = c.y + b.dy * 0.7;
      const target = this.nearestEnemyInCone(sx0, sy0, b.dx, b.dy, V.seekRange, V.seekCone);
      this.spawnProjectile({ team: 'p', owner: p, x: sx0, y: sy0, vx: Math.cos(a) * V.speed, vy: Math.sin(a) * V.speed, ttl: MARKSMAN.life, r: V.r,
        dmg: V.dmg * b.mult, poise: V.poise * b.mult, kb: 2, kind: 'dart', level: 4, family: b.family, intercept: true, interceptHeavy: false,
        splash: { ...V.splash }, seek: { target, delay: 4, until: V.seekFor, turn: V.turn, age: 0 } });
    }
  }
  endBeam(p, why) {
    if (!p.beam) return;
    this.emit('beamEnd', { p, why });
    p.beam = null;
  }

  // ---- Nova: the hard-light Aegis ----
  raiseAegis(p) {
    const A = AEGIS;
    p.aegis = { hp: A.hp, max: A.hp, t: A.ticks, seen: new Set() };
    this.emit('aegisOn', { p });
  }
  // Ends it: 'break' (damage) shatters it outward, 'detonate' (pressed again) blasts it outward on purpose
  endAegis(p, why) {
    const S = p.aegis; if (!S) return;
    const A = AEGIS, c = chest(p), frac = Math.max(0, S.hp / S.max);
    p.aegis = null; p.aegisCd = A.cd;
    if (why === 'break' || why === 'detonate') {
      const B = why === 'break' ? A.shatter : A.detonate, k = why === 'detonate' ? 0.5 + 0.5 * frac : 1;
      this.spawnHitbox({ owner: p, team: 'p', x0: c.x - B.r, x1: c.x + B.r, y0: c.y - B.r, y1: c.y + B.r, dmg: B.dmg * k, poise: B.poise * k,
        kb: [B.kb, 5], radial: true, cx: c.x, armorBreak: true, instance: this.newInstance(), aegisBurst: true });
      if (why === 'detonate') { p.overcharge = Math.min(A.over.max, p.overcharge + A.detonate.over * frac); p.overT = A.over.hold; }
    }
    this.emit('aegisOff', { p, why, x: c.x, y: c.y, frac });
  }
  detonateAegis(p) { this.endAegis(p, 'detonate'); }

  // ---- Signatures: Cyclops's Visor Overdrive, Storm's Squall, Wolverine's Berserker Rage ----
  // Visor Overdrive: Overcharge fills, and a concussive flare off the visor throws back everything close
  visorOverdrive(p) {
    const V = VISOR, F = V.flare, c = muzzle(p);
    p.sigCd = V.cd; p.overcharge = Math.min(AEGIS.over.max, p.overcharge + V.over); p.overT = V.hold;
    this.spawnHitbox({ owner: p, team: 'p', x0: p.x - F.r, x1: p.x + F.r, y0: p.y - 0.3, y1: p.y + p.h + 0.8, dmg: F.dmg, poise: F.poise,
      kb: [F.kb, 4], radial: true, cx: p.x, instance: this.newInstance(), aegisBurst: true });
    this.emit('visor', { p, x: c.x, y: c.y, r: F.r });
    this.bark(p, 'visor', 0.5);
  }
  // Squall: a burst of wind round Storm that throws enemies away and blows their shots out of the air
  squall(p) {
    const Q = SQUALL, c = chest(p);
    p.sigCd = Q.cd;
    for (const pr of this.projectiles) if (pr.team === 'e' && !pr.dead && Math.hypot(pr.x - c.x, pr.y - c.y) < Q.r + pr.r) { pr.dead = true; this.emit('erase', { x: pr.x, y: pr.y }); }
    this.spawnHitbox({ owner: p, team: 'p', x0: c.x - Q.r, x1: c.x + Q.r, y0: c.y - Q.r, y1: c.y + Q.r, dmg: Q.dmg, poise: Q.poise,
      kb: [Q.kb, Q.up], radial: true, cx: c.x, instance: this.newInstance(), aegisBurst: true });
    if (!p.onGround) { p.vy = Math.max(p.vy, Q.lift); p.fastFall = false; }
    const B = boostOf(p); if (B) p.fuel = Math.min(B.fuel, p.fuel + Q.fuel);
    this.emit('squall', { p, x: c.x, y: c.y, r: Q.r });
    this.bark(p, 'squall', 0.4);
  }
  // Berserker Rage: faster swings that hit harder and heal him, and hits taken don't stagger him (combat.js)
  berserk(p) {
    p.berserkT = BERSERK.ticks;
    this.emit('berserk', { p, x: p.x, y: p.y + p.h * 0.6 });
    this.bark(p, 'berserk', 0.7, true);
  }
  endBerserk(p) {
    if (!(p.berserkT > 0)) return;
    p.berserkT = 0; p.sigCd = BERSERK.cd;
    this.emit('berserkEnd', { p });
  }
  // The Nova whose Aegis shelters this player (their own, or one they stand inside), if any
  shieldFor(q) {
    for (const n of this.players) {
      if (!n.aegis || n.state === 'dead' || n.state === 'downed') continue;
      if (n === q) return n;
      const a = chest(n), b = chest(q);
      if (Math.hypot(a.x - b.x, a.y - b.y) < AEGIS.radius) return n;
    }
    return null;
  }
  // The Aegis a point (a shot of radius r) has reached, if any
  aegisAt(x, y, r) {
    for (const n of this.players) {
      if (!n.aegis || n.state === 'dead' || n.state === 'downed') continue;
      const c = chest(n);
      if (Math.hypot(x - c.x, y - c.y) < AEGIS.radius + r) return n;
    }
    return null;
  }
  // The Aegis takes a hit coming from (fx, fy): damage to the hard light becomes Overcharge. `key` makes
  // one attack (a hitbox, a blast) count once even when it reaches several players inside.
  absorbAegis(n, dmg, fx, fy, key) {
    const S = n.aegis; if (!S) return;
    if (key !== undefined) { if (S.seen.has(key)) return; S.seen.add(key); }
    const A = AEGIS, c = chest(n);
    let dx = fx - c.x, dy = fy - c.y; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
    S.hp -= dmg;
    n.overcharge = Math.min(A.over.max, n.overcharge + dmg * A.over.perDmg); n.overT = A.over.hold;
    this.emit('aegisHit', { p: n, x: c.x + dx * A.radius, y: c.y + dy * A.radius, dx, dy, dmg, frac: Math.max(0, S.hp / S.max) });
    if (S.hp <= 0) this.endAegis(n, 'break');
  }

  // ---- Echo: sniper rifle and staff deflect ----
  // An instant shot down the level. Focus f (0-1) sets damage and poise; an upper-body hit is a critical;
  // at full focus it pierces everything in line, breaks armor and tags. No recoil: he stays where he is.
  fireSniper(p, f) {
    const R = HUNTER.rifle, c = chest(p), ax = p.aimX, ay = p.aimY, full = f >= 1;
    const x0 = c.x + ax * 0.9, y0 = c.y + ay * 0.9, wall = rayCast(x0, y0, ax, ay, R.range);
    const line = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      const hb = hurtbox(e), h = rayBoxT(x0, y0, ax, ay, hb.x0 - 0.06, hb.y0 - 0.06, hb.x1 + 0.06, hb.y1 + 0.06);
      if (h && h.t <= wall.t) line.push({ e, t: h.t });
    }
    line.sort((a, b) => a.t - b.t);
    const dmg = R.minDmg + (R.maxDmg - R.minDmg) * f * f, poise = R.poise[0] + (R.poise[1] - R.poise[0]) * f;
    let endT = wall.t, crits = 0, n = 0;
    for (const { e, t } of line) {
      const hy = y0 + ay * (t + 0.15), crit = hy > e.y + e.h * R.critZone;
      const res = hitEnemy(this, e, { owner: p, dmg: dmg * (crit ? R.crit : 1), poise: poise * (crit ? 1.3 : 1), kb: [sign(ax) * R.kb * (0.5 + f), 2],
        vx: ax, armorBreak: full, rail: full, snipe: true }, 'proj');
      n++;
      if (crit && res !== 'blocked') { crits++; this.emit('crit', { p, e, x: x0 + ax * t, y: hy }); }
      if (full && !e.dead) { e.tagged = Math.max(e.tagged, R.tag); this.emit('tag', { x: e.x, y: e.y + e.h, e }); }
      if (!full || res === 'blocked') { endT = t; break; }
    }
    this.emit('snipe', { p, x0, y0, x1: x0 + ax * endT, y1: y0 + ay * endT, ax, ay, f, full, crits, n, wall: endT === wall.t && wall.wall });
  }
  // Echo's staff knocks an enemy shot back toward whoever fired it, as his own, faster; a perfect parry
  // hits harder and opens a riposte
  deflect(p, pr) {
    const D = DEFLECT, perfect = p.state === 'parry' && p.parryT <= parryWindows(p).perfect;
    const src = pr.owner && pr.owner.kind === 'enemy' && !pr.owner.dead ? pr.owner : null, sp = Math.hypot(pr.vx, pr.vy) * D.speed;
    let vx = -pr.vx * D.speed, vy = -pr.vy * D.speed;
    if (src) { const dx = src.x - pr.x, dy = src.y + src.h * 0.6 - pr.y, m = Math.hypot(dx, dy) || 1; vx = dx / m * sp; vy = dy / m * sp; }
    const heavy = !!pr.heavy;
    Object.assign(pr, { team: 'p', owner: p, vx, vy, dmg: (heavy ? D.dmg.heavy : D.dmg.standard) * (perfect ? D.perfect : 1), poise: heavy ? 40 : 20, kb: 5,
      hitSet: new Set(), deflected: true, intercept: false, heavy: false, homing: false, ttl: Math.max(pr.ttl, 120), gravity: 0 });
    if (p.state === 'parry' && !p.parryResult) { p.parryResult = perfect ? 'perfect' : 'normal'; p.st = 0; p.hitstop = perfect ? 5 : 3; }
    if (perfect) { p.riposteT = 20; addResolve(p, 12); gainUlt(p, ULT.gain.perfect, this); } else addResolve(p, 6);
    this.emit('deflect', { p, x: pr.x, y: pr.y, perfect, heavy });
  }

  // Prism rounds split into shards that fan out along (dx, dy); shards skip the enemy that split them
  splitPrism(pr, x, y, dx, dy, skip) {
    const S = MARKSMAN.prism.shard, n = pr.prism.shards, a0 = Math.atan2(dy, dx);
    const splash = { ...S.splash, dmg: S.splash.dmg * pr.prism.mult, poise: S.splash.poise * pr.prism.mult };
    for (let i = 0; i < n; i++) {
      const a = a0 + S.fan * (i - (n - 1) / 2);
      this.spawnProjectile({ team: 'p', owner: pr.owner, x, y, vx: Math.cos(a) * S.speed, vy: Math.sin(a) * S.speed, ttl: MARKSMAN.life, r: S.r,
        dmg: S.dmg * pr.prism.mult, poise: S.poise * pr.prism.mult, kb: 2, level: pr.level, perfect: pr.perfect, family: pr.family,
        intercept: true, interceptHeavy: false, bounces: pr.prism.bounces, kind: 'shard', splash });
      if (skip) this.projectiles[this.projectiles.length - 1].hitSet.add(skip.id);
    }
    this.emit('split', { p: pr.owner, x, y, n });
  }

  // ---- Nova: secondary weapons (SUB) ----
  fireSub(p, level, perfect = false) {
    const k = p.sub;
    if (k === 'grenade') this.throwGrenade(p, level, perfect);
    else if (k === 'chain') this.fireChain(p, level, perfect);
    else if (k === 'disc') this.throwDisc(p, level, perfect);
    else if (k === 'well') this.launchWell(p, level, perfect);
    else this.fireBurst(p, level, perfect);
    p.shootT = 10;
  }

  // Scatter: point-blank pellets, level 0 for the quick press or 1-3 when charged; level 3 adds a blast at
  // the muzzle. No recoil: Nova stays where he is.
  fireBurst(p, level, perfect = false) {
    const B = MARKSMAN.burst, S = level ? B[level] : B.tap, c = muzzle(p), ax = p.aimX, ay = p.aimY, a0 = Math.atan2(ay, ax);
    const x = c.x + ax * 0.5, y = c.y + ay * 0.5, mult = perfect ? MARKSMAN.perfectMult : 1;
    for (let i = 0; i < S.pellets; i++) {
      const a = a0 + S.fan * (i / (S.pellets - 1) - 0.5);
      this.spawnProjectile({ team: 'p', owner: p, x, y, vx: Math.cos(a) * S.speed, vy: Math.sin(a) * S.speed, ttl: MARKSMAN.life, r: 0.16,
        dmg: S.dmg * mult, poise: S.poise * mult, kb: S.kb, kbY: 2, intercept: true, interceptHeavy: false, kind: 'pellet',
        falloff: { x, y, d: B.falloff }, armorBreak: !!S.armorBreak && i === (S.pellets >> 1) });
    }
    if (S.blast) {
      this.explode({ owner: p, x: x + ax * 0.7, y: y + ay * 0.7, level, perfect, kind: 'blast',
        spec: { r: S.blast.r * (perfect ? 1.25 : 1), dmg: S.blast.dmg * mult, poise: S.blast.poise * mult, armorBreak: true } });
    }
    p.shootT = 10; p.burstCd = B.cd;
    this.emit('burst', { p, x, y, ax, ay, level, charged: level > 0, perfect });
  }

  // Grenade: a bouncing frag on a fuse (combat.js bounces it); it bursts early on an enemy, and level 3
  // scatters bomblets when it goes off (clusterBurst)
  throwGrenade(p, level, perfect) {
    const G = SUB.grenade, c = muzzle(p), ax = p.aimX, ay = p.aimY, dy = ay + G.lift, m = Math.hypot(ax, dy) || 1, sp = G.speed[level];
    const mult = perfect ? MARKSMAN.perfectMult : 1, B = G.blast[level];
    const x = c.x + ax * 0.6, y = c.y + ay * 0.6;
    this.spawnProjectile({ team: 'p', owner: p, x, y, vx: ax / m * sp, vy: dy / m * sp, gravity: G.gravity, bouncy: G.bounce, r: G.r, ttl: G.fuse[level],
      dmg: 0, poise: 0, kind: 'grenade', level, perfect, intercept: false,
      blast: { r: B.r * (perfect ? 1.2 : 1), dmg: B.dmg * mult, poise: B.poise * mult, armorBreak: !!B.armorBreak || perfect },
      cluster: level === 3 ? G.bomblets : null });
    p.burstCd = G.cd;
    this.emit('grenadeThrow', { p, x, y, level, perfect });
  }
  clusterBurst(pr, x, y) {
    const K = pr.cluster;
    for (let i = 0; i < K.n; i++) {
      const a = Math.PI / 2 + (i / (K.n - 1) - 0.5) * 2.2;
      this.spawnProjectile({ team: 'p', owner: pr.owner, x, y: y + 0.2, vx: Math.cos(a) * K.speed, vy: Math.sin(a) * K.speed + K.lift * 0.3, gravity: SUB.grenade.gravity,
        bouncy: 0.35, r: 0.14, ttl: K.fuse + i * 3, dmg: 0, poise: 0, kind: 'bomblet', level: 1, intercept: false, blast: { ...K.blast } });
    }
    this.emit('cluster', { p: pr.owner, x, y, n: K.n });
  }

  // Chain: instant lightning from the bracer to the nearest enemy in front (the lock-on target first), then
  // from each enemy on to the nearest one within `hop` m it has not hit. It needs a clear line each jump,
  // arcs round shields, and stuns light enemies (combat.hitEnemy: hit.stun).
  fireChain(p, level, perfect) {
    const C = SUB.chain, c = muzzle(p), ax = p.aimX, ay = p.aimY, mult = perfect ? MARKSMAN.perfectMult : 1;
    const x0 = c.x + ax * 0.6, y0 = c.y + ay * 0.6, R = C.range[level], cos = Math.cos(C.cone);
    const mid = e => ({ x: e.x, y: e.y + e.h * 0.55 });
    const clear = (a, b) => !segmentBlocked(a.x, a.y, b.x, b.y);
    let first = null;
    const t = p.lockT;
    if (t && !t.dead && Math.hypot(t.x - x0, mid(t).y - y0) <= R && clear({ x: x0, y: y0 }, mid(t))) first = t;
    else {
      let bd = R;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const m = mid(e), dx = m.x - x0, dy = m.y - y0, d = Math.hypot(dx, dy);
        if (d < bd && d > 1e-3 && (dx * ax + dy * ay) / d > cos && clear({ x: x0, y: y0 }, m)) { bd = d; first = e; }
      }
    }
    const pts = [{ x: x0, y: y0 }], hit = new Set();
    let cur = first, from = { x: x0, y: y0 };
    while (cur && hit.size < C.jumps[level]) {
      hit.add(cur);
      const m = mid(cur); pts.push(m);
      hitEnemy(this, cur, { owner: p, dmg: C.dmg[level] * mult, poise: C.poise[level] * mult, kb: [(sign(m.x - from.x) || p.facing) * 2, 1], stun: C.stun[level], shock: true,
        armorBreak: level === 3 && hit.size === 1 }, 'blast');
      from = m; cur = null; let bd = C.hop;
      for (const e of this.enemies) {
        if (e.dead || hit.has(e)) continue;
        const n = mid(e), d = Math.hypot(n.x - m.x, n.y - m.y);
        if (d < bd && clear(m, n)) { bd = d; cur = e; }
      }
    }
    // Nothing in reach: the arc lashes out and earths itself on the nearest surface in front
    if (!first) { const h = rayCast(x0, y0, ax, ay, R * 0.7); pts.push({ x: h.x, y: h.y, fizzle: true }); }
    p.burstCd = C.cd;
    this.emit('chain', { p, pts, level, perfect, n: hit.size });
  }

  // Disc: out along the aim, (from level 2) a hover at the far end, then back to him (combat.steerDisc)
  throwDisc(p, level, perfect) {
    const D = SUB.disc, c = muzzle(p), ax = p.aimX, ay = p.aimY, sp = D.speed[level], mult = perfect ? MARKSMAN.perfectMult : 1;
    const x = c.x + ax * 0.6, y = c.y + ay * 0.6;
    this.spawnProjectile({ team: 'p', owner: p, x, y, vx: ax * sp, vy: ay * sp, ttl: 100000, r: D.r[level] * (perfect ? 1.2 : 1),
      dmg: D.dmg[level] * mult, poise: D.poise[level] * mult, kb: 3, pierce: true, intercept: true, interceptHeavy: level >= 2, kind: 'disc', level, perfect,
      disc: { phase: 'out', t: 0, out: D.out[level], hover: D.hover[level] + (perfect ? 20 : 0), dx: ax, dy: ay, speed: sp } });
    p.burstCd = D.cd;
    this.emit('discThrow', { p, x, y, level, perfect });
  }
  // Gravity Well: an orb that opens where it stops (updateWells)
  launchWell(p, level, perfect) {
    const W = SUB.well, c = muzzle(p), x = c.x + p.aimX * 0.7, y = c.y + p.aimY * 0.7;
    this.wells.push({ owner: p, x, y, px: x, py: y, vx: p.aimX * W.speed, vy: p.aimY * W.speed, phase: 'orb', t: 0, level, perfect,
      r: W.r[level] * (perfect ? 1.2 : 1), life: W.life[level] + (perfect ? 30 : 0), mult: perfect ? MARKSMAN.perfectMult : 1, held: new Set() });
    p.burstCd = W.cd;
    this.emit('wellLaunch', { p, x, y, level, perfect });
  }
  // Is a disc or a well of his still out?
  subOut(p, kind) {
    if (kind === 'disc') return this.projectiles.some(pr => pr.owner === p && pr.kind === 'disc' && !pr.dead);
    if (kind === 'well') return this.wells.some(w => w.owner === p);
    return false;
  }
  // Pressed again while it is out: the disc turns for home; the well opens where the orb is, or collapses
  recallSub(p, kind) {
    if (kind === 'disc') {
      const pr = this.projectiles.find(q => q.owner === p && q.kind === 'disc' && !q.dead);
      if (pr && pr.disc.phase !== 'back') { pr.disc.phase = 'back'; pr.disc.t = 0; pr.ghost = true; pr.hitSet.clear(); this.emit('discRecall', { p, x: pr.x, y: pr.y }); }
    } else if (kind === 'well') {
      const w = this.wells.find(q => q.owner === p);
      if (w) { if (w.phase === 'orb') this.openWell(w); else w.collapse = true; }
    }
  }
  openWell(w) {
    const W = SUB.well;
    w.phase = 'open'; w.t = 0;
    // A well that opens at floor level lifts a little, so what it catches floats up into it
    const gy = groundBelow(w.x, w.y + 0.05);
    if (gy > -Infinity && w.y - gy < W.lift && !pointInSolid(w.x, gy + W.lift)) w.y = gy + W.lift;
    this.emit('wellOpen', { p: w.owner, x: w.x, y: w.y, r: w.r, level: w.level });
  }
  updateWells(frozen) {
    const W = SUB.well;
    for (const w of this.wells) {
      w.px = w.x; w.py = w.y; w.t++;
      const gone = !this.players.includes(w.owner);
      if (w.phase === 'orb') {
        const nx = w.x + w.vx * DT, ny = w.y + w.vy * DT;
        let open = w.t >= W.travel[w.level] || gone;
        if (pointInSolid(nx, ny)) open = true; else { w.x = nx; w.y = ny; }
        if (!open) for (const e of this.enemies) { if (!e.dead && Math.abs(e.x - w.x) < e.w / 2 + 0.35 && w.y > e.y - 0.35 && w.y < e.y + e.h + 0.35) { open = true; break; } }
        if (open) this.openWell(w);
        continue;
      }
      // Open: pull light enemies in and hold them, drag heavy ones, swallow enemy shots, hurt everything
      const L = w.level, tickHit = w.t % W.tick === 0;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const cy = e.y + e.h * 0.5, dx = w.x - e.x, dy = w.y - cy, d = Math.hypot(dx, dy);
        if (d > w.r) continue;
        if (tickHit) hitEnemy(this, e, { owner: w.owner, dmg: W.tickDmg[L] * w.mult, poise: 4, kb: [0, 0], well: true }, 'blast');
        if (e.dead || e.boss || frozen) continue;
        const T = ENEMY_TYPES[e.type] || {};
        if (T.stationary) continue;
        const ux = d > 1e-3 ? dx / d : 0, uy = d > 1e-3 ? dy / d : 0, sp = Math.min(W.pull[L], d * 6);
        if (e.light && e.armor <= 0) {
          if (!['stagger', 'caught', 'snared'].includes(e.state)) {
            if (e.state === 'windup' || e.state === 'aim' || e.state === 'lock') this.director.release(e);
            e.state = 'launched'; e.st = 1;
          }
          e.vx = ux * sp; e.vy = uy * sp + (e.flier ? 0 : GRAVITY * DT); e.wellT = 2;
        } else {
          // Heavy: dragged along the ground toward it
          const step = ux * W.pull[L] * W.heavy * DT, nx = e.x + step;
          if (!pointInSolid(nx + sign(step) * e.w / 2, e.y + 0.3)) e.x = nx;
          e.wellT = 2;
        }
      }
      for (const pr of this.projectiles) {
        if (pr.team !== 'e' || pr.dead) continue;
        const dx = w.x - pr.x, dy = w.y - pr.y, d = Math.hypot(dx, dy);
        if (d > w.r) continue;
        if (d < 0.6) { pr.dead = true; this.emit('erase', { x: pr.x, y: pr.y }); continue; }
        const sp = Math.hypot(pr.vx, pr.vy); pr.vx += dx / d * 40 * DT; pr.vy += dy / d * 40 * DT;
        const s2 = Math.hypot(pr.vx, pr.vy) || 1; pr.vx *= sp / s2; pr.vy *= sp / s2;
      }
      if (w.t >= w.life || w.collapse || gone) {
        const S = W.implode[L];
        this.explode({ owner: gone ? null : w.owner, x: w.x, y: w.y, level: L + 1, perfect: w.perfect, kind: 'wellCollapse',
          spec: { r: S.r * (w.perfect ? 1.2 : 1), dmg: S.dmg * w.mult, poise: S.poise * w.mult, armorBreak: !!S.armorBreak } });
        w.dead = true;
      }
    }
    this.wells = this.wells.filter(w => !w.dead);
  }

  fireBolt(p) {
    const c = chest(p);
    this.spawnProjectile({ team: 'p', owner: p, x: c.x + p.aimX * 0.7, y: c.y + p.aimY * 0.7, vx: p.aimX * ECHO.boltSpeed, vy: p.aimY * ECHO.boltSpeed,
      ttl: 36, r: 0.15, dmg: ECHO.boltDmg, poise: 8, kb: 2, kind: 'bolt' });
    this.emit('shot', { p, level: 0, bolt: true, x: c.x, y: c.y });
  }
  fireTracer(p) {
    const c = chest(p);
    this.spawnProjectile({ team: 'p', owner: p, x: c.x + p.aimX * 0.7, y: c.y + p.aimY * 0.7, vx: p.aimX * 40, vy: p.aimY * 40,
      ttl: 42, r: 0.16, dmg: ECHO.tracerDmg, poise: 5, kb: 1, tracer: true, kind: 'tracer' });
    this.emit('tracer', { p, x: c.x, y: c.y });
  }

  bulwarkPulse(p) {
    const c = chest(p), ax = p.aimX, ay = p.aimY, cos = Math.cos(Math.PI * 50 / 180);
    for (const e of this.enemies) {
      if (e.dead || e.type === 'turret') continue;
      const dx = e.x - c.x, dy = e.y + e.h / 2 - c.y, d = Math.hypot(dx, dy) || 0.01;
      if ((d < 4.4 && (dx * ax + dy * ay) / d > cos) || d < 1.4) {
        hitEnemy(this, e, { owner: p, dmg: 1, poise: 40, kb: [ax * 12, 4 + ay * 6], bulwark: true }, 'pulse');
      }
    }
    for (const pr of this.projectiles) {
      if (pr.team !== 'e' || pr.dead) continue;
      const dx = pr.x - c.x, dy = pr.y - c.y, d = Math.hypot(dx, dy) || 0.01;
      if ((d < 4.4 && (dx * ax + dy * ay) / d > cos) || d < 1.6) { pr.dead = true; this.emit('erase', { x: pr.x, y: pr.y }); }
    }
    this.barriers.push({ x: c.x + ax * 2.4, y: c.y + ay * 2.4, nx: ax, ny: ay, half: NOVA.barrierHalf, ttl: NOVA.barrierTicks, max: NOVA.barrierTicks, owner: p });
    this.emit('bulwark', { p, x: c.x, y: c.y, ax, ay });
  }

  findLashTarget(p, cx, cy, ax, ay, range) {
    let best = null, bt = range + 0.01;
    const consider = ent => {
      const dx = ent.x - cx, dy = ent.y + ent.h * 0.5 - cy, t = dx * ax + dy * ay;
      if (t <= 0.3 || t > range) return;
      if (Math.abs(dx * -ay + dy * ax) > ent.h * 0.5 + 0.9) return;
      if (t < bt) { bt = t; best = ent; }
    };
    for (const e of this.enemies) if (!e.dead) consider(e);
    for (const q of this.players) if (q !== p && q.state === 'downed') consider(q);
    return best;
  }

  lashConnect(p, t, held = false) {
    if (t.kind === 'player') {
      t.x = p.x + p.facing * 0.9; t.y = p.y + 0.1;
      this.emit('lashAlly', { p, q: t });
      return;
    }
    if (t.light && t.armor <= 0) {
      const ally = this.players.find(q => q !== p && q.state !== 'dead' && q.state !== 'downed' && Math.hypot(q.x - t.x, q.y - t.y) < 3);
      this.director.release(t);
      t.state = 'caught'; t.st = 0; t.catcher = p; t.catchSide = sign(t.x - p.x) || p.facing; t.shieldDir = t.catchSide; t.dropT = 16;
      addResolve(p, 4);
      this.emit('lashPull', { p, e: t });
      if (held) { p.leash = { e: t, t: 0 }; this.emit('leash', { p, e: t }); }
      if (ally) { this.bark(p, 'lash_save', 0.8); this.schedule(50, () => this.bark(ally, 'lash_reply', 1, true)); }
    } else if (held) {
      // Hunter kit: yank a heavy target off balance instead of zipping to it
      hitEnemy(this, t, { owner: p, dmg: 0.5, poise: HUNTER.yankPoise, kb: [sign(p.x - t.x) * 3, 0] }, 'pulse');
      this.emit('yank', { p, e: t });
    } else {
      p.zip = { target: t }; p.state = 'zip'; p.st = 0;
      this.emit('lashZip', { p, e: t });
    }
  }

  releaseLeash(p) {
    const L = p.leash; p.leash = null;
    if (L && L.e && L.e.state === 'caught') L.e.st = Math.max(L.e.st, 20);
    this.emit('leashEnd', { p });
  }

  // ---- Scarf modes ----
  // Flare Signature (Challenge): every enemy close by turns on Echo, including a sniper already
  // aiming at someone else, and attacks sooner.
  challenge(p) {
    const c = chest(p); let n = 0;
    for (const e of this.enemies) {
      if (e.dead || e.type === 'post' || e.type === 'turret') continue;
      if (Math.hypot(e.x - c.x, e.y + e.h / 2 - c.y) > SCARF.challengeRange) continue;
      e.taunter = p; e.tauntT = SCARF.tauntTicks; e.target = p; n++;
      if (e.type === 'sniper' && (e.state === 'aim' || e.state === 'lock')) { e.aimX = p.x; e.aimY = p.y + 1.0; }
      if (e.cd > 20) e.cd = 20;
      this.emit('taunted', { e });
    }
    addResolve(p, 4);
    this.emit('challenge', { p, x: c.x, y: c.y, n });
    const ally = this.players.find(q => q !== p && q.state !== 'dead' && q.state !== 'downed');
    if (n > 0) { this.bark(p, 'challenge', 0.6); if (ally) this.schedule(60, () => this.bark(ally, 'challenge_reply', 0.6, true)); }
  }
  // Veil Signature (Vanish): everything tracking Echo loses him, including a sniper mid-aim.
  shakeOffTrackers(p) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.taunter === p) { e.tauntT = 0; e.taunter = null; }
      if (e.target !== p) continue;
      e.target = null;
      if (e.type === 'sniper' && e.state === 'aim') { this.director.release(e); e.state = 'idle'; e.st = 0; }
      this.emit('lostTrack', { e, p });
    }
  }

  // ---- Hunter kit snares ----
  throwSnare(p) {
    const c = chest(p);
    // Bola throw: flies straight at an enemy inside the throw cone; otherwise arcs out and plants as a trap
    const t = this.nearestEnemyInCone(c.x, c.y, p.aimX, p.aimY, 10, Math.PI / 6);
    let vx, vy, gravity;
    if (t) {
      const dx = t.x - c.x, dy = t.y + t.h * 0.5 - c.y, d = Math.hypot(dx, dy) || 1;
      vx = dx / d * 20; vy = dy / d * 20; gravity = 3;
    } else {
      vx = p.aimX * HUNTER.throwSpeed; vy = p.aimY * HUNTER.throwSpeed + HUNTER.throwLift; gravity = HUNTER.snareGravity;
    }
    this.spawnProjectile({ team: 'p', owner: p, x: c.x + p.aimX * 0.6, y: c.y + p.aimY * 0.6, vx, vy, gravity,
      r: 0.3, ttl: 110, dmg: 0, snare: true, kind: 'snare' });
    this.emit('snareThrow', { p, x: c.x, y: c.y });
  }
  plantSnare(p) { this.addSnare(p, p.x + p.facing * 0.6, p.y); }
  snareLanded(pr, x, y) {
    const gy = groundBelow(x, y + 0.2);
    if (gy > -Infinity && y - gy < 6) this.addSnare(pr.owner, x, gy);
  }
  addSnare(owner, x, y) {
    const mine = this.snares.filter(s => s.owner === owner);
    if (mine.length >= HUNTER.maxPlanted) mine[0].dead = true;
    this.snares = this.snares.filter(s => !s.dead);
    this.snares.push({ owner, x, y, armT: HUNTER.armTicks, ttl: HUNTER.life, dead: false });
    this.emit('snarePlant', { x, y, p: owner });
  }
  applySnare(e, owner) {
    if (e.dead) return;
    if (e.type === 'post' || e.type === 'turret') { this.emit('snared', { e, x: e.x, y: e.y + 0.4, owner, weak: true }); return; }
    e.tagged = Math.max(e.tagged, 600); e.snaredBy = owner;
    if (e.light && e.armor <= 0) {
      this.director.release(e);
      if (e.catcher && e.catcher.leash && e.catcher.leash.e === e) this.releaseLeash(e.catcher);
      e.state = 'snared'; e.st = 0; e.stun = HUNTER.rootLight; e.vx = 0;
    } else {
      hitEnemy(this, e, { owner, dmg: 0.5, poise: HUNTER.rootHeavyPoise, kb: [0, 0] }, 'pulse');
    }
    this.emit('snared', { e, x: e.x, y: e.y + e.h * 0.4, owner });
  }
  updateSnares() {
    for (const s of this.snares) {
      s.ttl--; if (s.armT > 0) { s.armT--; continue; }
      for (const e of this.enemies) {
        if (e.dead || e.state === 'snared' || e.type === 'turret') continue;
        if (Math.abs(e.x - s.x) < e.w / 2 + 0.45 && e.y < s.y + 0.6 && e.y + e.h > s.y - 0.1) {
          this.applySnare(e, s.owner); s.dead = true; this.emit('snareTrigger', { x: s.x, y: s.y, e, owner: s.owner });
          break;
        }
      }
    }
    this.snares = this.snares.filter(s => !s.dead && s.ttl > 0);
  }

  // Echo's dash chases tagged enemies roughly in the dash direction.
  pursuitTarget(p, dx, dy) {
    if (p.arch !== 'echo') return null;
    let best = null, bd = 12;
    const c = chest(p);
    for (const e of this.enemies) {
      if (e.dead || e.tagged <= 0) continue;
      const ex = e.x - c.x, ey = e.y + e.h / 2 - c.y, d = Math.hypot(ex, ey);
      if (d < bd && d > 1 && (ex * dx + ey * dy) / d > 0.5) { bd = d; best = e; }
    }
    return best;
  }

  // ---- Lock-on ----
  // Candidates in range, best first: near, in front, in sight (training targets last)
  lockCandidates(p) {
    const c = chest(p), out = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      const ty = e.y + e.h * 0.55, dx = e.x - c.x, d = Math.hypot(dx, ty - c.y);
      if (d > LOCK.range) continue;
      const behind = dx * p.facing < -0.5, blocked = segmentBlocked(c.x, c.y, e.x, ty);
      out.push({ e, score: d + (behind ? 7 : 0) + (blocked ? 10 : 0) + (e.type === 'post' || e.type === 'turret' ? 4 : 0) });
    }
    return out.sort((a, b) => a.score - b.score).map(o => o.e);
  }
  bestLockTarget(p) { return this.lockCandidates(p).find(e => e !== p.lockT) || null; }
  // Automatic lock-on: the nearest enemy in sight within LOCK.auto
  autoLockTarget(p) {
    const c = chest(p);
    return this.lockCandidates(p).find(e => Math.hypot(e.x - c.x, e.y + e.h * 0.55 - c.y) <= LOCK.auto && !segmentBlocked(c.x, c.y, e.x, e.y + e.h * 0.55)) || null;
  }
  nextLockTarget(p) {
    const list = this.lockCandidates(p);
    if (!list.length) return p.lockT;
    return list[(list.indexOf(p.lockT) + 1) % list.length];
  }
  setLock(p, e, why) {
    const prev = p.lockT;
    p.lockT = e; p.lockLost = 0;
    p.lockPicked = !!e && (why === 'on' || why === 'cycle');   // chosen by the player, not by automatic lock-on
    if (e && e !== prev) this.emit(prev ? 'lockSwitch' : 'lockOn', { p, e, why });
    else if (!e && prev) this.emit('lockOff', { p, why });
    else if (!e && why === 'on') this.emit('lockNone', { p });
  }
  // The target died (the lock moves to the next one), left (removed), or is out of range or sight too long
  validateLock(p) {
    const t = p.lockT; if (!t) return;
    if (t.dead || !this.enemies.includes(t)) { this.setLock(p, this.bestLockTarget(p), 'switch'); return; }
    const c = chest(p), ty = t.y + t.h * 0.55;
    if (Math.hypot(t.x - c.x, ty - c.y) > LOCK.keep) { this.setLock(p, null, 'range'); return; }
    p.lockLost = segmentBlocked(c.x, c.y, t.x, ty) ? p.lockLost + 1 : 0;
    if (p.lockLost > LOCK.lost) this.setLock(p, null, 'sight');
  }

  nearestEnemyInCone(x, y, dx, dy, range, half) {
    let best = null, bd = range; const cos = Math.cos(half);
    for (const e of this.enemies) {
      if (e.dead || e.type === 'post' || e.type === 'turret') continue;
      const ex = e.x - x, ey = e.y + e.h / 2 - y, d = Math.hypot(ex, ey);
      if (d < bd && (ex * dx + ey * dy) / d > cos) { bd = d; best = e; }
    }
    return best;
  }
  // Enemies within range and half-angle of a direction, ordered by signed angle from it
  enemiesInCone(x, y, dx, dy, range, half) {
    const cos = Math.cos(half), out = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      const ex = e.x - x, ey = e.y + e.h / 2 - y, d = Math.hypot(ex, ey);
      if (d > range || d < 1e-3 || (ex * dx + ey * dy) / d < cos) continue;
      out.push({ e, a: Math.atan2(dx * ey - dy * ex, dx * ex + dy * ey) });
    }
    return out.sort((a, b) => a.a - b.a).map(o => o.e);
  }
  nearestEnemyDist(x, y) {
    let bd = Infinity;
    for (const e of this.enemies) if (!e.dead) bd = Math.min(bd, Math.hypot(e.x - x, e.y + e.h / 2 - y));
    return bd;
  }
  enemyBelow(p, dist) {
    return this.enemies.find(e => !e.dead && Math.abs(e.x - p.x) < (e.w + p.w) / 2 && p.y - (e.y + e.h) < dist && p.y > e.y);
  }
  onOneWay(p) {
    return BOXES.some(b => b.type === 'o' && Math.abs(p.y - b.y1) < 0.03 && p.x > b.x0 && p.x < b.x1);
  }
  projectileTarget(b, savior) {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    for (const q of this.players) {
      if (q === savior || q.state === 'dead' || q.state === 'downed') continue;
      const dx = q.x - b.x, dy = q.y + 1 - b.y, along = (dx * b.vx + dy * b.vy) / sp;
      if (along > 0 && along < 5 && Math.abs(dx * b.vy - dy * b.vx) / sp < 1.4) return q;
    }
    return null;
  }

  // ---- Barks (CP-09 test) ----
  bark(p, key, chance = 1, force = false) {
    if (!SETTINGS.barks || !p || Math.random() > chance) return;
    if (!force && ((p.barkCd || 0) > 0 || this.globalBarkCd > 0)) return;
    const lines = (BARKS[p.char] || BARKS[p.arch])[key];
    if (!lines) return;
    p.barkCd = 300; this.globalBarkCd = 60;
    this.emit('bark', { p, text: lines[Math.floor(Math.random() * lines.length)] });
  }

  // ---- Players ----
  addPlayer(device, charId) {
    const used = new Set(this.players.map(p => p.slot));
    let slot = 0; while (used.has(slot)) slot++;
    if (slot > 3) return null;
    const anchor = this.activePlayers()[0];
    const cp = CHECKPOINTS[this.checkpoint];
    const x = anchor ? anchor.x - 0.8 : cp.x + slot * 0.8, y = anchor ? anchor.lastSafeY : cp.y;
    const p = createPlayer(slot, device, charId, x, y);
    p.mercy = 120;
    this.players.push(p); this.players.sort((a, b) => a.slot - b.slot);
    this.emit('join', { p });
    return p;
  }
  removePlayer(slot) {
    this.players = this.players.filter(p => p.slot !== slot);
    this.wells = this.wells.filter(w => this.players.includes(w.owner));
    if (this.ultCast) { this.ultCast.members = this.ultCast.members.filter(m => this.players.includes(m)); if (!this.ultCast.members.length) this.ultCast = null; }
    this.emit('leave', { slot });
  }
  swapCharacter(p, charId) {
    if (this.ultCast || p.state === 'ult') return;   // not in the middle of an ultimate
    if (p.thrusting) this.emit('thrustOff', { p });
    if (p.aegis) this.endAegis(p, 'swap');
    if (p.beam) this.endBeam(p, 'swap');
    this.endBerserk(p);
    // Each hero keeps their own Signature cooldown, still counting down while they are off the field
    (p.sigStash ||= {})[p.char] = { cd: p.sigCd, tick: this.tick };
    setCharacter(p, charId);
    const s = p.sigStash[charId]; p.sigCd = s ? Math.max(0, s.cd - (this.tick - s.tick)) : 0;
    this.emit('swap', { p });
  }

  downPlayer(p) {
    if (p.lockT) this.setLock(p, null, 'downed');
    if (p.aegis) this.endAegis(p, 'down');
    if (p.beam) this.endBeam(p, 'down');
    this.endBerserk(p); p.drillT = 0;
    p.hp = 0; p.chargeT = 0; p.meleeCharged = false; p.dash = null; p.lash = null; p.zip = null; p.rifleT = 0; p.dashChargeT = 0;
    p.dodge = null; p.pound = null; p.burstT = 0; p.subArmed = false;
    p.veiled = false; p.veilCharge = 0; p.ambushT = 0;
    p.state = 'downed'; p.st = 0; p.revive = 0; p.autoRevive = 0;
    if (this.players.length === 1) {
      p.downedT = 9999;
      if (p.secondWind) { p.secondWind = false; p.autoRevive = 70; this.emit('downed', { p, secondWind: true }); }
      else { this.emit('downed', { p }); this.startWipe(); }
      return;
    }
    p.downedT = 600;
    this.emit('downed', { p });
    if (this.activePlayers().length === 0) this.startWipe();
  }
  bleedOut(p) {
    p.state = 'dead'; p.respawnT = 360;
    this.emit('bleedOut', { p });
    if (this.activePlayers().length === 0) this.startWipe();
  }
  revivePlayer(p, by, frac) {
    p.state = 'normal'; p.st = 0; p.hp = Math.round(p.maxHp * frac); p.mercy = 90; p.revive = 0;
    p.h = CHARS[p.char].height; p.crouch = !hasHeadroom(p.x, p.y, p.w, p.h);
    this.emit('revived', { p, by });
    if (by) { this.bark(by, 'revive', 1, true); this.schedule(40, () => this.bark(p, 'revived', 1, true)); }
  }
  startWipe() { if (this.wipeT <= 0) { this.wipeT = 100; this.emit('wipe', {}); } }

  resetToCheckpoint() {
    const cp = CHECKPOINTS[this.checkpoint];
    this.players.forEach((p, i) => {
      p.x = cp.x + i * 0.8; p.y = cp.y; p.prevX = p.x; p.prevY = p.y; p.vx = 0; p.vy = 0;
      p.hp = p.maxHp; p.strain = 0; p.state = 'normal'; p.st = 0; p.secondWind = true; p.mercy = 60;
      p.h = CHARS[p.char].height; p.lastSafeX = p.x; p.lastSafeY = p.y; p.resolve = 0; p.chargeT = 0;
      p.veiled = false; p.veilCharge = 0; p.veilBreakT = 0; p.ambushT = 0; p.focus = 0;
      p.aegis = null; p.aegisCd = 0; p.overcharge = 0; p.beam = null;
      p.dodge = null; p.pound = null; p.burstT = 0; p.subArmed = false; p.ultRun = null; p.lockSuspend = false;
      p.berserkT = 0; p.sigCd = 0; p.drillT = 0; p.drillCd = 0; p.hurtT = 0;
      const B = boostOf(p); p.fuel = B ? B.fuel : 0;
    });
    this.projectiles = []; this.shockwaves = []; this.barriers = []; this.snares = []; this.wells = []; this.ultCast = null;
    for (const p of this.players) p.leash = null;
    if (this.arena.state !== 'cleared') this.resetArena();
    if (this.towerSpawned && this.enemies.some(e => e.zone === 'tower' && !e.dead)) {
      this.enemies = this.enemies.filter(e => e.zone !== 'tower'); this.towerSpawned = false;
    }
    // Skyline encounters that were not finished start over (and their gates open)
    for (const S of this.encounters) {
      if (S.state === 'cleared') continue;
      this.enemies = this.enemies.filter(e => e.enc !== S.def.id);
      S.state = 'idle'; S.wave = 0;
      for (const g of S.def.gates || []) GATES[g] = false;
    }
    this.director.reset();
    this.emit('respawnAll', {});
  }

  teleport(zoneId) {
    const z = ZONES.find(q => q.id === zoneId); if (!z) return;
    this.checkpoint = CHECKPOINTS.findIndex(c => c.x === z.spawn.x && c.y === z.spawn.y);
    if (this.checkpoint < 0) this.checkpoint = 0;
    if (zoneId === 'arena') { this.arena.state = 'idle'; }
    this.wipeT = 0;
    this.resetToCheckpoint();
    this.emit('banner', { text: z.name, sub: 'Zone loaded' });
  }

  resetArena() {
    const boss = this.arena.state === 'boss' || this.arena.state === 'bossReady';
    this.enemies = this.enemies.filter(e => e.zone !== 'arena');
    GATES.L = false; GATES.R = false;
    this.arena = { state: boss ? 'bossReady' : 'idle' };   // a wipe in the boss fight comes back to the boss
  }

  // The Sentinel Works' last wave: the Juggernaut drops in
  startWarden() {
    this.arena.state = 'boss';
    spawnBoss(this, 'warden', 87, 12, { zone: 'arena' });   // drops in beside the dais, not onto it
    this.emit('banner', { text: BOSS.warden.name, sub: BOSS.warden.title });
  }

  // Straight to a boss fight (pause menu): the arena's boss, or the beacon's with the relay already won
  bossRush(id) {
    if (id === 'warden') {
      this.teleport('arena'); this.arena.state = 'bossReady';
      for (const p of this.players) { p.x = 64.5 + p.slot * 0.8; p.prevX = p.x; }
      return;
    }
    for (const S of this.encounters) { S.state = S.def.boss ? 'idle' : 'cleared'; for (const g of S.def.gates || []) GATES[g] = false; }
    this.enemies = this.enemies.filter(e => e.zone !== 'skyline');
    this.checkpoint = CHECKPOINTS.findIndex(c => c.x === 302); this.wipeT = 0;
    this.resetToCheckpoint();
    this.emit('banner', { text: 'Rooftop Relay', sub: 'The beacon pad' });
  }

  // ---- Nova: the perfect dodge ----
  // An attack reached him early in a dodge: time slows for enemies close by (and their shots), and he
  // gains Overcharge and ultimate charge
  perfectDodge(p) {
    const D = DODGE, c = chest(p);
    p.dodge.perfect = true;
    for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - c.x, e.y + e.h / 2 - c.y) < D.slowRange + e.w / 2) e.slowT = e.boss ? D.slowTicks >> 1 : D.slowTicks;
    for (const pr of this.projectiles) if (pr.team === 'e' && !pr.dead && Math.hypot(pr.x - c.x, pr.y - c.y) < D.slowRange) pr.slowT = D.slowTicks;
    p.overcharge = Math.min(AEGIS.over.max, p.overcharge + D.over); p.overT = AEGIS.over.hold;
    gainUlt(p, ULT.gain.perfect, this);
    this.emit('perfectDodge', { p, x: c.x, y: c.y });
    this.bark(p, 'perfect', 0.3);
  }

  // ---- Ultimates (ULT) ----
  // A full bar and both triggers: the call. The world freezes for ULT.cast ticks while the caster powers up;
  // teammates with a full bar can pull both triggers to join (each join keeps the call open ULT.join more).
  startUlt(p) {
    p.ult = 0; p.chordP = p.chordF = 99;
    this.enterUlt(p);
    this.ultCast = { members: [p], phase: 'cast', t: 0, len: ULT.cast, name: ultName(p), team: false, power: 1 };
    // Nothing is left mid-motion to smear while everything holds still
    for (const q of [...this.players, ...this.enemies]) { q.prevX = q.x; q.prevY = q.y; }
    for (const pr of this.projectiles) { pr.px = pr.x; pr.py = pr.y; }
    for (const w of this.wells) { w.px = w.x; w.py = w.y; }
    this.emit('ultCast', { p, name: this.ultCast.name, x: p.x, y: p.y + p.h * 0.6 });
  }
  enterUlt(p) {
    if (p.beam) this.endBeam(p, 'ult');
    if (p.thrusting) { p.thrusting = false; this.emit('thrustOff', { p }); }
    if (p.leash) this.releaseLeash(p);
    Object.assign(p, { state: 'ult', st: 0, ultRun: null, dash: null, dodge: null, pound: null, lash: null, zip: null, slash: null, chargeT: 0, burstT: 0,
      subArmed: false, rifleT: 0, drillT: 0, dashChargeT: 0, meleeCharged: false, crouch: false, hitstop: 0, wallSliding: false });
  }
  ultCastTick(cmds) {
    const U = this.ultCast; U.t++;
    for (const q of this.players) {
      if (U.members.includes(q) || q.state === 'dead' || q.state === 'downed') continue;
      const cmd = cmds[q.slot] || EMPTY_CMD;
      trackChord(q, cmd);
      if (q.ult >= ULT.max && chordReady(q, cmd)) {
        q.ult = 0; q.chordP = q.chordF = 99; q.prevX = q.x; q.prevY = q.y;
        this.enterUlt(q); U.members.push(q); U.len = Math.max(U.len, U.t + ULT.join);
        this.emit('ultJoin', { p: q, n: U.members.length });
      }
    }
    if (U.t >= U.len) this.runUlt();
  }
  runUlt() {
    const U = this.ultCast; U.phase = 'run'; U.t = 0;
    U.team = U.members.length > 1; U.power = U.team ? ULT.team.power : 1;
    if (U.team) U.name = U.members.length > 2 ? ULT.teamAll : ULT.teamNames[U.members.map(m => m.char).sort().join('+')] || ULT.teamAll;
    for (const m of U.members) this.beginUlt(m, U.power);
    this.emit('ultRun', { members: [...U.members], team: U.team, name: U.name });
  }
  beginUlt(p, power) {
    const c = chest(p), kind = kitOf(p).ult;
    if (kind === 'storm') {
      // Eye of the Storm: every enemy in sight is a target, nearest first, and the bolts are shared out among them
      const S = ULT.storm, C = this.cam, d = e => Math.hypot(e.x - c.x, e.y + e.h / 2 - c.y);
      const seen = e => !e.dead && Math.abs(e.x - C.x) <= C.halfW + S.reach && Math.abs(e.y + e.h / 2 - C.y) <= C.halfH + S.reach;
      const targets = this.enemies.filter(seen).sort((a, b) => d(a) - d(b)).slice(0, S.targets);
      const cuts = targets.length ? Array.from({ length: S.strikes }, (_, i) => ({ e: targets[i % targets.length], at: S.start + i * S.every, i })) : [];
      const fin = cuts.length ? cuts[cuts.length - 1].at + 16 : S.start + 10;
      p.ultRun = { kind: 'storm', t: 0, power, targets, cuts, fin, end: fin + S.end };
    } else if (kind === 'beam') {
      // Supernova: it opens toward the lock-on target if he has one
      let dx = p.aimX, dy = p.aimY;
      if (p.lockT && !p.lockT.dead) { const ex = p.lockT.x - c.x, ey = p.lockT.y + p.lockT.h * 0.55 - c.y, m = Math.hypot(ex, ey) || 1; dx = ex / m; dy = ey / m; }
      p.ultRun = { kind: 'nova', t: 0, power, dx, dy, pulse: 0, segs: null };
    } else {
      // Thousand Cuts: the targets are picked now and the cuts shared out among them, nearest first
      const E = ULT.echo, d = e => Math.hypot(e.x - c.x, e.y + e.h / 2 - c.y);
      const targets = this.enemies.filter(e => !e.dead && d(e) <= E.range).sort((a, b) => d(a) - d(b)).slice(0, E.targets);
      const cuts = targets.length ? Array.from({ length: E.strikes }, (_, i) => ({ e: targets[i % targets.length], at: E.start + i * E.every, i })) : [];
      const fin = cuts.length ? cuts[cuts.length - 1].at + 14 : E.start;
      p.ultRun = { kind: 'echo', t: 0, power, targets, cuts, fin, end: fin + E.end, x0: p.x, y0: p.y };
    }
    this.emit('ultBegin', { p, kind: p.ultRun.kind });
  }
  // Ultimate damage: breaks armor, reduced on bosses, and never charges anyone's ultimate
  ultHit(p, e, dmg, poise, kx = 0) {
    return hitEnemy(this, e, { owner: p, dmg: dmg * (e.boss ? ULT.boss : 1), poise, kb: [kx, 3], armorBreak: true, ult: true }, 'blast');
  }
  // Each member's ultimate, a tick at a time (called from their 'ult' state)
  ultStep(p, cmd) {
    const R = p.ultRun;
    if (!R) { p.vx = 0; p.vy = p.onGround ? -0.5 : 0; return; }
    R.t++;
    if (R.kind === 'nova') this.ultNova(p, R); else if (R.kind === 'storm') this.ultStorm(p, R); else this.ultEcho(p, R);
  }
  // Eye of the Storm: she rises into the eye and holds there while lightning falls on every target in turn,
  // then a great bolt strikes all of them at once (with nobody in sight, a ring of lightning round her)
  ultStorm(p, R) {
    const S = ULT.storm, t = R.t;
    p.vx *= 0.7; p.vy = t <= 14 ? S.rise * 10 * (1 - t / 14) : 0;
    for (const cut of R.cuts) {
      if (cut.at !== t) continue;
      let e = cut.e;
      if (e.dead) e = R.targets.find(q => !q.dead);   // its target fell: the bolt finds one still standing
      if (!e) continue;
      this.ultHit(p, e, S.dmg * R.power, 20, (cut.i % 2 ? 1 : -1) * 1.5);
      this.emit('ultBolt', { p, e, x: e.x, y: e.y, top: e.y + e.h + 11, i: cut.i });
    }
    if (t === R.fin) {
      const c = chest(p);
      if (R.cuts.length) for (const e of R.targets) { if (!e.dead) this.ultHit(p, e, S.finisher * R.power, 90, (sign(e.x - p.x) || 1) * 6); }
      else for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - c.x, e.y + e.h / 2 - c.y) <= S.flourish.r) this.ultHit(p, e, S.flourish.dmg * R.power, 60);
      this.emit('ultThunder', { p, x: c.x, y: c.y, targets: R.targets.filter(e => !e.dead || e.deathT < 3), flourish: !R.cuts.length, r: S.flourish.r });
    }
    if (t >= R.end) this.finishUlt(p);
  }
  ultNova(p, R) {
    const N = ULT.nova, t = R.t, c = muzzle(p);
    // He rises into a hover while the light gathers, then holds there
    p.vx *= 0.7; p.vy = t <= 12 ? N.rise * 10 * (1 - t / 12) : 0;
    if (t > N.gather && t <= N.gather + N.beam) {
      // The beam turns toward his aim, runs N.range m through everything, and pulses every N.pulse ticks
      const a0 = Math.atan2(R.dy, R.dx); let da = Math.atan2(p.aimY, p.aimX) - a0;
      while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const a = a0 + Math.max(-N.turn, Math.min(N.turn, da)); R.dx = Math.cos(a); R.dy = Math.sin(a);
      if (Math.abs(R.dx) > 0.2) p.facing = sign(R.dx);
      const g = { x0: c.x + R.dx * 0.6, y0: c.y + R.dy * 0.6, x1: c.x + R.dx * N.range, y1: c.y + R.dy * N.range };
      R.segs = [g];
      for (const pr of this.projectiles) if (pr.team === 'e' && !pr.dead && distToSeg(pr.x, pr.y, g) < N.width + pr.r) { pr.dead = true; this.emit('erase', { x: pr.x, y: pr.y }); }
      if ((t - N.gather) % N.pulse === 1) {
        R.pulse++;
        for (const e of this.enemies) if (!e.dead && segHitsBox(g, hurtbox(e), N.width)) this.ultHit(p, e, N.dmg * R.power, 30, sign(R.dx) * 2);
      }
    } else R.segs = null;
    if (t === N.gather + N.beam + 6) {
      // The nova: a burst of light from where he hangs
      const B = N.nova, r = B.r * (R.power > 1 ? 1.15 : 1);
      for (const e of this.enemies) {
        if (e.dead) continue;
        const nx = Math.max(e.x - e.w / 2, Math.min(c.x, e.x + e.w / 2)), ny = Math.max(e.y, Math.min(c.y, e.y + e.h));
        if (Math.hypot(nx - c.x, ny - c.y) <= r) this.ultHit(p, e, B.dmg * R.power, B.poise, (sign(e.x - c.x) || 1) * 9);
      }
      this.emit('ultNova', { p, x: c.x, y: c.y, r });
    }
    if (t >= N.end) this.finishUlt(p);
  }
  ultEcho(p, R) {
    const E = ULT.echo, t = R.t;
    p.vx = 0; p.vy = p.onGround ? -0.5 : 0;   // he is gone: only his cuts are seen
    for (const cut of R.cuts) {
      if (cut.at !== t) continue;
      let e = cut.e;
      if (e.dead) e = R.targets.find(q => !q.dead);   // its target fell: the cut goes to one still standing
      if (!e) continue;
      const dir = cut.i % 2 ? 1 : -1;
      this.ultHit(p, e, E.dmg * R.power, 16, dir * 2);
      this.emit('ultCut', { p, e, x: e.x, y: e.y + e.h * 0.55, i: cut.i, dir, ang: ((cut.i * 2.39996) % Math.PI) - Math.PI / 2 });
    }
    if (t === R.fin) {
      // Every cut lands again at once
      if (R.cuts.length) for (const e of R.targets) { if (!e.dead) this.ultHit(p, e, E.finisher * R.power, 90, (sign(e.x - p.x) || 1) * 8); }
      else {
        // No one in reach: a flourish around him
        const c = chest(p);
        for (const e of this.enemies) if (!e.dead && Math.hypot(e.x - c.x, e.y + e.h / 2 - c.y) <= E.flourish.r) this.ultHit(p, e, E.flourish.dmg * R.power, 60);
      }
      this.emit('ultFinisher', { p, x: p.x, y: p.y + p.h * 0.6, targets: R.targets.filter(e => !e.dead || e.deathT < 3), flourish: !R.cuts.length });
    }
    if (t >= R.end) this.finishUlt(p);
  }
  finishUlt(p) {
    p.ultRun = null; p.state = 'normal'; p.st = 0; p.mercy = Math.max(p.mercy, ULT.mercy); p.vy = Math.min(p.vy, 0);
    this.emit('ultEnd', { p });
  }
  // The run (and a team ultimate's finisher) after every member has finished
  ultTick() {
    const U = this.ultCast;
    U.members = U.members.filter(m => this.players.includes(m));
    U.t++;
    if (U.phase === 'run') {
      if (U.members.some(m => m.ultRun)) return;
      if (U.team && U.members.length) { U.phase = 'finish'; U.t = 0; }
      else this.ultCast = null;
    } else if (U.phase === 'finish') {
      if (U.t === 8) {
        // The team finisher: every enemy on screen
        const C = this.cam, n = U.members.length, lead = U.members[0];
        for (const e of this.enemies) {
          if (e.dead || Math.abs(e.x - C.x) > C.halfW + 2 || Math.abs(e.y + e.h / 2 - C.y) > C.halfH + 2) continue;
          this.ultHit(lead, e, ULT.team.dmg * n, 120, (sign(e.x - C.x) || 1) * 10);
        }
        this.emit('teamFinisher', { name: U.name, members: [...U.members], x: C.x, y: C.y, chars: U.members.map(m => m.char) });
      }
      if (U.t >= ULT.team.t) this.ultCast = null;
    }
  }

  spawnGym() {
    this.enemies.push(createEnemy('post', 54.5, 0, { zone: 'gym' }));
    this.enemies.push(createEnemy('turret', 58, 3.05, { zone: 'gym', facing: -1 }));
  }

  // ---- The tick ----
  step(cmds) {
    this.tick++;
    // An ultimate being called: the world holds still, and only teammates joining in are listened to
    if (this.ultCast && this.ultCast.phase === 'cast') { this.ultCastTick(cmds); return; }
    if (this.globalBarkCd > 0) this.globalBarkCd--;
    const due = this.scheduled.filter(s => s.t <= this.tick);
    this.scheduled = this.scheduled.filter(s => s.t > this.tick);
    due.forEach(s => s.fn());
    // While an ultimate plays out, enemies, their shots and shockwaves stay frozen
    const frozen = !!this.ultCast;

    for (const p of this.players) {
      if (p.barkCd > 0) p.barkCd--;
      if (p.state === 'dead') { this.tickDead(p); continue; }
      const c0 = chest(p);
      updatePlayer(p, cmds[p.slot] || EMPTY_CMD, this);
      if (p.state === 'dash') {
        const c1 = chest(p);
        for (const b of this.barriers) {
          if (p.boostT <= 0 && crossesBarrier(b, c0.x, c0.y, c1.x, c1.y)) { p.boostT = 40; this.emit('boost', { p, x: c1.x, y: c1.y }); }
        }
        if (p.dash && !p.dash.pursuit && p.st === 1) {
          const t = this.pursuitTarget(p, p.dash.dx, p.dash.dy);
          if (t) { p.dash.pursuit = t; p.dash.t = Math.max(p.dash.t, 20); this.emit('pursuit', { p, e: t }); }
        }
      }
    }
    for (const e of this.enemies) {
      if (frozen && !e.dead) { e.prevX = e.x; e.prevY = e.y; if (e.flash > 0) e.flash--; continue; }
      updateEnemy(e, this);
    }
    if (!frozen) updateShockwaves(this);
    updateProjectiles(this, frozen);
    this.updateWells(frozen);
    this.updateSnares();
    resolveHitboxes(this);
    if (this.ultCast) this.ultTick();
    for (const b of this.barriers) b.ttl--;
    this.barriers = this.barriers.filter(b => b.ttl > 0);

    this.tickRevives();
    this.updateCamera();
    this.updateEncounters();

    this.enemies = this.enemies.filter(e => !(e.dead && e.deathT > (e.boss ? 84 : 45)));   // a boss stays for its explosions
    if (this.tick % 120 === 0) {
      const keep = this.instanceSeq - 400;
      for (const k of this.hitSets.keys()) if (k < keep) this.hitSets.delete(k);
    }
    if (this.wipeT > 0) { this.wipeT--; if (this.wipeT === 0) this.resetToCheckpoint(); }
  }

  tickDead(p) {
    p.prevX = p.x; p.prevY = p.y;
    if (this.wipeT > 0) return;
    p.respawnT--;
    if (p.respawnT <= 0) {
      const ally = this.activePlayers()[0];
      if (!ally) return;
      p.x = ally.lastSafeX; p.y = ally.lastSafeY; p.prevX = p.x; p.prevY = p.y; p.vx = 0; p.vy = 0;
      p.state = 'normal'; p.st = 0; p.hp = Math.round(p.maxHp * 0.3); p.mercy = 120; p.h = CHARS[p.char].height;
      this.emit('respawn', { p });
    }
  }

  tickRevives() {
    for (const p of this.players) {
      if (p.state !== 'downed') continue;
      if (p.autoRevive > 0) { p.autoRevive--; if (p.autoRevive === 0) this.revivePlayer(p, null, 0.4); continue; }
      const helpers = this.players.filter(q => q !== p && q.state !== 'downed' && q.state !== 'dead' && q.state !== 'hitstun'
        && Math.abs(q.x - p.x) < 1.7 && Math.abs(q.y - p.y) < 1.6);
      if (helpers.length) {
        p.revive += helpers.length;
        if (p.revive >= 120) this.revivePlayer(p, helpers[0], 0.4);
      } else p.revive = Math.max(0, p.revive - 0.5);
    }
  }

  updateCamera() {
    const act = this.players.filter(p => p.state !== 'dead');
    if (!act.length) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of act) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y + p.h);
      // Lining up a rocket jump, the camera eases back to show how high it will go, and it keeps the
      // peak in view on the way up, so the frame never has to chase the climb
      const pv = p.chargeT > 0 && this.rocketPreview(p);
      if (pv) y1 = Math.max(y1, pv.apex + 0.6);
      if (p.rocketT > 0 && p.vy > 0) { y1 = Math.max(y1, p.y + apexGain(p.vy) * 0.85 + p.h * 0.5); y0 = Math.min(y0, p.y - 2); }
    }
    // A boss in the fight stays in the frame
    const mid = (x0 + x1) / 2;
    for (const e of this.enemies) {
      if (!e.boss || e.dead || Math.abs(e.x - mid) > 24) continue;
      x0 = Math.min(x0, e.x - e.w / 2); x1 = Math.max(x1, e.x + e.w / 2); y0 = Math.min(y0, e.y); y1 = Math.max(y1, Math.min(e.y + e.h, y0 + 16));
    }
    const tanH = Math.tan((SETTINGS.fov * Math.PI / 180) / 2);
    const needW = (x1 - x0) + 9, needH = (y1 - y0) + 7;
    const MIN_D = 13, MAX_D = 32;
    let dist = Math.max(needH / 2 / tanH, needW / 2 / (tanH * this.aspect));
    dist = Math.max(MIN_D, Math.min(MAX_D, dist));
    const halfH = dist * tanH, halfW = halfH * this.aspect;
    this.cam = { x: (x0 + x1) / 2 + 0.8, y: (y0 + y1) / 2 + 1.0, dist, halfW, halfH };
    // Spread limit and recall (co-op). Being left behind is never a damage penalty.
    const multi = act.length > 1;
    for (const p of this.players) {
      if (p.state === 'dead') continue;
      if (p.y < KILL_Y) { this.recall(p, true); continue; }
      if (!multi) continue;
      const right = this.cam.x + halfW - 0.7;
      if (p.x > right) { p.x = right; if (p.vx > 0) p.vx = 0; }
      const off = p.x < this.cam.x - halfW - 0.5 || p.y + p.h < this.cam.y - halfH - 1;
      p.offscreenT = off ? p.offscreenT + 1 : 0;
      if (p.offscreenT > 90 && p.state !== 'downed') this.recall(p, false);
    }
  }

  recall(p, pit) {
    const allies = this.activePlayers().filter(q => q !== p);
    const a = allies.sort((m, n) => Math.abs(m.x - p.x) - Math.abs(n.x - p.x))[0];
    const tx = a ? a.lastSafeX : p.lastSafeX, ty = a ? a.lastSafeY : p.lastSafeY;
    p.x = tx; p.y = ty; p.prevX = tx; p.prevY = ty; p.vx = 0; p.vy = 0; p.offscreenT = 0;
    p.mercy = 90; if (p.state !== 'downed') { p.state = 'normal'; p.st = 0; }
    this.emit('recall', { p, pit });
    if (pit && p.state !== 'downed') {
      p.hp -= 10;
      if (p.hp <= 0) this.downPlayer(p);
    }
  }

  updateEncounters() {
    // Checkpoints
    for (let i = this.checkpoint + 1; i < CHECKPOINTS.length; i++) {
      const cp = CHECKPOINTS[i];
      if (this.players.some(p => p.state !== 'dead' && p.x >= cp.x - 0.5 && p.y >= cp.y - 0.5 && p.onGround)) {
        if (i === 1 || this.arena.state === 'cleared' || i > 2) { this.checkpoint = i; this.emit('checkpoint', { i }); }
      }
    }
    // Concourse Lock
    const n = Math.max(1, this.players.length);
    const A = this.arena;
    if (A.state === 'idle' && this.players.some(p => p.state !== 'dead' && p.x > ARENA_TRIGGER_X && p.x < 96)) {
      GATES.L = true; GATES.R = true; A.state = 'wave1';
      for (const p of this.players) if (p.x < 63) { p.x = 64 + p.slot * 0.8; p.y = 0; p.vx = 0; p.vy = 0; }
      const sp = [createEnemy('shield', 88, 0), createEnemy('shield', 92, 0), createEnemy('sniper', 94.1, 5.4)];
      if (n >= 3) { sp.push(createEnemy('shield', 71, 0)); sp.push(createEnemy('sniper', 64.9, 5.4, { facing: 1 })); }
      for (const e of sp) { e.zone = 'arena'; this.enemies.push(e); }
      this.emit('banner', { text: 'Sentinel Works', sub: 'Floor sealed. Break the assembly lock.' });
      this.emit('gates', { closed: true });
    } else if (A.state === 'wave1') {
      const alive = this.enemies.filter(e => e.zone === 'arena' && !e.dead).length;
      if (alive <= 1) {
        A.state = 'wave2';
        const count = n === 1 ? 3 : n === 2 ? 4 : 6;
        for (let i = 0; i < count; i++) {
          const e = createEnemy('swarmer', i % 2 ? 66 : 94, 0); e.zone = 'arena'; e.cd = 20 + i * 12; this.enemies.push(e);
        }
        const b = createEnemy('brute', 90, 0); b.zone = 'arena'; this.enemies.push(b);
        this.emit('banner', { text: 'Wave 2', sub: 'A Mk-I Sentinel holds the lock.' });
      }
    } else if (A.state === 'wave2') {
      if (!this.enemies.some(e => e.zone === 'arena' && !e.dead)) this.startWarden();
    } else if (A.state === 'bossReady') {
      // After a wipe in the boss fight, walking back in goes straight to the boss
      if (this.players.some(p => p.state !== 'dead' && p.x > ARENA_TRIGGER_X && p.x < 96)) {
        GATES.L = true; GATES.R = true; this.emit('gates', { closed: true });
        for (const p of this.players) if (p.x < 63) { p.x = 64 + p.slot * 0.8; p.y = 0; p.vx = 0; p.vy = 0; }
        this.startWarden();
      }
    } else if (A.state === 'boss') {
      if (!this.enemies.some(e => e.zone === 'arena' && !e.dead)) {
        A.state = 'cleared'; GATES.L = false; GATES.R = false;
        this.emit('banner', { text: 'Juggernaut stopped', sub: 'Gates open. Trask Tower is ahead.' });
        this.emit('gates', { closed: false });
        const talker = this.activePlayers()[Math.floor(Math.random() * Math.max(1, this.activePlayers().length))];
        this.bark(talker, 'lock_broken', 1, true);
      }
    }
    this.updateSkyline(n);
    // Storm Spire climb enemies
    if (!this.towerSpawned && this.players.some(p => p.x > TOWER_TRIGGER_X)) {
      this.towerSpawned = true;
      for (const [t, x, y] of [['swarmer', 122, 5.2], ['swarmer', 134, 11.2], ['drone', 129, 12], ['shield', 152, 15.6], ['drone', 147, 19.5], ['sniper', 158, 15.6]]) {
        const e = createEnemy(t, x, y); e.zone = 'tower'; this.enemies.push(e);
      }
    }
  }
}

// Distance from a point to a beam segment, and whether a thick segment touches a box
function distToSeg(x, y, g) {
  const vx = g.x1 - g.x0, vy = g.y1 - g.y0, L = vx * vx + vy * vy;
  const t = L > 1e-9 ? Math.max(0, Math.min(1, ((x - g.x0) * vx + (y - g.y0) * vy) / L)) : 0;
  return Math.hypot(x - (g.x0 + vx * t), y - (g.y0 + vy * t));
}
function segHitsBox(g, b, w) {
  const vx = g.x1 - g.x0, vy = g.y1 - g.y0, L = Math.hypot(vx, vy);
  if (L < 1e-6) return false;
  const h = rayBoxT(g.x0, g.y0, vx / L, vy / L, b.x0 - w, b.y0 - w, b.x1 + w, b.y1 + w);
  return !!h && h.t <= L;
}

// Skyline Relay: data-driven encounters (level.js ENCOUNTERS)
World.prototype.updateSkyline = function (n) {
  const here = x0 => this.players.some(p => p.state !== 'dead' && p.state !== 'downed' && p.x > x0);
  for (const S of this.encounters) {
    const E = S.def;
    if (S.state === 'idle') {
      if (!here(E.trigger)) continue;
      S.state = 'active'; S.wave = 0;
      if (E.boss) S.boss = spawnBoss(this, E.boss, E.bossAt[0], E.bossAt[1], { zone: 'skyline', enc: E.id });
      else this.spawnWave(S, n);
      if (E.gates) {
        for (const g of E.gates) GATES[g] = true;
        // Anyone still outside the gate is brought in, as in the Concourse Lock
        for (const p of this.players) if (p.x < E.inside - 1) { p.x = E.inside + p.slot * 0.8; p.y = groundBelow(p.x, 40); p.vx = 0; p.vy = 0; p.prevX = p.x; p.prevY = p.y; }
        this.emit('gates', { closed: true });
      }
      this.emit('banner', { text: E.banner[0], sub: E.banner[1] });
    } else if (S.state === 'active') {
      if (E.boss && S.boss && S.boss.dead && S.state === 'active') {
        // The boss is down: its drones go with it
        for (const e of this.enemies) if (e.enc === E.id && !e.dead && e.add) { e.hp = 0; e.dead = true; e.deathT = 0; this.emit('kill', { x: e.x, y: e.y + e.h / 2, e, owner: null }); }
      }
      const alive = this.enemies.filter(e => e.enc === E.id && !e.dead).length;
      const last = E.boss ? true : S.wave >= E.waves.length - 1;
      if (!last && alive <= 1) {
        S.wave++; this.spawnWave(S, n);
        const b = E.waveBanners && E.waveBanners[S.wave];
        if (b) this.emit('banner', { text: b[0], sub: b[1] });
      } else if (last && alive === 0) {
        S.state = 'cleared'; if (E.boss) this.bossClearedT = this.tick;
        if (E.gates) { for (const g of E.gates) GATES[g] = false; this.emit('gates', { closed: false }); }
        if (E.cleared) {
          this.emit('banner', { text: E.cleared[0], sub: E.cleared[1] });
          const act = this.activePlayers();
          this.bark(act[Math.floor(Math.random() * Math.max(1, act.length))], 'lock_broken', 1, true);
        }
      }
    }
  }
  // The route completes once every encounter is won (a few seconds after a boss falls, so the banners don't collide)
  if (!this.routeDone && this.encounters.every(S => S.state === 'cleared') && here(ROUTE_END_X) && this.tick - (this.bossClearedT ?? -1e9) > 150) {
    this.routeDone = true;
    this.emit('banner', { text: 'Mission complete', sub: 'The beacon is silent. X-Men, head home.' });
  }
};

World.prototype.spawnWave = function (S, n) {
  const E = S.def, list = [...E.waves[S.wave], ...(S.wave === 0 && n >= 3 && E.extra ? E.extra : [])];
  list.forEach(([type, x, y], i) => {
    const e = createEnemy(type, x, y, { zone: 'skyline', enc: E.id, cd: 40 + i * 14 });
    this.enemies.push(e);
  });
};

function makeDirector(world) {
  const used = { melee: new Set(), ranged: new Set() };
  return {
    cap(pool) {
      const n = Math.max(1, world.players.filter(p => p.state !== 'dead').length);
      const d = (DIFFICULTY[SETTINGS.difficulty] || DIFFICULTY.normal).tokens;
      // Flare's cost: one more enemy may commit to a melee attack at a time
      const flare = world.players.some(p => p.arch === 'echo' && p.scarfMode === 'flare' && p.state !== 'dead' && p.state !== 'downed') ? 1 : 0;
      return pool === 'melee' ? Math.max(1, 2 + (n - 1) + d + flare) : n >= 3 ? 2 : 1;
    },
    request(e, pool) {
      if (e.token) return true;
      if (used[pool].size < this.cap(pool)) { used[pool].add(e); e.token = pool; return true; }
      return false;
    },
    release(e) { if (e.token) { used[e.token].delete(e); e.token = null; } },
    reset() { used.melee.clear(); used.ranged.clear(); },
    usage() { return { melee: used.melee.size, ranged: used.ranged.size, meleeCap: this.cap('melee'), rangedCap: this.cap('ranged') }; },
  };
}
