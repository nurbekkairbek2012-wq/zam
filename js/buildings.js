// Постройки: одинаково работают у всех стран (и у ИИ, и у Казахстана)
const BUILDINGS = {
  mine:     { name: 'Алмазная шахта', color: '#0d9488', cost: { d: 100 }, div: 150, desc: '+5 алмазов каждые 24 ч' },
  gen:      { name: 'Генератор золота', color: '#d97706', cost: { d: 50 }, div: 60, desc: '+1 золото каждые 24 ч' },
  oil:      { name: 'Нефтяная вышка', color: '#1f2937', cost: { d: 90 }, div: 150, desc: '+20% алмазов за выполненные задачи (у ИИ — +20% дохода)' },
  bank:     { name: 'Банк', color: '#15803d', cost: { d: 80 }, div: 300, desc: 'Открывает вклады: алмазы под процент на 1/3/7 дней, золото — снимаешь когда хочешь' },
  fort:     { name: 'Крепость', color: '#92400e', cost: { d: 80 }, div: 100, desc: 'Клетки в радиусе 2 нельзя захватить, пока стоит крепость. Саму крепость взять вдвое сложнее' },
  shield:   { name: 'Щит', color: '#2563eb', cost: { d: 30 }, div: 60, desc: '10 HP, радиус 4: каждая отбитая атака на клетку внутри = −1 HP', hp: 10, r: 4 },
  barracks: { name: 'Казарма', color: '#4d7c0f', cost: { d: 70 }, div: 150, desc: '+1 бесплатный заряд захвата каждые 24 ч' },
  port:     { name: 'Порт', color: '#0369a1', cost: { d: 70 }, div: 150, coastal: true, desc: 'Захват через море — до 10 клеток от порта. Ставится только у моря' },
  cosmo:    { name: 'Космодром', color: '#dc2626', cost: { d: 150, g: 5 }, div: 400, desc: 'Раз в сутки — захват в любой точке мира' },
  obs:      { name: 'Обсерватория', color: '#7c3aed', cost: { d: 60 }, div: 300, desc: 'Предупреждает о метеоритах, цунами и ураганах за час. Стихия не ломает постройки владельца' },
};
// у кого в реальности есть нефть, космос, банки и наука
const TAGS = {
  oil: new Set(['SAU', 'RUS', 'USA', 'IRN', 'IRQ', 'ARE', 'KWT', 'VEN', 'NGA', 'NOR', 'CAN', 'QAT', 'LBY', 'DZA', 'AGO', 'MEX', 'BRA', 'OMN', 'AZE', 'TKM', 'CHN']),
  cosmo: new Set(['USA', 'RUS', 'CHN', 'IND', 'FRA', 'JPN']),
  bank: new Set(['USA', 'GBR', 'CHE', 'JPN', 'DEU', 'CHN', 'SGP', 'ARE', 'FRA', 'CAN', 'NLD']),
  obs: new Set(['USA', 'CHL', 'CHN', 'RUS', 'JPN', 'DEU', 'GBR', 'FRA', 'IND', 'AUS', 'ESP', 'ZAF']),
};

