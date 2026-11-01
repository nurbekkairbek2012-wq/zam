// Жизнь мира: войны ИИ, эпидемии, стихии, восстания, союзы, золото, пришельцы
const EVENTS = {
  meteor:    { name: 'Метеорит', icon: 'meteor', color: '#b45309', chance: 1 / 150 },
  epidemic:  { name: 'Эпидемия', icon: 'virus', color: '#9333ea', chance: 1 / 300 },
  tsunami:   { name: 'Цунами', icon: 'wave', color: '#0284c7', chance: 1 / 220 },
  hurricane: { name: 'Ураган', icon: 'hurricane', color: '#0f766e', chance: 1 / 220 },
  revolt:    { name: 'Восстание', icon: 'revolt', color: '#dc2626', chance: 1 / 200 },
  alliance:  { name: 'Военный союз', icon: 'ally', color: '#2563eb', chance: 1 / 120 },
  goldrush:  { name: 'Золотая лихорадка', icon: 'gold', color: '#ca8a04', chance: 1 / 150 },
  aliens:    { name: 'Пришельцы', icon: 'ufo', color: '#4d7c0f', chance: 1 / 1600 },
};
const ALIEN_COOLDOWN = 30 * DAY; // не чаще раза в месяц
const SICK_DAYS = 7;

