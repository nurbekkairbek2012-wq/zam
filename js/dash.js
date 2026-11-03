// Аналитика: больше 100 показателей по задачам, времени, экономике и миру
const CONT_NAMES = ['', 'Европа', 'Азия', 'Африка', 'Сев. Америка', 'Юж. Америка', 'Океания'];
const EV_ORDER = ['meteor', 'epidemic', 'tsunami', 'hurricane', 'revolt', 'alliance', 'goldrush', 'aliens'];

const Dash = {
  tab: 'overview',
  sort: { key: 'cells', dir: -1 },
  TABS: [
    ['overview', 'Обзор', 'chart'], ['tasks', 'Задачи', 'check'], ['time', 'Время', 'clock'],
    ['eco', 'Экономика', 'gem'], ['land', 'Территория', 'flag'], ['world', 'Мир', 'globe'],
    ['maps', 'Тепловые карты', 'map'], ['table', 'Все страны', 'list'],
  ],

  render() {
    Game.t = Date.now();
    const counts = {};
    let total = 0;
    for (const [id] of this.TABS) {
      const n = (this.build(id).html.match(/class="(kpi|dc)[ "]/g) || []).length;
      counts[id] = n; total += n;
    }
    U.$('#dash-tabs').innerHTML = this.TABS.map(([id, name, icon]) =>
      `<button data-t="${id}" class="${id === this.tab ? 'active' : ''}">${ic(icon)}${name}<em>${counts[id]}</em></button>`).join('')
      + `<span class="dash-total">${total} показателей</span>`;
    U.$('#dash-tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { this.tab = b.dataset.t; this.render(); } };
    const { html, maps } = this.build(this.tab);
    U.$('#dash-body').innerHTML = html;
    maps.forEach(m => Ch.drawWorld(m));
    U.$$('#dash-body th[data-k]').forEach(th => th.onclick = () => {
      const k = th.dataset.k;
      this.sort = { key: k, dir: this.sort.key === k ? -this.sort.dir : -1 };
      this.render();
    });
  },

  card(title, body, opts = {}) {
    return `<section class="dc ${opts.wide ? 'wide' : ''} ${opts.full ? 'full' : ''}"><h4>${title}</h4>${opts.note ? `<p class="note">${opts.note}</p>` : ''}${body}</section>`;
  },
  kpis(list) { return `<div class="kpis">${list.join('')}</div>`; },

  build(id) {
    const maps = [];
    const map = (spec) => { maps.push(spec); return spec.html; };
    const html = this[id](map);
    return { html, maps };
  },

  // ---------- данные ----------
  occ() {
    const out = [];
    for (const t of Planner.tasks) {
      if (t.type === 'rest') continue;
      for (const d of t.dates) {
        if (!Planner.counts(t, d)) continue;
        const st = Planner.status(t, d);
        const doneAt = t.done[d] || null;
        out.push({
          t, d, st, h: Planner.hours(t), end: Planner.endOf(t, d).getTime(), doneAt,
          day: doneAt ? (t.type === 'deadline' ? U.ymd(new Date(doneAt)) : d) : null,
          hour: t.type === 'deadline' ? (doneAt ? new Date(doneAt).getHours() : null) : U.toMin(t.start) / 60 | 0,
        });
      }
    }
    return out;
  },
  hoursByDay(occ) {
    const m = {};
    occ.filter(o => o.st === 'done').forEach(o => m[o.day] = (m[o.day] || 0) + o.h);
    return m;
  },
  lastDays(n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push(U.addDays(U.today(), -i));
    return out;
  },
  sumRange(map, from, to) { let s = 0; for (let d = from; d <= to; d = U.addDays(d, 1)) s += map[d] || 0; return s; },
  streaks(occ) {
    const days = {};
    occ.forEach(o => {
      const k = o.st === 'done' ? o.day : o.st === 'missed' ? o.d : null;
      if (!k) return;
      days[k] = days[k] || { done: 0, missed: 0 };
      days[k][o.st]++;
    });
    const good = d => days[d] && days[d].done && !days[d].missed;
    let cur = 0, d = U.today();
    if (!good(d)) d = U.addDays(d, -1);
    while (good(d)) { cur++; d = U.addDays(d, -1); }
    let best = 0, run = 0, prev = null;
    Object.keys(days).sort().forEach(k => {
      if (good(k)) { run = prev && U.addDays(prev, 1) === k ? run + 1 : 1; best = Math.max(best, run); prev = k; }
      else { run = 0; prev = null; }
    });
    return { cur, best };
  },
  dailySum(key, n) {
    const dd = Stats.st.daily;
    return this.lastDays(n).map(d => (dd[d] && dd[d][key]) || 0);
  },
  tot(k) { return Stats.st.tot[k] || 0; },
  hist() { return [...Stats.st.hist, Stats.current()]; },
  histLabels() { return this.hist().map(h => { const d = new Date(h.t); return `${d.getDate()}.${U.pad(d.getMonth() + 1)}`; }); },
  pct(a, b) { return b ? Math.round(a / b * 100) + '%' : '—'; },
  alive() { return Game.countries.map((c, i) => i).filter(i => Game.countries[i] && Game.cells(i) > 0); },
  growth(days) {
    return this.alive().map(i => {
      const was = Stats.cellsAgo(i, days * DAY);
      return { i, v: was == null ? null : Game.cells(i) - was };
    }).filter(x => x.v != null);
  },
  pre(i) { return Game.flag(i); },

  rankMoves(before) {
    if (!before) return Ch.empty();
    const now = Stats.ranksNow();
    const list = [...now.keys()].map(i => ({ i, v: Stats.rankDelta(i, now, before) })).filter(x => x.v);
    if (!list.length) return Ch.empty('Пока никто не сдвинулся');
    list.sort((a, b) => b.v - a.v);
    const pick = [...list.slice(0, 8), ...list.slice(-8)].filter((x, j, a) => a.indexOf(x) === j);
    return Ch.diverge({ items: pick.map(x => ({ label: Game.name(x.i), value: x.v, pre: Game.flag(x.i) })), fmt: v => v + ' ' + U.plural(v, 'место', 'места', 'мест') });
  },

  // ---------- вкладки ----------
  overview(map) {
    const occ = this.occ(), done = occ.filter(o => o.st === 'done'), missed = occ.filter(o => o.st === 'missed');
    const P = Game.player, byDay = this.hoursByDay(occ);
    const d24 = Stats.cellsAgo(P, DAY), d7 = Stats.cellsAgo(P, 7 * DAY);
    const st = this.streaks(occ);
    const days = this.lastDays(14);
    return this.kpis([
      Ch.kpi('Выполнено задач', done.length, { icon: 'check', sub: `из ${done.length + missed.length} с итогом` }),
      Ch.kpi('Процент выполнения', this.pct(done.length, done.length + missed.length), { icon: 'target' }),
      Ch.kpi('Часов за 7 дней', Ch.fmt(this.sumRange(byDay, U.addDays(U.today(), -6), U.today())), { icon: 'clock', delta: this.sumRange(byDay, U.addDays(U.today(), -6), U.today()) - this.sumRange(byDay, U.addDays(U.today(), -13), U.addDays(U.today(), -7)), dlabel: 'к прошлой неделе' }),
      Ch.kpi('Серия без пропусков', `${st.cur} дн.`, { icon: 'star', sub: `рекорд ${st.best} дн.` }),
      Ch.kpi('Алмазы', Game.s.diamonds, { icon: 'gem', delta: this.dailySum('earn', 1)[0] - this.dailySum('spend', 1)[0], dlabel: 'сегодня' }),
      Ch.kpi('Территория', `${Game.cells(P)} кл.`, { icon: 'flag', delta: d24 == null ? null : Game.cells(P) - d24, dlabel: 'за 24 ч' }),
      Ch.kpi('Место в мире', `#${Game.rank()}`, { icon: 'trophy', sub: `${(Game.cells(P) / 16129 * 100).toFixed(1)}% суши` }),
      Ch.kpi('За неделю', d7 == null ? '—' : `${Game.cells(P) - d7 >= 0 ? '+' : ''}${Game.cells(P) - d7} кл.`, { icon: 'chart', delta: d7 == null ? null : Game.cells(P) - d7, dlabel: 'клеток' }),
    ]) + `<div class="dgrid">`
      + this.card('Выполненные часы по дням (полгода)', Ch.calHeat({ values: byDay, unit: ' ч' }), { wide: true })
      + this.card('Моя территория во времени', Ch.line({ labels: this.histLabels(), series: [{ name: 'Клетки', color: PAL[0], values: this.hist().map(h => Stats.decode(h)[P] || 0) }], area: true, zero: false }))
      + this.card('Доходы и расходы алмазов (14 дней)', Ch.stack({ labels: days.map(d => U.parse(d).getDate() + ''), series: [
        { name: 'Заработано', color: UP, values: this.dailySum('earn', 14).map(v => Math.max(0, v)) },
        { name: 'Потрачено', color: DOWN, values: this.dailySum('spend', 14) },
      ] }))
      + `</div>`;
  },

  tasks() {
    const occ = this.occ();
    const done = occ.filter(o => o.st === 'done'), missed = occ.filter(o => o.st === 'missed');
    const open = occ.filter(o => o.st === 'open');
    const byDay = this.hoursByDay(occ);
    const today = U.today();
    const h7 = this.sumRange(byDay, U.addDays(today, -6), today), h7p = this.sumRange(byDay, U.addDays(today, -13), U.addDays(today, -7));
    const h30 = this.sumRange(byDay, U.addDays(today, -29), today), h30p = this.sumRange(byDay, U.addDays(today, -59), U.addDays(today, -30));
    const st = this.streaks(occ);
    const wdH = [0, 0, 0, 0, 0, 0, 0], hrH = new Array(24).fill(0);
    done.forEach(o => { wdH[U.wd(o.day)] += o.h; if (o.hour != null) hrH[o.hour] += o.h; });
    const bestWd = wdH.some(Boolean) ? U.WD_SHORT[wdH.indexOf(Math.max(...wdH))] : '—';
    const bestHr = hrH.some(Boolean) ? `${hrH.indexOf(Math.max(...hrH))}:00` : '—';
    const goals = Planner.tasks.filter(t => t.type === 'long');
    const dls = occ.filter(o => o.t.type === 'deadline');
    const margins = dls.filter(o => o.doneAt).map(o => (o.end - o.doneAt) / HOUR);
    const imp = k => { const a = occ.filter(o => o.t.type === 'normal' && o.t.importance === k); const d = a.filter(o => o.st === 'done').length, m = a.filter(o => o.st === 'missed').length; return this.pct(d, d + m); };
    const next7 = Array.from({ length: 7 }, (_, i) => Planner.occurrencesOn(U.addDays(today, i + 1)).filter(t => t.type !== 'rest').length).reduce((a, b) => a + b, 0);

    // по неделям
    const weeks = [], wDone = [], wMiss = [];
    for (let w = 11; w >= 0; w--) {
      const from = U.addDays(today, -w * 7 - 6), to = U.addDays(today, -w * 7);
      weeks.push(U.human(from).split(' ')[0] + '.' + (U.parse(from).getMonth() + 1));
      wDone.push(done.filter(o => o.day >= from && o.day <= to).length);
      wMiss.push(missed.filter(o => o.d >= from && o.d <= to).length);
    }
    // скользящий процент выполнения
    const days30 = this.lastDays(30);
    const rate = days30.map(d => {
      const from = U.addDays(d, -6);
      const dn = done.filter(o => o.day >= from && o.day <= d).length, ms = missed.filter(o => o.d >= from && o.d <= d).length;
      return dn + ms ? Math.round(dn / (dn + ms) * 100) : null;
    });
    const typeCnt = k => done.filter(o => o.t.type === k).length;
    const titles = {};
    done.forEach(o => titles[o.t.title] = (titles[o.t.title] || 0) + 1);

    return this.kpis([
      Ch.kpi('Всего задач', Planner.tasks.length, { icon: 'list' }),
      Ch.kpi('Выполнено', done.length, { icon: 'check' }),
      Ch.kpi('Просрочено', missed.length, { icon: 'x' }),
      Ch.kpi('Процент выполнения', this.pct(done.length, done.length + missed.length), { icon: 'target' }),
      Ch.kpi('Ожидают', open.length, { icon: 'clock' }),
      Ch.kpi('Часов выполнено', Ch.fmt(done.reduce((a, o) => a + o.h, 0)), { icon: 'clock' }),
      Ch.kpi('Часов за 7 дней', Ch.fmt(h7), { delta: h7 - h7p, dlabel: 'к прошлой неделе' }),
      Ch.kpi('Часов за 30 дней', Ch.fmt(h30), { delta: h30 - h30p, dlabel: 'к прошлому месяцу' }),
      Ch.kpi('Средняя длительность', done.length ? Ch.fmt(done.reduce((a, o) => a + o.h, 0) / done.length) + ' ч' : '—'),
      Ch.kpi('Текущая серия', `${st.cur} дн.`, { icon: 'star' }),
      Ch.kpi('Лучшая серия', `${st.best} дн.`, { icon: 'trophy' }),
      Ch.kpi('Лучший день недели', bestWd),
      Ch.kpi('Самый продуктивный час', bestHr),
      Ch.kpi('Встреч проведено', typeCnt('meet'), { icon: 'users' }),
      Ch.kpi('Дней отдыха', Planner.tasks.filter(t => t.type === 'rest').length, { icon: 'leaf' }),
      Ch.kpi('Целей достигнуто', goals.filter(t => t.goalDone).length, { icon: 'trophy' }),
      Ch.kpi('Целей провалено', goals.filter(t => t.goalMissed).length, { icon: 'x' }),
      Ch.kpi('Активные цели', goals.filter(t => !t.goalDone && !t.goalMissed).length, { icon: 'target' }),
      Ch.kpi('Дедлайнов сдано', dls.filter(o => o.st === 'done').length, { icon: 'flag' }),
      Ch.kpi('Дедлайнов сорвано', dls.filter(o => o.st === 'missed').length, { icon: 'flag' }),
      Ch.kpi('Запас до дедлайна', margins.length ? Ch.fmt(margins.reduce((a, b) => a + b, 0) / margins.length) + ' ч' : '—', { sub: 'в среднем сдаёшь раньше на' }),
      Ch.kpi('Красные выполнены', imp('red')),
      Ch.kpi('Оранжевые выполнены', imp('orange')),
      Ch.kpi('Жёлтые выполнены', imp('yellow')),
      Ch.kpi('Задач на сегодня', Planner.occurrencesOn(today).filter(t => t.type !== 'rest').length),
      Ch.kpi('Задач на 7 дней вперёд', next7),
    ]) + `<div class="dgrid">`
      + this.card('Часы выполненных задач за 30 дней', Ch.line({ labels: this.lastDays(30).map(d => U.parse(d).getDate() + ''), series: [{ name: 'Часы', color: PAL[0], values: this.lastDays(30).map(d => byDay[d] || 0) }], area: true }))
      + this.card('Выполнено и просрочено по неделям', Ch.stack({ labels: weeks, series: [{ name: 'Выполнено', color: UP, values: wDone }, { name: 'Просрочено', color: DOWN, values: wMiss }] }))
      + this.card('Процент выполнения (скользящие 7 дней)', Ch.line({ labels: days30.map(d => U.parse(d).getDate() + ''), series: [{ name: '%', color: PAL[2], values: rate }], yfmt: v => v == null ? '—' : Math.round(v) + '%' }))
      + this.card('Выполнено по типам', Ch.donut({ items: [
        { label: 'Обычные', value: typeCnt('normal'), color: PAL[1] }, { label: 'Цели', value: typeCnt('long'), color: PAL[0] },
        { label: 'Дедлайны', value: typeCnt('deadline'), color: '#1f2937' }, { label: 'Встречи', value: typeCnt('meet'), color: '#898781' }] }))
      + this.card('Задачи по важности', Ch.donut({ items: [
        { label: 'Не срочно', value: occ.filter(o => o.t.importance === 'yellow').length, color: '#f2c200' },
        { label: 'Важно', value: occ.filter(o => o.t.importance === 'orange').length, color: '#f2851f' },
        { label: 'Очень важно', value: occ.filter(o => o.t.importance === 'red').length, color: '#e23d3d' }] }))
      + this.card('Часы по дням недели', Ch.bars({ items: U.WD_SHORT.map((w, i) => ({ label: w, value: wdH[i] })) }))
      + this.card('Самые долгие выполненные задачи', Ch.hbars({ items: [...done].sort((a, b) => b.h - a.h).slice(0, 10).map(o => ({ label: o.t.title, value: o.h })), fmt: v => Ch.fmt(v) + ' ч' }))
      + this.card('Прогресс целей', Ch.hbars({ items: goals.map(t => ({ label: t.title, value: Math.round(Planner.goalProgress(t).done / Math.max(1, Planner.goalProgress(t).total) * 100), color: t.goalDone ? UP : t.goalMissed ? DOWN : PAL[0] })), fmt: v => v + '%', max: 100 }))
      + this.card('Самые частые задачи', Ch.hbars({ items: Object.entries(titles).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([l, v]) => ({ label: l, value: v })), fmt: v => v + ' раз' }))
      + `</div>`;
  },

  time() {
    const occ = this.occ(), done = occ.filter(o => o.st === 'done');
    const m = Array.from({ length: 7 }, () => new Array(18).fill(0));
    done.forEach(o => {
      if (o.t.type === 'deadline') { const hh = new Date(o.doneAt).getHours(); if (hh >= 6) m[U.wd(o.day)][hh - 6] += o.h; return; }
      const s = U.toMin(o.t.start), e = U.toMin(o.t.end);
      for (let mm = s; mm < e; mm += 60) { const hh = mm / 60 | 0; if (hh >= 6 && hh < 24) m[U.wd(o.day)][hh - 6] += Math.min(60, e - mm) / 60; }
    });
    const byHour = new Array(18).fill(0).map((_, j) => m.reduce((a, r) => a + r[j], 0));
    const year = new Date().getFullYear();
    const months = U.MONTHS.map((n, i) => ({ label: n.slice(0, 3), value: done.filter(o => U.parse(o.day).getFullYear() === year && U.parse(o.day).getMonth() === i).length }));
    const byDay = this.hoursByDay(occ);
    const days = Object.keys(byDay).sort();
    let acc = 0;
    const cum = days.map(d => (acc += byDay[d]));
    // плановая загрузка
    const plan = {};
    occ.forEach(o => plan[o.d] = (plan[o.d] || 0) + o.h);
    const busiest = Object.entries(plan).sort((a, b) => b[1] - a[1])[0];
    const wk = Object.entries(plan).filter(([d]) => U.wd(d) < 5), we = Object.entries(plan).filter(([d]) => U.wd(d) >= 5);
    const avg = a => a.length ? Ch.fmt(a.reduce((s, [, v]) => s + v, 0) / a.length) + ' ч' : '—';
    const now = new Date();
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    let schoolH = 0;
    for (let d = 1; d <= dim; d++) { const ds = U.ymd(new Date(now.getFullYear(), now.getMonth(), d)); if (Planner.hasSchool(ds)) { const sp = Planner.schoolSpan(ds); schoolH += (U.toMin(sp.end) - U.toMin(sp.start)) / 60; } }
    let freeEv = 0;
    for (let i = 1; i <= 7; i++) { const d = U.addDays(U.today(), i); if (!Planner.occurrencesOn(d).some(t => !t.allDay && U.toMin(t.end) > 17 * 60)) freeEv++; }
    const wdPlan = [0, 0, 0, 0, 0, 0, 0], wdDone = [0, 0, 0, 0, 0, 0, 0];
    occ.forEach(o => { wdPlan[U.wd(o.d)] += o.h; if (o.st === 'done') wdDone[U.wd(o.day)] += o.h; });
    return this.kpis([
      Ch.kpi('Самый загруженный день', busiest ? `${Ch.fmt(busiest[1])} ч` : '—', { sub: busiest ? U.human(busiest[0]) : '' }),
      Ch.kpi('Средняя загрузка в будни', avg(wk)),
      Ch.kpi('Средняя загрузка в выходные', avg(we)),
      Ch.kpi('Школа в этом месяце', `${schoolH} ч`, { icon: 'school' }),
      Ch.kpi('Свободных вечеров на неделе', freeEv, { sub: 'после 17:00, ближайшие 7 дней' }),
    ]) + `<div class="dgrid">`
      + this.card('Когда ты работаешь: день недели × час', Ch.matrix({ rows: U.WD_SHORT, cols: Array.from({ length: 18 }, (_, i) => i + 6), values: m, unit: ' ч' }), { wide: true })
      + this.card('Часы по времени суток', Ch.bars({ items: byHour.map((v, i) => ({ label: `${i + 6}`, value: v })), fmt: v => Ch.fmt(v) }))
      + this.card(`Выполнено задач по месяцам (${year})`, Ch.bars({ items: months }))
      + this.card('Накопленные часы', Ch.line({ labels: days.map(d => U.parse(d).getDate() + '.' + (U.parse(d).getMonth() + 1)), series: [{ name: 'Часы', color: PAL[6], values: cum }], area: true }))
      + this.card('План и факт по дням недели', Ch.stack({ labels: U.WD_SHORT, series: [{ name: 'Выполнено', color: PAL[0], values: wdDone }, { name: 'Не выполнено', color: '#c3c2b7', values: wdPlan.map((v, i) => Math.max(0, v - wdDone[i])) }], fmt: v => Ch.fmt(v) }))
      + `</div>`;
  },

  eco() {
    const s = Game.s, T = k => this.tot(k);
    const e7 = this.dailySum('earn', 14);
    const earn7 = e7.slice(7).reduce((a, b) => a + b, 0), earnP = e7.slice(0, 7).reduce((a, b) => a + b, 0);
    const deps = s.bank.deps;
    const days = this.lastDays(14);
    return this.kpis([
      Ch.kpi('Алмазы сейчас', s.diamonds, { icon: 'gem' }),
      Ch.kpi('Золото сейчас', s.gold, { icon: 'coin' }),
      Ch.kpi('Заряды захвата', s.charges, { icon: 'swords' }),
      Ch.kpi('Клеток за заряд', s.level, { icon: 'up' }),
      Ch.kpi('Военная база', `ур. ${Military.level(Game.player)}`, { icon: 'power', sub: `сила ${Math.round(Game.eff(Game.player))}${Military.hungry(Game.player) ? ' · голодает' : ''}` }),
      Ch.kpi('Тиын', s.tiyn, { icon: 'tiyn', sub: `налог собран: ${T('tax')}` }),
      Ch.kpi('Потрачено тиын', T('tiyn_spent'), { icon: 'tiyn', sub: `улучшений базы: ${T('mil_up')}` }),
      Ch.kpi('Заработано всего', T('earn')),
      Ch.kpi('Потрачено всего', T('spend')),
      Ch.kpi('Заработано за 7 дней', earn7, { delta: earn7 - earnP, dlabel: 'к прошлой неделе' }),
      Ch.kpi('С задач', T('earn_task'), { icon: 'check' }),
      Ch.kpi('С целей', T('earn_goal'), { icon: 'trophy' }),
      Ch.kpi('С шахт', T('earn_mine'), { icon: 'mine' }),
      Ch.kpi('Бонус нефти', T('earn_oil'), { icon: 'oil' }),
      Ch.kpi('За уничтожение стран', T('earn_kill'), { icon: 'dead' }),
      Ch.kpi('Прибыль банка', T('earn_bank'), { icon: 'bank' }),
      Ch.kpi('На захваты', T('spend_capture'), { icon: 'swords' }),
      Ch.kpi('На постройки', T('spend_build'), { icon: 'fort' }),
      Ch.kpi('На улучшения', T('spend_upgrade'), { icon: 'up' }),
      Ch.kpi('Во вкладах', deps.reduce((a, d) => a + d.amount, 0), { icon: 'bank' }),
      Ch.kpi('Золото в банке', s.bank.gold.toFixed(2), { icon: 'coin' }),
      Ch.kpi('Ожидаемая прибыль вкладов', deps.reduce((a, d) => a + Math.round(d.amount * d.rate), 0)),
      Ch.kpi('Золота добыто', T('gold_mined'), { icon: 'gen' }),
      Ch.kpi('Зарядов от казарм', T('free_charges'), { icon: 'barracks' }),
    ]) + `<div class="dgrid">`
      + this.card('Баланс алмазов', Ch.line({ labels: this.histLabels(), series: [{ name: 'Алмазы', color: PAL[0], values: this.hist().map(h => h.d) }], area: true }))
      + this.card('Баланс золота', Ch.line({ labels: this.histLabels(), series: [{ name: 'Золото', color: PAL[3], values: this.hist().map(h => h.g) }], area: true }))
      + this.card('Доходы и расходы по дням', Ch.stack({ labels: days.map(d => U.parse(d).getDate() + ''), series: [
        { name: 'Заработано', color: UP, values: this.dailySum('earn', 14).map(v => Math.max(0, v)) },
        { name: 'Потрачено', color: DOWN, values: this.dailySum('spend', 14) }] }))
      + this.card('Откуда алмазы', Ch.donut({ items: [
        { label: 'Задачи', value: Math.max(0, T('earn_task')), color: PAL[0] }, { label: 'Цели', value: T('earn_goal'), color: PAL[1] },
        { label: 'Шахты', value: T('earn_mine'), color: PAL[2] }, { label: 'Нефть', value: T('earn_oil'), color: PAL[3] },
        { label: 'Победы', value: T('earn_kill'), color: PAL[4] }, { label: 'Банк', value: T('earn_bank'), color: PAL[5] }] }))
      + this.card('На что потрачено', Ch.donut({ items: [
        { label: 'Захваты', value: T('spend_capture'), color: PAL[0] }, { label: 'Постройки', value: T('spend_build'), color: PAL[1] },
        { label: 'Улучшения', value: T('spend_upgrade'), color: PAL[2] }] }))
      + `</div>`;
  },

  land(map) {
    const P = Game.player, n = Game.cells(P), T = k => this.tot(k);
    const H = this.hist(), mine = H.map(h => Stats.decode(h)[P] || 0);
    const d24 = Stats.cellsAgo(P, DAY), d7 = Stats.cellsAgo(P, 7 * DAY);
    const snap7 = Stats.snapAgo(7 * DAY);
    const nb = World.neighbours(P).filter(i => i !== P);
    const danger = nb.sort((a, b) => Game.eff(b) - Game.eff(a))[0];
    const border = Game.lists[P].filter(k => Game.nbrs(k).some(x => Game.own[x] !== P && Game.own[x] !== OCEAN)).length;
    const myB = Buildings.owned(P);
    const won = T('atk_win'), fail = T('atk_fail');
    const lostOther = T('lost') - T('lost_penalty') - T('lost_disaster');
    const zh = Game.countries.map((c, i) => i).filter(i => Game.countries[i] && Game.countries[i].iso3.startsWith('KZ'));
    return this.kpis([
      Ch.kpi('Клеток сейчас', n, { icon: 'flag' }),
      Ch.kpi('За 24 часа', d24 == null ? '—' : (n - d24 >= 0 ? '+' : '') + (n - d24), { delta: d24 == null ? null : n - d24 }),
      Ch.kpi('За 7 дней', d7 == null ? '—' : (n - d7 >= 0 ? '+' : '') + (n - d7), { delta: d7 == null ? null : n - d7 }),
      Ch.kpi('Максимум', Math.max(n, ...mine)),
      Ch.kpi('Минимум', Math.min(n, ...mine)),
      Ch.kpi('Доля мира', (n / 16129 * 100).toFixed(2) + '%'),
      Ch.kpi('Место', `#${Game.rank()}`, { delta: snap7 ? snap7.r - Game.rank() : null, dlabel: 'мест за неделю' }),
      Ch.kpi('Захвачено клеток', T('gained_capture'), { icon: 'swords' }),
      Ch.kpi('Отнято за пропуски', T('lost_penalty'), { icon: 'alert' }),
      Ch.kpi('Потеряно от стихий', T('lost_disaster'), { icon: 'meteor' }),
      Ch.kpi('Потеряно иначе', Math.max(0, lostOther), { sub: 'восстания, пришельцы' }),
      Ch.kpi('Удачных атак', won, { icon: 'swords' }),
      Ch.kpi('Отбитых атак', fail, { icon: 'shield' }),
      Ch.kpi('Успешность атак', this.pct(won, won + fail)),
      Ch.kpi('Стран уничтожено', T('killed'), { icon: 'dead' }),
      Ch.kpi('Сила', Math.round(Game.eff(P)), { icon: 'power', delta: snap7 ? Math.round(Game.eff(P)) - snap7.p : null, dlabel: 'за неделю' }),
      Ch.kpi('Соседей', nb.length, { icon: 'users' }),
      Ch.kpi('Самый опасный сосед', danger ? `${Game.flag(danger)} ${U.esc(Game.name(danger))}` : '—', { sub: danger ? `сила ${Math.round(Game.eff(danger))}` : '' }),
      Ch.kpi('Длина границы', `${border} кл.`),
      Ch.kpi('HP всех щитов', myB.filter(b => b.type === 'shield').reduce((a, b) => a + b.hp, 0), { icon: 'shield' }),
      Ch.kpi('Штрафов получено', T('penalties'), { icon: 'alert' }),
      Ch.kpi('Отбито щитами', T('blocked'), { icon: 'shield' }),
    ]) + `<div class="dgrid">`
      + this.card('Мои клетки во времени', Ch.line({ labels: this.histLabels(), series: [{ name: 'Клетки', color: PAL[0], values: mine }], area: true, zero: false }))
      + this.card('Моё место в мире', Ch.line({ labels: this.histLabels(), series: [{ name: 'Место', color: PAL[6], values: H.map(h => h.r) }], zero: false }), { note: 'чем ниже число — тем лучше' })
      + this.card('Три жуза во времени', Ch.line({ labels: this.histLabels(), series: zh.map((i, j) => ({ name: Game.name(i), color: i === P ? PAL[0] : PAL[j + 1], values: H.map(h => Stats.decode(h)[i] || 0) })) }))
      + this.card('Мои постройки', Ch.hbars({ items: Object.keys(BUILDINGS).map(t => ({ label: BUILDINGS[t].name, value: myB.filter(b => b.type === t).length, color: BUILDINGS[t].color, pre: ic(t) })).filter(x => x.value) }))
      + this.card('Мои завоевания и потери', map(Ch.world('wm-mine', k => {
        const o = Game.own[k], g = Game.orig[k];
        if (!g) return null;
        if (o === P && g === P) return PAL[0];
        if (o === P) return UP;
        if (g === P) return DOWN;
        return '#e7e5df';
      }, k => Game.own[k] === Game.player ? (Game.orig[k] === Game.player ? 'Исконная земля' : 'Завоёвано') : Game.orig[k] === Game.player ? `Потеряно — сейчас ${Game.name(Game.own[k])}` : ''))
        + Ch.legend([{ name: 'Исконная', color: PAL[0] }, { name: 'Завоёвано', color: UP }, { name: 'Потеряно', color: DOWN }]), { wide: true })
      + `</div>`;
  },

  world() {
    const alive = this.alive(), T = k => this.tot(k);
    const dead = Game.countries.map((c, i) => i).filter(i => Game.countries[i] && !Game.cells(i));
    const strong = [...alive].sort((a, b) => Game.eff(b) - Game.eff(a));
    const g7 = this.growth(7).sort((a, b) => b.v - a.v);
    const counts = Buildings.counts();
    const sick = alive.filter(i => Game.sick(i));
    const allies = (Game.s.alliances || []).filter(x => x.until > Date.now()).length;
    const aliens = alive.filter(i => Game.countries[i].kind === 'alien');
    const H = this.hist();
    const top5 = [...alive].sort((a, b) => Game.cells(b) - Game.cells(a)).slice(0, 5);
    const days = this.lastDays(14);
    const evDay = EV_ORDER.map((t, j) => ({ name: EVENTS[t].name, color: PAL[j], values: days.map(d => Stats.st.ev.filter(e => e.type === t && U.ymd(new Date(e.t)) === d).length) }));
    // континенты
    const cont = Uint8Array.from(atob(WORLD.cont), c => c.charCodeAt(0));
    const cstat = CONT_NAMES.map(() => new Map());
    for (let k = 0; k < Game.own.length; k++) { const o = Game.own[k], c = cont[k]; if (!c || o === OCEAN || o >= FLOOD) continue; cstat[c].set(o, (cstat[c].get(o) || 0) + 1); }
    const contRows = CONT_NAMES.slice(1).map((n, j) => {
      const m = cstat[j + 1], tot = [...m.values()].reduce((a, b) => a + b, 0);
      const [lead, lv] = [...m].sort((a, b) => b[1] - a[1])[0] || [0, 0];
      return { label: `${n}: ${Game.name(lead)}`, value: tot ? Math.round(lv / tot * 100) : 0, pre: Game.flag(lead), color: Game.countries[lead]?.color };
    });
    return this.kpis([
      Ch.kpi('Стран живо', alive.length, { icon: 'globe' }),
      Ch.kpi('Стран погибло', dead.length, { icon: 'dead' }),
      Ch.kpi('Гибелей всего', T('deaths')),
      Ch.kpi('Возрождений', T('rebirths'), { icon: 'sprout' }),
      Ch.kpi('Битв всего', T('battles'), { icon: 'swords' }),
      Ch.kpi('Битв сегодня', this.dailySum('battles', 1)[0], { delta: this.dailySum('battles', 1)[0] - this.dailySum('battles', 2)[0], dlabel: 'ко вчера' }),
      Ch.kpi('Самая сильная', strong[0] ? `${Game.flag(strong[0])} ${U.esc(Game.name(strong[0]))}` : '—', { sub: strong[0] ? `сила ${Math.round(Game.eff(strong[0]))}` : '' }),
      Ch.kpi('Быстрее всех растёт', g7[0] && g7[0].v > 0 ? `${Game.flag(g7[0].i)} ${U.esc(Game.name(g7[0].i))}` : '—', { delta: g7[0] && g7[0].v > 0 ? g7[0].v : null, dlabel: 'за неделю' }),
      Ch.kpi('Быстрее всех падает', g7.length && g7[g7.length - 1].v < 0 ? `${Game.flag(g7[g7.length - 1].i)} ${U.esc(Game.name(g7[g7.length - 1].i))}` : '—', { delta: g7.length && g7[g7.length - 1].v < 0 ? g7[g7.length - 1].v : null, dlabel: 'за неделю' }),
      Ch.kpi('Построек в мире', Game.s.buildings.length, { icon: 'fort' }),
      Ch.kpi('Кратеров и затоплений', Game.s.scars.length, { icon: 'meteor' }),
      Ch.kpi('Больных стран', sick.length, { icon: 'virus' }),
      Ch.kpi('Активных союзов', allies, { icon: 'ally' }),
      Ch.kpi('Пришельцы', aliens.length ? `${Game.cells(aliens[0])} кл.` : 'нет', { icon: 'ufo' }),
      Ch.kpi('Событий всего', Stats.st.ev.length, { icon: 'info' }),
      Ch.kpi('Долгих войн сейчас', Game.s.wars.length, { icon: 'swords' }),
      Ch.kpi('Долгих войн всего', this.tot('wars'), { icon: 'swords', sub: `из них против тебя: ${this.tot('wars_vs_me')}` }),
      Ch.kpi('Миров заключено', this.tot('peace') + this.tot('peace_me'), { icon: 'peace', sub: `твоих: ${this.tot('peace_me')}` }),
      Ch.kpi('Писем получено', this.tot('letters'), { icon: 'mail' }),
      Ch.kpi('Потрачено на дипломатию', this.tot('spend_diplomacy'), { icon: 'gem', sub: `получено: ${this.tot('earn_diplomacy')}` }),
    ]) + `<div class="dgrid">`
      + this.card('Топ-15 стран по площади', Ch.hbars({ items: [...alive].sort((a, b) => Game.cells(b) - Game.cells(a)).slice(0, 15).map(i => ({ label: Game.name(i), value: Game.cells(i), pre: Game.flag(i), color: i === Game.player ? PAL[0] : '#898781' })) }))
      + this.card('Рост и падение за неделю', g7.length ? Ch.diverge({ items: [...g7.slice(0, 8), ...g7.slice(-8)].filter((x, j, a) => a.indexOf(x) === j && x.v).map(x => ({ label: Game.name(x.i), value: x.v, pre: Game.flag(x.i) })) }) : Ch.empty())
      + this.card('Места: кто поднялся и упал с начала игры', this.rankMoves(Stats.ranksStart()), { note: 'На сколько мест в таблице по площади сдвинулась страна. Полный список — во вкладке «Все страны»' })
      + this.card('Места: изменения за сутки', this.rankMoves(Stats.ranksDayAgo()))
      + this.card('Топ-5 стран во времени', Ch.line({ labels: this.histLabels(), series: top5.map((i, j) => ({ name: Game.name(i), color: PAL[j], values: H.map(h => Stats.decode(h)[i] || 0) })), zero: false }))
      + this.card('События по типам', Ch.bars({ items: EV_ORDER.map((t, j) => ({ label: EVENTS[t].name.split(' ')[0], value: T('ev_' + t), color: PAL[j] })) }))
      + this.card('События по дням', Ch.stack({ labels: days.map(d => U.parse(d).getDate() + ''), series: evDay }), { wide: true })
      + this.card('Лидеры континентов (доля суши)', Ch.hbars({ items: contRows, fmt: v => v + '%', max: 100 }))
      + this.card('Топ-10 по силе', Ch.hbars({ items: strong.slice(0, 10).map(i => ({ label: Game.name(i), value: Math.round(Game.eff(i)), pre: Game.flag(i), color: PAL[6] })) }))
      + this.card('Больше всего построек', Ch.hbars({ items: [...counts].filter(([o]) => Game.countries[o]).map(([o, c]) => ({ o, n: Object.values(c).reduce((a, b) => a + b, 0) })).sort((a, b) => b.n - a.n).slice(0, 10).map(x => ({ label: Game.name(x.o), value: x.n, pre: Game.flag(x.o), color: PAL[2] })) }))
      + `</div>`;
  },

  maps(map) {
    const flips = Stats.flips, maxF = Math.max(1, ...flips);
    const dens = new Float32Array(Game.own.length);
    Game.s.buildings.forEach(b => Game.around(b.cell, 4, k => dens[k] += 1));
    const maxD = Math.max(1, ...dens);
    const maxE = Math.max(...this.alive().map(i => Game.eff(i)));
    const land = k => Game.own[k] !== OCEAN;
    const cont = Uint8Array.from(atob(WORLD.cont), c => c.charCodeAt(0));
    const nm = k => { const o = Game.own[k]; return o === OCEAN ? '' : o === CRATER ? 'Кратер' : o === FLOOD ? 'Затоплено' : Game.name(o); };
    const W = (id, title, cf, tf, legend, note) => this.card(title, map(Ch.world(id, cf, tf)) + legend, { note, wide: true });
    return `<div class="dgrid">`
      + W('wm-hot', 'Горячие точки войн', k => land(k) ? Ch.seq(flips[k] ? 0.15 + 0.85 * Math.sqrt(flips[k] / maxF) : null) : null,
        k => land(k) ? `${nm(k)}: клетка сменила владельца ${flips[k]} раз` : '', Ch.scale('тихо', 'частые бои'), 'Сколько раз каждая клетка переходила из рук в руки')
      + W('wm-change', 'Кто чем владеет сейчас (изменения с начала)', k => {
        const o = Game.own[k]; if (o === OCEAN) return null;
        if (o >= FLOOD) return '#5c4636';
        return o === Game.orig[k] ? '#e7e5df' : Game.countries[o].color;
      }, k => land(k) ? (Game.own[k] === Game.orig[k] ? `${nm(k)}: без изменений` : `${nm(k)} (было: ${Game.name(Game.orig[k])})`) : '', '', 'Серым — земля у исконного владельца, цветом — захваченная')
      + W('wm-power', 'Сила стран', k => { const o = Game.own[k]; return o === OCEAN ? null : o >= FLOOD ? '#e7e5df' : Ch.seq(Game.eff(o) / maxE); },
        k => land(k) && Game.own[k] < FLOOD ? `${nm(k)}: сила ${Math.round(Game.eff(Game.own[k]))}` : '', Ch.scale('слабые', 'сильные'))
      + W('wm-growth', 'Рост и сжатие стран с начала игры', k => {
        const o = Game.own[k]; if (o === OCEAN) return null; if (o >= FLOOD) return '#e7e5df';
        const r = Game.cells(o) / Math.max(1, Game.countries[o].init);
        return Ch.div(Math.max(-1, Math.min(1, Math.log2(r))));
      }, k => land(k) && Game.own[k] < FLOOD ? `${nm(k)}: ${Game.cells(Game.own[k])} из ${Game.countries[Game.own[k]].init} исходных клеток` : '', Ch.scale('сжались', 'выросли', 'div'), 'Зелёный — страна выросла, красный — уменьшилась')
      + W('wm-dens', 'Плотность построек', k => land(k) ? Ch.seq(dens[k] ? 0.12 + 0.88 * dens[k] / maxD : null) : null,
        k => land(k) ? `${nm(k)}: построек рядом ${dens[k] | 0}` : '', Ch.scale('пусто', 'много построек'))
      + W('wm-status', 'Эпидемии, союзы и стихии', k => {
        const o = Game.own[k]; if (o === OCEAN) return null;
        if (o === CRATER) return '#5c4636'; if (o === FLOOD) return '#78aad7';
        if (Game.countries[o].kind === 'alien') return '#6cf542';
        if (Game.sick(o)) return '#9333ea';
        if (Game.alliesOf(o).length) return PAL[0];
        return '#e7e5df';
      }, k => nm(k), Ch.legend([{ name: 'Эпидемия', color: '#9333ea' }, { name: 'Союз', color: PAL[0] }, { name: 'Кратер', color: '#5c4636' }, { name: 'Затоплено', color: '#78aad7' }, { name: 'Пришельцы', color: '#6cf542' }]))
      + W('wm-cont', 'Континенты', k => cont[k] && land(k) ? PAL[cont[k] - 1] : null, k => cont[k] ? CONT_NAMES[cont[k]] : '',
        Ch.legend(CONT_NAMES.slice(1).map((n, j) => ({ name: n, color: PAL[j] }))))
      + `</div>`;
  },

  table() {
    const rNow = Stats.ranksNow(), rDay = Stats.ranksDayAgo(), rStart = Stats.ranksStart(), cDay = Stats.countsDayAgo();
    const rows = Game.countries.map((c, i) => {
      if (!c) return null;
      const n = Game.cells(i), w = Stats.cellsAgo(i, 7 * DAY);
      const b = Buildings.owned(i).length;
      const st = Game.s.cs[i] || {};
      const status = !n ? 'погибла' : Game.sick(i) ? 'эпидемия' : Game.alliesOf(i).length ? 'союз' : c.kind === 'alien' ? 'пришельцы' : c.kind === 'rebel' ? 'повстанцы' : '';
      return { i, name: Game.name(i), rank: rNow.get(i) ?? null, rd1: Stats.rankDelta(i, rNow, rDay), rd0: Stats.rankDelta(i, rNow, rStart), cells: n, dd1: Stats.cellsDelta(i, cDay), init: c.init, dc: n - c.init, d7: w == null ? null : n - w, power: Math.round(Game.eff(i)), b, status };
    }).filter(Boolean);
    const { key, dir } = this.sort;
    rows.sort((a, b) => ((a[key] ?? -1e9) > (b[key] ?? -1e9) ? 1 : (a[key] ?? -1e9) < (b[key] ?? -1e9) ? -1 : 0) * dir);
    const th = (k, l) => `<th data-k="${k}" class="${key === k ? 'on' : ''}">${l}${key === k ? ic(dir < 0 ? 'down' : 'up') : ''}</th>`;
    return this.card('Все страны мира', `<div class="tw"><table class="dt">
      <thead><tr>${th('rank', 'Место')}${th('name', 'Страна')}${th('rd1', 'Место за сутки')}${th('rd0', 'Место с начала')}${th('cells', 'Клеток')}${th('dd1', 'За сутки')}${th('init', 'Было')}${th('dc', 'Клеток с начала')}${th('d7', 'За 7 дней')}${th('power', 'Сила')}${th('b', 'Построек')}${th('status', 'Статус')}</tr></thead>
      <tbody>${rows.map(r => `<tr class="${r.i === Game.player ? 'me' : ''}"><td>${r.rank ?? '—'}</td><td>${Game.flag(r.i)} ${U.esc(r.name)}</td><td>${r.rd1 == null ? '—' : Ch.delta(r.rd1)}</td><td>${r.rd0 == null ? '—' : Ch.delta(r.rd0)}</td><td>${r.cells}</td><td>${r.dd1 == null ? '—' : Ch.delta(r.dd1)}</td><td>${r.init}</td><td>${Ch.delta(r.dc)}</td><td>${r.d7 == null ? '—' : Ch.delta(r.d7)}</td><td>${r.power}</td><td>${r.b}</td><td>${r.status}</td></tr>`).join('')}</tbody>
    </table></div>`, { full: true, note: 'Нажми на заголовок столбца, чтобы отсортировать' });
  },
};