const Buildings = {
  limit(type, o) { return 1 + Math.floor(Game.cells(o) / BUILDINGS[type].div); },
  owned(o) { return Game.s.buildings.filter(b => Game.own[b.cell] === o); },
  count(type, o) { return Game.s.buildings.reduce((n, b) => n + (b.type === type && Game.own[b.cell] === o ? 1 : 0), 0); },
  // сводка по всем странам: owner -> {тип: количество}
  counts() {
    const m = new Map();
    for (const b of Game.s.buildings) {
      const o = Game.own[b.cell];
      if (!m.has(o)) m.set(o, {});
      const r = m.get(o); r[b.type] = (r[b.type] || 0) + 1;
    }
    return m;
  },
  at(k) { return Game.s.buildings.find(b => b.cell === k); },

  canBuild(type, o, k) {
    const def = BUILDINGS[type];
    if (Game.own[k] !== o) return 'Строить можно только на своей территории';
    if (this.at(k)) return 'Тут уже есть постройка';
    if (def.coastal && !Game.coastal(k)) return 'Порт можно ставить только у моря';
    const lim = this.limit(type, o);
    if (this.count(type, o) >= lim) return `Лимит: ${lim} шт. (растёт с размером территории)`;
    const w = o === Game.player ? { d: Game.s.diamonds, g: Game.s.gold } : { d: Game.st(o).dia, g: Game.st(o).gold };
    if (w.d < def.cost.d || w.g < (def.cost.g || 0)) return 'Не хватает ресурсов';
    return null;
  },
  place(type, k) {
    const def = BUILDINGS[type];
    const b = { id: Game.s.nextId++, type, cell: k, builtAt: Game.t, paid: 0 };
    if (def.hp) { b.hp = def.hp; b.r = def.r; }
    Game.s.buildings.push(b);
    return b;
  },
  build(type, o, k) {
    const err = this.canBuild(type, o, k);
    if (err) return err;
    const c = BUILDINGS[type].cost;
    if (o === Game.player) { Game.spend(c.d, 'build'); Game.s.gold -= c.g || 0; Stats.bump('built'); }
    else { const s = Game.st(o); s.dia -= c.d; s.gold -= c.g || 0; }
    this.place(type, k);
    if (o === Game.player) Game.log(`Построено: ${BUILDINGS[type].name} за ${c.d} алм.${c.g ? ` + ${c.g} зол.` : ''}`, 'shop', type, Date.now());
    return null;
  },

  // постройки в зоне стихии ломаются, если у владельца нет обсерватории
  disaster(cells, why) {
    const set = new Set(cells);
    const counts = this.counts();
    const lost = this.s().filter(b => set.has(b.cell) && !(counts.get(Game.own[b.cell])?.obs));
    if (!lost.length) return 0;
    this.remove(lost, why);
    return lost.length;
  },
  s() { return Game.s.buildings; },
  remove(list, why) {
    const del = new Set(list);
    const mine = list.filter(b => Game.own[b.cell] === Game.player || b.prevOwner === Game.player);
    Game.s.buildings = Game.s.buildings.filter(b => !del.has(b));
    if (mine.length) Game.log(`Потеряны постройки (${why}): ${mine.map(b => BUILDINGS[b.type].name.toLowerCase()).join(', ')}`, 'loss', 'alert');
  },

  cosmoReady(o) { return Game.s.buildings.some(b => b.type === 'cosmo' && Game.own[b.cell] === o && Game.t - (b.cosmoAt || 0) >= DAY); },
  useCosmo(o) {
    const b = Game.s.buildings.find(b => b.type === 'cosmo' && Game.own[b.cell] === o && Game.t - (b.cosmoAt || 0) >= DAY);
    if (b) b.cosmoAt = Game.t;
  },

  // доход от построек (каждые 24 ч с момента постройки)
  produce() {
    const me = { d: 0, g: 0, c: 0 };
    for (const b of Game.s.buildings) {
      if (b.type !== 'gen' && b.type !== 'mine' && b.type !== 'barracks') continue;
      const periods = Math.floor((Game.t - b.builtAt) / DAY);
      if (periods <= b.paid) continue;
      const n = periods - b.paid;
      b.paid = periods;
      const o = Game.own[b.cell];
      if (!Game.isLand(b.cell)) continue;
      if (o === Game.player) {
        if (b.type === 'gen') me.g += n;
        if (b.type === 'mine') me.d += 5 * n;
        if (b.type === 'barracks') me.c += n;
      } else {
        const s = Game.st(o);
        if (b.type === 'gen') s.gold += n;
        if (b.type === 'mine') s.dia += 5 * n;
        if (b.type === 'barracks') s.free = (s.free || 0) + n;
      }
    }
    if (me.d || me.g || me.c) {
      if (me.d) Game.earn(me.d, 'mine');
      Game.s.gold += me.g; Game.s.charges += me.c;
      Stats.bump('gold_mined', me.g);
      Stats.bump('free_charges', me.c);
      const parts = [me.d && `+${me.d} алм. (шахты)`, me.g && `+${me.g} зол. (генераторы)`, me.c && `+${me.c} зар. (казармы)`].filter(Boolean);
      Game.log(`Постройки принесли: ${parts.join(', ')}`, 'reward', 'gift');
    }
  },

  freeCell(o, type) {
    const L = Game.lists[o];
    for (let i = 0; i < 40; i++) {
      const k = Game.rand(L);
      if (this.at(k)) continue;
      if (BUILDINGS[type].coastal && !Game.coastal(k)) continue;
      if (type === 'fort' && !Game.nbrs(k).some(n => Game.own[n] !== o && Game.own[n] !== OCEAN) && i < 30) continue;
      return k;
    }
    return null;
  },
  weights(o) {
    const c = Game.countries[o], iso = c.iso3;
    return {
      fort: 3, mine: 2, gen: 1.5, shield: 1,
      barracks: c.base >= 40 ? 1.5 : 0.4,
      port: 1.2,
      oil: TAGS.oil.has(iso) ? 2.5 : 0,
      obs: TAGS.obs.has(iso) ? 1.5 : 0.1,
      bank: TAGS.bank.has(iso) ? 1.5 : 0.2,
      cosmo: TAGS.cosmo.has(iso) ? 1 : 0,
    };
  },
  pick(w) {
    let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
    for (const [k, v] of Object.entries(w)) if ((r -= v) <= 0) return k;
    return 'fort';
  },

  // стартовая расстановка: у сильных стран больше построек, как в жизни
  placeInitial() {
    Game.countries.forEach((c, o) => {
      if (!c || c.kind !== 'nation' || !Game.cells(o)) return;
      if (o === Game.player) {
        const k = Game.lists[o].includes(c.capital) ? c.capital : Game.lists[o][0];
        this.place('mine', k);
        return;
      }
      const total = Math.max(1, Math.round(c.base / 12));
      const plan = [];
      for (const tag of ['cosmo', 'oil', 'bank', 'obs']) if (TAGS[tag].has(c.iso3)) plan.push(tag);
      const w = this.weights(o);
      w.cosmo = 0;
      while (plan.length < total) plan.push(this.pick(w));
      for (const type of plan) {
        if (this.count(type, o) >= this.limit(type, o)) continue;
        const k = this.freeCell(o, type);
        if (k != null) this.place(type, k);
      }
      const s = Game.st(o);
      s.dia = Math.round(c.base);
    });
  },

  // ИИ копит алмазы и иногда строит
  aiEconomy(counts) {
    const perTick = Game.TICK_MS / DAY;
    Game.countries.forEach((c, o) => {
      if (!Game.ai(o)) return;
      const s = Game.st(o), b = counts.get(o) || {};
      s.dia += (1 + c.base / 10) * (1 + 0.2 * (b.oil || 0)) * perTick;
      if (b.bank) s.dia += s.dia * 0.02 * Math.min(3, b.bank) * perTick;
      s.dia = Math.min(600, s.dia);
      if (Math.random() < 0.03) {
        const type = this.pick(this.weights(o));
        const k = this.freeCell(o, type);
        if (k != null && !this.canBuild(type, o, k)) this.build(type, o, k);
      }
      const up = Game.upgradeCost(s.lvl);
      if (s.lvl < 3 && s.gold >= up.g && s.dia >= up.d + 50) {
        s.dia -= up.d; s.gold -= up.g; s.lvl++;
      }
    });
  },
};