const World = {
  BATTLES_PER_TICK: 1.7, // ≈ 80 попыток (около 50 удачных стычек) в сутки на весь мир

  tick() {
    const G = Game, t = G.t;
    const counts = Buildings.counts();
    Buildings.produce();
    Buildings.aiEconomy(counts);
    Stats.snapshot();
    this.epidemicStep();
    this.runPending();
    this.restoreScars();
    this.hurricaneStep();
    this.goldStep();
    this.alliancesStep();
    this.respawns();

    const out = [];
    let nb = Math.floor(this.BATTLES_PER_TICK) + (Math.random() < this.BATTLES_PER_TICK % 1 ? 1 : 0);
    while (nb-- > 0) { const r = this.battle(counts); if (r) out.push(r); }
    // казармы и космодромы ИИ
    G.countries.forEach((c, o) => {
      if (!G.ai(o)) return;
      const s = G.st(o);
      if (s.free > 0 && Math.random() < 1 / 12) {
        s.free--;
        const r = this.battle(counts, o); if (r) out.push(r);
      }
      if ((counts.get(o) || {}).cosmo && Buildings.cosmoReady(o) && Math.random() < 1 / 24) {
        const r = this.cosmoStrike(o); if (r) out.push(r);
      }
    });

    for (const [type, ev] of Object.entries(EVENTS)) {
      if (Math.random() < ev.chance) this.start(type);
    }
    out.forEach(r => { r.t = t; Stats.bump('battles'); if (r.d === G.player) Stats.bump('battles_vs_me'); });
    return out;
  },

  // ---------- войны ----------
  battle(counts, forced) {
    const G = Game;
    let a = forced;
    if (a == null) {
      const pool = [];
      let total = 0;
      G.countries.forEach((c, i) => {
        if (!G.ai(i)) return;
        const b = counts.get(i) || {};
        const w = G.eff(i) ** 1.5 * (1 + 0.3 * (b.mine || 0) + 0.2 * (b.oil || 0)) * (c.kind === 'alien' ? 4 : 1);
        pool.push([i, w]); total += w;
      });
      if (!pool.length) return null;
      let r = Math.random() * total;
      a = pool[pool.length - 1][0];
      for (const [i, w] of pool) if ((r -= w) <= 0) { a = i; break; }
    }
    const isAlien = G.countries[a].kind === 'alien';
    const okTarget = o => o !== OCEAN && o < FLOOD && o !== a && !G.allied(a, o) && (o !== G.player || isAlien);
    const fronts = [];
    const L = G.lists[a];
    if (!L.length) return null;
    for (let s = 0; s < 30; s++) {
      const k = G.rand(L);
      for (const nb of G.nbrs(k)) if (okTarget(G.own[nb])) fronts.push(nb);
    }
    let how = '';
    const ports = (counts.get(a) || {}).port ? G.s.buildings.filter(b => b.type === 'port' && G.own[b.cell] === a) : [];
    if (ports.length && (Math.random() < 0.25 || !fronts.length)) {
      const p = G.rand(ports);
      for (let i = 0; i < 40; i++) {
        const k = p.cell + Math.round((Math.random() * 2 - 1) * 10) + Math.round((Math.random() * 2 - 1) * 10) * G.W;
        if (k >= 0 && k < G.own.length && okTarget(G.own[k]) && G.dist2(p.cell, k) <= 100) { fronts.length = 0; fronts.push(k); how = 'морской десант'; break; }
      }
    }
    if (!fronts.length) return null;
    const cell = G.rand(fronts), d = G.own[cell];
    if (G.cells(d) <= 3 && Math.random() < 0.7) return null; // маленьких добивают редко

    this.contagion(a, d);
    const A = G.eff(a) * (G.s.buildings.some(b => b.type === 'fort' && b.cell === cell) ? 0.6 : 1);
    const D = G.defense(d);
    if (Math.random() < A * A / (A * A + D * D)) {
      const lvl = G.level(a);
      const n = G.grab(a, d, cell, 1 + (Math.random() < 0.25 + 0.1 * (lvl - 1) ? 1 : 0));
      // союзник присоединяется
      const ally = G.s.cs[a]?.allyUntil > G.t ? G.s.cs[a].ally : null;
      if (ally && ally !== G.player && ally !== d && G.ai(ally) && G.cells(d)) {
        const front = G.lists[d].find(c => G.nbrs(c).some(nb => G.own[nb] === ally));
        if (front != null) G.grab(ally, d, front, 1);
      }
      return { a, d, n, how };
    }
    if (Math.random() < 0.25 && d !== G.player) {
      const back = G.nbrs(cell).find(nb => G.own[nb] === a);
      if (back != null) return { a: d, d: a, n: G.grab(d, a, back, 1), counter: true };
    }
    return null;
  },
  cosmoStrike(a) {
    const G = Game;
    Buildings.useCosmo(a);
    // удар по слабой стране в любой точке мира
    for (let i = 0; i < 30; i++) {
      const k = (Math.random() * G.own.length) | 0;
      const d = G.own[k];
      if (!G.isLand(k) || d === a || d === G.player || G.allied(a, d) || G.cells(d) <= 3) continue;
      if (G.defense(d) > G.eff(a)) continue;
      const n = G.grab(a, d, k, 2);
      if (n) return { a, d, n, how: 'удар с космодрома' };
    }
    return null;
  },

  // ---------- соседи страны ----------
  neighbours(i) {
    const G = Game, set = new Set();
    for (const k of G.lists[i]) for (const nb of G.nbrs(k)) {
      const o = G.own[nb];
      if (o !== OCEAN && o < FLOOD && o !== i) set.add(o);
    }
    return [...set];
  },

  // ---------- события ----------
  start(type) {
    const G = Game;
    switch (type) {
      case 'meteor': case 'tsunami': case 'hurricane': return this.schedule(type);
      case 'aliens': return this.aliens();
      case 'epidemic': {
        if (G.countries.some((c, i) => c && G.sick(i))) return; // одна эпидемия за раз
        const alive = G.countries.map((c, i) => i).filter(i => G.countries[i] && G.cells(i) > 5);
        const i = G.rand(alive);
        Stats.event('epidemic', G.lists[i][0]);
        G.log(`Эпидемия! Вспышка болезни в стране ${G.c(i)}. Заражённые страны слабеют, болезнь передаётся через войну и соседям`, 'event', 'virus');
        return this.infect(i);
      }
      case 'revolt': return this.revolt();
      case 'alliance': return this.alliance();
      case 'goldrush': {
        let k;
        for (let i = 0; i < 50 && k == null; i++) { const c = (Math.random() * G.own.length) | 0; if (G.isLand(c)) k = c; }
        if (k == null) return;
        Stats.event('goldrush', k);
        G.s.goldrush.push({ cell: k, start: G.t, until: G.t + 3 * DAY, paid: 0 });
        return G.log(`Золотая лихорадка на земле ${G.c(G.own[k])}! Кто владеет этой точкой, 3 дня получает по 1 золоту в сутки`, 'event', 'gold');
      }
    }
  },

  schedule(type) {
    const G = Game;
    let k;
    for (let i = 0; i < 60 && k == null; i++) {
      const c = (Math.random() * G.own.length) | 0;
      if (!G.isLand(c)) continue;
      if (type !== 'meteor' && !G.coastal(c)) continue;
      k = c;
    }
    if (k == null) return;
    G.s.pending.push({ type, cell: k, at: G.t + HOUR });
    if (Buildings.count('obs', G.player)) {
      G.log(`Обсерватория: через час ${EVENTS[type].name.toLowerCase()} — удар по стране ${G.c(G.own[k])}`, 'event', 'obs');
    }
  },
  runPending() {
    const G = Game;
    const due = G.s.pending.filter(p => p.at <= G.t);
    if (!due.length) return;
    G.s.pending = G.s.pending.filter(p => p.at > G.t);
    for (const p of due) {
      if (p.type === 'meteor') this.meteor(p.cell);
      if (p.type === 'tsunami') this.tsunami(p.cell);
      if (p.type === 'hurricane') this.hurricane(p.cell);
    }
  },

  meteor(center) {
    const G = Game;
    if (!G.isLand(center)) return;
    const victim = G.own[center];
    const r = 2 + Math.random() * 2.5;
    const cells = [], prev = [], at = [];
    G.around(center, r, k => {
      if (!G.isLand(k)) return;
      if (G.own[k] === G.player && G.cells(G.player) - prev.filter(o => o === G.player).length <= 1) return;
      cells.push(k); prev.push(G.own[k]);
      // края зарастают быстрее, центр — ровно через неделю
      const d = Math.sqrt(G.dist2(center, k)) / r;
      at.push(G.t + DAY + (1 - d) * 6 * DAY);
    });
    if (!cells.length) return;
    const lostB = Buildings.disaster(cells, 'метеорит');
    const mine = prev.filter(o => o === G.player).length;
    G.cause = 'disaster';
    cells.forEach(k => G.setOwner(k, CRATER));
    G.cause = null;
    Stats.event('meteor', center);
    G.s.scars.push({ kind: 'crater', cells, prev, at, center });
    G.log(`Метеорит! Удар по стране ${G.c(victim)} — выжжено ${cells.length} ${U.plural(cells.length, 'клетка', 'клетки', 'клеток')}${mine ? `, из них ${mine} твоих` : ''}${lostB ? `, разрушено построек: ${lostB}` : ''}. Земля будет понемногу восстанавливаться неделю`, mine ? 'loss' : 'event', 'meteor');
  },

  tsunami(center) {
    const G = Game;
    const victim = G.own[center];
    if (!G.isLand(center)) return;
    const cells = [], prev = [], at = [];
    G.around(center, 7, k => {
      if (!G.isLand(k)) return;
      let nearSea = false;
      G.around(k, 2, n => { if (G.own[n] === OCEAN) nearSea = true; });
      if (!nearSea) return;
      if (G.own[k] === G.player && G.cells(G.player) - prev.filter(o => o === G.player).length <= 1) return;
      cells.push(k); prev.push(G.own[k]); at.push(G.t + 4 * DAY);
    });
    if (!cells.length) return;
    const lostB = Buildings.disaster(cells, 'цунами');
    const mine = prev.filter(o => o === G.player).length;
    G.cause = 'disaster';
    cells.forEach(k => G.setOwner(k, FLOOD));
    G.cause = null;
    Stats.event('tsunami', center);
    G.s.scars.push({ kind: 'flood', cells, prev, at, center });
    G.log(`Цунами обрушилось на побережье ${G.c(victim)}: затоплено ${cells.length} ${U.plural(cells.length, 'клетка', 'клетки', 'клеток')}${mine ? `, из них ${mine} твоих` : ''}${lostB ? `, разрушено построек: ${lostB}` : ''}. Вода уйдёт через 4 дня`, mine ? 'loss' : 'event', 'wave');
  },

  restoreScars() {
    const G = Game;
    G.s.scars = G.s.scars.filter(sc => {
      let left = 0;
      sc.cells.forEach((k, i) => {
        if (G.own[k] !== CRATER && G.own[k] !== FLOOD) return;
        if (sc.at[i] > G.t) { left++; return; }
        let o = sc.prev[i];
        if (!G.cells(o) && G.st(o).dead) {
          // прежний хозяин погиб — земля достаётся соседу
          const nb = G.nbrs(k).map(n => G.own[n]).filter(x => x !== OCEAN && x < FLOOD);
          if (nb.length) o = G.rand(nb);
        }
        G.cause = 'restore';
        G.setOwner(k, o);
        G.cause = null;
      });
      if (!left) G.log(sc.kind === 'crater' ? `Земля после метеорита полностью восстановилась (${G.c(sc.prev[0])})` : `Вода после цунами ушла (${G.c(sc.prev[0])})`, 'event', 'sprout');
      return left > 0;
    });
  },

  hurricane(center) {
    const G = Game;
    const [x, y] = G.xy(center);
    const ang = Math.random() * Math.PI * 2;
    Stats.event('hurricane', center);
    G.s.hurricanes.push({ x, y, ang, start: G.t, end: G.t + DAY, path: [[x, y]], broke: 0 });
    G.log(`Ураган сформировался у берегов ${G.c(G.own[center])}! Сутки он будет идти по карте и ломать постройки`, 'event', 'hurricane');
  },
  hurricaneStep() {
    const G = Game;
    G.s.hurricanes = G.s.hurricanes.filter(h => {
      if (G.t <= h.end) {
        h.ang += (Math.random() - 0.5) * 0.8;
        h.x = Math.max(1, Math.min(G.W - 2, h.x + Math.cos(h.ang) * 1.5));
        h.y = Math.max(1, Math.min(G.H - 2, h.y + Math.sin(h.ang) * 1.5));
        if (h.x <= 1 || h.x >= G.W - 2) h.ang = Math.PI - h.ang;
        if (h.y <= 1 || h.y >= G.H - 2) h.ang = -h.ang;
        h.path.push([+h.x.toFixed(2), +h.y.toFixed(2)]);
        const k = Math.round(h.y) * G.W + Math.round(h.x);
        const hit = [];
        G.around(k, 1.8, c => hit.push(c));
        const counts = Buildings.counts();
        const set = new Set(hit);
        const victims = G.s.buildings.filter(b => set.has(b.cell) && !(counts.get(G.own[b.cell])?.obs));
        const broken = [];
        for (const b of victims) {
          if (b.type === 'shield') { b.hp -= 3; if (b.hp <= 0) broken.push(b); }
          else broken.push(b);
        }
        if (broken.length) { h.broke += broken.length; Buildings.remove(broken, 'ураган'); }
        if (G.t + G.TICK_MS > h.end) G.log(`Ураган затих${h.broke ? `, успев разрушить построек: ${h.broke}` : ''}`, 'event', 'hurricane');
      }
      return G.t < h.end + DAY; // след виден ещё сутки
    });
  },

  // ---------- эпидемия ----------
  infect(i) {
    const G = Game, s = G.st(i);
    if (G.sick(i) || (s.immune && s.immune > G.t)) return;
    s.sick = G.t + SICK_DAYS * DAY;
    s.sickAt = null;
    if (i === G.player) G.log('Эпидемия добралась до тебя! Неделю твоя сила снижена — захваты удаются реже', 'loss', 'virus');
    for (const j of this.neighbours(i)) {
      const js = G.st(j);
      if (G.sick(j) || js.sickAt || (js.immune && js.immune > G.t)) continue;
      if (Math.random() < 0.4) js.sickAt = G.t + (0.5 + Math.random() * 1.5) * DAY;
    }
  },
  // война с заражённым — гарантированное заражение
  contagion(a, d) {
    const G = Game;
    if (G.sick(a) && !G.sick(d)) this.infect(d);
    else if (G.sick(d) && !G.sick(a)) this.infect(a);
  },
  epidemicStep() {
    const G = Game;
    for (const [key, s] of Object.entries(G.s.cs)) {
      const i = +key;
      if (s.sickAt && s.sickAt <= G.t) { s.sickAt = null; if (G.cells(i)) this.infect(i); }
      if (s.sick && s.sick <= G.t) {
        s.sick = null; s.immune = G.t + SICK_DAYS * DAY;
        if (i === G.player) G.log('Ты победил эпидемию! Неделю у тебя иммунитет', 'reward', 'virus');
      }
    }
  },

  // ---------- восстание ----------
  revolt() {
    const G = Game;
    // ищем оккупированные земли: кто держит чужие клетки
    const pairs = new Map();
    for (let k = 0; k < G.own.length; k++) {
      const o = G.own[k], z = G.orig[k];
      if (!z || o === z || o === OCEAN || o >= FLOOD) continue;
      if (G.countries[z].kind !== 'nation') continue;
      if (G.countries[z].noRespawn && !G.cells(z)) continue; // погибший жуз не восстаёт
      const key = o * 256 + z;
      pairs.set(key, (pairs.get(key) || 0) + 1);
    }
    const cand = [...pairs].filter(([, n]) => n >= 6);
    if (cand.length) {
      let r = Math.random() * cand.reduce((a, [, n]) => a + n, 0);
      const [key] = cand.find(([, n]) => (r -= n) <= 0) || cand[0];
      const holder = Math.floor(key / 256), z = key % 256;
      const occupied = [];
      for (let k = 0; k < G.own.length; k++) if (G.own[k] === holder && G.orig[k] === z) occupied.push(k);
      const want = Math.ceil(occupied.length * (0.3 + Math.random() * 0.3));
      G.cause = 'revolt';
      Stats.event('revolt', occupied[0]);
      const start = G.rand(occupied);
      const q = [start], seen = new Set([start]);
      let taken = 0;
      while (q.length && taken < want) {
        const k = q.shift();
        if (G.own[k] === holder && G.tryTake(z, k) === 'ok') taken++;
        for (const nb of G.nbrs(k)) if (!seen.has(nb) && G.own[nb] === holder && G.orig[nb] === z) { seen.add(nb); q.push(nb); }
      }
      G.cause = null;
      if (!taken) return;
      const s = G.st(z);
      const reborn = !!s.dead;
      if (reborn) { s.dead = null; s.killer = null; s.respawnAt = null; }
      G.checkDeath(holder, z);
      return G.log(`Восстание! Народ ${G.c(z)} поднялся против ${G.c(holder)} и вернул ${taken} кл.${reborn ? ' Страна возродилась!' : ''}`, holder === G.player ? 'loss' : 'event', 'revolt');
    }
    // иначе — сепаратисты в большой стране
    const big = G.countries.map((c, i) => i).filter(i => G.ai(i) && G.cells(i) >= 400);
    if (!big.length) return;
    const host = G.rand(big);
    const idx = this.newCountry({ name: `Повстанцы (${G.name(host)})`, base: 18, kind: 'rebel' });
    if (!idx) return;
    Stats.event('revolt', G.lists[host][0]);
    const n = G.grab(idx, host, G.rand(G.lists[host]), Math.min(25, Math.round(G.cells(host) * 0.04)));
    G.log(`Восстание! В стране ${G.c(host)} сепаратисты захватили ${n} кл. и объявили независимость: ${G.c(idx)}`, 'event', 'revolt');
  },

  newCountry({ name, base, kind, color }) {
    const G = Game;
    let idx = G.countries.length;
    if (idx > MAX_IDX) {
      idx = G.countries.findIndex((c, i) => c && c.kind !== 'nation' && i !== G.player && !G.cells(i));
      if (idx < 0) return null;
    }
    if (!color) {
      const used = new Set(G.countries.filter(Boolean).map(c => c.color));
      do {
        let h = Math.random() * 360; if (h > 160 && h < 275) h += 115;
        color = '#' + [0, 8, 4].map(n => {
          const s = 0.6, l = 0.45, k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
          return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, '0');
        }).join('');
      } while (used.has(color));
    }
    const c = { idx, name, base, kind, color, init: 10, iso3: kind.toUpperCase() };
    G.s.extra = G.s.extra.filter(e => e.idx !== idx);
    G.s.extra.push(c);
    G.countries[idx] = { ...c, rgb: [1, 3, 5].map(k => parseInt(color.slice(k, k + 2), 16)) };
    G.s.cs[idx] = { dia: 30, gold: 0, lvl: kind === 'alien' ? 2 : 1 };
    return idx;
  },

  // ---------- союзы ----------
  alliance() {
    const G = Game;
    const P = G.player;
    let a, b;
    if (Math.random() < 0.2) {
      const nb = this.neighbours(P).filter(i => G.ai(i) && G.countries[i].kind === 'nation' && !(G.s.cs[i]?.allyUntil > G.t));
      if (nb.length && !(G.s.cs[P]?.allyUntil > G.t)) { a = P; b = G.rand(nb); }
    }
    if (a == null) {
      const alive = G.countries.map((c, i) => i).filter(i => G.ai(i) && G.countries[i].kind === 'nation' && !(G.s.cs[i]?.allyUntil > G.t));
      for (let tries = 0; tries < 10 && b == null; tries++) {
        a = G.rand(alive);
        const nb = this.neighbours(a).filter(i => G.ai(i) && G.countries[i].kind === 'nation' && !(G.s.cs[i]?.allyUntil > G.t));
        if (nb.length) b = G.rand(nb);
      }
    }
    if (b == null) return;
    const until = G.t + 2 * DAY;
    Stats.event('alliance', G.lists[a][0]);
    Object.assign(G.st(a), { ally: b, allyUntil: until });
    Object.assign(G.st(b), { ally: a, allyUntil: until });
    G.log(a === P
      ? `${G.c(b)} заключила с тобой военный союз на 2 дня: она не нападёт на тебя и поможет в твоих атаках`
      : `Военный союз: ${G.c(a)} и ${G.c(b)} на 2 дня не воюют друг с другом и атакуют вместе`, a === P ? 'me' : 'event', 'ally');
  },
  alliancesStep() {
    const G = Game;
    for (const [key, s] of Object.entries(G.s.cs)) {
      if (s.ally != null && s.allyUntil <= G.t) {
        const i = +key, j = s.ally;
        s.ally = null;
        if (i < j || G.s.cs[j]?.ally !== i) G.log(`Союз ${G.c(i)} и ${G.c(j)} закончился`, i === G.player || j === G.player ? 'me' : 'event', 'ally');
      }
    }
  },

  // ---------- золотая лихорадка ----------
  goldStep() {
    const G = Game;
    G.s.goldrush = G.s.goldrush.filter(g => {
      const periods = Math.min(3, Math.floor((G.t - g.start) / DAY));
      if (periods > g.paid) {
        const n = periods - g.paid; g.paid = periods;
        const o = G.own[g.cell];
        if (o === G.player) { G.s.gold += n; G.log(`Золотая жила принесла +${n} зол.`, 'reward', 'gold'); }
        else if (G.isLand(g.cell)) G.st(o).gold += n;
      }
      return G.t < g.until;
    });
  },

  // ---------- пришельцы ----------
  aliens() {
    const G = Game;
    if (G.t - (G.s.alienAt || 0) < ALIEN_COOLDOWN) return;
    if (G.countries.some((c, i) => c && c.kind === 'alien' && G.cells(i) > 0)) return; // пока живы прошлые — новые не прилетают
    let k;
    for (let i = 0; i < 60 && k == null; i++) {
      const c = (Math.random() * G.own.length) | 0;
      if (G.isLand(c) && G.own[c] !== G.player) k = c;
    }
    if (k == null) return;
    const idx = this.newCountry({ name: 'Пришельцы', base: 80, kind: 'alien', color: '#6cf542' });
    if (!idx) return;
    G.s.alienAt = G.t;
    Stats.event('aliens', k);
    G.cause = 'aliens';
    const victim = G.own[k];
    let n = 0;
    G.around(k, 2.6, c => { if (G.tryTake(idx, c) === 'ok') n++; });
    G.cause = null;
    G.checkDeath(victim, idx);
    G.log(`ПРИШЕЛЬЦЫ высадились на земле ${G.c(victim)} и захватили ${n} кл.! Они очень сильны в атаке, но слабы в обороне — их можно добить`, 'event', 'ufo');
  },

  // ---------- возрождение погибших стран ----------
  respawns() {
    const G = Game;
    for (const [key, s] of Object.entries(G.s.cs)) {
      if (s.dead && s.respawnAt && s.respawnAt <= G.t) G.liberate(+key, `Народ поднялся и возродил страну`);
    }
  },
};
