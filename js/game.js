// Ядро игры: территории, сила стран, захваты, штрафы, хроника, ход времени
const OCEAN = 0, CRATER = 255, FLOOD = 254, MAX_IDX = 253;
const HOUR = 3600e3, DAY = 24 * HOUR;

// Примерная военная сила (0–100). Остальные страны считаются по размеру.
const POWER = {
  USA: 100, CHN: 95, RUS: 93, IND: 86, KOR: 72, GBR: 72, FRA: 72, JPN: 70, TUR: 66, PRK: 50,
  PAK: 62, ITA: 62, DEU: 63, BRA: 60, IRN: 58, EGY: 56, ISR: 57, UKR: 54, IDN: 54, AUS: 53,
  SAU: 52, ESP: 52, POL: 53, VNM: 49, CAN: 50, TWN: 46, THA: 45, MEX: 44, DZA: 43, GRC: 42,
  SWE: 44, ARG: 38, NGA: 37, NOR: 39, MMR: 34, IRQ: 34, BGD: 33, PHL: 35, ZAF: 36, COL: 36,
  PER: 30, CHL: 32, MAR: 32, ETH: 30, UZB: 30, AZE: 30, ROU: 33, NLD: 38, CHE: 34, FIN: 36,
  BLR: 30, SYR: 26, PRT: 31, CZE: 32, HUN: 29, AUT: 30, DNK: 31, BEL: 30, MYS: 33, SGP: 34,
  VEN: 28, CUB: 22, AGO: 25, KEN: 24, TZA: 22, SDN: 23, LBY: 20, YEM: 18, AFG: 20, KAZ: 35,
  TKM: 18, KGZ: 15, TJK: 15, MNG: 14, GEO: 18, ARM: 20, SRB: 25, BGR: 26, NZL: 24, ARE: 33,
  KZU: 22, KZO: 30, KZK: 26, // три жуза Казахстана
  QAT: 22, OMN: 22, JOR: 24, ECU: 22, BOL: 18, PRY: 15, URY: 15, GRL: 8,
};
const SHORT_NAMES = {
  USA: 'США', COD: 'ДР Конго', COG: 'Конго', CAF: 'ЦАР', ARE: 'ОАЭ', GBR: 'Великобритания',
  BIH: 'Босния', DOM: 'Доминикана', PRK: 'КНДР', KOR: 'Южная Корея', MKD: 'Сев. Македония',
};

