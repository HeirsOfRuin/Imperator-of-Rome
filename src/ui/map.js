// The empire map: the tile grid from tools/build-map.js drawn on a canvas at
// integer-ish scale, provinces tinted by holder, armies as standards.
// One finger pans, two fingers zoom, a tap selects a province.
import { MAP_W, MAP_H, MAP_ROWS, MAP_CODES, RIVERS } from '../data/map.js';
import { PROVINCES } from '../data/world.js';
import { CAPITALS } from '../data/seeds.js';

const IDS = PROVINCES.map((p) => p.id);
const SEA = [147, 166, 184], OUTSIDE = [216, 211, 200], MARBLE = [236, 234, 230], IRON = [43, 40, 38];

// tile -> province index (-1 sea, -2 outside)
const GRID = new Int16Array(MAP_W * MAP_H);
const SUMS = IDS.map(() => [0, 0, 0]);
for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
  const ch = MAP_ROWS[y][x];
  const i = ch === '.' ? -1 : ch === '#' ? -2 : MAP_CODES.indexOf(ch);
  GRID[y * MAP_W + x] = i;
  if (i >= 0) { SUMS[i][0] += x; SUMS[i][1] += y; SUMS[i][2]++; }
}
export const CENTRE = Object.fromEntries(IDS.map((id, i) => [id, SUMS[i][2] ? [SUMS[i][0] / SUMS[i][2] + 0.5, SUMS[i][1] / SUMS[i][2] + 0.5] : [0, 0]]));
// nudge centres that fall in the sea or another province onto their own land
for (const [id, c] of Object.entries(CENTRE)) {
  const i = IDS.indexOf(id);
  if (GRID[Math.floor(c[1]) * MAP_W + Math.floor(c[0])] === i) continue;
  let best = null, bd = Infinity;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (GRID[y * MAP_W + x] === i) { const d = (x - c[0]) ** 2 + (y - c[1]) ** 2; if (d < bd) { bd = d; best = [x + 0.5, y + 0.5]; } }
  if (best) CENTRE[id] = best;
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => Math.round(v * (1 - t) + b[i] * t));

export class MapView {
  constructor(onTap) {
    this.onTap = onTap;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'map';
    this.canvas.setAttribute('role', 'img');
    this.ctx = this.canvas.getContext('2d');
    this.base = document.createElement('canvas');
    this.base.width = MAP_W; this.base.height = MAP_H;
    this.sig = '';
    this.z = 0; this.ox = 0; this.oy = 0;
    this.V = null; this.sel = null;
    this.pointers = new Map();
    this.bind();
  }

  attach(el) {
    if (this.canvas.parentNode !== el) el.appendChild(this.canvas);
    this.resize();
  }

