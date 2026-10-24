// Builds the empire map (src/data/map.js) from Natural Earth (public domain).
// Run: node tools/build-map.js. Downloads the GeoJSON into .map-cache/ once.
//
// Output: a tile grid. Each tile is '.' (sea), '#' (land outside the empire),
// or a letter for the province (index into PROVINCES). Rivers as polylines in
// tile coordinates. The grid is committed; the cache is not.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { SEEDS, RHINE, DANUBE, MAP, RADIUS_SCALE } from '../src/data/seeds.js';
import { PROVINCES } from '../src/data/world.js';

const CACHE = new URL('../.map-cache/', import.meta.url).pathname;
const SRC = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
function load(name) {
  const p = CACHE + name + '.geojson';
  if (!existsSync(p)) execSync(`curl -sS -o ${p} ${SRC}${name}.geojson`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

const land = load('ne_50m_land'), rivers = load('ne_50m_rivers_lake_centerlines'), lakes = load('ne_50m_lakes');
const W = Math.round((MAP.lon1 - MAP.lon0) / MAP.dLon), H = Math.round((MAP.lat1 - MAP.lat0) / MAP.dLat);

function rings(geo) {
  const out = [];
  for (const f of geo.features) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) {
      const outer = poly[0];
      let x0 = 180, x1 = -180, y0 = 90, y1 = -90;
      for (const [x, y] of outer) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      if (x1 < MAP.lon0 || x0 > MAP.lon1 || y1 < MAP.lat0 || y0 > MAP.lat1) continue;
      out.push({ poly, box: [x0, x1, y0, y1] });
    }
  }
  return out;
}
function inRing(x, y, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inAny(x, y, rs) {
  for (const { poly, box } of rs) {
    if (x < box[0] || x > box[1] || y < box[2] || y > box[3]) continue;
    if (inRing(x, y, poly[0]) && !poly.slice(1).some((h) => inRing(x, y, h))) return true;
  }
  return false;
}
const landR = rings(land), lakeR = rings(lakes);

const km = (lon1, lat1, lon2, lat2) => {
  const dx = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180) * 111.3, dy = (lat2 - lat1) * 111.3;
  return Math.hypot(dx, dy);
};
// latitude of a polyline at a longitude (for the Danube), longitude at a latitude (for the Rhine)
function yAt(line, x) { for (let i = 0; i < line.length - 1; i++) { const [x1, y1] = line[i], [x2, y2] = line[i + 1]; if ((x - x1) * (x - x2) <= 0 && x1 !== x2) return y1 + (y2 - y1) * (x - x1) / (x2 - x1); } return null; }
function xAt(line, y) { for (let i = 0; i < line.length - 1; i++) { const [x1, y1] = line[i], [x2, y2] = line[i + 1]; if ((y - y1) * (y - y2) <= 0 && y1 !== y2) return x1 + (x2 - x1) * (y - y1) / (y2 - y1); } return null; }
function beyondFrontier(lon, lat) {
  if (lat > 47.5 && lat < 52.0) { const rx = xAt(RHINE, lat); if (rx !== null && lon > rx + 0.05 && lon < 12 && !(lat < 49 && lon > 8.5)) return true; }
  if (lon > 8.5 && lon < 29.6) { const dy = yAt(DANUBE, lon); if (dy !== null && lat > dy + 0.05) return true; }
  if (lat > 52.2 && lon > 4.5) return true; // Frisia and beyond
  return false;
}

const ids = PROVINCES.map((p) => p.id);
const CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const rows = [];
let counts = {};
for (let r = 0; r < H; r++) {
  const lat = MAP.lat1 - (r + 0.5) * MAP.dLat;
  let row = '';
  for (let c = 0; c < W; c++) {
    const lon = MAP.lon0 + (c + 0.5) * MAP.dLon;
    if (!inAny(lon, lat, landR) || inAny(lon, lat, lakeR)) { row += '.'; continue; }
    let best = null, bd = Infinity;
    if (!beyondFrontier(lon, lat)) {
      for (const [pid, seeds] of Object.entries(SEEDS)) for (const [sx, sy, r0] of seeds) {
        const rad = pid === 'EGY' ? r0 : r0 * RADIUS_SCALE;
        const d = km(lon, lat, sx, sy);
        if (d <= rad && d / rad < bd) { bd = d / rad; best = pid; }
      }
    }
    if (!best) { row += '#'; continue; }
    row += CH[ids.indexOf(best)];
    counts[best] = (counts[best] || 0) + 1;
  }
  rows.push(row);
}

// rivers that matter: Rhine, Danube, Rhône, Po, Nile, Euphrates, Tiber, Ebro, Tagus, Seine, Loire, Thames
const KEEP = /rhine|rhein|danube|donau|rhône|rhone|po$|^po |nile|euphrat|tiber|tevere|ebro|tagus|tajo|seine|loire|thames|sava|drava|morava|garonne|orontes|jordan|maas|meuse|moselle|mosel/i;
const riverLines = [];
for (const f of rivers.features) {
  const name = f.properties.name || f.properties.name_en || '';
  if (!KEEP.test(name)) continue;
  const g = f.geometry;
  const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
  for (const L of lines) {
    const pts = L.filter(([x, y]) => x >= MAP.lon0 && x <= MAP.lon1 && y >= MAP.lat0 && y <= MAP.lat1)
      .map(([x, y]) => [+((x - MAP.lon0) / MAP.dLon).toFixed(1), +((MAP.lat1 - y) / MAP.dLat).toFixed(1)]);
    if (pts.length > 1) riverLines.push(pts);
  }
}

const out = `// GENERATED by tools/build-map.js from Natural Earth (public domain). Do not edit.
// '.' sea, '#' land outside the empire, a letter: province by index in PROVINCES.
export const MAP_W = ${W};
export const MAP_H = ${H};
export const MAP_CODES = ${JSON.stringify(CH.slice(0, ids.length))};
export const MAP_ROWS = ${JSON.stringify(rows, null, 0).replace(/","/g, '",\n"')};
export const RIVERS = ${JSON.stringify(riverLines)};
`;
writeFileSync(new URL('../src/data/map.js', import.meta.url), out);
const missing = ids.filter((id) => !counts[id]);
console.log(`map ${W}x${H}, ${Object.keys(counts).length} regions, ${riverLines.length} river lines${missing.length ? ', MISSING ' + missing : ''}`);
console.log(Object.entries(counts).sort((a, b) => a[1] - b[1]).slice(0, 8).map(([k, v]) => `${k}:${v}`).join(' '));
