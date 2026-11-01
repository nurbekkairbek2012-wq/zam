// Дипломатия: долгие войны, перемирия, союзы и почта с письмами от стран
const GOLD_VALUE = 15; // одно золото стоит примерно 15 алмазов

const Diplo = {
  RATE: 0.5,          // атак каждой стороны в долгой войне ИИ за «полчаса»
  RATE_VS_ME: 0.07,   // как часто враг в долгой войне бьёт по тебе за «полчаса»
  AI_WAR_CHANCE: 1 / 40,
  ME_WAR_CHANCE: 1 / 600,
  TRUCE_DAYS: 3,
  ALLY_DAYS: 2,
  MAX_AI_WARS: 8,

  init() {
    const s = Game.s;
    s.wars = s.wars || [];
    s.truces = s.truces || [];
    s.mail = s.mail || [];
  },

  // ---------- состояние ----------
  war(a, b) { return Game.s.wars.find(w => (w.a === a && w.b === b) || (w.a === b && w.b === a)) || null; },
  atWar(a, b) { return !!this.war(a, b); },
  truce(a, b) { return Game.s.truces.find(x => ((x.a === a && x.b === b) || (x.a === b && x.b === a)) && x.until > Game.t) || null; },
  warsOf(i) { return Game.s.wars.filter(w => w.a === i || w.b === i); },
  enemy(w, i) { return w.a === i ? w.b : w.a; },
  won(w, i) { return w.a === i ? w.sa : w.sb; },
  unread() { return Game.s.mail.filter(m => m.status === 'new').length; },
  myAlly() { const s = Game.s.cs[Game.player]; return s && s.ally != null && s.allyUntil > Date.now() ? s.ally : null; },

  declare(a, b, reason) {
    const G = Game, P = G.player;
    if (a === b || this.atWar(a, b) || this.truce(a, b) || G.allied(a, b) || !G.cells(a) || !G.cells(b)) return null;
    const w = { id: G.s.nextId++, a, b, start: G.t, until: G.t + (3 + Math.random() * 4) * DAY, reason, sa: 0, sb: 0 };
    G.s.wars.push(w);
    Stats.bump('wars');
    if (b === P) {
      Stats.bump('wars_vs_me');
      G.log(`${G.c(a)} объявила тебе долгую войну (${reason})! До ${U.stamp(w.until)} она будет часто нападать. Помириться можно в «Дипломатии» — предложи алмазы или золото`, 'loss', 'swords');
      this.letter(a, 'war', `Мы объявляем вам войну: ${reason}. Готовьтесь!`);
    } else {
      G.log(`Долгая война: ${G.c(a)} объявила войну ${G.c(b)} (${reason})`, 'war', 'swords');
    }
    return w;
  },
  end(w, why, truceDays) {
    const G = Game, P = G.player;
    G.s.wars = G.s.wars.filter(x => x !== w);
    if (truceDays) this.makeTruce(w.a, w.b, truceDays);
    const me = w.a === P || w.b === P;
    const other = this.enemy(w, P);
    const score = me ? ` Итог: ты взял ${this.won(w, P)} кл., враг — ${this.won(w, other)} кл.` : '';
    const text = why === 'peace'
      ? (me ? `Мир с ${G.c(other)}! Перемирие на ${truceDays} ${U.plural(truceDays, 'день', 'дня', 'дней')} — вы не можете нападать друг на друга.${score}` : `${G.c(w.a)} и ${G.c(w.b)} заключили мир`)
      : why === 'time'
      ? (me ? `Война с ${G.c(other)} закончилась сама — стороны устали.${score}` : `Война ${G.c(w.a)} и ${G.c(w.b)} закончилась`)
      : `Война ${G.c(w.a)} и ${G.c(w.b)} закончилась: одна из сторон пала`;
    if (why === 'peace') Stats.bump(me ? 'peace_me' : 'peace');
    G.log(text, me ? 'me' : 'war', 'peace');
  },
  makeTruce(a, b, days) {
    Game.s.truces = Game.s.truces.filter(x => !((x.a === a && x.b === b) || (x.a === b && x.b === a)));
    Game.s.truces.push({ a, b, until: Game.t + days * DAY });
  },

  // ---------- ход мира ----------
  tick() {
    const G = Game, t = G.t, f = G.tickFrac(), P = G.player, out = [];
    for (const w of G.s.wars.filter(w => !G.cells(w.a) || !G.cells(w.b) || w.until <= t)) {
      if (!G.cells(w.a) || !G.cells(w.b)) this.end(w, 'dead'); else this.end(w, 'time', 1);
    }
    G.s.truces = G.s.truces.filter(x => x.until > t);
    G.s.mail.forEach(m => { if (m.status === 'new' && m.until && m.until <= t) m.status = 'expired'; });
    if (G.s.mail.length > 120) G.s.mail = G.s.mail.slice(-120);

    for (const w of [...G.s.wars]) {
      for (const [att, def] of [[w.a, w.b], [w.b, w.a]]) {
        if (att === P) continue;
        if (Math.random() < (def === P ? this.RATE_VS_ME : this.RATE) * f) {
          const r = this.warBattle(att, def, w);
          if (r) out.push(r);
        }
      }
    }
    if (Math.random() < this.AI_WAR_CHANCE * f) this.randomAiWar();
    if (Math.random() < this.ME_WAR_CHANCE * f) this.randomWarOnMe();
    for (const w of G.s.wars) {
      const me = w.a === P || w.b === P;
      if (!me && Math.random() < f / 96) { this.end(w, 'peace', 2); break; }
      if (me && Math.random() < f / 20) this.aiPeaceLetter(w);
    }
    if (Math.random() < f / 96) this.allianceLetter();
    if (Math.random() < f / 72) this.giftLetter();
    return out;
  },

  warBattle(att, def, w) {
    const G = Game;
    const L = G.lists[att];
    if (!L.length) return null;
    const fronts = [];
    for (let s = 0; s < 40; s++) {
      const k = G.rand(L);
      for (const nb of G.nbrs(k)) if (G.own[nb] === def) fronts.push(nb);
    }
    if (!fronts.length) return null;
    const cell = G.rand(fronts);
    World.contagion(att, def);
    const A = G.eff(att) * 1.25 * (G.orig[cell] === att ? 1.6 : 1), D = G.defense(def);
    if (Math.random() >= A * A / (A * A + D * D)) return null;
    const n = G.grab(att, def, cell, 1);
    if (!n) return null;
    if (w.a === att) w.sa += n; else w.sb += n;
    return { a: att, d: def, n, how: 'долгая война' };
  },
  // учёт клеток, взятых тобой у врага в долгой войне
  playerTook(def, n) {
    const w = this.war(Game.player, def);
    if (!w) return;
    if (w.a === Game.player) w.sa += n; else w.sb += n;
  },

  neighbours(i) { return World.neighbours(i).filter(j => Game.ai(j) && Game.countries[j].kind !== 'alien'); },
  randomAiWar() {
    const G = Game;
    if (G.s.wars.filter(w => w.a !== G.player && w.b !== G.player).length >= this.MAX_AI_WARS) return;
    const alive = G.countries.map((c, i) => i).filter(i => G.ai(i) && G.countries[i].kind === 'nation' && G.cells(i) > 8);
    for (let tries = 0; tries < 10; tries++) {
      const a = G.rand(alive);
      const nb = this.neighbours(a).filter(b => b !== G.player && G.cells(b) > 8);
      if (!nb.length) continue;
      const b = G.rand(nb);
      if (this.declare(a, b, G.rand(['спор о границе', 'старая обида', 'борьба за ресурсы', 'захват торговых путей']))) return;
    }
  },
  randomWarOnMe() {
    const G = Game, P = G.player;
    if (this.warsOf(P).length >= 1) return; // против тебя — не больше одной долгой войны сразу
    const nb = this.neighbours(P).filter(i => G.eff(i) >= G.eff(P) * 0.8 && !G.allied(i, P));
    if (nb.length) this.declare(G.rand(nb), P, G.rand(['решила забрать твою землю', 'считает тебя слабым', 'спор о границе']));
  },

  // ---------- письма ----------
  letter(from, kind, text, offer, hours = 24) {
    const G = Game;
    const m = { id: G.s.nextId++, t: G.t, from, kind, text, offer: offer || null, status: 'new', until: offer || kind === 'peace' || kind === 'alliance' ? G.t + hours * HOUR : null };
    G.s.mail.push(m);
    Stats.bump('letters');
    G.log(`Письмо от ${G.c(from)}: ${text}`, 'me', 'mail');
    return m;
  },
  offerText(o) {
    if (!o) return '';
    const p = [];
    if (o.give) p.push(`дают тебе ${[o.give.d && o.give.d + ' алм.', o.give.g && o.give.g + ' зол.'].filter(Boolean).join(' и ')}`);
    if (o.ask) p.push(`просят ${[o.ask.d && o.ask.d + ' алм.', o.ask.g && o.ask.g + ' зол.'].filter(Boolean).join(' и ')}`);
    return p.join(', ');
  },
  demand(enemy, w) {
    const P = Game.player;
    const ratio = Game.eff(enemy) / Math.max(1, Game.eff(P));
    return Math.max(0, Math.round(10 + 15 * ratio + (this.won(w, enemy) - this.won(w, P)) * 3));
  },
  aiPeaceLetter(w) {
    const G = Game, P = G.player, e = this.enemy(w, P);
    if (G.s.mail.some(m => m.from === e && m.kind === 'peace' && m.status === 'new')) return;
    const mine = this.won(w, P), theirs = this.won(w, e);
    if (theirs > mine + 2) {
      const d = Math.round(this.demand(e, w) * 0.8);
      this.letter(e, 'peace', 'Мы побеждаем. Заплатите дань — и мы остановим войну', { ask: { d } });
    } else if (mine > theirs + 2) {
      const d = Math.max(3, Math.min(Math.floor(G.st(e).dia), Math.round(5 + (mine - theirs) * 3)));
      this.letter(e, 'peace', 'Война идёт плохо для нас. Предлагаем мир и выкуп', { give: { d } });
    } else {
      this.letter(e, 'peace', 'Эта война никому не нужна. Предлагаем мир без условий', {});
    }
  },
  allianceLetter() {
    const G = Game, P = G.player;
    if (this.myAlly() != null) return;
    const nb = this.neighbours(P).filter(i => !this.atWar(i, P) && !G.angry(i) && !(G.s.cs[i]?.allyUntil > G.t));
    if (!nb.length) return;
    const i = G.rand(nb), r = Math.random();
    const offer = r < 0.4 ? { give: { d: 5 + Math.round(Math.random() * 15) } } : r < 0.7 ? { ask: { d: 5 + Math.round(G.eff(i) * 0.3) } } : {};
    this.letter(i, 'alliance', offer.give ? 'Предлагаем военный союз на 2 дня и подарок в знак дружбы' : offer.ask ? 'Готовы стать вашим союзником на 2 дня — за небольшую плату' : 'Предлагаем военный союз на 2 дня', offer);
  },
  giftLetter() {
    const G = Game, P = G.player;
    const pool = G.countries.map((c, i) => i).filter(i => G.ai(i) && G.countries[i].kind === 'nation');
    const nb = this.neighbours(P);
    const i = Math.random() < 0.6 && nb.length ? G.rand(nb) : G.rand(pool);
    if (G.angry(i) || this.atWar(i, P)) return this.letter(i, 'letter', G.rand(['Мы не забудем, что вы сделали.', 'Наши армии смотрят на ваши границы.', 'Вы ещё пожалеете о своих нападениях.']));
    if (Math.random() < 0.55) {
      const offer = Math.random() < 0.75 ? { give: { d: 3 + Math.round(Math.random() * 9) } } : { give: { g: 1 } };
      return this.letter(i, 'gift', G.rand(['Шлём подарок в знак дружбы между нашими народами', 'Посол привёз вам небольшой дар', 'Примите это как жест доброй воли']), offer);
    }
    this.letter(i, 'letter', G.rand(['Наш народ шлёт вам привет!', 'Желаем вашей стране процветания.', 'Мы внимательно следим за вашими успехами.', 'Торговцы хвалят ваши города.']));
  },

  // ---------- ответы на письма ----------
  canPay(o) { return !o || !o.ask || (Game.s.diamonds >= (o.ask.d || 0) && Game.s.gold >= (o.ask.g || 0)); },
  pay(o, to) {
    if (!o) return;
    const G = Game;
    if (o.ask) {
      if (o.ask.d) { G.spend(o.ask.d, 'diplomacy'); G.st(to).dia += o.ask.d; }
      if (o.ask.g) { G.s.gold -= o.ask.g; G.st(to).gold += o.ask.g; }
    }
    if (o.give) {
      if (o.give.d) { G.earn(o.give.d, 'diplomacy'); G.st(to).dia = Math.max(0, G.st(to).dia - o.give.d); }
      if (o.give.g) G.s.gold += o.give.g;
    }
  },
  answer(id, accept) {
    const G = Game, P = G.player;
    G.t = Date.now();
    const m = G.s.mail.find(x => x.id === id);
    if (!m || m.status !== 'new') return 'Письмо уже неактуально';
    if (!accept) { m.status = 'declined'; G.changed(); return null; }
    if (m.kind === 'peace') {
      const w = this.war(m.from, P);
      if (!w) { m.status = 'expired'; return 'Войны уже нет'; }
      if (!this.canPay(m.offer)) return 'Не хватает ресурсов';
      this.pay(m.offer, m.from);
      this.end(w, 'peace', this.TRUCE_DAYS);
    } else if (m.kind === 'alliance') {
      if (this.myAlly() != null) return 'У тебя уже есть союзник';
      if (this.atWar(m.from, P)) return 'Вы воюете';
      if (!this.canPay(m.offer)) return 'Не хватает ресурсов';
      this.pay(m.offer, m.from);
      this.ally(m.from);
    } else if (m.kind === 'gift') {
      this.pay(m.offer, m.from);
      G.log(`Подарок от ${G.c(m.from)} принят: ${this.offerText(m.offer).replace('дают тебе ', '+')}`, 'reward', 'gift');
    }
    m.status = accept ? 'accepted' : 'declined';
    G.changed();
    return null;
  },
  ally(i) {
    const G = Game, P = G.player, until = Date.now() + this.ALLY_DAYS * DAY;
    Object.assign(G.st(i), { ally: P, allyUntil: until });
    Object.assign(G.st(P), { ally: i, allyUntil: until });
    Stats.bump('alliances_me');
    G.log(`Союз с ${G.c(i)} на ${this.ALLY_DAYS} дня: она не нападёт на тебя и поможет в твоих атаках`, 'me', 'ally');
  },

  // ---------- твои предложения ----------
  offerPeace(enemy, d, g) {
    const G = Game, P = G.player;
    G.t = Date.now();
    d = Math.max(0, Math.floor(d || 0)); g = Math.max(0, Math.floor(g || 0));
    const w = this.war(enemy, P);
    if (!w) return { err: 'Вы не воюете' };
    if (G.s.diamonds < d || G.s.gold < g) return { err: 'Не хватает ресурсов' };
    const s = G.st(enemy);
    if (s.envoyAt && Date.now() - s.envoyAt < 2 * HOUR) return { err: 'Посол ещё не вернулся — можно снова через ' + Math.ceil((2 * HOUR - (Date.now() - s.envoyAt)) / 60e3) + ' мин' };
    s.envoyAt = Date.now();
    const value = d + g * GOLD_VALUE;
    const need = this.demand(enemy, w) * (0.85 + Math.random() * 0.3);
    if (value >= need) {
      this.pay({ ask: { d, g } }, enemy);
      this.end(w, 'peace', this.TRUCE_DAYS);
      return { ok: true, text: `${G.name(enemy)} согласилась на мир!` };
    }
    const hint = value < need * 0.5 ? 'Над вашим предложением посмеялись.' : 'Почти согласились — добавьте ещё немного.';
    G.log(`${G.c(enemy)} отвергла твоё предложение мира (${d} алм.${g ? ` + ${g} зол.` : ''}). ${hint}`, 'me', 'mail');
    return { ok: false, text: `Отказ. ${hint}` };
  },
  allyDemand(i) { return Math.round(8 + Game.eff(i) * 0.5 * (Game.angry(i) ? 2 : 1)); },
  offerAlliance(i, d, g) {
    const G = Game, P = G.player;
    G.t = Date.now();
    d = Math.max(0, Math.floor(d || 0)); g = Math.max(0, Math.floor(g || 0));
    if (this.atWar(i, P)) return { err: 'Сначала помиритесь' };
    if (this.myAlly() != null) return { err: 'У тебя уже есть союзник' };
    if (G.s.cs[i]?.allyUntil > Date.now()) return { err: 'У этой страны уже есть союзник' };
    if (G.s.diamonds < d || G.s.gold < g) return { err: 'Не хватает ресурсов' };
    const s = G.st(i);
    if (s.envoyAt && Date.now() - s.envoyAt < 2 * HOUR) return { err: 'Посол ещё не вернулся — попробуй позже' };
    s.envoyAt = Date.now();
    const value = d + g * GOLD_VALUE;
    if (value >= this.allyDemand(i) * (0.85 + Math.random() * 0.3)) {
      this.pay({ ask: { d, g } }, i);
      this.ally(i);
      return { ok: true, text: `${G.name(i)} согласилась на союз!` };
    }
    G.log(`${G.c(i)} отказалась от союза (${d} алм.${g ? ` + ${g} зол.` : ''})`, 'me', 'mail');
    return { ok: false, text: 'Отказ — предложи больше' };
  },
};
