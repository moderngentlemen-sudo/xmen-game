// A real-input playtest:  NODE_USE_ENV_PROXY=1 node tools/playtest.mjs
// Joins with a click, plays with the keyboard (walk, jump, strings, a held Power, tag, Evade, Signature, a held
// Team for an assist), opens and closes the pause and controls screens, then races the mission to its end (the
// script removes the Sentinels and walks the team on) and checks the debrief appears. Prints what it saw and
// every console error. Screenshots go to tools/out/playtest-*.png.
// The keys and the race are V2's: update them when the controls or the mission change.
import { ensureServer, launch, openGame, outPath } from './lib/browser.mjs';

const stop = await ensureServer();
const browser = await launch();
const { page, logs } = await openGame(browser);
await page.waitForTimeout(1500);
const stats = () => page.evaluate(() => { const p = window.__X.S.players[0]; return { ...window.__X.stats(), hero: p && p.hero, x: p && +p.x.toFixed(1) }; });
const until = async (fn, ms = 20000) => { try { await page.waitForFunction(fn, null, { timeout: ms, polling: 200 }); return true; } catch { return false; } };
const shot = name => page.screenshot({ path: outPath(`playtest-${name}.png`), timeout: 180000 });
const out = [];

// Join with a click on the game
await page.mouse.click(640, 400);
out.push(['joined', await until(() => window.__X.S.players.length === 1), await stats()]);
// Walk right, jump, attack
await page.keyboard.down('KeyD'); await page.waitForTimeout(1500); await page.keyboard.press('Space'); await page.waitForTimeout(600); await page.keyboard.up('KeyD');
out.push(['walked', await stats()]);
for (let i = 0; i < 4; i++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(200); }
// Optic blast: hold Power (K), then let go
await page.keyboard.down('KeyK'); await page.waitForTimeout(900); await page.keyboard.up('KeyK'); await page.waitForTimeout(300);
out.push(['optic strain', await page.evaluate(() => window.__X.S.players[0].strain.toFixed(1))]);
await shot('optic');
// Tag to Wolverine (tap U), coil a Drill Claw
await page.keyboard.press('KeyU'); await page.waitForTimeout(400);
out.push(['tag', await stats()]);
await page.keyboard.down('KeyK'); await page.waitForTimeout(1000); await page.keyboard.up('KeyK'); await page.waitForTimeout(500);
// Evade, Signature
await page.keyboard.press('KeyL'); await page.waitForTimeout(300); await page.keyboard.press('KeyI'); await page.waitForTimeout(300);
// Hold U for a benched hero's assist
await page.keyboard.down('KeyU'); await page.waitForTimeout(500); await page.keyboard.up('KeyU'); await page.waitForTimeout(500);
out.push(['assists', await page.evaluate(() => window.__X.S.mission.stats.assists)]);
await shot('assist');
// Pause and resume; the controls screen opens and closes
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
out.push(['paused', await page.evaluate(() => !!document.querySelector('.screen.pause'))]);
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
out.push(['resumed', await page.evaluate(() => !document.querySelector('.screen'))]);
await page.keyboard.press('KeyH'); await page.waitForTimeout(400);
out.push(['controls open', await page.evaluate(() => !!document.querySelector('.screen.help'))]);
await shot('controls');
await page.keyboard.press('KeyH'); await page.waitForTimeout(400);
out.push(['controls closed', await page.evaluate(() => !document.querySelector('.screen.help'))]);
await page.keyboard.press('Escape'); await page.waitForTimeout(300);   // the pause the controls screen sat on
// Race the mission: Sentinels removed, the team walked on section by section, the kid kept close
const race = await page.evaluate(async () => {
  const X = window.__X, C = await import('./js/sim/combat.js'), MS = await import('./js/sim/mission.js'), L = await import('./js/sim/level.js');
  const seen = [];
  for (let n = 0; n < 400 && !X.S.mission.done; n++) {
    const S = X.S, M = S.mission, p = S.players[0], sec = MS.SECTIONS[M.sec];
    for (const e of S.enemies) if (!e.dead) C.hitEnemy(S, e, { owner: p.id, team: 'p', inst: 1e7 + n * 50 + e.id, dmg: 9999, power: 'team' });
    if (sec.kid && S.gates.cell) { M.door.hp = 0; S.gates.cell = false; }
    p.mercy = 999; p.hp = p.maxHp;
    const goal = M.phase === 'escape' ? L.JET.ramp + 4 : sec.start + 3;
    if (p.x < goal - 3) { p.x = Math.min(goal, p.x + 6); p.y = sec.boss ? L.JET.y + 0.1 : 0.1; }
    if (S.kid && (S.kid.state === 'follow' || S.kid.state === 'cower') && Math.abs(S.kid.x - p.x) > 6) { S.kid.x = p.x - 1; S.kid.y = p.y; }
    X.step(30);
    if (!seen.includes(M.sec + ':' + M.phase)) seen.push(M.sec + ':' + M.phase);
    await new Promise(r => setTimeout(r, 20));
  }
  return { done: X.S.mission.done, seen, kills: X.S.mission.stats.kills };
});
out.push(['race', race]);
await until(() => !!document.querySelector('.screen.results'), 15000);
out.push(['debrief', await page.evaluate(() => !!document.querySelector('.screen.results'))]);
await shot('debrief');
console.log(JSON.stringify(out, null, 1));
console.log('console:', logs.length ? logs.slice(0, 15).join('\n') : 'clean');
await browser.close();
stop();
