// Армия: основная военная база (её уровень = сила страны), вспомогательные базы,
// корм в тиынах и налог с земли. Тиын — мелкая монета: 1 алмаз = 100 тиын.
const TIYN_PER_DIAMOND = 100;

const Military = {
  START_TIYN: 300,
  START_FOOD_DAYS: 3,
  FEED_MAIN: 2,         // тиын в сутки за каждый уровень основной базы
  FEED_AUX: 5,          // тиын в сутки за каждый уровень вспомогательной базы
  AUX_STEP: 0.02,       // +2% за уровень вспомогательной базы
  AUX_MAX_LVL: 10,      // значит максимум +20% с одной базы
  HUNGRY: 0.5,          // голодная армия воюет вдвое хуже
  TAX: 1,               // тиын в сутки с каждой клетки

  init() {
    const s = Game.s;
    if (s.tiyn == null) s.tiyn = this.START_TIYN;
    s.taxAcc = s.taxAcc || 0;
    s.taxStore = s.taxStore || 0;
    Game.countries.forEach((c, i) => { if (c) this.mainOf(i); });
    this.ensureHQs();
  },

  // ---------- основная база ----------
  mainOf(i) {
    const st = Game.st(i);
    if (st.mil == null) {
      st.mil = Math.max(1, Math.round(Game.countries[i].base));
      st.milFed = Date.now() + this.START_FOOD_DAYS * DAY;
    }
    return st;
  },
  level(i) { return this.mainOf(i).mil; },
  hungry(i) { return this.mainOf(i).milFed <= Game.t; },
  upCost(l) { return { t: 200 + 30 * l, g: (l + 1) % 10 === 0 ? (l + 1) / 10 : 0 }; },
  feedMain(i) { return this.FEED_MAIN * this.level(i); },
  feedAux(b) { return this.FEED_AUX * b.lvl; },

  // бонус от вспомогательных баз (кэш на один шаг мира)
  auxBonus(i) {
    if (this._auxT !== Game.t || this._auxDirty) {
      this._aux = new Map();
      for (const b of Game.s.buildings) {
        if (b.type !== 'aux' || !(b.fedUntil > Game.t)) continue;
        const o = Game.own[b.cell];
        this._aux.set(o, (this._aux.get(o) || 0) + this.AUX_STEP * b.lvl);
      }
      this._auxT = Game.t; this._auxDirty = false;
    }
    return this._aux.get(i) || 0;
  },
  dirty() { this._auxDirty = true; },
  // сила армии до учёта размера страны и болезней
  power(i) {
    return this.level(i) * (1 + this.auxBonus(i)) * (this.hungry(i) ? this.HUNGRY : 1);
  },

  // ---------- здание основной базы ----------
  hqOf(i) { return Buildings.index().hq.get(i) || null; },
  // свободная своя клетка поближе к столице
  hqCell(i, avoid) {
    const L = Game.lists[i];
    if (!L || !L.length) return null;
    const cap = Game.countries[i].capital;
    const from = cap != null && Game.own[cap] === i ? cap : L[0];
    let best = null, bd = Infinity;
    for (const k of L) {
      if (k === avoid || Buildings.at(k)) continue;
      const d = Game.dist2(from, k);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  },
  ensureHQs() {
    Game.countries.forEach((c, i) => {
      if (!c || !Game.cells(i) || this.hqOf(i)) return;
      const k = this.hqCell(i);
      if (k == null) return;
      Game.s.buildings.push({ id: Game.s.nextId++, type: 'hq', cell: k, builtAt: Game.t, paid: 0 });
      Buildings.invalidate();
    });
  },
  // базу захватили или выжгли: переезжает, при захвате — уровень −1 и налог пропадает
  hqLost(b, old, now) {
    const G = Game, P = G.player;
    if (!G.countries[old]) return;
    const captured = now !== OCEAN && now < FLOOD;
    if (captured) {
      const st = this.mainOf(old);
      st.mil = Math.max(1, st.mil - 1);
      if (old === P) {
        const lost = Math.floor(G.s.taxStore);
        G.s.taxStore = 0;
        G.log(`Твою основную военную базу захватила ${G.c(now)}! Уровень −1 (теперь ${st.mil})${lost ? `, несобранный налог ${lost} тиын пропал` : ''}. База переехала на другую клетку`, 'loss', 'alert');
      }
    }
    const k = this.hqCell(old, b.cell);
    if (k == null) { G.s.buildings = G.s.buildings.filter(x => x !== b); Buildings.invalidate(); return; }
    b.cell = k;
    Buildings.invalidate();
  },
  collectTax() {
    const n = Math.floor(Game.s.taxStore);
    if (!n) return 'Налог ещё не накопился';
    Game.s.taxStore -= n;
    Game.s.tiyn += n;
    Stats.bump('tax', n);
    Game.log(`Налог с территории собран: +${n} тиын`, 'reward', 'tiyn', Date.now());
    return null;
  },

  // ---------- тиын ----------
  // заплатить тиынами; если не хватает — недостающее берётся из алмазов
  payTiyn(n) {
    const s = Game.s;
    if (s.tiyn < n) {
      const needD = Math.ceil((n - s.tiyn) / TIYN_PER_DIAMOND);
      if (s.diamonds < needD) return false;
      Game.spend(needD, 'exchange');
      s.tiyn += needD * TIYN_PER_DIAMOND;
    }
    s.tiyn -= n;
    Stats.bump('tiyn_spent', n);
    return true;
  },
  exchange(dir, amount) {
    const s = Game.s;
    amount = Math.floor(amount);
    if (!(amount > 0)) return 'Введи количество';
    if (dir === 'toTiyn') {
      if (s.diamonds < amount) return 'Не хватает алмазов';
      Game.spend(amount, 'exchange');
      s.tiyn += amount * TIYN_PER_DIAMOND;
      Game.log(`Обмен: ${amount} алм. → ${amount * TIYN_PER_DIAMOND} тиын`, 'shop', 'tiyn', Date.now());
    } else {
      if (s.tiyn < amount * TIYN_PER_DIAMOND) return 'Не хватает тиын';
      s.tiyn -= amount * TIYN_PER_DIAMOND;
      Game.earn(amount, 'exchange');
      Game.log(`Обмен: ${amount * TIYN_PER_DIAMOND} тиын → ${amount} алм.`, 'shop', 'tiyn', Date.now());
    }
    return null;
  },

  // ---------- действия игрока ----------
  upgradeMain() {
    const P = Game.player, st = this.mainOf(P), c = this.upCost(st.mil);
    if (Game.s.gold < c.g) return `Нужно ${c.g} золота`;
    if (!this.payTiyn(c.t)) return 'Не хватает тиын и алмазов';
    Game.s.gold -= c.g;
    st.mil++;
    Stats.bump('mil_up');
    Game.log(`Военная база улучшена до ур. ${st.mil} (${c.t} тиын${c.g ? ` + ${c.g} зол.` : ''})`, 'shop', 'power', Date.now());
    return null;
  },
  feed(target, days) {
    const P = Game.player;
    const isMain = target === 'main';
    const b = isMain ? null : Game.s.buildings.find(x => x.id === target);
    if (!isMain && (!b || Game.own[b.cell] !== P)) return 'База не твоя';
    const daily = isMain ? this.feedMain(P) : this.feedAux(b);
    if (!this.payTiyn(daily * days)) return 'Не хватает тиын и алмазов';
    const obj = isMain ? this.mainOf(P) : b;
    const key = isMain ? 'milFed' : 'fedUntil';
    obj[key] = Math.max(obj[key] || 0, Date.now()) + days * DAY;
    this.dirty();
    Stats.bump('fed_days', days);
    Game.log(`Армия накормлена на ${days} ${U.plural(days, 'день', 'дня', 'дней')} (${isMain ? 'основная база' : 'вспомогательная база'}): −${daily * days} тиын`, 'shop', 'gift', Date.now());
    return null;
  },
  upgradeAux(id) {
    const b = Game.s.buildings.find(x => x.id === id);
    if (!b || Game.own[b.cell] !== Game.player) return 'База не твоя';
    if (b.lvl >= this.AUX_MAX_LVL) return 'Уже максимальный уровень (+20%)';
    const cost = 100 * (b.lvl + 1);
    if (!this.payTiyn(cost)) return 'Не хватает тиын и алмазов';
    b.lvl++;
    this.dirty();
    Game.log(`Вспомогательная база улучшена до ур. ${b.lvl} (+${Math.round(b.lvl * this.AUX_STEP * 100)}% к силе): −${cost} тиын`, 'shop', 'up', Date.now());
    return null;
  },

  // ---------- ход мира: налог, ИИ кормит и качает базы ----------
  tick(mult = 1) {
    const G = Game, dayFrac = G.TICK_MS / DAY * mult;
    if (this.hqOf(G.player)) G.s.taxStore += G.cells(G.player) * this.TAX * dayFrac;
    if (G.s.trails && G.s.trails.length) G.s.trails = G.s.trails.filter(x => G.t - x.t < DAY);
    this.ensureHQs();
    // предупреждения игроку о корме
    const me = this.mainOf(G.player), left = me.milFed - G.t;
    if (left <= 0 && !G.s.hungryLog) { G.s.hungryLog = 1; G.log('Армия голодает! Сила снижена вдвое — покорми основную базу в окне «Армия»', 'loss', 'alert'); }
    else if (left > 0 && left < 12 * HOUR && !G.s.foodWarn) { G.s.foodWarn = 1; G.log('Корм армии закончится меньше чем через 12 часов — покорми базу заранее', 'me', 'clock'); }
    if (left >= 12 * HOUR) { G.s.foodWarn = 0; G.s.hungryLog = 0; }
    const f = G.tickFrac() * mult;
    G.countries.forEach((c, i) => {
      if (!G.ai(i)) return;
      const st = this.mainOf(i);
      st.dia += G.cells(i) * this.TAX * dayFrac / TIYN_PER_DIAMOND;
      // кормим заранее, пока есть деньги
      if (st.milFed - G.t < DAY) {
        const cost = this.feedMain(i) / TIYN_PER_DIAMOND;
        if (st.dia >= cost) { st.dia -= cost; st.milFed = Math.max(st.milFed, G.t) + DAY; }
      }
      // качаем основную базу, если есть запас
      if (Math.random() < 0.02 * f) {
        const up = this.upCost(st.mil);
        if (st.dia >= up.t / TIYN_PER_DIAMOND + 40 && st.gold >= up.g) { st.dia -= up.t / TIYN_PER_DIAMOND; st.gold -= up.g; st.mil++; }
      }
    });
    for (const b of G.s.buildings) {
      if (b.type !== 'aux') continue;
      const o = G.own[b.cell];
      if (!G.ai(o)) continue;
      const st = G.st(o);
      if (!(b.fedUntil - G.t >= DAY)) {
        const cost = this.feedAux(b) / TIYN_PER_DIAMOND;
        if (st.dia >= cost) { st.dia -= cost; b.fedUntil = Math.max(b.fedUntil || 0, G.t) + DAY; }
      }
      if (b.lvl < this.AUX_MAX_LVL && Math.random() < 0.02 * f && st.dia >= (100 * (b.lvl + 1)) / TIYN_PER_DIAMOND + 30) {
        st.dia -= 100 * (b.lvl + 1) / TIYN_PER_DIAMOND; b.lvl++;
      }
    }
    this.dirty();
  },

  // ---------- окна ----------
  breakdown(i) {
    const G = Game, c = G.countries[i];
    const ratio = Math.min(1, Math.sqrt(G.cells(i) / Math.max(1, c.init)));
    return { lvl: this.level(i), aux: this.auxBonus(i), hungry: this.hungry(i), land: 0.55 + 0.45 * ratio, sick: G.sick(i), total: G.eff(i) };
  },
  openExchange() {
    const draw = root => {
      U.$('#ex-bal', root).innerHTML = `${ic('gem', 'gem')} ${Game.s.diamonds} &nbsp; ${ic('tiyn', 'tiyn')} ${Game.s.tiyn}`;
      const n = +U.$('#ex-n', root).value || 0;
      U.$('#ex-calc', root).textContent = n > 0 ? `${n} алм. = ${n * TIYN_PER_DIAMOND} тиын` : '';
    };
    U.modal(`<h2>${ic('tiyn', 'tiyn')} Обмен валюты <button class="x" data-close>${ic('x')}</button></h2>
      <div class="rate">1 ${ic('gem', 'gem')} = ${TIYN_PER_DIAMOND} ${ic('tiyn', 'tiyn')} тиын</div>
      <div class="balance" id="ex-bal"></div>
      <div class="hint">Тиын — мелкая монета для корма армии и прокачки баз. Каждая твоя клетка приносит ${this.TAX} тиын в сутки налогом. Обмен в обе стороны без комиссии.</div>
      <div class="field" style="margin-top:10px"><label>Сколько алмазов</label><input class="input" type="number" min="1" id="ex-n" placeholder="Например 5"></div>
      <div class="hint" id="ex-calc"></div>
      <div class="actions">
        <button class="btn primary grow" data-ex="toTiyn">${ic('gem')} → тиын</button>
        <button class="btn grow" data-ex="toDia">тиын → ${ic('gem')}</button>
      </div>`, root => {
      draw(root);
      root.oninput = () => draw(root);
      root.onclick = e => {
        const b = e.target.closest('[data-ex]');
        if (!b) return;
        const err = this.exchange(b.dataset.ex, +U.$('#ex-n', root).value);
        U.toast(err || 'Готово');
        draw(root);
      };
    });
  },
  open() {
    const P = Game.player;
    const draw = root => {
      const br = this.breakdown(P), st = this.mainOf(P), up = this.upCost(st.mil);
      const days = Math.max(0, (st.milFed - Date.now()) / DAY);
      const auxes = Game.s.buildings.filter(b => b.type === 'aux' && Game.own[b.cell] === P);
      const lim = Buildings.limit('aux', P);
      const feedBtns = (target, daily) => [1, 3, 7].map(d => `<button class="btn" data-feed="${target}" data-days="${d}">+${d} ${U.plural(d, 'день', 'дня', 'дней')} · ${daily * d} т.</button>`).join('');
      U.$('#mil-body', root).innerHTML = `
        <div class="balance"><span>${ic('gem', 'gem')} ${Game.s.diamonds}</span><span>${ic('tiyn', 'tiyn')} ${Game.s.tiyn}</span><span>${ic('coin', 'coin')} ${Game.s.gold}</span></div>
        <div class="milsum">
          <div><small>Основная база</small><b>ур. ${br.lvl}</b></div>
          <div><small>Вспомогательные</small><b class="${br.aux ? 'up' : ''}">+${Math.round(br.aux * 100)}%</b></div>
          <div><small>Земля</small><b>×${br.land.toFixed(2)}</b></div>
          <div><small>Итоговая сила</small><b class="big">${Math.round(br.total)}</b></div>
        </div>
        <div class="milcard tax"><div class="lh">${ic('tiyn', 'tiyn')} Налог с территории в базе: ${Math.floor(Game.s.taxStore)} тиын</div><div class="hint">${Game.cells(P)} клеток × ${this.TAX} тиын в сутки. Если базу захватят — несобранный налог пропадёт.</div><button class="btn primary" data-tax style="width:100%;margin-top:6px" ${Math.floor(Game.s.taxStore) ? '' : 'disabled'}>Забрать налог</button></div>
        ${br.hungry ? `<div class="hint warn">${ic('alert')} Армия голодает — сила снижена вдвое. Покорми основную базу!</div>` : ''}
        ${br.sick ? `<div class="hint warn">${ic('virus')} Эпидемия: сила −40%</div>` : ''}
        <div class="milcard">
          <div class="lh">${ic('power')} Основная военная база · ур. ${st.mil}</div>
          <div class="hint">Уровень = твоя сила. Улучшение: ${up.t} тиын${up.g ? ` + ${up.g} золота (каждый 10-й уровень)` : ''}.</div>
          <button class="btn primary" data-up="main" style="width:100%;margin-top:6px">${ic('up')} Улучшить до ур. ${st.mil + 1}</button>
          <div class="hint" style="margin-top:8px">Корм: ${this.feedMain(P)} тиын в сутки. Запас: <b class="${days < 1 ? 'down' : ''}">${days >= 1 ? Math.floor(days) + ' дн. ' + Math.floor((days % 1) * 24) + ' ч' : Math.floor(days * 24) + ' ч'}</b></div>
          <div class="feed">${feedBtns('main', this.feedMain(P))}</div>
        </div>
        <h4 class="dh">Вспомогательные базы (${auxes.length} из ${lim})</h4>
        <div class="hint">Каждая даёт до +20% к основной базе (+2% за уровень, 10 уровней). Кормится отдельно: ${this.FEED_AUX} тиын × уровень в сутки. Голодная база не даёт бонус.</div>
        ${auxes.map(b => {
          const d = Math.max(0, ((b.fedUntil || 0) - Date.now()) / DAY);
          return `<div class="milcard"><div class="lh">${ic('aux')} Вспомогательная база · ур. ${b.lvl}<time>+${Math.round(b.lvl * this.AUX_STEP * 100)}%${d <= 0 ? ' · голодает' : ''}</time></div>
            ${b.lvl < this.AUX_MAX_LVL ? `<button class="btn" data-up="${b.id}" style="width:100%;margin-top:6px">${ic('up')} Ур. ${b.lvl + 1} (+${Math.round((b.lvl + 1) * this.AUX_STEP * 100)}%) · ${100 * (b.lvl + 1)} тиын</button>` : '<div class="hint">Максимальный уровень</div>'}
            <div class="hint" style="margin-top:6px">Корм: ${this.feedAux(b)} тиын в сутки. Запас: <b class="${d < 1 ? 'down' : ''}">${d >= 1 ? Math.floor(d) + ' дн.' : Math.floor(d * 24) + ' ч'}</b></div>
            <div class="feed">${feedBtns(b.id, this.feedAux(b))}</div></div>`;
        }).join('')}
        ${auxes.length < lim ? `<button class="btn blue" data-build-aux style="width:100%">${ic('plus')} Построить вспомогательную базу · ${BUILDINGS.aux.cost.d} алм.</button>` : `<div class="hint">Лимит баз. Новая появится при ${BUILDINGS.aux.div * lim * lim} клетках.</div>`}
        <div class="hint" style="margin-top:8px">Если тиын не хватает, недостающее берётся из алмазов (1 алм. = ${TIYN_PER_DIAMOND} тиын).</div>`;
      App.wallet();
    };
    U.modal(`<h2>${ic('power')} Армия <button class="x" data-close>${ic('x')}</button></h2><div id="mil-body"></div>`, root => {
      draw(root);
      root.onclick = e => {
        let err;
        const up = e.target.closest('[data-up]');
        const fd = e.target.closest('[data-feed]');
        if (e.target.closest('[data-tax]')) err = this.collectTax();
        else if (up) err = up.dataset.up === 'main' ? this.upgradeMain() : this.upgradeAux(+up.dataset.up);
        else if (fd) err = this.feed(fd.dataset.feed === 'main' ? 'main' : +fd.dataset.feed, +fd.dataset.days);
        else if (e.target.closest('[data-build-aux]')) {
          if (Game.s.diamonds < BUILDINGS.aux.cost.d) return U.toast('Не хватает алмазов');
          U.closeModal(); App.show('map'); MapView.setMode('aux'); return;
        } else return;
        if (err) U.toast(err);
        Game.changed();
        draw(root);
      };
    }, 'wide');
  },
};
