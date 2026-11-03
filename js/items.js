// Предметы: покупаются только за золото и хранятся в инвентаре. ИИ тоже ими пользуется.
const ITEMS = {
  medicine: { name: 'Лекарство', icon: 'pill', color: '#0891b2', gold: 2, desc: 'Сразу вылечивает эпидемию и даёт иммунитет на 5 дней — всё это время заразиться нельзя' },
  repair:   { name: 'Ремкомплект щитов', icon: 'wrench', color: '#2563eb', gold: 2, desc: 'Восстанавливает HP всех твоих щитов до полного' },
  horn:     { name: 'Боевой рог', icon: 'horn', color: '#b45309', gold: 3, desc: 'На 24 часа сила +25%' },
  ram:      { name: 'Таран', icon: 'ram', color: '#7c2d12', gold: 3, desc: 'Следующий захват берёт вдвое больше клеток и пробивает крепость' },
  rod:      { name: 'Громоотвод', icon: 'power', color: '#ca8a04', gold: 3, desc: 'Следующая стихия (метеорит, цунами, ураган) обойдёт твою землю и постройки' },
  smoke:    { name: 'Дымовая завеса', icon: 'cloud', color: '#475569', gold: 4, desc: '12 часов тебя никто не видит: на тебя не нападают и тебя нельзя захватить (штрафы за пропуски всё равно работают). Ты сам тоже не можешь нападать на тех, кто под завесой' },
};

