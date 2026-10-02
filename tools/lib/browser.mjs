// The shared browser harness behind the tools: finds Playwright, starts the static server, launches Chromium with
// software GL (SwiftShader), and opens the game with every https request served from a disk cache.
//
// Why the cache: in the cloud container, Chromium cannot reach jsDelivr or Google Fonts through the agent proxy,
// but Node's fetch can when NODE_USE_ENV_PROXY=1 is set. So Node fetches each CDN file once into
// tools/.netcache/ (gitignored) and the page is served from there. On a normal machine it just works.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../..');
export const OUT = path.join(ROOT, 'tools/out');
const CACHE = path.join(ROOT, 'tools/.netcache');
export const PORT = +(process.env.PORT || 8770);
export const GAME_URL = `http://127.0.0.1:${PORT}/`;

// Playwright: a local install if there is one, else the global one (the cloud image ships it globally;
// never run "playwright install" there, Chromium is pre-installed)
export async function playwright() {
  try { return await import('playwright'); } catch {}
  const roots = [];
  try { roots.push(execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch {}
  roots.push('/opt/node22/lib/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules');
  for (const r of roots) {
    const p = path.join(r, 'playwright/index.mjs');
    if (fs.existsSync(p)) return await import(pathToFileURL(p).href);
  }
  throw new Error('Playwright not found. Install it with "npm i -D playwright" (in the cloud container it is global).');
}

export async function launch() {
  const { chromium } = await playwright();
  return chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
}

// Is the game being served? node:http, not fetch: fetch would go through the proxy when NODE_USE_ENV_PROXY is set
function ping() {
  return new Promise(res => {
    const req = http.get(GAME_URL, r => { r.resume(); res(r.statusCode === 200); });
    req.on('error', () => res(false));
    req.setTimeout(1500, () => { req.destroy(); res(false); });
  });
}
// Start `python3 -m http.server` on game/ unless something already serves it. Returns a function that stops it.
export async function ensureServer() {
  if (await ping()) return () => {};
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', path.join(ROOT, 'game')], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    if (await ping()) return () => server.kill();
    await new Promise(r => setTimeout(r, 150));
  }
  server.kill();
  throw new Error(`Could not serve game/ on port ${PORT}`);
}

// Every https request from the cache, fetched by Node the first time
async function fromCache(route) {
  const url = route.request().url(), key = path.join(CACHE, Buffer.from(url).toString('base64url').slice(0, 200));
  try {
    if (!fs.existsSync(key)) {
      fs.mkdirSync(CACHE, { recursive: true });
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140 Safari/537.36' } });
      fs.writeFileSync(key, Buffer.from(await r.arrayBuffer()));
      fs.writeFileSync(key + '.json', JSON.stringify({ status: r.status, type: r.headers.get('content-type') }));
    }
    const meta = JSON.parse(fs.readFileSync(key + '.json', 'utf8'));
    await route.fulfill({ status: meta.status, contentType: meta.type || 'application/octet-stream', body: fs.readFileSync(key), headers: { 'access-control-allow-origin': '*' } });
  } catch (e) {
    console.error(`could not fetch ${url} (${e.message}); in the cloud container run with NODE_USE_ENV_PROXY=1`);
    await route.abort();
  }
}

// A scripted gamepad in place of the Gamepad API, installed before the page loads. In the page:
// window.__pad (axes, buttons), window.__press(button, on), window.__rumbles (count of rumble calls).
// Standard mapping: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Back, 9 Start, 12-15 D-pad.
function fakePad() {
  const btn = () => ({ pressed: false, value: 0, touched: false });
  window.__rumbles = 0;
  window.__pad = { index: 0, id: 'Test pad', connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, btn),
    vibrationActuator: { type: 'dual-rumble', playEffect: () => { window.__rumbles++; return Promise.resolve('complete'); } } };
  navigator.getGamepads = () => [window.__pad];
  window.__press = (i, on) => { window.__pad.buttons[i].pressed = on; window.__pad.buttons[i].value = on ? 1 : 0; };
}

// Open the game in a new page and wait for its test hooks (window.__X). Returns { page, logs }: logs collects
// console errors, warnings and page errors.
export async function openGame(browser, { w = 1280, h = 720, query = '', gamepad = false, timeout = 60000 } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.route(/^https:\/\//, fromCache);
  if (gamepad) await page.addInitScript(fakePad);
  const logs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => logs.push('pageerror: ' + e.message));
  await page.goto(GAME_URL + query, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__X && window.__X.S, null, { timeout });
  return { page, logs };
}

// Where screenshots go: tools/out/ (gitignored)
export function outPath(name) { fs.mkdirSync(OUT, { recursive: true }); return path.isAbsolute(name) ? name : path.join(OUT, name); }
