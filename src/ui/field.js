// The field: an animated pixel battlefield. Cohorts are blocks of soldier dots
// that thin as men fall; volleys arc, lines jostle in contact, relieved lines
// pass back through the gaps, routed cohorts run. Reads the battle view only.
import { makeRng, hashString } from '../engine/rng.js';

const W = 96, H = 60;
const COL_X = [3, 34, 65], COL_W = 28;
const YOU_FRONT = { 2: 39, 1: 35, 0: 30 }, FOE_FRONT = { 2: 17, 1: 21, 0: 27 };
const PAL = {
  grass: '#6E7A4E', grass2: '#76824F', grass3: '#66713F', road: '#B9A981', road2: '#A99A72', river: '#5E7088', river2: '#6F8299',
  vine: '#4F5A36', vine2: '#5C6A3C', tree: '#3F4A2E', tree2: '#4C5836', you: '#C8102E', youRim: '#E8D48A', gold: '#C9A227', ink: '#2B2826', dust: '#C9B48A', pale: '#F6F4F0',
};
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export class FieldView {
  constructor(onTap) {
    this.onTap = onTap;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'field';
    this.ctx = this.canvas.getContext('2d');
    this.terrain = null; this.site = null;
    this.prev = null; this.cur = null; this.t0 = 0; this.anim = 1;
    this.sel = null; this.raf = null;
    this.canvas.addEventListener('click', (e) => this.tap(e));
  }

  attach(el) { if (this.canvas.parentNode !== el) el.appendChild(this.canvas); this.resize(); }
  resize() {
    const r = this.canvas.parentNode?.getBoundingClientRect(); if (!r) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.s = Math.max(2, Math.floor((r.width * dpr) / W));
    this.canvas.width = W * this.s; this.canvas.height = H * this.s;
    this.canvas.style.width = '100%'; this.canvas.style.aspectRatio = `${W} / ${H}`;
  }

  // positions for every cohort in a battle view
  layout(vb) {
    const pos = {};
    const groups = {};
    for (const c of vb.cohorts) { const key = `${c.mine}|${c.col}|${c.depth}`; (groups[key] = groups[key] || []).push(c); }
    for (const [key, cs] of Object.entries(groups)) {
      const [mineS, colS, depthS] = key.split('|'); const mine = mineS === 'true', col = +colS, depth = +depthS;
      const sec = vb.sectors[col];
      const n = cs.length;
      const w = Math.max(2, Math.min(4, Math.floor(COL_W / Math.max(1, n)) - 1));
      const span = n * (w + 1) - 1;
      cs.forEach((c, j) => {
        let x, y;
        if (depth === 9) { // reserve, behind the centre
          x = COL_X[1] + (COL_W - span) / 2 + j * (w + 1); y = mine ? 56 : 1;
        } else if (depth < 0) { // broken: running for the rear edge
          const h = hashString(c.id) % 100;
          x = COL_X[col] + (h % COL_W); y = mine ? 58 - (h % 4) : 0 + (h % 4);
        } else {
          x = COL_X[col] + (COL_W - span) / 2 + j * (w + 1);
          const front = mine ? YOU_FRONT[sec.dist] : FOE_FRONT[sec.dist];
          y = mine ? front + depth * 5 : front - depth * 5;
          y = Math.max(0, Math.min(H - 3, y));
        }
        pos[c.id] = { x, y, w, h: 3 };
      });
    }
    return pos;
  }

  update(vb, sel, animate) {
    this.sel = sel;
    if (this.site !== vb.loc) { this.site = vb.loc; this.terrain = this.paintTerrain(vb.loc); }
    const next = { vb, pos: this.layout(vb) };
    if (animate && this.cur && !reduced()) { this.prev = this.cur; this.cur = next; this.t0 = performance.now(); this.anim = 0; }
    else { this.prev = null; this.cur = next; this.anim = 1; }
    this.loop();
  }

  loop() {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (!this.canvas.isConnected) return;
      const dur = 1500;
      if (this.anim < 1) this.anim = Math.min(1, (performance.now() - this.t0) / dur);
      this.draw();
      this.raf = requestAnimationFrame(() => setTimeout(tick, 1000 / 14)); // pixel art at about 14 fps
    };
    tick();
  }

  paintTerrain(loc) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const r = makeRng(hashString('field|' + loc));
    const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    g.fillStyle = PAL.grass; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) px(r.int(W), r.int(H), r.chance(0.5) ? PAL.grass2 : PAL.grass3);
    const italy = ['NIT', 'ETR', 'CMP', 'ROM'].includes(loc);
    // a river along the top (the Po, at Bedriacum)
    if (italy || r.chance(0.5)) for (let x = 0; x < W; x++) { const h = 2 + Math.round(Math.sin(x / 7) + 1); for (let y = 0; y < h; y++) px(x, y, y === h - 1 ? PAL.river2 : PAL.river); }
    // the road across the field (the Via Postumia)
    for (let x = 0; x < W; x++) { const y = 29 + Math.round(Math.sin(x / 11) * 1.2); px(x, y, PAL.road); px(x, y + 1, PAL.road2); }
    // vineyards on one flank (the ditches and vines that broke up the field at Bedriacum), trees elsewhere
    if (loc === 'NIT') for (let y = 6; y < 22; y += 2) for (let x = 68; x < 94; x++) if ((x + y) % 3) px(x, y, (x % 4) ? PAL.vine : PAL.vine2);
    else for (let i = 0; i < 6; i++) { const cx = r.int(W), cy = r.chance(0.5) ? r.range(4, 12) : r.range(46, 56); for (let j = 0; j < 14; j++) px(cx + r.range(-3, 3), cy + r.range(-2, 2), r.chance(0.5) ? PAL.tree : PAL.tree2); }
    return c;
  }

  draw() {
    const { ctx, s } = this;
    const cur = this.cur; if (!cur) return;
    const vb = cur.vb, t = this.anim;
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.terrain, 0, 0, W * s, H * s);
    const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x * s), Math.round(y * s), Math.round(w * s), Math.round(h * s)); };
    const dot = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x * s), Math.round(y * s), Math.max(1, Math.round(s * 0.5)), Math.max(1, Math.round(s * 0.5))); };
    const foeCol = vb.enemyColor || '#7A7A45';
    const contactCols = new Set(vb.sectors.filter((x) => x.dist === 0).map((x) => x.col));
    const events = this.prev ? vb.events : [];
    const meleeCols = new Set(events.filter((e) => e.kind === 'melee').map((e) => e.col));
    // cavalry on the wings
    for (const [list, mine] of [[vb.cavalry, true], [vb.enemyCavalry, false]]) for (const c of list) {
      if (c.men < 50) continue;
      const x = c.col === 'left' ? 0.5 : W - 3.5, y = mine ? 37 : 19;
      const charging = events.some((e) => e.kind === 'flank' && e.mine === mine);
      const dx = charging ? Math.sin(t * Math.PI) * (c.col === 'left' ? 8 : -8) : 0;
      R(x + dx, y, 3, 2, mine ? PAL.you : foeCol); dot(x + dx + (c.col === 'left' ? 2.6 : 0), y - 0.5, PAL.ink);
      if (c.beaten) R(x + dx, y + 2, 3, 0.5, PAL.ink);
    }
    // cohorts
    for (const c of vb.cohorts) {
      const p1 = cur.pos[c.id];
      const p0 = this.prev?.pos[c.id] || p1;
      let x = p0.x + (p1.x - p0.x) * ease, y = p0.y + (p1.y - p0.y) * ease;
      if (contactCols.has(c.col) && c.depth === 0 && meleeCols.has(c.col)) { x += Math.sin((performance.now() / 90) + p1.x) * 0.35 * (1 - t * 0.5); y += (c.mine ? -1 : 1) * Math.abs(Math.sin(performance.now() / 140 + p1.x)) * 0.4; }
      const frac = Math.max(0, c.men / Math.max(1, c.max));
      const base = c.mine ? PAL.you : foeCol;
      const dots = Math.round(frac * p1.w * 2 * p1.h * 2);
      const order = makeRng(hashString(c.id));
      const cells = [];
      for (let i = 0; i < p1.w * 2; i++) for (let j = 0; j < p1.h * 2; j++) cells.push([i, j]);
      order.shuffle(cells);
      const live = new Set(cells.slice(0, dots).map(([i, j]) => i * 16 + j));
      for (let i = 0; i < p1.w * 2; i++) for (let j = 0; j < p1.h * 2; j++) {
        if (!live.has(i * 16 + j)) continue;
        let col = base;
        if (j === (c.mine ? 0 : p1.h * 2 - 1)) col = c.mine ? PAL.youRim : PAL.ink; // shields facing the enemy
        if (c.state === 'tired' || c.end < 30) col = shade(col, 0.72);
        if (c.state === 'routed') col = shade(col, 0.6);
        if (c.state === 'wavering' && ((performance.now() / 200 + i + j) | 0) % 5 === 0) continue;
        dot(x + i * 0.5, y + j * 0.5, col);
      }
      if (this.sel === c.id) { ctx.strokeStyle = PAL.gold; ctx.lineWidth = Math.max(1, s / 2); ctx.strokeRect(x * s - 2, y * s - 2, p1.w * s + 4, p1.h * s + 4); }
    }
    // eagles: one gold standard per legion of yours, behind its first line
    const eagles = {};
    for (const c of vb.cohorts) if (c.mine && c.depth >= 0 && c.depth < 9) { const p = cur.pos[c.id]; (eagles[c.legion] = eagles[c.legion] || []).push(p); }
    for (const ps of Object.values(eagles)) { const ex = ps.reduce((a, p) => a + p.x + p.w / 2, 0) / ps.length, ey = Math.max(...ps.map((p) => p.y)) + 3.6; R(ex, ey - 2, 0.5, 2.5, PAL.gold); R(ex - 0.75, ey - 2, 2, 0.5, PAL.gold); }
    // volleys: arcs of pila from the throwing line to the target
    if (this.prev && t < 0.55) for (const e of events.filter((x) => x.kind === 'volley')) {
      const q = t / 0.55;
      const x0 = COL_X[e.col], y0 = e.mine ? YOU_FRONT[1] : FOE_FRONT[1], y1 = e.mine ? FOE_FRONT[1] + 2 : YOU_FRONT[1];
      for (let i = 0; i < 26; i++) {
        const xx = x0 + 2 + ((i * 7.3) % (COL_W - 4)), yy = y0 + (y1 - y0) * q - Math.sin(q * Math.PI) * 5 + (i % 3) * 0.5;
        R(xx, yy, 0.5, 1, PAL.ink);
      }
    }
    // dust where the lines meet
    if (this.prev) for (const e of events.filter((x) => x.kind === 'melee')) {
      const r = makeRng(hashString(`${e.col}|${(performance.now() / 120) | 0}`));
      for (let i = 0; i < 18; i++) dot(COL_X[e.col] + r.float(0, COL_W), 29.5 + r.float(-1.5, 1.5), r.chance(0.3) ? PAL.pale : PAL.dust);
    }
    // night
    if (vb.night) { ctx.fillStyle = 'rgba(30,24,48,0.38)'; ctx.fillRect(0, 0, W * s, H * s); }
  }

  tap(e) {
    if (!this.cur) return;
    const r = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    let best = null, bd = 4;
    for (const c of this.cur.vb.cohorts) { const p = this.cur.pos[c.id]; const d = Math.hypot(p.x + p.w / 2 - x, p.y + p.h / 2 - y); if (d < bd) { bd = d; best = c.id; } }
    this.onTap(best);
  }
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}
