// The comic layer over the 3D view, drawn on a 2D canvas: lettered sound effects (sized by impact, capped per
// second so they never bury the screen, and doubling as captions), impact panels (the hit held inside a
// tilted panel border with speed lines and a white flash), name tags, the "!!" over unblockable tells,
// revive rings, and arrows to anyone off-screen.
import { PLAYER_COLORS, TELL, HOSTILE, POWER_COLORS, HERO_LOOKS } from './looks.js';
import { SETTINGS } from './settings.js';

// The sound each event prints: [word, colour, size]
const WORDS = {
  optic: ev => (ev.a > 0.6 ? ['KRAKOOM!', POWER_COLORS.optic, 1.5] : ev.a > 0.2 ? ['ZZAK!', POWER_COLORS.optic, 1.1] : null),
  drill: ev => (ev.tier >= 1 ? ['SHRAKK!', '#ffd23f', 1 + ev.tier * 0.25] : null),
  berserk: () => ['RRRAAGH!', POWER_COLORS.rage, 1.5],
  tkThrow: ev => (ev.kind === 'enemy' ? ['VWOOM!', POWER_COLORS.tk, 1.2] : null),
  fastballSlam: () => ['FASTBALL!', '#ffd23f', 1.7],
  kill: ev => (ev.unit === 'mk2' ? ['KA-BLAMM!!', '#ff8a1f', 2.2] : ev.unit === 'collector' ? ['KRUNCH!', '#ff8a1f', 1.4] : ['BLAM!', '#ffb547', 1.05]),
  perfect: () => ['PERFECT!', '#ffffff', 1.3],
  slam: ev => (ev.big ? ['KRA-KOOM!', TELL.unblockable, 1.8] : ['WHUMP!', HOSTILE, 1.1]),
  bossLand: () => ['THOOM!', '#ffffff', 2],
  doorBroken: () => ['KLANNG!', '#ffd27a', 1.5],
  ultStrike: () => ['TO ME, MY X-MEN!', '#fff1b8', 2.2],
  teamup: ev => [ev.name.toUpperCase() + '!', '#fff1b8', 1.3],
  marked: () => ['MARKED!', HOSTILE, 1],
  kidGrabbed: () => ['HELP!', '#ffffff', 1.1],
  adapted: ev => ['ADAPTED!', HOSTILE, 1.2],
  snikt: () => ['SNIKT!', '#dfe9f5', 1],
  styleRank: ev => ['A', 'S', 'X'].includes(ev.rank) ? [ev.rank === 'X' ? 'X-TREME!' : ev.rank + ' RANK!', '#ffd23f', ev.rank === 'X' ? 1.5 : 1.1] : null,
  wallBounce: () => ['WHAM!', '#ffffff', 1],
  groundBounce: () => ['KRAK!', '#ffffff', 1],
};
const CAP_PER_SEC = 4, MAX_ON = 8;

