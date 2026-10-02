// The Danger Room: its page, the move list, the trials, the sparring settings, a demo in play with the hitbox
// readout, and a trial being tried. Driven through the page's buttons, as a player would.
//   NODE_USE_ENV_PROXY=1 node tools/shots.mjs tools/plans/danger.mjs
const click = act => `document.querySelector('[data-act="${act}"]').click();`;
const open = `window.__X.manual = false; ${click('danger')} await new Promise(r => setTimeout(r, 400));`;
const info = `return { page: document.querySelector('.screen') && document.querySelector('.screen').className, top: document.querySelector('.mission') && document.querySelector('.mission').textContent, tip: document.querySelector('.tip') && !document.querySelector('.tip').hidden && document.querySelector('.tip').textContent, danger: !!window.__X.S.danger, enemies: window.__X.S.enemies.length };`;
export default [
  { out: 'danger-page.png', wait: 1500, script: open + info },
  { out: 'danger-moves.png', wait: 1500, script: open + click('dmoves') + `await new Promise(r => setTimeout(r, 300));` + info },
  { out: 'danger-trials.png', wait: 1500, script: open + click('dtrials') + `await new Promise(r => setTimeout(r, 300));` + info },
  { out: 'danger-spar.png', wait: 1500, script: open + click('dspar') + `document.querySelector('[data-act="spar"][data-k="count"][data-v="3"]').click(); await new Promise(r => setTimeout(r, 300));` + info },
  { out: 'danger-demo.png', wait: 1500, script: open + click('dmoves') + `document.querySelector('[data-act="demo"][data-id="g3"]').click(); await new Promise(r => setTimeout(r, 1600));` + info },
  { out: 'danger-try.png', wait: 1500, script: open + click('dtrials') + `document.querySelector('[data-act="try"][data-i="0"]').click(); await new Promise(r => setTimeout(r, 900));` + info },
];
