// Предметы: покупаются только за золото и хранятся в инвентаре
const ITEMS = {
  medicine: {
    name: 'Лекарство', icon: 'pill', color: '#0891b2', gold: 2,
    desc: 'Сразу вылечивает эпидемию и даёт иммунитет на 5 дней — всё это время заразиться нельзя',
  },
};

const Items = {
  IMMUNITY_DAYS: 5,

  inv() { return Game.s.inv || (Game.s.inv = {}); },
  count(id) { return this.inv()[id] || 0; },
  total() { return Object.values(this.inv()).reduce((a, b) => a + b, 0); },

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
    const P = Game.player, s = Game.st(P), now = Date.now();
    if (id === 'medicine') {
      const wasSick = Game.sick(P);
      s.sick = null; s.sickAt = null;
      s.immune = Math.max(s.immune || 0, now) + this.IMMUNITY_DAYS * DAY;
      Game.log(wasSick
        ? `Лекарство принято: эпидемия вылечена, иммунитет до ${U.stamp(s.immune)}`
        : `Лекарство принято: иммунитет до ${U.stamp(s.immune)} — эпидемия не страшна`, 'reward', 'pill', now);
    }
    this.inv()[id]--;
    Stats.bump('items_used');
    Game.changed();
    return null;
  },

  immuneUntil() { const s = Game.s.cs[Game.player]; return s && s.immune > Date.now() ? s.immune : 0; },

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
    return status + (list || '<div class="empty">Инвентарь пуст. Купи предметы во вкладке «Предметы».</div>');
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
