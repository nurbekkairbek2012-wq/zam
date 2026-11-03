// Напоминалки: задачи без даты + то, что ты не сделал. Разбор по очереди свайпами.
const Inbox = {
  data: { reminders: [], reviewed: {} },

  load() {
    this.data = Object.assign({ reminders: [], reviewed: {} }, U.load('plan.inbox', {}));
  },
  save() { U.save('plan.inbox', this.data); },

  // просроченные задачи, которые ещё не разобраны
  missed() {
    const out = [];
    for (const t of Planner.tasks) {
      if (t.type === 'rest') continue;
      for (const d of t.dates) {
        if (t.missed[d] && !this.data.reviewed[t.id + '|' + d]) out.push({ kind: 'missed', key: t.id + '|' + d, t, date: d });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  },
  reminders() { return this.data.reminders; },
  count() { return this.missed().length + this.reminders().length; },
  // очередь для разбора: сначала несделанное, потом напоминалки
  queue() {
    return [...this.missed(), ...this.reminders().map(r => ({ kind: 'reminder', key: r.id, r }))];
  },

  add(title, notes = '', from = null) {
    title = title.trim();
    if (!title) return null;
    const r = { id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), title, notes, createdAt: Date.now(), from };
    this.data.reminders.unshift(r);
    this.save();
    return r;
  },
  remove(id) {
    this.data.reminders = this.data.reminders.filter(r => r.id !== id);
    this.save();
  },
  // свайп вправо — оставить
  keep(item) {
    if (item.kind === 'missed') {
      this.data.reviewed[item.key] = 'kept';
      const exists = this.data.reminders.some(r => r.from === item.key);
      if (!exists) this.add(item.t.title, item.t.notes || '', item.key);
      else this.save();
    }
  },
  // свайп влево — удалить (просроченная задача остаётся в календаре на своей неделе)
  drop(item) {
    if (item.kind === 'missed') { this.data.reviewed[item.key] = 'dropped'; this.save(); }
    else this.remove(item.r.id);
  },

  // ---------- окно со списком ----------
  open() {
    const draw = root => {
      const missed = this.missed(), rem = this.reminders();
      U.$('#ib-body', root).innerHTML = `
        <div class="row" style="margin-bottom:10px">
          <input class="input" id="ib-new" maxlength="120" placeholder="Новая напоминалка без даты…">
          <button class="btn primary" id="ib-add" style="flex:0 0 auto">${ic('plus')} Добавить</button>
        </div>
        <button class="btn blue" id="ib-swipe" style="width:100%;margin-bottom:12px" ${missed.length + rem.length ? '' : 'disabled'}>${ic('list')} Разобрать по очереди (${missed.length + rem.length})</button>
        ${missed.length ? `<h4 class="dh">${ic('x')} Не сделано (${missed.length})</h4>
          <div class="hint">Просроченные задачи. Оставь — станут напоминалкой; удали — уйдут из этого списка, но в календаре останутся.</div>
          ${missed.map(m => `<div class="item c-${Planner.color(m.t)} missed">${ic(TYPES[m.t.type].icon)}<span class="name">${U.esc(m.t.title)}</span><span class="t">${U.human(m.date)}</span></div>`).join('')}` : ''}
        <h4 class="dh">${ic('bell')} Напоминалки (${rem.length})</h4>
        ${rem.map(r => `<div class="rem">
          <div class="rem-t"><b>${U.esc(r.title)}</b>${r.notes ? `<small>${U.esc(r.notes)}</small>` : ''}<small>${r.from ? 'из невыполненного · ' : ''}добавлено ${U.stamp(r.createdAt)}</small></div>
          <div class="rem-a">
            <button class="btn primary" data-done="${r.id}" title="Сделано">${ic('check')}</button>
            <button class="btn" data-plan="${r.id}" title="Поставить на дату">${ic('calendar')}</button>
            <button class="btn danger" data-del="${r.id}" title="Удалить">${ic('trash')}</button>
          </div></div>`).join('') || '<div class="empty">Напоминалок нет. Запиши сюда дела без даты — чтобы не забыть.</div>'}`;
      U.$('#ib-new', root).onkeydown = e => { if (e.key === 'Enter') U.$('#ib-add', root).click(); };
    };
    U.modal(`<h2>${ic('bell')} Напоминалки <button class="x" data-close>${ic('x')}</button></h2><div id="ib-body"></div>`, root => {
      draw(root);
      root.onclick = e => {
        if (e.target.closest('#ib-add')) {
          if (this.add(U.$('#ib-new', root).value)) { U.toast('Напоминалка добавлена'); draw(root); App.refresh(); }
          return;
        }
        if (e.target.closest('#ib-swipe')) return this.swipe();
        const done = e.target.closest('[data-done]'), del = e.target.closest('[data-del]'), plan = e.target.closest('[data-plan]');
        if (done) { this.remove(done.dataset.done); U.toast('Отлично, сделано!'); }
        else if (del) this.remove(del.dataset.del);
        else if (plan) {
          const r = this.data.reminders.find(x => x.id === plan.dataset.plan);
          return Cal.editor(null, U.today(), null, { title: r.title, notes: r.notes, onSave: () => this.remove(r.id) });
        } else return;
        draw(root); App.refresh();
      };
    }, 'wide');
  },

  // ---------- разбор по очереди: свайп влево — удалить, вправо — оставить ----------
  swipe() {
    const items = this.queue();
    let i = 0, kept = 0, dropped = 0;
    const root = U.modal(`<h2>${ic('list')} Разбор <span id="sw-n" class="sw-n"></span> <button class="x" data-close>${ic('x')}</button></h2>
      <div class="sw-area"><div class="sw-label left">${ic('trash')} Удалить</div><div class="sw-label right">${ic('check')} Оставить</div><div id="sw-card" class="sw-card"></div></div>
      <div class="actions"><button class="btn danger grow" id="sw-l">${ic('left')} Удалить</button><button class="btn primary grow" id="sw-r">Оставить ${ic('right')}</button></div>
      <div class="hint" style="text-align:center">Свайпни карточку влево или вправо (или стрелки ← → на клавиатуре)</div>`, null, 'swipe-modal');
    const card = U.$('#sw-card', root);
    const show = () => {
      if (i >= items.length) {
        U.$('.sw-area', root).innerHTML = `<div class="sw-done">${ic('check')}<b>Всё разобрано!</b><small>Оставлено: ${kept} · удалено: ${dropped}</small></div>`;
        U.$('.actions', root).innerHTML = `<button class="btn primary grow" id="sw-close">Готово</button>`;
        U.$('#sw-close', root).onclick = () => { U.closeModal(); App.refresh(); };
        U.$('#sw-n', root).textContent = '';
        return;
      }
      const it = items[i];
      U.$('#sw-n', root).textContent = `${i + 1} из ${items.length}`;
      card.style.transition = 'none'; card.style.transform = ''; card.style.opacity = 1;
      card.className = 'sw-card ' + (it.kind === 'missed' ? '' : 'rem-card');
      const COL = { yellow: '#f2c200', orange: '#f2851f', red: '#e23d3d', blue: '#2f7fe0', gray: '#6b7280', black: '#111827', green: '#22a55b' };
      card.style.borderLeftColor = it.kind === 'missed' ? COL[Planner.color(it.t)] : '#6366f1';
      card.innerHTML = it.kind === 'missed'
        ? `<div class="sw-kind">${ic('x')} Не сделано</div><b>${U.esc(it.t.title)}</b><small>${TYPES[it.t.type].name} · ${U.human(it.date)} · ${Planner.timeText(it.t)}</small>${it.t.notes ? `<p>${U.esc(it.t.notes)}</p>` : ''}`
        : `<div class="sw-kind">${ic('bell')} Напоминалка</div><b>${U.esc(it.r.title)}</b>${it.r.notes ? `<p>${U.esc(it.r.notes)}</p>` : ''}<small>добавлено ${U.stamp(it.r.createdAt)}</small>`;
    };
    const decide = dir => {
      if (i >= items.length) return;
      const it = items[i];
      if (dir > 0) { this.keep(it); kept++; } else { this.drop(it); dropped++; }
      card.style.transition = 'transform .25s, opacity .25s';
      card.style.transform = `translateX(${dir * 420}px) rotate(${dir * 18}deg)`;
      card.style.opacity = 0;
      i++;
      setTimeout(show, 220);
    };
    // перетаскивание пальцем или мышью
    let sx = null;
    card.onpointerdown = e => { sx = e.clientX; card.setPointerCapture(e.pointerId); card.style.transition = 'none'; };
    card.onpointermove = e => {
      if (sx == null) return;
      const dx = e.clientX - sx;
      card.style.transform = `translateX(${dx}px) rotate(${dx / 20}deg)`;
      root.classList.toggle('to-left', dx < -40);
      root.classList.toggle('to-right', dx > 40);
    };
    card.onpointerup = card.onpointercancel = e => {
      if (sx == null) return;
      const dx = e.clientX - sx;
      sx = null;
      root.classList.remove('to-left', 'to-right');
      if (Math.abs(dx) > 90) decide(Math.sign(dx));
      else { card.style.transition = 'transform .2s'; card.style.transform = ''; }
    };
    U.$('#sw-l', root).onclick = () => decide(-1);
    U.$('#sw-r', root).onclick = () => decide(1);
    const keys = e => {
      if (!document.body.contains(root)) return document.removeEventListener('keydown', keys);
      if (e.key === 'ArrowLeft') decide(-1);
      if (e.key === 'ArrowRight') decide(1);
    };
    document.addEventListener('keydown', keys);
    U.onModalClose = () => { document.removeEventListener('keydown', keys); App.refresh(); };
    show();
  },
};