  resize() {
    const r = this.canvas.parentNode?.getBoundingClientRect();
    if (!r || !r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cw = r.width; this.ch = r.height;
    this.canvas.width = Math.round(r.width * dpr); this.canvas.height = Math.round(r.height * dpr);
    this.dpr = dpr;
    if (!this.z) this.fit();
    this.draw();
  }

  fit() { this.z = Math.max(this.cw / MAP_W, this.ch / MAP_H) ; this.ox = 0; this.oy = (MAP_H - this.ch / this.z) / 2; this.clamp(); }
  focus(pid, z = 5) {
    const c = CENTRE[pid]; if (!c) return;
    this.z = z; this.ox = c[0] - this.cw / this.z / 2; this.oy = c[1] - this.ch / this.z / 2; this.clamp(); this.draw();
  }
  clamp() {
    const minZ = Math.min(this.cw / MAP_W, this.ch / MAP_H);
    this.z = Math.max(minZ, Math.min(14, this.z));
    const vw = this.cw / this.z, vh = this.ch / this.z;
    this.ox = Math.max(Math.min(0, (MAP_W - vw) / 2), Math.min(this.ox, Math.max(0, MAP_W - vw)));
    this.oy = Math.max(Math.min(0, (MAP_H - vh) / 2), Math.min(this.oy, Math.max(0, MAP_H - vh)));
  }

  update(V, sel) {
    this.V = V; this.sel = sel;
    this.canvas.setAttribute('aria-label', mapText(V, sel));
    const sig = V.provinces.map((p) => p.owner).join(',');
    if (sig !== this.sig) { this.sig = sig; this.paintBase(V); }
    this.draw();
  }

  paintBase(V) {
    const ctx = this.base.getContext('2d');
    const img = ctx.createImageData(MAP_W, MAP_H);
    const fill = V.provinces.map((p) => mix(hex(p.color), MARBLE, p.owner === 'state' ? 0.35 : 0.3));
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const i = GRID[y * MAP_W + x];
      let c = i === -1 ? SEA : i === -2 ? OUTSIDE : fill[i];
      if (i >= 0) {
        const n = [x > 0 ? GRID[y * MAP_W + x - 1] : -2, x < MAP_W - 1 ? GRID[y * MAP_W + x + 1] : -2, y > 0 ? GRID[(y - 1) * MAP_W + x] : -2, y < MAP_H - 1 ? GRID[(y + 1) * MAP_W + x] : -2];
        if (n.some((j) => j >= 0 && j !== i)) c = mix(c, IRON, 0.28);
      }
      const o = (y * MAP_W + x) * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  toScreen(x, y) { return [(x - this.ox) * this.z, (y - this.oy) * this.z]; }

  draw() {
    const { ctx } = this;
    if (!this.cw || !this.V) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = `rgb(${SEA.join(',')})`;
    ctx.fillRect(0, 0, this.cw, this.ch);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, -this.ox * this.z, -this.oy * this.z, MAP_W * this.z, MAP_H * this.z);
    // rivers
    ctx.strokeStyle = 'rgba(94,112,136,0.75)'; ctx.lineWidth = Math.max(1, this.z / 4);
    for (const line of RIVERS) { ctx.beginPath(); line.forEach(([x, y], i) => { const [sx, sy] = this.toScreen(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }); ctx.stroke(); }
    // selected province outline
    if (this.sel) {
      const i = IDS.indexOf(this.sel);
      ctx.fillStyle = '#C9A227';
      const s = this.z;
      for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
        if (GRID[y * MAP_W + x] !== i) continue;
        const edge = [GRID[y * MAP_W + x - 1], GRID[y * MAP_W + x + 1], GRID[(y - 1) * MAP_W + x], GRID[(y + 1) * MAP_W + x]].some((j) => j !== i);
        if (edge) { const [sx, sy] = this.toScreen(x, y); ctx.fillRect(sx, sy, s, s); }
      }
    }
    // frontier threat: a crimson glow on threatened frontier provinces
    for (const p of this.V.provinces) if (p.threat >= 60) {
      const [sx, sy] = this.toScreen(...CENTRE[p.id]);
      ctx.fillStyle = `rgba(140,28,43,${Math.min(0.45, (p.threat - 50) / 120)})`;
      ctx.beginPath(); ctx.arc(sx, sy, this.z * 4, 0, Math.PI * 2); ctx.fill();
    }
    // labels
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (this.z >= 3.2) {
      ctx.font = `600 ${Math.min(13, 6 + this.z)}px "Source Sans 3", system-ui, sans-serif`;
      for (const p of this.V.provinces) {
        const [sx, sy] = this.toScreen(...CENTRE[p.id]);
        if (sx < -40 || sy < -10 || sx > this.cw + 40 || sy > this.ch + 10) continue;
        const label = this.z >= 6 ? p.name : CAPITALS[p.id];
        ctx.fillStyle = 'rgba(246,244,240,0.75)'; const w = ctx.measureText(label).width;
        ctx.fillRect(sx - w / 2 - 3, sy + 7, w + 6, 13);
        ctx.fillStyle = p.mine ? '#8C1C2B' : '#2B2826'; ctx.fillText(label, sx, sy + 14);
      }
    }
    // routes and armies
    for (const a of this.V.armies) {
      if (a.mine && a.path && a.path.length) {
        ctx.strokeStyle = '#C8102E'; ctx.setLineDash([4, 4]); ctx.lineWidth = 2; ctx.beginPath();
        let [px, py] = this.toScreen(...CENTRE[a.loc]); ctx.moveTo(px, py);
        for (const step of a.path) { const [qx, qy] = this.toScreen(...CENTRE[step]); ctx.lineTo(qx, qy); }
        ctx.stroke(); ctx.setLineDash([]);
      }
    }
    const placed = {};
    for (const a of this.V.armies) {
      const n = placed[a.loc] = (placed[a.loc] || 0) + 1;
      let [sx, sy] = this.toScreen(...CENTRE[a.loc]);
      sx += (n - 1) * 12; sy -= 4;
      const u = Math.max(3, Math.min(6, this.z));
      ctx.fillStyle = '#2B2826'; ctx.fillRect(sx - 1, sy - u * 2.6, 2, u * 2.8);
      ctx.fillStyle = a.color; ctx.fillRect(sx + 1, sy - u * 2.6, u * 1.8, u * 1.3);
      ctx.fillStyle = a.mine ? '#E8D48A' : '#F6F4F0'; ctx.fillRect(sx + 1, sy - u * 2.6, u * 1.8, Math.max(1, u * 0.3));
      if (a.mine) { ctx.fillStyle = '#C9A227'; ctx.fillRect(sx - 2, sy - u * 2.9, 4, 3); }
      ctx.font = `700 ${Math.max(9, u * 2)}px "Source Sans 3", sans-serif`; ctx.fillStyle = '#F6F4F0';
      ctx.fillText(String(a.legions), sx + 1 + u * 0.9, sy - u * 1.95);
    }
  }

  pick(cx, cy) {
    const x = Math.floor(cx / this.z + this.ox), y = Math.floor(cy / this.z + this.oy);
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return null;
    const i = GRID[y * MAP_W + x];
    if (i >= 0) return IDS[i];
    // tap near the coast: nearest province within 3 tiles
    let best = null, bd = 10;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const j = GRID[(y + dy) * MAP_W + x + dx];
      if (j >= 0 && dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; best = IDS[j]; }
    }
    return best;
  }

