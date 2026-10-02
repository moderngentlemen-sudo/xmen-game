// Contact sheets: every move of every hero, caught on its first active tick, one sheet per hero.
//   NODE_USE_ENV_PROXY=1 node tools/contact.mjs [hero ...]      (sheets land in tools/out/contact-<hero>.png)
// One page per hero does all of that hero's shots (a fresh page costs 20 s or more in software GL): for each move
// the hero is reset alone on the rooftop (in the air for an air move), the move is started by itself and stepped to
// its first active tick, and once a frame has drawn the view around the hero is cut out. Nothing is hit, so nothing
// flashes over the pose: tests/movelist-test.mjs proves the hits. A second
// page lays the cuts out in a grid, labelled with the move id, its slot and its frame data, and screenshots that.
import { ensureServer, launch, openGame, outPath } from './lib/browser.mjs';
import { H } from './plans/helpers.mjs';

const heroes = process.argv.slice(2).length ? process.argv.slice(2) : ['cyclops', 'wolverine', 'jean'];
const stop = await ensureServer();
const browser = await launch();
for (const hero of heroes) {
  const { page, logs } = await openGame(browser, { w: 1280, h: 720 });
  await page.waitForTimeout(1500);
  const ids = await page.evaluate(`(async () => { ${H}
    const PL = await import('./js/sim/player.js'), ME = await import('./js/sim/moveEngine.js'), MV = await import('./js/sim/moves/index.js');
    X.join('kbm');
    window.__contact = {
      ids: Object.entries(MV.MOVESETS['${hero}'].moves).filter(([, m]) => !m.module).map(([id]) => id),   // the module's moves have no clip
      // Puts the hero in move id on its first active tick; returns where the hero is on screen, and the frame data
      pose(id) {
        const w = S(), p = w.players[0], m = MV.MOVESETS['${hero}'].moves[id];
        if (p.hero !== '${hero}') PL.setHero(w, p, '${hero}');
        place(20); w.enemies = []; w.projectiles = [];
        p.move = null; p.state = 'normal'; p.facing = 1; p.hitstop = 0; p.mercy = 0;   // (an invulnerable hero blinks)
        const air = m.input.ctx === 'air';
        if (air) { p.y = m.dive ? 2.6 : 3; p.onGround = false; p.vy = 0; }
        ME.startMove(w, p, id, m.input.ctx === 'counter');
        for (let i = 0; i < 60 && p.move && p.move.t <= m.su; i++) { X.step(1); if (air && !m.dive) p.vy = Math.max(p.vy, 0); }
        settle();
        return { t: p.move ? +p.move.t.toFixed(1) : null, data: m.slot + ' · ' + m.su + '/' + m.ac + '/' + m.rc + ' · ' + m.react };
      },
      // Where the hero is on screen, once the view has drawn the settled camera
      where() { const p = S().players[0], s = X.view.screenOf(p.x + 0.4, p.y + 1); return { x: s.x, y: s.y }; },
    };
    return window.__contact.ids;
  })()`);
  const cuts = [];
  for (const id of ids) {
    const r = await page.evaluate(`window.__contact.pose(${JSON.stringify(id)})`);
    await page.waitForTimeout(250);   // let a frame or two draw the pose and the camera
    Object.assign(r, await page.evaluate('window.__contact.where()'));
    const W = 340, Hh = 300, x = Math.max(0, Math.min(1280 - W, Math.round(r.x - W / 2))), y = Math.max(0, Math.min(720 - Hh, Math.round(r.y - Hh * 0.55)));
    const png = await page.screenshot({ clip: { x, y, width: W, height: Hh }, timeout: 180000 });
    cuts.push({ id, ...r, src: 'data:image/png;base64,' + png.toString('base64') });
    process.stdout.write('.');
  }
  await page.close();
  // The sheet
  const sheet = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  await sheet.setContent(`<html><body style="margin:0;background:#16121c;color:#fff;font:13px system-ui,sans-serif">
    <h1 style="font:600 22px system-ui;margin:12px 16px">${hero}: every move on its first active tick</h1>
    <div style="display:grid;grid-template-columns:repeat(4,340px);gap:10px;padding:0 16px 16px">
    ${cuts.map(c => `<figure style="margin:0"><img src="${c.src}" width="340" height="300" style="display:block;border:2px solid #000">
      <figcaption style="padding:3px 2px"><b>${c.id}</b> <span style="opacity:.75">${c.data} · t ${c.t}</span></figcaption></figure>`).join('')}
    </div></body></html>`);
  await sheet.screenshot({ path: outPath(`contact-${hero}.png`), fullPage: true });
  await sheet.close();
  console.log(` contact-${hero}.png: ${cuts.length} moves`, logs.length ? logs.slice(0, 4).join(' | ') : 'clean');
}
await browser.close();
stop();