const Items = {
  IMMUNITY_DAYS: 5,
  HORN_MS: DAY,
  SMOKE_MS: 12 * HOUR,

  inv() { return Game.s.inv || (Game.s.inv = {}); },
  count(id) { return this.inv()[id] || 0; },
  total() { return Object.values(this.inv()).reduce((a, b) => a + b, 0); },

  // ---------- активные эффекты (для любой страны) ----------
  st(i) { return Game.s.cs[i] || {}; },
  hornOn(i) { return this.st(i).hornUntil > Game.t; },
  hidden(i) { return this.st(i).smokeUntil > Game.t; },
  hasRod(i) { return (this.st(i).rod || 0) > 0; },
  hasRam(i) { return !!this.st(i).ram; },
  // громоотводы сработали: снимаем по одному у каждой страны
  spendRods(owners, what) {
    for (const o of owners) {
      const s = Game.st(o);
      s.rod = Math.max(0, (s.rod || 0) - 1);
      if (o === Game.player) Game.log(`Громоотвод сработал: ${what} обошёл твою землю`, 'reward', 'power');
    }
  },
  effects(i) {
    const s = this.st(i), out = [];
    if (s.hornUntil > Game.t) out.push({ icon: 'horn', text: `Боевой рог до ${U.stamp(s.hornUntil)}` });
    if (s.smokeUntil > Game.t) out.push({ icon: 'cloud', text: `Дымовая завеса до ${U.stamp(s.smokeUntil)}` });
    if (s.rod > 0) out.push({ icon: 'power', text: `Громоотвод${s.rod > 1 ? ' ×' + s.rod : ''}` });
    if (s.ram) out.push({ icon: 'ram', text: 'Таран заряжен' });
    return out;
  },

  // применить предмет к стране (игрок или ИИ)
  apply(o, id) {
    const s = Game.st(o), now = Game.t;
    if (id === 'medicine') {
      s.sick = null; s.sickAt = null;
      s.immune = Math.max(s.immune || 0, now) + this.IMMUNITY_DAYS * DAY;
    }
    if (id === 'repair') Game.s.buildings.forEach(b => { if (b.type === 'shield' && Game.own[b.cell] === o) b.hp = BUILDINGS.shield.hp; });
    if (id === 'horn') s.hornUntil = Math.max(s.hornUntil || 0, now) + this.HORN_MS;
    if (id === 'ram') s.ram = true;
    if (id === 'rod') s.rod = (s.rod || 0) + 1;
    if (id === 'smoke') s.smokeUntil = Math.max(s.smokeUntil || 0, now) + this.SMOKE_MS;
  },

  buy(id, qty = 1) {
    const it = ITEMS[id];
    const cost = it.gold * qty;
    if (Game.s.gold < cost) return `Не хватает золота: нужно ${cost}`;
    Game.s.gold -= cost;
    this.inv()[id] = this.count(id) + qty;
    Stats.bump('items_bought', qty);
    Game.log(`Куплено: ${it.name} ×${qty} за ${cost} зол. — лежит в инвентаре`, 'shop', it.icon, Date.now());
    Game.changed();
    return null;
  },

  use(id) {
    if (!this.count(id)) return 'В инвентаре нет такого предмета';
    const P = Game.player;
    Game.t = Date.now();
    if (id === 'ram' && this.hasRam(P)) return 'Таран уже заряжен — сначала используй его в захвате';
    if (id === 'repair' && !Game.s.buildings.some(b => b.type === 'shield' && Game.own[b.cell] === P && b.hp < BUILDINGS.shield.hp)) return 'Все твои щиты и так целые';
    const wasSick = Game.sick(P);
    this.apply(P, id);
    const s = Game.st(P);
    const text = {
      medicine: wasSick ? `Лекарство принято: эпидемия вылечена, иммунитет до ${U.stamp(s.immune)}` : `Лекарство принято: иммунитет до ${U.stamp(s.immune)}`,
      repair: 'Ремкомплект: все щиты восстановлены до полного HP',
      horn: `Боевой рог: сила +25% до ${U.stamp(s.hornUntil)}`,
      ram: 'Таран заряжен: следующий захват возьмёт вдвое больше клеток и пробьёт крепость',
      rod: 'Громоотвод установлен: следующая стихия обойдёт твою землю',
      smoke: `Дымовая завеса до ${U.stamp(s.smokeUntil)}: на тебя не нападают`,
    }[id];
    Game.log(text, 'reward', ITEMS[id].icon, Date.now());
    this.inv()[id]--;
    Stats.bump('items_used');
    Game.changed();
    return null;
  },

  immuneUntil() { const s = Game.s.cs[Game.player]; return s && s.immune > Date.now() ? s.immune : 0; },

  // ИИ иногда покупает и сразу использует предметы за своё золото
  aiTick(mult = 1) {
    const G = Game, f = G.tickFrac() * mult;
    G.countries.forEach((c, i) => {
      if (!G.ai(i) || c.kind === 'alien') return;
      const s = G.st(i);
      if (!(s.gold >= 2)) return;
      const tryUse = (id, cond, chance) => {
        if (!cond || s.gold < ITEMS[id].gold || Math.random() >= chance * f) return false;
        s.gold -= ITEMS[id].gold;
        this.apply(i, id);
        const nearMe = World.neighbours(i).includes(G.player);
        if ((id === 'horn' || id === 'smoke') || (nearMe && id !== 'repair' && id !== 'medicine')) G.log(`${G.c(i)} использовала предмет: ${ITEMS[id].name.toLowerCase()}`, 'war', ITEMS[id].icon);
        return true;
      };
      const atWar = Diplo.warsOf(i).length > 0;
      tryUse('medicine', G.sick(i), 0.3)
        || tryUse('repair', G.s.buildings.some(b => b.type === 'shield' && G.own[b.cell] === i && b.hp < BUILDINGS.shield.hp / 2), 0.05)
        || tryUse('horn', atWar && !this.hornOn(i), 0.05)
        || tryUse('smoke', G.cells(i) < c.init * 0.5 && !this.hidden(i), 0.05)
        || tryUse('ram', !s.ram && s.gold >= 6, 0.01)
        || tryUse('rod', !s.rod && s.gold >= 7, 0.01);
    });
  },


  // карточки для магазина
  shopHtml() {
    return Object.entries(ITEMS).map(([id, it]) => `<div class="shop-item"><div class="sic" style="background:${it.color}">${ic(it.icon)}</div>
      <div class="info"><b>${it.name}</b><small>${it.desc}</small><small class="lim">В инвентаре: ${this.count(id)}</small></div>
      <div class="buy"><button class="btn primary" data-item-buy="${id}">${it.gold} ${ic('coin', 'coin')}</button></div></div>`).join('')
      + '<div class="hint">Предметы покупаются только за золото и лежат в инвентаре, пока не используешь.</div>';
  },
  invHtml() {
    const P = Game.player, imm = this.immuneUntil();
    const status = `<div class="hint">${Game.sick(P) ? `<b style="color:#9333ea">Ты сейчас болеешь эпидемией</b> — лекарство вылечит сразу.` : imm ? `Иммунитет к эпидемии до ${U.stamp(imm)}.` : 'Ты здоров, иммунитета нет.'}</div>`;
    const list = Object.entries(ITEMS).filter(([id]) => this.count(id)).map(([id, it]) => `<div class="shop-item"><div class="sic" style="background:${it.color}">${ic(it.icon)}</div>
      <div class="info"><b>${it.name} ×${this.count(id)}</b><small>${it.desc}</small></div>
      <div class="buy"><button class="btn blue" data-item-use="${id}">Использовать</button></div></div>`).join('');
    const eff = this.effects(P).map(e => `<div class="tag blue">${ic(e.icon)} ${e.text}</div>`).join('');
    return status + (eff ? `<div style="margin:4px 0 10px">${eff}</div>` : '') + (list || '<div class="empty">Инвентарь пуст. Купи предметы во вкладке «Предметы».</div>');
  },
  // общий обработчик кликов в окне
  handle(e) {
    const b = e.target.closest('[data-item-buy]'), u = e.target.closest('[data-item-use]');
    if (b) { const err = this.buy(b.dataset.itemBuy); U.toast(err || 'Куплено — смотри в инвентаре'); return true; }
    if (u) { const err = this.use(u.dataset.itemUse); U.toast(err || 'Использовано'); return true; }
    return false;
  },
  open() {
    const draw = root => { U.$('#inv-body', root).innerHTML = `<div class="balance"><span>${ic('coin', 'coin')} ${Game.s.gold}</span></div>` + this.invHtml(); };
    U.modal(`<h2>${ic('bag')} Инвентарь <button class="x" data-close>${ic('x')}</button></h2><div id="inv-body"></div>
      <button class="btn" id="inv-shop" style="width:100%;margin-top:10px">${ic('store')} Купить предметы</button>`, root => {
      draw(root);
      root.onclick = e => {
        if (e.target.closest('#inv-shop')) { U.closeModal(); return MapView.shop('items'); }
        if (this.handle(e)) draw(root);
      };
    });
  },
};