// Банк Казахстана: работает, только если у тебя есть хоть один банк
const Bank = {
  RATES: { 1: 0.03, 3: 0.10, 7: 0.25 },
  GOLD_RATE: 0.05, // в сутки
  rate(amount, days) { return this.RATES[days] + Math.min(0.10, Math.floor(amount / 50) * 0.01); },
  has() { return Buildings.count('bank', Game.player) > 0; },
  accrue(now) {
    const b = Game.s.bank, dt = now - b.goldAt;
    if (dt > 0) { b.gold += b.gold * this.GOLD_RATE * dt / DAY; b.goldAt = now; }
  },
  depositDia(amount, days) {
    amount = Math.floor(amount);
    if (!this.has()) return 'Сначала построй банк';
    if (!(amount >= 10)) return 'Минимум 10 алмазов';
    if (amount > Game.s.diamonds) return 'Не хватает алмазов';
    const rate = this.rate(amount, days);
    Game.s.diamonds -= amount;
    Game.s.bank.deps.push({ id: Game.s.nextId++, amount, days, rate, at: Date.now(), until: Date.now() + days * DAY });
    Game.log(`Вклад ${amount} алм. на ${days} ${U.plural(days, 'день', 'дня', 'дней')} под ${Math.round(rate * 100)}%`, 'shop', 'bank', Date.now());
    return null;
  },
  claim(id) {
    const b = Game.s.bank, d = b.deps.find(x => x.id === id);
    if (!d || Date.now() < d.until) return 'Вклад ещё заблокирован';
    const total = Math.round(d.amount * (1 + d.rate));
    b.deps = b.deps.filter(x => x !== d);
    Game.s.diamonds += d.amount;
    Game.earn(total - d.amount, 'bank');
    Game.log(`Вклад закрыт: +${total} алм. (прибыль ${total - d.amount})`, 'reward', 'bank', Date.now());
    return null;
  },
  depositGold(n) {
    n = Math.floor(n);
    if (!this.has()) return 'Сначала построй банк';
    if (!(n >= 1) || n > Game.s.gold) return 'Не хватает золота';
    this.accrue(Date.now());
    Game.s.gold -= n; Game.s.bank.gold += n;
    Game.log(`Положено в банк ${n} зол.`, 'shop', 'bank', Date.now());
    return null;
  },
  withdrawGold(n) {
    this.accrue(Date.now());
    n = Math.floor(n);
    if (!(n >= 1) || n > Math.floor(Game.s.bank.gold + 1e-9)) return 'В банке столько нет';
    Game.s.bank.gold -= n; Game.s.gold += n;
    Game.log(`Снято из банка ${n} зол.`, 'shop', 'bank', Date.now());
    return null;
  },
};
