// The HUD never covers the play area:  NODE_USE_ENV_PROXY=1 node tools/layout.mjs
// For several window sizes, and the HUD's busiest states (one player with the squad bench, four players, the
// Sentinels adapting, a banner, the kid taken, the team ultimate's letterbox), it measures every visible HUD
// element and checks that each sits wholly inside its band (#hud-top or #hud-bottom), clear of the game view
// (#stage) and of the other HUD items, and that nothing else on the page covers the view during play. Prints one line per size and every
// problem, and saves tools/out/layout-<w>x<h>.png with four players and a banner up. Exit code 1 on any problem.
import { ensureServer, launch, openGame, outPath } from './lib/browser.mjs';

const SIZES = [[1280, 720], [1920, 1080], [1366, 768], [1024, 768], [800, 600]];
const stop = await ensureServer();
const browser = await launch();
const { page, logs } = await openGame(browser, { w: SIZES[0][0], h: SIZES[0][1] });
await page.waitForTimeout(1200);
let problems = 0;

// In the page: put the HUD in a state, let it draw, then measure
const STATES = {
  solo: `X.join('kbm');`,
  adapting: `S.adapt.warn = 'optic'; S.adapt.warnT = 9999;`,
  banner: `X.ui.banner('The assembly hall', 'Sentinels incoming', false, 99);`,
  'kid taken': `S.kid.state = 'carried';`,
  'four players': `X.join('pad1'); X.join('pad2'); X.join('pad3');`,
  'combos and full meters': `for (const p of S.players) { p.streak.n = 123; p.streak.rank = 5; p.meter = 300; }`,
  'failure banner': `X.ui.banner('Mission failed', 'They took the kid', true, 99);`,
  'ultimate letterbox': `X.ui.letterbox.forEach(l => l.classList.add('on'));`,
};
const measure = () => page.evaluate(() => {
  const r = e => e.getBoundingClientRect(), stage = r(document.getElementById('stage')), out = [];
  const visible = e => { const b = r(e), cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0; };
  const hits = (a, b, pad = 0) => a.left < b.right - pad && a.right > b.left + pad && a.top < b.bottom - pad && a.bottom > b.top + pad;
  const name = e => e.className ? `.${String(e.className).split(' ')[0]}` : e.tagName.toLowerCase();
  for (const id of ['hud-top', 'hud-bottom']) {
    const band = document.getElementById(id), B = r(band);
    if (hits(B, stage)) out.push(`#${id} overlaps the view`);
    const reported = new Set();
    for (const e of band.querySelectorAll('*')) {
      if (!visible(e) || (e.parentElement && reported.has(e.parentElement))) { if (e.parentElement && reported.has(e.parentElement)) reported.add(e); continue; }
      const b = r(e), tol = 3;   // plates and captions are tilted a little
      if (b.left < B.left - tol || b.right > B.right + tol || b.top < B.top - tol || b.bottom > B.bottom + tol) { reported.add(e); out.push(`${name(e)} spills out of #${id} (${Math.round(b.top)}–${Math.round(b.bottom)} in ${Math.round(B.top)}–${Math.round(B.bottom)}, ${Math.round(b.left)}–${Math.round(b.right)} in ${Math.round(B.left)}–${Math.round(B.right)})`); }
      if (hits(b, stage, 1)) out.push(`${name(e)} covers the view`);
    }
  }
  // HUD items must not cover each other either: the top band's mission, gauge, alert and kid, and the plates
  const items = [...document.querySelectorAll('#hud-top .mission, #hud-top .gauge, #hud-top .adapt, #hud-top .kidplate, #hud-bottom .plate')].filter(visible);
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (hits(r(items[i]), r(items[j]), 2)) out.push(`${name(items[i])} and ${name(items[j])} overlap`);
  // Nothing else may sit over the view while playing (menus are pages, and only open on a halted game)
  for (const e of document.querySelectorAll('#ui *')) if (visible(e) && hits(r(e), stage, 1)) out.push(`${name(e)} (in #ui) covers the view`);
  return { stage: [Math.round(stage.width), Math.round(stage.height)], problems: [...new Set(out)] };
});

for (const [w, h] of SIZES) {
  await page.setViewportSize({ width: w, height: h });
  await page.evaluate(() => { location.hash = ''; });
  await page.reload(); await page.waitForFunction(() => window.__X && window.__X.S); await page.waitForTimeout(800);
  await page.evaluate(() => { window.__X.manual = true; });
  const seen = [];
  let stage = null;
  for (const [state, js] of Object.entries(STATES)) {
    await page.evaluate(`(() => { const X = window.__X, S = X.S; ${js} X.step(1); })()`);
    await page.waitForTimeout(250);
    const m = await measure();
    stage = m.stage;
    for (const p of m.problems) seen.push(`${state}: ${p}`);
    if (state === 'failure banner') await page.screenshot({ path: outPath(`layout-${w}x${h}.png`), timeout: 180000 });
  }
  problems += seen.length;
  const share = Math.round((stage[1] / h) * 100);
  console.log(`${seen.length ? 'FAIL' : 'ok  '} ${w}×${h}: the view is ${stage[0]}×${stage[1]} (${share}% of the height)${seen.length ? '\n  ' + seen.join('\n  ') : ''}`);
}
console.log(logs.length ? `console:\n  ${logs.join('\n  ')}` : 'console: clean');
await browser.close();
stop();
process.exitCode = problems || logs.length ? 1 : 0;
