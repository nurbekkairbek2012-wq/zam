// Календарь: месяц, день по часам, добавление и просмотр задач
const Cal = {
  y: new Date().getFullYear(),
  m: new Date().getMonth(),
  HOUR_FROM: 6,
  HOUR_PX: 56,

  init() {
    U.$('#cal-prev').onclick = () => this.shift(-1);
    U.$('#cal-next').onclick = () => this.shift(1);
    U.$('#cal-today').onclick = () => { const d = new Date(); this.y = d.getFullYear(); this.m = d.getMonth(); this.render(); };
    U.$('#cal-title').onclick = () => this.pickMonth();
    U.$('#btn-add').onclick = () => this.editor();
    U.$('#btn-inbox').onclick = () => Inbox.open();
    this.render();
  },
  shift(n) {
    this.m += n;
    if (this.m < 0) { this.m = 11; this.y--; }
    if (this.m > 11) { this.m = 0; this.y++; }
    this.render();
  },

  render() {
    U.$('#cal-title').textContent = `${U.MONTHS[this.m]} ${this.y}`;
    const first = new Date(this.y, this.m, 1);
    const start = new Date(first);
    start.setDate(1 - (first.getDay() + 6) % 7);
    const today = U.today();
    const narrow = window.innerWidth < 760;
    const maxChips = Infinity; // показываем все задачи — клетка дня растягивается вниз
    let html = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      if (i >= 35 && d.getMonth() !== this.m) break;
      const ds = U.ymd(d);
      const occ = Planner.occurrencesOn(ds);
      const rest = occ.find(t => t.type === 'rest');
      const cls = ['day'];
      if (d.getMonth() !== this.m) cls.push('other');
      if (U.wd(ds) >= 5) cls.push('weekend');
      if (ds === today) cls.push('today');
      if (rest) cls.push('rest');
      const sums = Planner.hasSchool(ds) || School.covers(ds) ? School.sumsOn(ds) : [];
      if (sums.length) cls.push('sumday');
      const chips = occ.filter(t => t.type !== 'rest');
      html += `<div class="${cls.join(' ')}" data-date="${ds}">
        <div class="top"><span class="num">${d.getDate()}</span>${Planner.hasSchool(ds) ? '<span class="school-bar" title="Школа"></span>' : ''}</div>
        ${sums.length ? `<div class="chip c-sum" title="Суммативки">СОР: ${U.esc(sums.join(', '))}</div>` : ''}
        ${rest ? `<div class="chip c-green">${U.esc(rest.title || 'Отдых')}</div>` : ''}
        ${chips.slice(0, maxChips).map(t => {
          const st = Planner.status(t, ds);
          const time = t.allDay ? '' : t.type === 'deadline' ? `до ${t.end}` : t.start;
          return `<div class="chip c-${Planner.color(t)} ${st}">${narrow ? '' : `<b>${time}</b> `}${U.esc(t.title)}</div>`;
        }).join('')}
        ${chips.length > maxChips ? `<div class="more">+${chips.length - maxChips}</div>` : ''}
      </div>`;
    }
    const grid = U.$('#cal-grid');
    grid.innerHTML = html;
    grid.onclick = e => { const c = e.target.closest('.day'); if (c) this.dayView(c.dataset.date); };
    this.renderSide();
  },

  pickMonth() {
    let y = this.y;
    const draw = root => {
      U.$('#pm-y', root).textContent = y;
      U.$('#pm-grid', root).innerHTML = U.MONTHS.map((n, i) =>
        `<button class="btn ${i === this.m && y === this.y ? 'blue' : ''}" data-m="${i}">${n}</button>`).join('');
    };
    U.modal(`<h2>Выбери месяц <button class="x" data-close>${ic('x')}</button></h2>
      <div class="mini-head"><button id="pm-p">${ic('left')}</button><span id="pm-y"></span><button id="pm-n">${ic('right')}</button></div>
      <div id="pm-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px"></div>`, root => {
      draw(root);
      U.$('#pm-p', root).onclick = () => { y--; draw(root); };
      U.$('#pm-n', root).onclick = () => { y++; draw(root); };
      U.$('#pm-grid', root).onclick = e => {
        const b = e.target.closest('[data-m]'); if (!b) return;
        this.y = y; this.m = +b.dataset.m; U.closeModal(); this.render();
      };
    });
  },

  itemHtml(t, date) {
    const st = Planner.status(t, date);
    const mark = st === 'done' ? 'check' : st === 'missed' ? 'x' : TYPES[t.type].icon;
    return `<div class="item c-${Planner.color(t)} ${st}" data-id="${t.id}" data-date="${date}">
      ${ic(mark)}<span class="name">${U.esc(t.title)}</span><span class="t">${Planner.timeText(t)}</span></div>`;
  },

  untilText(ms) {
    if (ms < 0) return 'время вышло';
    const h = Math.floor(ms / 3600e3);
    if (h < 1) return `через ${Math.max(1, Math.round(ms / 60e3))} мин`;
    if (h < 48) return `через ${h} ${U.plural(h, 'час', 'часа', 'часов')}`;
    const d = Math.floor(h / 24);
    return `через ${d} ${U.plural(d, 'день', 'дня', 'дней')}`;
  },

  renderSide() {
    const cnt = Inbox.count(), pill = U.$('#inbox-count');
    pill.textContent = cnt; pill.classList.toggle('hidden', !cnt);
    const missedN = Inbox.missed().length, rem = Inbox.reminders();
    U.$('#side-inbox').innerHTML = (missedN ? `<div class="item c-red missed" data-inbox>${ic('x')}<span class="name">Не сделано: ${missedN}</span><span class="t">разобрать</span></div>` : '')
      + rem.slice(0, 4).map(r => `<div class="item c-gray" data-inbox>${ic('bell')}<span class="name">${U.esc(r.title)}</span></div>`).join('')
      + (rem.length > 4 ? `<div class="empty">и ещё ${rem.length - 4}…</div>` : '')
      + (cnt ? `<button class="btn" data-swipe style="width:100%;margin-top:4px">${ic('list')} Разобрать по очереди</button>` : '<div class="empty">Пусто. Нажми «Напоминалки», чтобы записать дело без даты.</div>');
    U.$$('#side-inbox [data-inbox]').forEach(el => el.onclick = () => Inbox.open());
    const sw = U.$('#side-inbox [data-swipe]'); if (sw) sw.onclick = () => Inbox.swipe();
    const today = U.today();
    const occ = Planner.occurrencesOn(today);
    let h = '';
    if (Planner.hasSchool(today)) {
      const sp = Planner.schoolSpan(today), L = School.lessons(today);
      h += `<div class="item c-school" data-school="${today}">${ic('school')}<span class="name">Школа${L.length ? ` · ${L.length} уроков` : ''}</span><span class="t">${sp.start}–${sp.end}</span></div>`;
    }
    h += School.sumsOn(today).map(s => `<div class="item c-sum" data-school="${today}">${ic('alert')}<span class="name">Суммативка: ${U.esc(School.title(s))}</span></div>`).join('');
    h += occ.map(t => this.itemHtml(t, today)).join('');
    U.$('#side-today').innerHTML = h || '<div class="empty">На сегодня ничего нет</div>';

    const now = Date.now();
    const dls = Planner.tasks.filter(t => t.type === 'deadline' && Planner.status(t, t.dates[0]) === 'open' && Planner.counts(t, t.dates[0]))
      .sort((a, b) => Planner.endOf(a, a.dates[0]) - Planner.endOf(b, b.dates[0]));
    U.$('#side-deadlines').innerHTML = dls.map(t => {
      const left = Planner.endOf(t, t.dates[0]).getTime() - now;
      return `<div class="item c-black ${left < 86400e3 ? 'urgent' : ''}" data-id="${t.id}" data-date="${t.dates[0]}">${ic('flag')}<span class="name">${U.esc(t.title)}</span><span class="t">${this.untilText(left)}</span></div>`;
    }).join('') || '<div class="empty">Нет активных дедлайнов</div>';

    const goals = Planner.tasks.filter(t => t.type === 'long' && !t.goalDone && !t.goalMissed);
    U.$('#side-goals').innerHTML = goals.map(t => {
      const { done, total } = Planner.goalProgress(t);
      const kids = Planner.children(t).length;
      const next = t.dates.filter(d => d >= today).sort()[0];
      return `<div class="goal" data-id="${t.id}" data-date="${next || t.dates[t.dates.length - 1]}">
        <div class="name">${ic('target')} ${U.esc(t.title)}</div>
        <div class="bar"><i style="width:${total ? done / total * 100 : 0}%"></i></div>
        <div class="sub">${done} из ${total} выполнено${kids ? ` · задач внутри: ${kids}` : ''} · ${next ? 'следующий день: ' + U.human(next) : 'даты закончились — отметь цель!'}</div>
      </div>`;
    }).join('') || '<div class="empty">Нет активных целей. Добавь долгосрочную задачу.</div>';

    let soon = '';
    for (let i = 1; i <= 7; i++) {
      const d = U.addDays(today, i);
      const list = Planner.occurrencesOn(d).filter(t => t.type === 'normal' || t.type === 'meet');
      const sums = School.sumsOn(d);
      if (list.length || sums.length) soon += `<div class="empty" style="margin:6px 0 4px">${U.WEEKDAYS[U.parse(d).getDay()]}, ${U.human(d)}</div>` + sums.map(s => `<div class="item c-sum" data-school="${d}">${ic('alert')}<span class="name">Суммативка: ${U.esc(School.title(s))}</span></div>`).join('') + list.map(t => this.itemHtml(t, d)).join('');
    }
    U.$('#side-soon').innerHTML = soon || '<div class="empty">Ближайшая неделя свободна</div>';

    U.$$('.cal-side [data-id]').forEach(el => el.onclick = () => this.details(el.dataset.id, el.dataset.date));
    U.$$('.cal-side [data-school]').forEach(el => el.onclick = () => this.dayView(el.dataset.school));
  },

  // ---------- день по часам ----------
  dayView(date) {
    this.openDay = date;
    const d = U.parse(date);
    const rest = Planner.tasks.find(t => t.type === 'rest' && t.dates.includes(date));
    const hours = [];
    for (let h = this.HOUR_FROM; h <= 24; h++) hours.push(h);
    U.modal(`
      <div class="dv-head">
        <button class="icon-btn" id="dv-prev">${ic('left')}</button>
        <h2>${U.WEEKDAYS[d.getDay()]}, ${U.human(date)}</h2>
        <button class="icon-btn" id="dv-next">${ic('right')}</button>
        <button class="icon-btn" data-close>${ic('x')}</button>
      </div>
      ${School.sumsWithoutLesson(date).map(s => `<div class="dv-banner sum">${ic('alert')} Суммативка: ${U.esc(School.title(s))} (в этот день урока нет)</div>`).join('')}
      ${rest ? `<div class="dv-banner" style="cursor:pointer">${ic('leaf')} ${U.esc(rest.title || 'День отдыха')} — сегодня ничего нет</div>` : ''}
      ${(() => { const nt = Planner.occurrencesOn(date).filter(t => t.noTime); return nt.length ? `<div class="dv-notime"><div class="dvn-h">${ic('clock')} В этот день, без точного времени</div>${nt.map(t => this.itemHtml(t, date)).join('')}</div>` : ''; })()}
      <div class="dv-scroll"><div class="timeline" id="tl">
        ${hours.map(h => `<div class="hour" ${h === 24 ? 'style="height:0"' : ''}><span>${U.pad(h % 24)}:00</span></div>`).join('')}
      </div></div>
      <div class="dv-foot"><button class="btn primary" style="width:100%" id="dv-add">${ic('plus')} Добавить на этот день</button></div>
    `, root => {
      U.$('#dv-prev', root).onclick = () => this.dayView(U.addDays(date, -1));
      U.$('#dv-next', root).onclick = () => this.dayView(U.addDays(date, 1));
      U.$('#dv-add', root).onclick = () => this.editor(null, date);
      if (rest) U.$('.dv-banner', root).onclick = () => this.details(rest.id, date);
      U.$$('.dv-notime [data-id]', root).forEach(el => el.onclick = () => this.details(el.dataset.id, date));
      this.drawBlocks(U.$('#tl', root), date);
      const scroll = U.$('.dv-scroll', root);
      const nowH = new Date().getHours();
      scroll.scrollTop = date === U.today() ? Math.max(0, (nowH - this.HOUR_FROM - 1) * this.HOUR_PX) : (8 - this.HOUR_FROM) * this.HOUR_PX - 10;
    }, 'dayview');
    U.onModalClose = () => { this.openDay = null; };
  },

  drawBlocks(tl, date) {
    const from = this.HOUR_FROM * 60;
    const items = [];
    if (Planner.hasSchool(date)) {
      const L = School.lessons(date);
      if (L.length) L.forEach(l => items.push({ lesson: l, s: U.toMin(l.start), e: U.toMin(l.end) }));
      else items.push({ school: true, s: U.toMin(Planner.settings.schoolStart), e: U.toMin(Planner.settings.schoolEnd) });
    }
    for (const t of Planner.occurrencesOn(date)) {
      if (t.allDay) continue;
      if (t.type === 'deadline') { const e = U.toMin(t.end); items.push({ t, s: Math.max(0, e - 30), e }); continue; }
      items.push({ t, s: U.toMin(t.start), e: Math.max(U.toMin(t.end), U.toMin(t.start) + 15) });
    }
    // раскладка пересекающихся блоков по колонкам
    items.sort((a, b) => a.s - b.s || b.e - a.e);
    let group = [], groupEnd = -1;
    const flush = () => {
      const cols = [];
      for (const it of group) {
        let c = cols.findIndex(end => end <= it.s);
        if (c < 0) { c = cols.length; cols.push(0); }
        cols[c] = it.e; it.col = c;
      }
      group.forEach(it => it.cols = cols.length);
      group = [];
    };
    for (const it of items) {
      if (it.s >= groupEnd && group.length) flush();
      group.push(it); groupEnd = Math.max(groupEnd, it.e);
    }
    flush();

    for (const it of items) {
      const top = Math.max(0, (it.s - from)) / 60 * this.HOUR_PX;
      const h = Math.max(24, (it.e - Math.max(it.s, from)) / 60 * this.HOUR_PX - 2);
      const el = document.createElement('div');
      el.style.top = top + 'px';
      el.style.height = h + 'px';
      el.style.left = `calc(${it.col / it.cols * 100}% + 4px)`;
      el.style.width = `calc(${100 / it.cols}% - 8px)`;
      if (it.lesson) {
        const l = it.lesson;
        el.className = 'block lesson' + (l.sum ? ' sum' : '');
        el.innerHTML = `<b>${l.sum ? ic('alert') + ' СОР · ' : ''}${U.esc(l.title)}</b><small>${l.n + 1} урок · ${l.start}–${l.end}</small>`;
        el.title = l.sum ? 'Суммативка. Нажми, чтобы снять отметку' : 'Нажми, чтобы отметить суммативку';
        el.onclick = () => { School.toggleSum(date, l.name); App.refresh(); this.dayView(date); };
      } else if (it.school) {
        el.className = 'block school';
        el.innerHTML = `<b>${ic('school')} Школа</b><small>${Planner.settings.schoolStart}–${Planner.settings.schoolEnd}</small>`;
      } else {
        const t = it.t, st = Planner.status(t, date);
        const r = Planner.reward(t);
        el.className = `block c-${Planner.color(t)} ${st}`;
        el.innerHTML = `<b>${ic(st === 'done' ? 'check' : st === 'missed' ? 'x' : TYPES[t.type].icon)} ${U.esc(t.title)}</b><small>${Planner.timeText(t)}${r ? ` · ${r} алм.` : ''}</small>`;
        el.onclick = () => this.details(t.id, date);
      }
      tl.appendChild(el);
    }
    if (date === U.today()) {
      const n = new Date(), m = n.getHours() * 60 + n.getMinutes();
      if (m >= from) {
        const line = document.createElement('div');
        line.className = 'now-line';
        line.style.top = (m - from) / 60 * this.HOUR_PX + 'px';
        tl.appendChild(line);
      }
    }
  },

  // ---------- карточка задачи ----------
  details(id, date) {
    const t = Planner.get(id);
    if (!t) return;
    const back = this.openDay;
    const st = Planner.status(t, date);
    const r = st === 'done' ? (t.paid[date] ?? Planner.reward(t)) : Game.taskReward(Planner.rewardFor(t, date));
    const parent = t.parent ? Planner.get(t.parent) : null;
    const can = Planner.canMarkDone(t, date);
    let time = t.allDay ? 'весь день' : `${t.start}–${t.end} (${Planner.hours(t)} ч)`;
    if (t.type === 'deadline') time = `сделать до ${t.end} · работы ~${Planner.hours(t)} ч`;
    let extra = '';
    if (t.type === 'normal') extra = `<div class="chip c-${t.importance}" style="display:inline-block;margin-top:6px">${IMPORTANCE[t.importance]}</div>`;
    if (t.type === 'deadline' && st === 'open') extra = `<div class="hint">${ic('clock')} ${this.untilText(Planner.endOf(t, date).getTime() - Date.now())}</div>`;
    if (t.type === 'long') {
      const p = Planner.goalProgress(t);
      const kids = Planner.children(t);
      extra = `<div class="hint">Выполнено: ${p.done} из ${p.total} (дни цели и задачи внутри). ${t.goalDone ? 'Цель достигнута!' : t.goalMissed ? 'Цель провалена' : `За достижение цели: +${Planner.GOAL_BONUS} алм.`}</div>
        <div class="subtasks"><div class="st-head">${ic('list')} Задачи внутри цели</div>
        ${kids.map(c => `<div class="item c-${Planner.color(c)} ${Object.keys(c.done).length >= c.dates.length ? 'done' : ''}" data-kid="${c.id}" data-date="${c.dates[0]}">${ic(TYPES[c.type].icon)}<span class="name">${U.esc(c.title)}</span><span class="t">${U.human(c.dates[0])}, ${Planner.timeText(c)}</span></div>`).join('') || '<div class="empty">Пока пусто</div>'}
        ${!t.goalDone && !t.goalMissed ? `<button class="btn" id="d-addkid" style="width:100%;margin-top:6px">${ic('plus')} Добавить задачу в цель</button>` : ''}
        <div class="hint">Обычные задачи, дедлайны и встречи внутри цели дают алмазы как обычно, но если совпадают по времени с днём цели — эти часы оплачиваются один раз.</div></div>`;
    }
    if (parent) extra += `<div class="hint">${ic('target')} Часть цели «${U.esc(parent.title)}»</div>`;
    const doneBtn = t.type === 'rest' ? '' : st === 'done'
      ? `<button class="btn grow" id="d-done">${ic('undo')} Не выполнено (−${r})</button>`
      : `<button class="btn primary grow" id="d-done" ${can.ok ? '' : 'disabled'}>${ic('check')} Выполнено (+${r} ${ic('gem', 'gem')})</button>`;
    U.modal(`
      <h2>${ic(TYPES[t.type].icon)} ${U.esc(t.title)} <button class="x" data-close>${ic('x')}</button></h2>
      <div>${TYPES[t.type].name} · ${U.human(date)} · ${time}</div>
      ${extra}
      ${t.notes ? `<p style="white-space:pre-wrap;background:var(--bg);padding:10px;border-radius:10px">${U.esc(t.notes)}</p>` : ''}
      ${st === 'missed' ? '<div class="hint" style="color:var(--red)">Просрочено — за это соседи забрали часть твоей земли.</div>' : ''}
      ${st === 'open' && !can.ok && t.type !== 'rest' ? `<div class="hint">${can.why}</div>` : ''}
      <div class="actions">
        ${doneBtn}
        ${t.type === 'long' && !t.goalDone && !t.goalMissed ? `<button class="btn blue grow" id="d-goal">${ic('trophy')} Цель достигнута (+${Planner.GOAL_BONUS})</button>` : ''}
      </div>
      <div class="actions">
        <button class="btn grow" id="d-edit">${ic('edit')} Изменить</button>
        <button class="btn danger grow" id="d-del">${ic('trash')} Удалить</button>
        ${back ? `<button class="btn grow" id="d-back">${ic('left')} К дню</button>` : ''}
      </div>
    `, root => {
      const after = () => { App.refresh(); back ? this.dayView(back) : U.closeModal(); };
      const b = U.$('#d-done', root);
      if (b) b.onclick = () => { if (Planner.toggleDone(t, date)) after(); };
      const g = U.$('#d-goal', root);
      if (g) g.onclick = () => U.confirm('Точно цель достигнута?', () => { Planner.completeGoal(t); after(); });
      U.$('#d-edit', root).onclick = () => this.editor(t);
      U.$$('[data-kid]', root).forEach(el => el.onclick = () => this.details(el.dataset.kid, el.dataset.date));
      const ak = U.$('#d-addkid', root);
      if (ak) ak.onclick = () => this.editor(null, t.dates.find(d => d >= U.today()) || U.today(), t.id);
      U.$('#d-del', root).onclick = () => U.confirm(`Удалить «${t.title}»?`, () => { Planner.remove(t.id); after(); });
      const bk = U.$('#d-back', root);
      if (bk) bk.onclick = () => this.dayView(back);
    });
    this.openDay = back;
  },

  // ---------- добавление / изменение ----------
  editor(task = null, date = null, parentId = null, opts = {}) {
    const back = this.openDay;
    const f = task ? JSON.parse(JSON.stringify(task)) : {
      type: 'normal', title: opts.title || '', importance: 'orange',
      dates: [date || U.today()], start: '17:00', end: '18:00', allDay: false, notes: '', hours: 1, parent: parentId || '',
    };
    const goals = Planner.goals().filter(g => !task || g.id !== task.id);
    let mini = U.parse(f.dates[0] || U.today());
    mini = { y: mini.getFullYear(), m: mini.getMonth() };
    const lbl = 'style="display:block;font-size:13px;font-weight:600;color:var(--muted);margin-bottom:6px"';

    const root = U.modal(`
      <h2>${task ? 'Изменить задачу' : 'Новая задача'} <button class="x" data-close>${ic('x')}</button></h2>
      <div class="field"><div class="types">
        ${Object.entries(TYPES).map(([k, v]) => `<button class="type-btn" data-type="${k}">${ic(v.icon)}<span>${v.name}</span></button>`).join('')}
      </div></div>
      <div class="field"><label>Название</label><input class="input" id="e-title" maxlength="80" placeholder="Например: подготовка к контрольной"></div>
      <div class="field" id="f-imp"><label>Насколько важно</label><div class="imp">
        <button data-imp="yellow" class="c-yellow">Не срочно</button>
        <button data-imp="orange" class="c-orange">Важно</button>
        <button data-imp="red" class="c-red">Очень важно</button>
      </div></div>
      <div class="field" id="f-parent"><label>Входит в долгосрочную цель</label><select class="input" id="e-parent"><option value="">— нет —</option>${goals.map(g => `<option value="${g.id}">${U.esc(g.title)}</option>`).join('')}</select></div>
      <div class="field" id="f-date"><label id="l-date">Дата</label><input type="date" class="input" id="e-date"></div>
      <div class="field" id="f-dates"><label>Даты цели (нажимай на дни) — выбрано: <b id="e-count">0</b></label>
        <div class="mini">
          <div class="mini-head"><button id="mn-p">${ic('left')}</button><span id="mn-t"></span><button id="mn-n">${ic('right')}</button></div>
          <div class="mini-grid" id="mn-g"></div>
          <div class="range">
            с <input type="date" id="r-from"> по <input type="date" id="r-to">
            <div class="wds">${U.WD_SHORT.map((w, i) => `<label><input type="checkbox" value="${i}" checked><span>${w}</span></label>`).join('')}</div>
            <button class="btn" id="r-add" style="padding:6px 10px">Добавить</button>
            <button class="btn" id="r-clear" style="padding:6px 10px">Очистить</button>
          </div>
        </div>
      </div>
      <div class="field" id="f-allday"><label class="check"><input type="checkbox" id="e-allday"> Весь день</label></div>
      <div class="field" id="f-notime"><label class="check"><input type="checkbox" id="e-notime"> Без точного времени — просто в этот день (всегда +5 алм.)</label></div>
      <div class="field row" id="f-time">
        <div id="f-start"><label ${lbl}>Начало</label><input type="time" class="input" id="e-start"></div>
        <div><label ${lbl} id="l-end">Конец</label><input type="time" class="input" id="e-end"></div>
        <div id="f-hours"><label ${lbl}>Часов работы</label><input type="number" class="input" id="e-hours" min="0.5" max="24" step="0.5"></div>
      </div>
      <div class="hint" id="e-reward"></div>
      <div class="field" style="margin-top:12px"><label>Заметка (необязательно)</label><textarea class="input" id="e-notes" rows="2"></textarea></div>
      <div class="actions">
        <button class="btn grow" id="e-cancel">Отмена</button>
        <button class="btn primary grow" id="e-save">${task ? 'Сохранить' : 'Добавить'}</button>
      </div>
    `);
    const $ = s => U.$(s, root);
    $('#e-title').value = f.title;
    $('#e-parent').value = f.parent || '';
    $('#e-date').value = f.dates[0] || U.today();
    $('#e-start').value = f.start || '17:00';
    $('#e-end').value = f.end;
    $('#e-hours').value = f.hours || 1;
    $('#e-allday').checked = !!f.allDay;
    $('#e-notime').checked = !!f.noTime;
    $('#e-notes').value = f.notes || '';
    $('#r-from').value = U.today();
    $('#r-to').value = U.addDays(U.today(), 27);

    const sync = () => {
      const dl = f.type === 'deadline';
      U.$$('.type-btn', root).forEach(b => b.classList.toggle('sel', b.dataset.type === f.type));
      U.$$('[data-imp]', root).forEach(b => b.classList.toggle('sel', b.dataset.imp === f.importance));
      $('#f-imp').classList.toggle('hidden', f.type !== 'normal');
      $('#f-parent').classList.toggle('hidden', !goals.length || !['normal', 'deadline', 'meet'].includes(f.type));
      $('#f-date').classList.toggle('hidden', f.type === 'long');
      $('#f-dates').classList.toggle('hidden', f.type !== 'long');
      $('#f-allday').classList.toggle('hidden', f.type !== 'rest');
      $('#f-start').classList.toggle('hidden', dl);
      $('#f-hours').classList.toggle('hidden', !dl);
      $('#l-date').textContent = dl ? 'Сделать до (дата)' : 'Дата';
      $('#l-end').textContent = dl ? 'До скольки' : 'Конец';
      $('#f-notime').classList.toggle('hidden', !['normal', 'meet'].includes(f.type));
      f.noTime = ['normal', 'meet'].includes(f.type) && $('#e-notime').checked;
      f.allDay = (f.type === 'rest' && $('#e-allday').checked) || f.noTime;
      $('#f-time').classList.toggle('hidden', f.allDay);
      $('#e-count').textContent = f.dates.length;
      const tmp = { type: f.type, noTime: f.noTime, start: $('#e-start').value || '00:00', end: $('#e-end').value || '00:00', hours: +$('#e-hours').value || 1 };
      const r = Planner.reward(tmp);
      const lose = Math.max(1, Math.ceil(Planner.hours(tmp) * Planner.CELLS_LOST_PER_HOUR));
      $('#e-reward').textContent = f.type === 'rest' ? 'Отдых не даёт алмазов, но и не штрафует.'
        : f.type === 'long' ? `За каждый выполненный день: +${r} алм., за всю цель: +${Planner.GOAL_BONUS}. Если провалить — соседи заберут клетки.`
        : dl ? `Можно сделать в любой момент до срока: +${r} алм. Не успеешь — соседи заберут ${lose} кл.`
        : `За выполнение: +${r} алм. Если не выполнить — соседи заберут ${lose} кл.`;
      drawMini();
    };
    const drawMini = () => {
      $('#mn-t').textContent = `${U.MONTHS[mini.m]} ${mini.y}`;
      const first = new Date(mini.y, mini.m, 1);
      const off = (first.getDay() + 6) % 7;
      const days = new Date(mini.y, mini.m + 1, 0).getDate();
      let h = U.WD_SHORT.map(w => `<div class="wd">${w}</div>`).join('');
      for (let i = 0; i < off; i++) h += '<button class="out"></button>';
      for (let d = 1; d <= days; d++) {
        const ds = U.ymd(new Date(mini.y, mini.m, d));
        h += `<button data-d="${ds}" class="${f.dates.includes(ds) ? 'sel' : ''} ${ds === U.today() ? 'today' : ''}">${d}</button>`;
      }
      $('#mn-g').innerHTML = h;
    };

    U.$$('.type-btn', root).forEach(b => b.onclick = () => {
      const was = f.type;
      f.type = b.dataset.type;
      if (f.type === 'long' && was !== 'long' && !task) f.dates = [];
      if (f.type !== 'long' && f.dates.length !== 1) f.dates = [$('#e-date').value || U.today()];
      if (f.type === 'rest' && !task) $('#e-allday').checked = true;
      if (f.type === 'deadline' && was !== 'deadline' && !task) $('#e-end').value = '23:00';
      sync();
    });
    U.$$('[data-imp]', root).forEach(b => b.onclick = () => { f.importance = b.dataset.imp; sync(); });
    $('#e-allday').onchange = sync;
    $('#e-notime').onchange = sync;
    $('#e-start').oninput = sync;
    $('#e-end').oninput = sync;
    $('#e-hours').oninput = sync;
    $('#mn-p').onclick = () => { mini.m--; if (mini.m < 0) { mini.m = 11; mini.y--; } drawMini(); };
    $('#mn-n').onclick = () => { mini.m++; if (mini.m > 11) { mini.m = 0; mini.y++; } drawMini(); };
    $('#mn-g').onclick = e => {
      const b = e.target.closest('[data-d]'); if (!b) return;
      const d = b.dataset.d;
      f.dates = f.dates.includes(d) ? f.dates.filter(x => x !== d) : [...f.dates, d].sort();
      sync();
    };
    $('#r-add').onclick = () => {
      const from = $('#r-from').value, to = $('#r-to').value;
      if (!from || !to || to < from) return U.toast('Проверь даты диапазона');
      const wds = U.$$('.wds input', root).filter(i => i.checked).map(i => +i.value);
      const set = new Set(f.dates);
      for (let d = from, n = 0; d <= to && n < 400; d = U.addDays(d, 1), n++) if (wds.includes(U.wd(d))) set.add(d);
      f.dates = [...set].sort();
      sync();
    };
    $('#r-clear').onclick = () => { f.dates = []; sync(); };
    $('#e-cancel').onclick = () => { back ? this.dayView(back) : U.closeModal(); };

    $('#e-save').onclick = () => {
      f.title = $('#e-title').value.trim();
      f.notes = $('#e-notes').value.trim();
      f.start = $('#e-start').value;
      f.end = $('#e-end').value;
      if (f.type !== 'long') f.dates = [$('#e-date').value];
      if (!f.title) f.title = f.type === 'rest' ? 'Отдых' : '';
      if (!f.title) return U.toast('Напиши название');
      if (!f.dates.length || !f.dates[0]) return U.toast('Выбери хотя бы одну дату');
      if (f.type === 'deadline') {
        if (!f.end) return U.toast('Укажи, до скольки');
        f.start = f.end;
        f.hours = Math.max(0.5, Math.min(24, +$('#e-hours').value || 1));
        if (U.at(f.dates[0], f.end).getTime() < Date.now()) return U.toast('Срок уже прошёл');
      } else if (!f.allDay) {
        if (!f.start || !f.end) return U.toast('Укажи время');
        if (U.toMin(f.end) <= U.toMin(f.start)) return U.toast('Конец должен быть позже начала');
      } else { f.start = '00:00'; f.end = '23:59'; }
      const data = { type: f.type, title: f.title, dates: f.dates, start: f.start, end: f.end, allDay: f.allDay, notes: f.notes, noTime: !!f.noTime };
      if (f.type === 'normal') data.importance = f.importance;
      if (f.type === 'deadline') data.hours = f.hours;
      const par = $('#e-parent').value;
      if (par && ['normal', 'deadline', 'meet'].includes(f.type)) data.parent = par;
      else if (task) delete Planner.get(task.id).parent;
      if (task) Planner.update(task.id, data); else { Planner.add(data); if (opts.onSave) opts.onSave(); }
      U.toast(task ? 'Сохранено' : 'Задача добавлена');
      App.refresh();
      back ? this.dayView(back) : U.closeModal();
    };
    sync();
    if (!task) setTimeout(() => $('#e-title').focus(), 50);
    this.openDay = back;
  },
};