const Game = {
  TICK_MS: 60e3,            // мир делает шаг каждую минуту
  BASE_TICK_MS: 30 * 60e3,  // под этот шаг подобраны шансы событий
  MAX_CATCHUP_TICKS: 4320,  // не больше 3 суток догонялки
  COST: { capture: 2 },
  START_DIAMONDS: 20,

  W: WORLD.w, H: WORLD.h,
  countries: [],   // индекс = номер владельца на карте
  player: 0,
  s: null,         // сохраняемое состояние
  own: null,       // владельцы клеток
  orig: null,      // исходные владельцы (для возрождения стран)
  lists: [],       // клетки каждой страны
  pos: null,
  listeners: [],
  dirtyCells: [],
  t: Date.now(),   // «игровое» время (при догонялке идёт быстрее)

  init() {
    const dec = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
    this.orig = dec(WORLD.grid);
    this.countries = [null, ...WORLD.countries.map(c => ({
      ...c, name: SHORT_NAMES[c.iso3] || c.name, init: c.cells, kind: 'nation', noRespawn: c.iso3.startsWith('KZ'),
      base: POWER[c.iso3] ?? Math.min(34, 8 + 3 * Math.log2(c.cells + 1)),
    }))];
    this.player = this.countries.findIndex(c => c && c.iso3 === 'KZU');
    Object.assign(this.countries[this.player], { color: '#4db8ff' });

    const saved = U.load('game.state', null);
    if (saved && saved.v === 3) {
      this.s = saved;
      this.own = dec(saved.owners);
      saved.extra.forEach(e => this.countries[e.idx] = { ...e });
    } else {
      this.own = Uint8Array.from(this.orig);
      this.s = {
        v: 3, diamonds: this.START_DIAMONDS, gold: 0, charges: 0, level: 1,
        buildings: [], scars: [], hurricanes: [], goldrush: [], pending: [], extra: [], cs: {},
        bank: { deps: [], gold: 0, goldAt: Date.now() },
        log: [], lastTick: Date.now(), nextId: 1, created: Date.now(),
      };
    }
    this.countries.forEach(c => { if (c) c.rgb = [1, 3, 5].map(k => parseInt(c.color.slice(k, k + 2), 16)); });
    this.rebuildLists();
    this.findCapitals();
    this.occ = new Set();
    for (let k = 0; k < this.own.length; k++) if (this.isOccupied(k)) this.occ.add(k);
    Stats.init();
    Diplo.init();
    Military.init();
    if (!this.s.log.length) {
      this.t = Date.now();
      Buildings.placeInitial();
      this.log('Игра началась! Ты — Ұлы жүз, самый маленький из трёх жузов Казахстана. Выполняй задачи, получай алмазы и захватывай мир. Объедини Казахстан — и станешь просто «Казахстан». Не выполнишь задачи — соседи отберут землю.', 'me', 'flag');
      this.log(`Стартовый подарок: ${this.START_DIAMONDS} алм. и алмазная шахта`, 'reward', 'gift');
    }
  },

  rebuildLists() {
    this.lists = Array.from({ length: 256 }, () => []);
    this.pos = new Int32Array(this.own.length);
    for (let k = 0; k < this.own.length; k++) {
      const o = this.own[k];
      if (o === OCEAN || o >= FLOOD) continue;
      this.pos[k] = this.lists[o].length;
      this.lists[o].push(k);
    }
  },
  findCapitals() {
    const sum = new Map();
    for (let k = 0; k < this.orig.length; k++) {
      const o = this.orig[k]; if (!o) continue;
      const a = sum.get(o) || [0, 0, 0, []];
      a[0] += k % this.W; a[1] += (k / this.W) | 0; a[2]++; a[3].push(k);
      sum.set(o, a);
    }
    for (const [o, [sx, sy, n, cells]] of sum) {
      const mx = sx / n, my = sy / n;
      let best = cells[0], bd = 1e9;
      for (const k of cells) {
        const d = (k % this.W - mx) ** 2 + (((k / this.W) | 0) - my) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
      this.countries[o].capital = best;
    }
  },

  setOwner(k, o) {
    const old = this.own[k];
    if (old === o) return;
    if (old !== OCEAN && old < FLOOD) {
      const L = this.lists[old], last = L.pop();
      if (last !== k) { L[this.pos[k]] = last; this.pos[last] = this.pos[k]; }
    }
    this.own[k] = o;
    if (this.s.armor && this.s.armor[k]) delete this.s.armor[k];
    if (this.occ) { if (this.isOccupied(k)) this.occ.add(k); else this.occ.delete(k); }
    if (old === this.player && o !== this.player) this.fx('lost', k);
    else if (o === this.player && old !== this.player && old !== OCEAN && old < FLOOD) this.fx('gain', k);
    else if (old !== OCEAN && old < FLOOD && o !== OCEAN && o < FLOOD) this.fx('battle', k);
    Stats.cell(k, old, o);
    if (o !== OCEAN && o < FLOOD) { this.pos[k] = this.lists[o].length; this.lists[o].push(k); }
    this.dirtyCells.push(k);
  },

  _saveT: 0,
  save() {
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => this.saveNow(), 300);
  },
  saveNow() {
    let bin = '';
    for (let i = 0; i < this.own.length; i += 8192) bin += String.fromCharCode.apply(null, this.own.subarray(i, i + 8192));
    this.s.owners = btoa(bin);
    Stats.beforeSave();
    if (this.s.log.length > 1500) this.s.log = this.s.log.slice(-1500);
    U.save('game.state', this.s);
  },
  changed() { this.save(); this.listeners.forEach(f => f()); },

  // [[c:N]] в тексте превращается в цветную метку страны
  log(text, kind = 'war', icon = 'swords', t = this.t) {
    this.s.log.push({ t, text, kind, icon });
    if (!this.batch) this.changed();
  },
  c(i) { return `[[c:${i}]]`; },

  // доля «базового» получасового шага в одном шаге мира
  tickFrac() { return this.TICK_MS / this.BASE_TICK_MS; },
  // анимация на карте (при долгой догонялке не показываем)
  fx(type, cell, extra) { if (this.fxOn !== false && typeof MapView !== 'undefined' && MapView.canvas) MapView.addFx(type, cell, extra); },

  // ---------- помощники ----------
  xy(k) { return [k % this.W, (k / this.W) | 0]; },
  dist2(a, b) { const [ax, ay] = this.xy(a), [bx, by] = this.xy(b); return (ax - bx) ** 2 + (ay - by) ** 2; },
  nbrs(k) {
    const x = k % this.W, out = [];
    if (x > 0) out.push(k - 1);
    if (x < this.W - 1) out.push(k + 1);
    if (k >= this.W) out.push(k - this.W);
    if (k < this.own.length - this.W) out.push(k + this.W);
    return out;
  },
  around(k, r, fn) {
    const [cx, cy] = this.xy(k), R = Math.ceil(r);
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      if (x < 0 || y < 0 || x >= this.W || y >= this.H) continue;
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      fn(y * this.W + x);
    }
  },
  // клетка в чужих руках: владелец не тот, кому она принадлежала изначально
  isOccupied(k) { const o = this.own[k]; return o !== OCEAN && o < FLOOD && this.orig[k] && o !== this.orig[k]; },
  isLand(k) { const o = this.own[k]; return o !== OCEAN && o < FLOOD; },
  coastal(k) { return this.nbrs(k).some(n => this.own[n] === OCEAN); },
  name(i) {
    if (i === this.player && this.united()) return 'Казахстан';
    return this.countries[i]?.name || '?';
  },
  // оба других жуза погибли — Казахстан объединён
  united() {
    return this.countries.every((c, i) => !c || i === this.player || !c.iso3.startsWith('KZ') || this.cells(i) === 0);
  },
  flag(i, cls = 'flag') {
    const c = this.countries[i];
    if (!c) return '';
    if (i === this.player) return `<img class="${cls}" src="flags/kz.svg" alt="">`;
    if (c.kind === 'alien') return `<svg class="${cls}" viewBox="0 0 32 24"><rect width="32" height="24" fill="#111827"/><ellipse cx="16" cy="14" rx="10" ry="3.5" fill="#6cf542"/><path d="M11 13a5 5 0 0 1 10 0" fill="#a7f3d0"/></svg>`;
    if (c.kind === 'rebel') return `<svg class="${cls}" viewBox="0 0 32 24"><rect width="32" height="24" fill="#111"/><path d="M0 24 32 0v6L8 24z" fill="${c.color}"/></svg>`;
    if (c.iso2) return `<img class="${cls}" src="flags/${c.iso2}.svg" alt="" loading="lazy">`;
    return `<svg class="${cls}" viewBox="0 0 32 24"><rect width="32" height="24" fill="${c.color}"/></svg>`;
  },
  cells(i) { return this.lists[i].length; },
  rand(arr) { return arr[(Math.random() * arr.length) | 0]; },
  st(i) {
    if (!this.s.cs[i]) this.s.cs[i] = { dia: 20, gold: 0, lvl: 1 };
    return this.s.cs[i];
  },
  ai(i) { return i !== this.player && this.countries[i] && this.cells(i) > 0; },
  sick(i) { const s = this.s.cs[i]; return !!(s && s.sick && s.sick > this.t); },
  // страна мстит тебе за нападение (2 дня)
  angry(i) { const s = this.s.cs[i]; return !!(s && s.grudge > 0 && s.grudgeUntil > this.t); },
  allied(a, b) { const s = this.s.cs[a]; return !!(s && s.ally === b && s.allyUntil > this.t); },
  level(i) { return i === this.player ? this.s.level : this.st(i).lvl; },

  eff(i) {
    const c = this.countries[i];
    const ratio = Math.min(1, Math.sqrt(this.cells(i) / Math.max(1, c.init)));
    // сила = уровень военной базы (+ вспомогательные базы, голод) × размер страны
    let p = Military.power(i) * (0.55 + 0.45 * ratio);
    if (this.sick(i)) p *= 0.6;
    return p;
  },
  // сопротивление при обороне: маленькие страны держатся до последнего
  defense(i) {
    const n = this.cells(i), c = this.countries[i];
    let p = this.eff(i);
    if (n <= 3) p *= 4; else if (n <= 10) p *= 2.2; else if (n < c.init * 0.2) p *= 1.5;
    if (c.kind === 'alien') p *= 0.35; // пришельцы сильны в атаке, но слабы в обороне
    return p;
  },
  rank() {
    const me = this.cells(this.player);
    return 1 + this.countries.filter((c, i) => c && i !== this.player && this.cells(i) > me).length;
  },
  upgradeCost(l = this.s.level) { return { d: 40 * l, g: 2 * l - 1 }; },

  // ---------- защита клеток ----------
  fortGuard(k) {
    const o = this.own[k];
    return Buildings.index().forts.some(b => b.cell !== k && this.own[b.cell] === o && this.dist2(b.cell, k) <= 4.5);
  },
  shieldFor(k) {
    const o = this.own[k];
    return Buildings.index().shields.find(b => b.hp > 0 && this.own[b.cell] === o && this.dist2(b.cell, k) <= b.r * b.r);
  },
  breakShieldIfDead(sh) {
    if (sh.hp > 0) return;
    this.s.buildings = this.s.buildings.filter(b => b !== sh);
    if (this.own[sh.cell] === this.player) this.log('Щит разрушен — у него кончились HP', 'loss', 'shield');
  },
  // бронь клетки: сколько ударов она ещё выдержит
  armorOf(k) { return (this.s.armor && this.s.armor[k]) || 0; },
  fortify(k, n = 1) {
    this.s.armor = this.s.armor || {};
    this.s.armor[k] = (this.s.armor[k] || 0) + n;
    this.fx('fortify', k);
  },
  // попытка забрать клетку k: 'ok' | 'fort' | 'shield' | 'last' | 'no'
  // force — штраф за пропуск: защита не помогает
  tryTake(att, k, force) {
    const o = this.own[k];
    if (!this.isLand(k) || o === att) return 'no';
    if (o === this.player && this.cells(o) <= 1) return 'last';
    if (force) { this.setOwner(k, att); return 'ok'; }
    if (this.fortGuard(k)) return 'fort';
    const sh = this.shieldFor(k);
    if (sh) { sh.hp--; this.breakShieldIfDead(sh); this.fx('block', k); return 'shield'; }
    if (this.armorOf(k)) { this.s.armor[k]--; if (!this.s.armor[k]) delete this.s.armor[k]; if (o === this.player) Stats.bump('armor_used'); this.fx('block', k); return 'armor'; }
    this.setOwner(k, att);
    return 'ok';
  },
  // захват до n клеток страны def, начиная с клетки start
  grab(att, def, start, n, deferDeath) {
    const q = [start], seen = new Set([start]);
    let taken = 0, tries = 0;
    while (q.length && taken < n && tries < n * 4 + 4) {
      const c = q.shift();
      if (this.own[c] !== def) continue;
      tries++;
      if (this.tryTake(att, c) === 'ok') taken++;
      for (const nb of this.nbrs(c)) if (!seen.has(nb) && this.own[nb] === def) { seen.add(nb); q.push(nb); }
    }
    if (taken && !deferDeath) this.checkDeath(def, att);
    return taken;
  },

  // ---------- гибель и возрождение стран ----------
  killReward(i) { return Math.round(5 + this.countries[i].base * 0.5); },
  checkDeath(d, killer) {
    if (this.cells(d) > 0 || this.st(d).dead) return;
    const s = this.st(d), c = this.countries[d];
    s.dead = this.t; s.killer = killer;
    Stats.bump('deaths');
    s.respawnAt = c.kind === 'nation' && !c.noRespawn ? this.t + (4 + Math.random() * 6) * DAY : null;
    s.sick = null; s.ally = null;
    if (killer === this.player) {
      const r = this.killReward(d);
      this.earn(r, 'kill');
      Stats.bump('killed');
      this.log(`${this.c(d)} полностью захвачена тобой! Награда за силу страны: +${r} алм.`, 'me', 'trophy');
      if (c.noRespawn && this.united()) this.log('Все жузы объединены! Теперь ты — Казахстан', 'me', 'trophy');
    } else {
      this.log(c.kind === 'alien'
        ? `Пришельцы уничтожены! Их добил ${this.c(killer)}`
        : `${this.c(d)} полностью захвачена — ${this.c(killer)}`, 'war', 'dead');
    }
    // все, кого поглотила погибшая страна, освобождаются
    this.countries.forEach((cc, z) => {
      const zs = this.s.cs[z];
      if (cc && zs && zs.dead && zs.killer === d && z !== d) this.liberate(z, `${this.c(d)} пала — народ ${this.c(z)} вышел на свободу`, 0.1);
    });
  },
  // frac — какую долю исходной земли страна возвращает при возрождении
  liberate(z, why, frac = 0.25) {
    const c = this.countries[z];
    if (!c || c.kind !== 'nation' || c.capital == null) return 0;
    if (c.noRespawn && !this.cells(z)) return 0; // погибшие жузы не возрождаются
    const want = Math.max(2, Math.round(c.init * frac));
    const q = [c.capital], seen = new Set([c.capital]);
    const fromPlayer = { n: 0 };
    let taken = 0;
    while (q.length && taken < want) {
      const k = q.shift();
      if (this.isLand(k) && this.own[k] !== z) {
        const was = this.own[k];
        if (this.tryTake(z, k) === 'ok') { taken++; if (was === this.player) fromPlayer.n++; }
      }
      for (const nb of this.nbrs(k)) if (!seen.has(nb) && this.orig[nb] === z) { seen.add(nb); q.push(nb); }
    }
    const s = this.st(z);
    if (!taken) { s.respawnAt = this.t + 2 * DAY; return 0; }
    if (s.dead) { s.dead = null; s.killer = null; s.respawnAt = null; Stats.bump('rebirths'); }
    this.log(`${why}: ${this.c(z)} вернула ${taken} кл.${fromPlayer.n ? `, из них ${fromPlayer.n} твоих` : ''}`, fromPlayer.n ? 'loss' : 'event', 'sprout');
    return taken;
  },

  // ---------- экономика игрока ----------
  earn(n, src) {
    this.s.diamonds += n;
    Stats.bump('earn', n);
    Stats.bump('earn_' + src, n);
  },
  spend(n, what) {
    this.s.diamonds -= n;
    Stats.bump('spend', n);
    Stats.bump('spend_' + what, n);
  },
  addDiamonds(n, text, kind, icon, src = 'task') {
    this.earn(n, src);
    if (text) this.log(text, kind, icon, Date.now()); else this.changed();
  },
  taskReward(base) { return Math.round(base * (1 + 0.2 * Buildings.count('oil', this.player))); },

  buy(item, qty = 1) {
    const s = this.s;
    if (item === 'capture') {
      const cost = this.COST.capture * qty;
      if (s.diamonds < cost) return U.toast('Не хватает алмазов');
      this.spend(cost, 'capture'); s.charges += qty;
      this.log(`Куплено ${qty} ${U.plural(qty, 'заряд', 'заряда', 'зарядов')} захвата за ${cost} алм.`, 'shop', 'swords', Date.now());
      return true;
    }
    if (item === 'upgrade') {
      const c = this.upgradeCost();
      if (s.diamonds < c.d || s.gold < c.g) return U.toast('Не хватает ресурсов');
      this.spend(c.d, 'upgrade'); s.gold -= c.g; s.level++;
      this.log(`Сила улучшена до ур. ${s.level}: за один заряд берёшь ${s.level} ${U.plural(s.level, 'клетку', 'клетки', 'клеток')}`, 'shop', 'up', Date.now());
      return true;
    }
  },

  // ---------- захват игроком ----------
  reach(k) {
    const P = this.player;
    let near = false;
    this.around(k, 3.5, n => { if (this.own[n] === P) near = true; });
    if (near) return 'near';
    if (this.s.buildings.some(b => b.type === 'port' && this.own[b.cell] === P && this.dist2(b.cell, k) <= 100)) return 'port';
    if (Buildings.cosmoReady(P)) return 'cosmo';
    return null;
  },
  playerCapture(k) {
    this.t = Date.now();
    const P = this.player, def = this.own[k];
    if (def === OCEAN) return U.toast('Это океан');
    if (def === CRATER) return U.toast('Тут кратер от метеорита — земля ещё восстанавливается');
    if (def === FLOOD) return U.toast('Земля затоплена цунами');
    if (def === P) {
      if (this.s.charges <= 0) return U.toast('Нет зарядов — купи в магазине');
      this.s.charges--;
      this.fortify(k);
      Stats.bump('fortified');
      U.toast(`Клетка укреплена: выдержит ${this.armorOf(k)} ${U.plural(this.armorOf(k), 'удар', 'удара', 'ударов')}`);
      this.changed();
      return true;
    }
    if (this.allied(P, def)) return U.toast('Это твой союзник');
    const tr = Diplo.truce(P, def);
    if (tr) return U.toast(`Перемирие с ${this.name(def)} до ${U.stamp(tr.until)} — нападать нельзя`);
    const how = this.reach(k);
    if (!how) return U.toast('Слишком далеко. Нужен порт рядом или космодром');
    if (this.s.charges <= 0) return U.toast('Нет зарядов — купи в магазине');
    if (this.fortGuard(k)) return U.toast('Эти клетки прикрывает крепость — сначала захвати её саму');
    this.s.charges--;
    if (how === 'cosmo') Buildings.useCosmo(P);

    // страна сопротивляется по силе
    const me = this.eff(P), dd = this.defense(def);
    let chance = 0.35 + 0.65 * me / (me + dd);
    if (Buildings.isFort(k)) chance *= 0.5;
    if (Math.random() > chance) {
      Stats.bump('atk_fail');
      this.fx('repel', k);
      this.log(`${this.c(def)} отбила твою атаку (шанс был ${Math.round(chance * 100)}%)`, 'me', 'shield', Date.now());
      return true;
    }
    this.cause = 'capture';
    const n = this.grab(P, def, k, this.s.level, true);
    this.cause = null;
    Stats.bump(n ? 'atk_win' : 'atk_fail');
    if (!n) {
      this.log(`Атака на ${this.c(def)} упёрлась в щит, крепость или укрепление`, 'me', 'shield', Date.now());
      return true;
    }
    const gs = this.st(def);
    gs.grudge = (gs.grudge || 0) + n;
    gs.grudgeUntil = Date.now() + 2 * DAY;
    Diplo.playerTook(def, n);
    this.log(`Ты захватил ${n} ${U.plural(n, 'клетку', 'клетки', 'клеток')} у ${this.c(def)}${how === 'port' ? ' (морской десант)' : how === 'cosmo' ? ' (удар с космодрома)' : ''}`, 'me', 'swords', Date.now());
    this.checkDeath(def, P);
    // сильная обида может перерасти в долгую войну
    if (this.cells(def) && gs.grudge >= 4 && !Diplo.atWar(def, P) && Math.random() < 0.6) Diplo.declare(def, P, 'обида за твои нападения');
    // союзник помогает
    const ally = this.s.cs[P]?.allyUntil > this.t ? this.s.cs[P].ally : null;
    if (ally && this.cells(ally) && this.lists[ally].some(c => this.nbrs(c).some(nb => this.own[nb] === def))) {
      const front = this.lists[def].find(c => this.nbrs(c).some(nb => this.own[nb] === ally));
      if (front != null && this.grab(ally, def, front, 1)) this.log(`Союзник ${this.c(ally)} поддержал атаку и взял 1 кл. у ${this.c(def)}`, 'war', 'ally', Date.now());
    }
    return true;
  },

  // ---------- штраф за невыполненное ----------
  penalty(n, reason) {
    this.t = Date.now();
    const me = this.player;
    const contact = new Map();
    for (const k of this.lists[me]) for (const nb of this.nbrs(k)) {
      const o = this.own[nb];
      if (o !== OCEAN && o < FLOOD && o !== me && !this.allied(me, o) && !Diplo.truce(me, o)) contact.set(o, (contact.get(o) || 0) + 1);
    }
    let att;
    if (contact.size) {
      const arr = [...contact].map(([o, c]) => [o, Math.sqrt(c) * this.eff(o) ** 1.5]);
      let r = Math.random() * arr.reduce((a, b) => a + b[1], 0);
      att = arr.find(([, w]) => (r -= w) <= 0)?.[0] ?? arr[0][0];
    } else {
      att = this.countries.reduce((best, c, i) => this.ai(i) && !this.allied(me, i) && (!best || this.eff(i) > this.eff(best)) ? i : best, 0);
    }
    let start = this.lists[me].filter(k => this.nbrs(k).some(nb => this.own[nb] === att));
    if (!start.length) start = this.lists[me].filter(k => this.nbrs(k).some(nb => this.own[nb] !== me));
    if (!start.length) start = [...this.lists[me]];
    const q = [...start], seen = new Set(start);
    let lost = 0, blocked = 0, tries = 0;
    this.cause = 'penalty';
    Stats.bump('penalties');
    while (q.length && lost + blocked < n && tries < n * 6) {
      const k = q.shift();
      if (this.own[k] !== me) continue;
      tries++;
      const r = this.tryTake(att, k, true);
      if (r === 'ok') lost++;
      else if (r === 'shield' || r === 'armor') blocked++;
      else if (r === 'last') break;
      for (const nb of this.nbrs(k)) if (!seen.has(nb) && this.own[nb] === me) { seen.add(nb); q.push(nb); }
    }
    this.cause = null;
    if (blocked) Stats.bump('blocked', blocked);
    const cap = reason[0].toUpperCase() + reason.slice(1);
    let text = `${cap} — ${this.c(att)} ${lost ? `захватила ${lost} ${U.plural(lost, 'твою клетку', 'твои клетки', 'твоих клеток')}` : 'атаковала тебя'}`;
    if (blocked) text += `. Щиты и укрепления отбили ${blocked}`;
    if (this.cells(me) <= 1) text += '. Осталась последняя клетка — её не отнять, но пора собраться!';
    this.log(text, 'loss', 'alert');
  },

  // ---------- ход времени ----------
  update() {
    const now = Date.now();
    let due = Math.floor((now - this.s.lastTick) / this.TICK_MS);
    if (due <= 0) { this.t = now; Bank.accrue(now); return; }
    const skipped = Math.max(0, due - this.MAX_CATCHUP_TICKS);
    due = Math.min(due, this.MAX_CATCHUP_TICKS);
    const t0 = this.s.lastTick + skipped * this.TICK_MS;
    const before = this.countries.map((c, i) => c ? this.cells(i) : 0);
    const battles = [];
    this.batch = true;
    this.fxOn = due <= 12;
    try {
      for (let i = 1; i <= due; i++) {
        this.t = t0 + i * this.TICK_MS;
        battles.push(...World.tick());
      }
      this.s.lastTick = t0 + due * this.TICK_MS;
      this.t = now;
      Bank.accrue(now);
      if (due <= 12) battles.forEach(b => this.logBattle(b));
      else this.summary(before, due);
      this.s.log.sort((a, b) => a.t - b.t);
    } finally { this.batch = false; this.fxOn = true; }
    this.changed();
  },
  logBattle(r) {
    if (!r.n) return;
    const word = U.plural(r.n, 'клетку', 'клетки', 'клеток');
    this.log(r.back
      ? `${this.c(r.a)} отбила обратно ${r.n} ${word} у ${this.c(r.d)}`
      : r.counter
      ? `${this.c(r.a)} отбила атаку и отняла ${r.n} ${word} у ${this.c(r.d)}`
      : `${this.c(r.a)} захватила ${r.n} ${word} у ${this.c(r.d)}${r.how ? ` (${r.how})` : ''}${r.revenge ? ' — месть за твоё нападение' : ''}`, r.d === this.player ? 'loss' : 'war', 'swords', r.t);
  },
  summary(before, due) {
    const delta = this.countries.map((c, i) => c ? this.cells(i) - (before[i] || 0) : 0);
    const order = delta.map((v, i) => [i, v]).filter(([i, v]) => v && i !== this.player);
    const up = order.filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const down = order.filter(x => x[1] < 0).sort((a, b) => a[1] - b[1]).slice(0, 4);
    const hrs = Math.round(due * this.TICK_MS / HOUR);
    let text = `Пока тебя не было (~${hrs} ч), в мире шли войны.`;
    if (up.length) text += ` Выросли: ${up.map(([i, v]) => `${this.c(i)} +${v}`).join(', ')}.`;
    if (down.length) text += ` Потеряли: ${down.map(([i, v]) => `${this.c(i)} ${v}`).join(', ')}.`;
    if (!up.length && !down.length) text += ' Границы почти не изменились.';
    this.log(text, 'war', 'clock');
  },

  reset() {
    Sync.applying = true;
    localStorage.removeItem('game.state');
    localStorage.setItem('sync.updated', Date.now());
    Sync.applying = false;
    Sync.dirty = true;
    location.reload();
  },
};
