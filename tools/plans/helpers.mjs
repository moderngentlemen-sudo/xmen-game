// Page-side helpers for screenshot plans. Prepend H to a shot's script:  { out: 'x.png', script: H + `...` }
// They stop the clock (X.manual) so the simulation only moves when the script steps it, which makes a picture
// repeatable. Inside the script:
//   place(x, y?, sec?)       put the team at x (gates open, mission paused), optionally in section `sec`
//   spawn(type, x, y?, o?)   add a Sentinel that holds still (cd 9999) until `o` says otherwise
//   run(spec, n)             step n ticks; spec is a command {mx, my, aim:[x,y], b} or a function (i, slot) => command
//   bits('attack', 'power')  button bits for a command's b
//   settle()                 snap the view's camera to the simulation's (otherwise it is still easing in)
//   wait(ms)                 let the renderer draw a frame or two before the screenshot
// The page's own hooks are on window.__X: S (the world), join(device), step(n), inject, stats(), view.
export const H = `
  const X = window.__X; X.manual = true;
  const S = () => X.S;
  const C = (o = {}) => ({ mx: o.mx || 0, my: o.my || 0, ax: o.aim ? o.aim[0] : 1, ay: o.aim ? o.aim[1] : 0, aim: !!o.aim, b: o.b || 0 });
  const BT = { attack: 1, power: 2, jump: 4, evade: 8, sig: 16, team: 32 };
  const bits = (...n) => n.reduce((a, k) => a | BT[k], 0);
  const E = await import('./js/sim/enemies.js');
  const MS = await import('./js/sim/mission.js');
  function place(x, y = 0, sec) {
    const w = S(); w.mission.phase = 'test';
    if (sec !== undefined) { w.mission.sec = sec; w.mission.secId = MS.SECTIONS[sec].id; w.mission.x0 = MS.SECTIONS[sec].x0; w.mission.x1 = MS.SECTIONS[sec].x1; }
    for (const g of Object.keys(w.gates)) if (g !== 'cell') w.gates[g] = false;
    w.players.forEach((p, i) => { p.x = x + i * 1.3; p.y = y; p.vx = p.vy = 0; p.mercy = 0; });
  }
  function spawn(type, x, y = 0, o = {}) { const w = S(); const e = E.createEnemy(w, type, x, y, { cd: 9999, onGround: true, ...o }); w.enemies.push(e); return e; }
  function run(spec, n) {
    let i = -1, last = -1;
    X.inject = (t, c) => { if (t !== last) { i++; last = t; } for (const k in c) c[k] = C(typeof spec === 'function' ? spec(i, +k) : spec); return c; };
    X.step(n); X.inject = null;
  }
  function settle() { const w = S(); X.view.cam.x = w.cam.x; X.view.cam.y = w.cam.y; X.view.cam.dist = w.cam.dist; }
  const wait = ms => new Promise(r => setTimeout(r, ms));
`;