export class Overlay {
  constructor(canvas, view) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.view = view;
    this.words = []; this.recent = []; this.panel = null; this.time = 0;
    this.font = '"Bangers", "Impact", "Arial Black", sans-serif';
  }
  resize(w, h, dpr) { this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr); this.w = w; this.h = h; this.dpr = dpr; }

  word(text, x, y, color, size = 1, force = false) {
    if (!SETTINGS.sfxWords && !force) return;
    const now = this.time;
    this.recent = this.recent.filter(t => now - t < 1);
    if (!force && (this.recent.length >= CAP_PER_SEC || this.words.length >= MAX_ON)) return;
    this.recent.push(now);
    this.words.push({ text, x, y, color, size, t: 0, life: 0.7 + size * 0.15, tilt: (Math.random() - 0.5) * 0.35, dy: 0 });
  }

  onEvent(ev) {
    if (ev.type === 'swing' && ev.hero === 'wolverine' && ev.move === 'g1') { const w = WORDS.snikt(); this.word(w[0], ev.x + ev.facing * 0.8, ev.y + 2.1, w[1], w[2]); return; }
    const f = WORDS[ev.type]; if (!f) return;
    const w = f(ev); if (!w) return;
    const x = ev.x !== undefined ? ev.x : this.view.cam.x, y = (ev.y !== undefined ? ev.y : this.view.cam.y) + 1.2;
    this.word(w[0], x, y, w[1], w[2], ev.type === 'ultStrike');
  }

  // An impact panel: the moment held in a tilted comic panel, speed lines converging on the hit
  impact(x, y, k = 1) {
    if (!SETTINGS.impactPanels) return 0;
    if (this.panel && this.panel.t < this.panel.dur * 0.6) return 0;
    this.panel = { x, y, k, t: 0, dur: 0.32 + 0.12 * k, tilt: (Math.random() < 0.5 ? -1 : 1) * (0.025 + 0.02 * k) };
    return 0.12 + 0.1 * k;   // how long the caller slows the world (main.js, slow motion)
  }

  draw(S, dt) {
    this.time += dt;
    const g = this.g, W = this.w, H = this.h, dpr = this.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!S) return;
    const v = this.view, sc = (x, y) => v.screenOf(x, y);
    const unit = H / 22;   // a world metre at the camera's usual distance, roughly, in pixels

    // Name tags and revive rings
    for (const p of S.players) {
      const s = sc(p.x, p.y + p.h + 0.5); if (!s.vis) continue;
      const col = PLAYER_COLORS[p.slot] || '#fff';
      g.font = `700 ${Math.round(unit * 0.42)}px "Saira Condensed", "Arial Narrow", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'bottom';
      const tag = `P${p.slot + 1}`;
      g.lineWidth = 3; g.strokeStyle = 'rgba(10,8,18,0.9)'; g.strokeText(tag, s.x, s.y); g.fillStyle = col; g.fillText(tag, s.x, s.y);
      if (p.state === 'downed') {
        const r = sc(p.x, p.y + 0.6), k = Math.min(1, p.revive / 90);
        g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,18,0.7)'; g.beginPath(); g.arc(r.x, r.y, unit * 0.7, 0, 7); g.stroke();
        g.strokeStyle = '#7dff6a'; g.beginPath(); g.arc(r.x, r.y, unit * 0.7, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); g.stroke();
        g.font = `${Math.round(unit * 0.38)}px ${this.font}`; g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.fillText(S.players.length > 1 ? 'REVIVE' : 'DOWN', r.x, r.y);
      }
    }
    // "!!" over an unblockable windup
    for (const e of S.enemies) {
      if (e.dead || e.state !== 'windup' || !e.atk) continue;
      const kind = e.atk.kind, unb = kind === 'stomp' || kind === 'beam' || kind === 'mark';
      if (!unb) continue;
      const s = sc(e.x, e.y + e.h + 0.7); if (!s.vis) continue;
      g.font = `${Math.round(unit * 0.9)}px ${this.font}`; g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.lineWidth = 6; g.strokeStyle = '#120d1a'; g.strokeText('!!', s.x, s.y); g.fillStyle = TELL.unblockable; g.fillText('!!', s.x, s.y);
    }
    // The kid: a marker when she is taken, and an arrow when she is off-screen
    const k = S.kid;
    if (k && k.state !== 'caged' && k.state !== 'boarded') {
      const s = sc(k.x, k.y + 1.4);
      if (k.state === 'carried' && s.vis) this.bubble(g, s.x, s.y - unit * 0.3, 'HELP!', '#ffffff', unit * 0.5);
      if (!s.vis || s.x < 0 || s.x > W || s.y < 0 || s.y > H) this.edgeArrow(g, s, W, H, k.state === 'carried' ? HOSTILE : '#ffffff', 'KID');
    }
    for (const p of S.players) { const s = sc(p.x, p.y + 1); if (!s.vis || s.x < 0 || s.x > W || s.y < 0 || s.y > H) this.edgeArrow(g, s, W, H, PLAYER_COLORS[p.slot], `P${p.slot + 1}`); }

    // Lettered sound effects
    for (let i = this.words.length - 1; i >= 0; i--) {
      const w = this.words[i]; w.t += dt;
      if (w.t >= w.life) { this.words.splice(i, 1); continue; }
      const s = sc(w.x, w.y); if (!s.vis) continue;
      const pop = w.t < 0.08 ? 0.4 + (w.t / 0.08) * 0.8 : w.t < 0.16 ? 1.2 - (w.t - 0.08) / 0.08 * 0.2 : 1;
      const fade = w.t > w.life - 0.2 ? (w.life - w.t) / 0.2 : 1;
      const size = Math.round(unit * 0.95 * w.size * pop);
      g.save(); g.globalAlpha = fade; g.translate(s.x, s.y - w.t * unit * 0.6); g.rotate(w.tilt);
      g.font = `${size}px ${this.font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = Math.max(4, size * 0.16); g.strokeStyle = '#120d1a';
      g.fillStyle = '#120d1a'; g.fillText(w.text, size * 0.06, size * 0.07);   // a drop shadow
      g.strokeText(w.text, 0, 0); g.fillStyle = w.color; g.fillText(w.text, 0, 0);
      g.restore();
    }

    // The impact panel
    const P = this.panel;
    if (P) {
      P.t += dt; const k2 = P.t / P.dur;
      if (k2 >= 1) this.panel = null;
      else {
        const s = sc(P.x, P.y), cx = s.x, cy = s.y;
        g.save();
        // Speed lines converging on the hit
        const n = 36, inner = Math.min(W, H) * (0.16 + 0.1 * k2), outer = Math.hypot(W, H);
        g.globalAlpha = (1 - k2) * 0.85; g.fillStyle = '#120d1a';
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + (i % 3) * 0.05, wdt = 0.012 + (i % 4) * 0.006;
          g.beginPath(); g.moveTo(cx + Math.cos(a - wdt) * outer, cy + Math.sin(a - wdt) * outer);
          g.lineTo(cx + Math.cos(a) * inner * (1 + (i % 5) * 0.12), cy + Math.sin(a) * inner * (1 + (i % 5) * 0.12));
          g.lineTo(cx + Math.cos(a + wdt) * outer, cy + Math.sin(a + wdt) * outer); g.fill();
        }
        // The white flash, then the panel border: a thick ink frame inside a white gutter, tilted
        if (k2 < 0.18) { g.globalAlpha = (1 - k2 / 0.18) * 0.85; g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); }
        g.globalAlpha = Math.min(1, (1 - k2) * 2.2);
        g.translate(W / 2, H / 2); g.rotate(P.tilt);
        const m = Math.min(W, H) * 0.035, bw = W * 1.04 - m * 2, bh = H * 1.04 - m * 2;
        g.lineWidth = m * 1.6; g.strokeStyle = '#ffffff'; g.strokeRect(-bw / 2 - m * 0.4, -bh / 2 - m * 0.4, bw + m * 0.8, bh + m * 0.8);
        g.lineWidth = m * 0.45; g.strokeStyle = '#120d1a'; g.strokeRect(-bw / 2, -bh / 2, bw, bh);
        g.restore();
      }
    }
  }

  bubble(g, x, y, text, color, size) {
    g.font = `${Math.round(size)}px ${this.font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(text).width + size * 0.8, h = size * 1.3;
    g.fillStyle = '#ffffff'; g.strokeStyle = '#120d1a'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(x, y, w / 2, h / 2, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(x - size * 0.2, y + h / 2 - 2); g.lineTo(x, y + h / 2 + size * 0.45); g.lineTo(x + size * 0.15, y + h / 2 - 2); g.fill(); g.stroke();
    g.fillStyle = '#120d1a'; g.fillText(text, x, y + 1);
  }
  edgeArrow(g, s, W, H, color, label) {
    const cx = W / 2, cy = H / 2;
    let dx = s.x - cx, dy = s.y - cy; if (!s.vis) { dx = -dx; dy = -dy; }
    const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
    const pad = 34, t = Math.min((W / 2 - pad) / Math.max(1e-3, Math.abs(dx)), (H / 2 - pad) / Math.max(1e-3, Math.abs(dy)));
    const x = cx + dx * t, y = cy + dy * t, a = Math.atan2(dy, dx);
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = color; g.strokeStyle = '#120d1a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(16, 0); g.lineTo(-10, -12); g.lineTo(-10, 12); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.font = `700 13px "Saira Condensed", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 3; g.strokeStyle = '#120d1a'; g.strokeText(label, x - dx * 26, y - dy * 26); g.fillStyle = color; g.fillText(label, x - dx * 26, y - dy * 26);
  }
}
