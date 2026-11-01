// Генерирует data/world.js — клеточную карту мира из реальных границ стран.
// Запуск (один раз, сайту не нужен):
//   npm i d3-geo@3 topojson-client@3 world-atlas@2 world-countries@5
//   node build-map.mjs <путь к папке data>
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoNaturalEarth1, geoContains, geoBounds, geoArea, geoCentroid } from 'd3-geo';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8'));
const meta = JSON.parse(readFileSync(require.resolve('world-countries/countries.json'), 'utf8'));
const outDir = process.argv[2] || '.';

const W = 360;
const LAT_TOP = 84, LAT_BOTTOM = -57;
const proj = geoNaturalEarth1().fitWidth(W, { type: 'Sphere' });
const yTop = Math.floor(proj([0, LAT_TOP])[1]);
const yBot = Math.ceil(proj([0, LAT_BOTTOM])[1]);
const H = yBot - yTop;

const byNum = new Map(meta.map(m => [m.ccn3, m]));
const fallbackRu = {
  Kosovo: 'Косово', 'N. Cyprus': 'Северный Кипр', Somaliland: 'Сомалиленд',
};

let feats = feature(topo, topo.objects.countries).features
  .filter(f => f.properties.name !== 'Antarctica');

// Казахстан делится на 3 жуза (примерные исторические границы)
const ZHUZ = [
  { iso3: 'KZK', iso2: 'kz-kishi', name: 'Казахстан (Кіші жүз)' },
  { iso3: 'KZO', iso2: 'kz-orta', name: 'Казахстан (Орта жүз)' },
  { iso3: 'KZU', iso2: 'kz', name: 'Казахстан (Ұлы жүз)' },
];
function zhuzOf(lon, lat) {
  if (lon < 61 || (lon < 63.5 && lat > 46.5 && lat < 50.5)) return 0;
  if ((lon >= 66 && lon < 74 && lat < 45.6) || (lon >= 74 && lat < 46.6)) return 2;
  return 1;
}

const countries = feats.map(f => {
  const m = byNum.get(f.id);
  const b = geoBounds(f);
  return {
    f, b,
    iso3: m ? m.cca3 : (f.properties.name || '').slice(0, 3).toUpperCase(),
    name: m ? (m.translations?.rus?.common || m.name.common) : (fallbackRu[f.properties.name] || f.properties.name),
    iso2: m ? m.cca2.toLowerCase() : '',
    region: m ? m.region : 'Europe',
    sub: m ? m.subregion : '',
    area: geoArea(f) * 6371 * 6371,
  };
});
const kazIdx = countries.findIndex(c => c.iso3 === 'KAZ');
const zhuzBase = countries.length;
ZHUZ.forEach(z => countries.push({ ...z, region: 'Asia', sub: '', area: 1e9, f: null, b: [[0, 0], [0, 0]] }));

function inBounds(b, lon, lat) {
  const [[x0, y0], [x1, y1]] = b;
  if (lat < y0 || lat > y1) return false;
  if (x0 <= x1) return lon >= x0 && lon <= x1;
  return lon >= x0 || lon <= x1; // пересекает 180°
}

// 1..6: Европа, Азия, Африка, Сев. Америка, Юж. Америка, Океания
function continentOf(c, lon) {
  if (c.iso3 === 'RUS') return lon > 60 || lon < -160 ? 2 : 1;
  if (c.iso3.startsWith('KZ') || c.iso3 === 'KAZ' || c.iso3 === 'TUR' || c.iso3 === 'CYP' || c.iso3 === 'GEO' || c.iso3 === 'ARM' || c.iso3 === 'AZE') return 2;
  switch (c.region) {
    case 'Europe': return 1;
    case 'Asia': return 2;
    case 'Africa': return 3;
    case 'Americas': return c.sub === 'South America' ? 5 : 4;
    case 'Oceania': return 6;
    default: return 1;
  }
}