  zoomAt(cx, cy, f) {
    const wx = cx / this.z + this.ox, wy = cy / this.z + this.oy;
    this.z *= f; this.clamp();
    this.ox = wx - cx / this.z; this.oy = wy - cy / this.z; this.clamp(); this.draw();
  }

  bind() {
    const c = this.canvas;
    let moved = 0, last = null, pinch = null;
    const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, pos(e)); moved = 0; last = pos(e); if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
    c.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const p = pos(e); this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 2 && pinch) {
        const [a, b] = [...this.pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        this.zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch); pinch = d; moved += 10; return;
      }
      if (last) { const dx = p[0] - last[0], dy = p[1] - last[1]; moved += Math.abs(dx) + Math.abs(dy); this.ox -= dx / this.z; this.oy -= dy / this.z; this.clamp(); this.draw(); }
      last = p;
    });
    const up = (e) => {
      const p = pos(e);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) pinch = null;
      if (moved < 8 && this.pointers.size === 0) { const id = this.pick(p[0], p[1]); if (id) this.onTap(id); }
      last = this.pointers.size ? [...this.pointers.values()][0] : null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', (e) => { this.pointers.delete(e.pointerId); last = null; pinch = null; });
    c.addEventListener('wheel', (e) => { e.preventDefault(); const p = pos(e); this.zoomAt(p[0], p[1], e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
    window.addEventListener('resize', () => this.resize());
  }
}

// What the map shows, in words: for screen readers, and anyone who cannot see the colours.
function mapText(V, sel) {
  const mine = V.provinces.filter((p) => p.mine).map((p) => p.name);
  const mineA = (V.myArmies || []).map((a) => `${a.leader ? 'your army' : 'the army of ' + a.commander} at ${a.locName}${a.destName ? ', marching to ' + a.destName : ''}`);
  const rivals = {};
  for (const p of V.provinces) if (!p.mine && p.owner !== 'state') (rivals[p.ownerName] = rivals[p.ownerName] || []).push(p.name);
  const s = V.provinces.find((p) => p.id === sel);
  return [`Map of the empire, ${V.month}.`,
    mine.length ? `You hold ${mine.join(', ')}.` : 'You hold no province yet.',
    mineA.length ? (([t]) => t.charAt(0).toUpperCase() + t.slice(1))([mineA.join('; ')]) + '.' : '',
    ...Object.entries(rivals).map(([who, ps]) => `${who} holds ${ps.join(', ')}.`),
    s ? `Selected: ${s.name}.` : 'Tap a province to select it; the Provinces tab lists yours.'].filter(Boolean).join(' ');
}
