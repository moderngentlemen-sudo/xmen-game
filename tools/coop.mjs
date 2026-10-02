// A two-player co-op playtest:  NODE_USE_ENV_PROXY=1 node tools/coop.mjs
// Player 1 on keyboard and mouse, player 2 on a scripted gamepad (tools/lib/browser.mjs replaces the Gamepad
// API). Both join, walk, call a team-up with real inputs, and player 2 attacks; then Start pauses and A resumes,
// and rumble calls are counted. Screenshot: tools/out/coop-teamup.png.
// The team-up checked is V2's Optic Edge (Cyclops + Wolverine): update it as the roster changes.
import { ensureServer, launch, openGame, outPath } from './lib/browser.mjs';

const stop = await ensureServer();
const browser = await launch();
const { page, logs } = await openGame(browser, { gamepad: true });
await page.waitForTimeout(1200);
const out = [];
const ticks = async n => { const t0 = await page.evaluate(() => window.__X.S.tick); await page.waitForFunction(t => window.__X.S.tick >= t, t0 + n, { timeout: 60000, polling: 50 }); };
const team = () => page.evaluate(() => window.__X.S.players.map(p => ({ slot: p.slot, hero: p.hero, x: +p.x.toFixed(1), state: p.state, squad: !!p.squad })));
const press = async (i, ms = 250) => { await page.evaluate(i => window.__press(i, true), i); await page.waitForTimeout(ms); await page.evaluate(i => window.__press(i, false), i); };

// Player 1 joins with a click, player 2 with A
await page.mouse.click(640, 400); await page.waitForTimeout(500);
await press(0, 300); await page.waitForTimeout(500);
out.push(['joined', await team()]);
// Player 2 walks on the stick, player 1 on D
await page.evaluate(() => { window.__pad.axes[0] = 1; }); await page.keyboard.down('KeyD'); await ticks(60);
await page.evaluate(() => { window.__pad.axes[0] = 0; }); await page.keyboard.up('KeyD'); await page.waitForTimeout(400);
out.push(['moved', await team()]);
// Side by side, player 1 calls the pair's team-up with Team (U)
await page.evaluate(() => { const [a, b] = window.__X.S.players; b.x = a.x + 1.2; b.y = a.y; });
await page.keyboard.down('KeyU'); await ticks(3); await page.keyboard.up('KeyU'); await ticks(10);
out.push(['team-up', await page.evaluate(() => ({ teamups: window.__X.S.mission.stats.teamups, edge: !!window.__X.S.players[1].edge }))]);
// Player 2 attacks with X (button 2)
for (let i = 0; i < 3; i++) { await page.evaluate(() => window.__press(2, true)); await ticks(4); await page.evaluate(() => window.__press(2, false)); await ticks(14); }
out.push(['team hits', await page.evaluate(() => window.__X.S.mission.stats.teamups)]);
await page.screenshot({ path: outPath('coop-teamup.png'), timeout: 180000 });
// Start pauses; A resumes
await press(9); await page.waitForTimeout(300);
out.push(['pad pause', await page.evaluate(() => !!document.querySelector('.screen.pause'))]);
await press(0); await page.waitForTimeout(400);
out.push(['pad resume', await page.evaluate(() => !document.querySelector('.screen'))]);
out.push(['rumbles', await page.evaluate(() => window.__rumbles)]);
console.log(JSON.stringify(out));
console.log('console:', logs.length ? logs.slice(0, 15).join('\n') : 'clean');
await browser.close();
stop();
