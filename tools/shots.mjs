// Screenshots from a plan:  NODE_USE_ENV_PROXY=1 node tools/shots.mjs tools/plans/rooms.mjs
// A plan module exports an array of shots { out, script?, w?, h?, query?, wait? }. Each shot opens the game fresh,
// waits `wait` ms, runs its page script (the body of an async function, run in the page), and saves
// tools/out/<out>. Scripts usually start with the helpers in tools/plans/helpers.mjs, which stop the clock
// (X.manual) and step the simulation by hand, so a shot comes out the same every time.
// In software rendering a screenshot can take a minute; that is normal.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ensureServer, launch, openGame, outPath } from './lib/browser.mjs';

if (!process.argv[2]) { console.log('usage: node tools/shots.mjs <plan.mjs>'); process.exit(1); }
const plan = (await import(pathToFileURL(path.resolve(process.argv[2])).href)).default;
const stop = await ensureServer();
const browser = await launch();
for (const shot of plan) {
  let page, logs = [];
  try { ({ page, logs } = await openGame(browser, shot)); }
  catch (e) { console.log(shot.out, 'FAILED TO LOAD:', e.message.split('\n')[0]); continue; }
  await page.waitForTimeout(shot.wait || 600);
  let res;
  if (shot.script) { try { res = await page.evaluate(`(async () => { ${shot.script} })()`); } catch (e) { logs.push('script: ' + e.message); } }
  try { await page.screenshot({ path: outPath(shot.out), timeout: 180000 }); } catch (e) { logs.push('screenshot: ' + e.message.split('\n')[0]); }
  console.log(shot.out, res !== undefined ? JSON.stringify(res) : '', logs.slice(0, 8).join(' | ') || 'ok');
  await page.close();
}
await browser.close();
stop();