const grid = new Int16Array(W * H).fill(-1);
const cont = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const ll = proj.invert([x + 0.5, y + yTop + 0.5]);
    if (!ll || Math.abs(ll[0]) > 180 || Math.abs(ll[1]) > 90) continue;
    for (let i = 0; i < countries.length; i++) {
      const c = countries[i];
      if (!inBounds(c.b, ll[0], ll[1])) continue;
      if (geoContains(c.f, ll)) {
        grid[y * W + x] = i === kazIdx ? zhuzBase + zhuzOf(ll[0], ll[1]) : i;
        cont[y * W + x] = continentOf(c, ll[0]);
        break;
      }
    }
  }
}

// заметные страны, которым не досталось клетки, получают клетку в центре
countries.forEach((c, i) => {
  if (c.area < 6000 || !c.f || i === kazIdx) return;
  if (grid.some(v => v === i)) return;
  const p = proj(geoCentroid(c.f));
  const x = Math.floor(p[0]), y = Math.floor(p[1]) - yTop;
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const k = y * W + x;
  if (grid[k] === -1) { grid[k] = i; cont[k] = continentOf(c, geoCentroid(c.f)[0]); }
});

// переиндексация: только страны с клетками, 0 = океан
const counts = new Map();
for (const v of grid) if (v >= 0) counts.set(v, (counts.get(v) || 0) + 1);
const used = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
const remap = new Map(used.map((old, i) => [old, i + 1]));
const out = new Uint8Array(W * H);
grid.forEach((v, k) => { if (v >= 0) out[k] = remap.get(v); });
if (used.length > 254) throw new Error('слишком много стран');

// соседи для раскраски
const N = used.length + 1;
const nb = Array.from({ length: N }, () => new Set());
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const a = out[y * W + x]; if (!a) continue;
  for (const [dx, dy] of [[1, 0], [0, 1], [2, 0], [0, 2]]) {
    const xx = x + dx, yy = y + dy; if (xx >= W || yy >= H) continue;
    const b = out[yy * W + xx];
    if (b && b !== a) { nb[a].add(b); nb[b].add(a); }
  }
}

// палитра: без голубых оттенков (это цвет игрока), все цвета разные,
// у соседей — максимально непохожие
function hsl2rgb(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)].map(v => Math.round(v * 255));
}
const palette = [];
for (let i = 0; palette.length < 400; i++) {
  const h = (i * 137.508) % 360;
  if (h > 160 && h < 275) continue;
  const l = [62, 72, 52, 80][i % 4];
  const s = [55, 45, 60, 50][(i >> 2) % 4];
  palette.push(hsl2rgb(h, s, l));
}
const dist = (p, q) => (p[0] - q[0]) ** 2 * 0.3 + (p[1] - q[1]) ** 2 * 0.59 + (p[2] - q[2]) ** 2 * 0.11;
const colorOf = new Array(N);
const taken = new Set();
for (let i = 1; i < N; i++) {
  let best = -1, bestScore = -1;
  palette.forEach((p, pi) => {
    if (taken.has(pi)) return;
    let mn = 1e9;
    for (const j of nb[i]) if (colorOf[j]) mn = Math.min(mn, dist(p, colorOf[j]));
    if (mn > bestScore) { bestScore = mn; best = pi; }
  });
  taken.add(best); colorOf[i] = palette[best];
}
const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');

const list = used.map((old, i) => {
  const c = countries[old];
  return { iso3: c.iso3, iso2: c.iso2, name: c.name, color: hex(colorOf[i + 1]), cells: counts.get(old) };
});

const b64 = arr => Buffer.from(arr).toString('base64');
const js = `// сгенерировано tools/build-map.mjs — не редактировать руками
window.WORLD = ${JSON.stringify({ w: W, h: H, grid: b64(out), cont: b64(cont), countries: list })};
`;
writeFileSync(`${outDir}/world.js`, js);
console.log(`grid ${W}x${H}, countries ${list.length}, land ${[...counts.values()].reduce((a, b) => a + b)}`);
console.log(list.filter(c => c.iso3.startsWith('KZ')).map(c => c.name + ': ' + c.cells).join(', '));
console.log(list.slice(0, 12).map(c => `${c.name}:${c.cells}`).join(', '));
// список кодов для копирования флагов
writeFileSync(`${outDir}/../tools/iso2.txt`, list.map(c => c.iso2).filter(Boolean).join('\n'));
